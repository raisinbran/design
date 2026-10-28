import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, request, type Server } from "node:http";
import { access, lstat, readFile, realpath, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { atomicWrite, digest, WorkspaceRegistry } from "./files";
import type { AppId } from "../models";
import type { CompanionTask, CompanionSettings } from "../contracts";

interface Endpoint {
  version: 1;
  port: number;
  token: string;
  pid: number;
  instance: string;
}
interface PrivateTask {
  version: 1;
  kind: "open";
  id: string;
  workspaceId: string;
  workspacePath: string;
  operation: "import" | "reframe";
  photoKey?: string;
}
interface Completion {
  version: 1;
  kind: "completed";
  id: string;
  workspaceId: string;
  revision: string;
}
type Message = PrivateTask | Completion;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid companion message");
  return value as Record<string, unknown>;
}
export function validateMessage(value: unknown): Message {
  const message = object(value);
  if (message.version !== 1)
    throw new Error("Unsupported companion protocol version");
  if (
    typeof message.id !== "string" ||
    !/^[a-f0-9-]{36}$/.test(message.id) ||
    typeof message.workspaceId !== "string" ||
    !/^[a-f0-9]{64}$/.test(message.workspaceId)
  )
    throw new Error("Invalid companion identity");
  if (message.kind === "open") {
    if (
      !["import", "reframe"].includes(String(message.operation)) ||
      typeof message.workspacePath !== "string" ||
      !path.isAbsolute(message.workspacePath)
    )
      throw new Error("Invalid companion workspace");
    if (
      message.operation === "reframe" &&
      (typeof message.photoKey !== "string" ||
        !message.photoKey ||
        /[\\/\x00-\x1f]/.test(message.photoKey))
    )
      throw new Error("Invalid photograph identity");
  } else if (message.kind === "completed") {
    if (
      typeof message.revision !== "string" ||
      !/^[a-f0-9]{64}$/.test(message.revision)
    )
      throw new Error("Invalid completion revision");
  } else throw new Error("Unsupported companion message");
  return message as unknown as Message;
}
export function authenticated(
  header: string | undefined,
  token: string,
): boolean {
  if (!header) return false;
  const supplied = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${token}`);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
/** The rendezvous file is private to the OS account. Tokens never enter URLs, CLI args, or public files. */
export class CompanionService {
  private server?: Server;
  private endpoint?: Endpoint;
  private pending = new Map<
    string,
    { workspaceId: string; revision: string }
  >();
  private received = new Map<string, CompanionTask>();
  private publications = new Map<
    string,
    { photoKey: string; revision: string }
  >();
  constructor(
    private readonly directory: string,
    private readonly appId: AppId,
    private readonly registry: WorkspaceRegistry,
    private readonly onTask: (task: CompanionTask) => void,
    private readonly onCompletion: (workspaceId: string) => void,
  ) {}
  private endpointFile(appId: AppId): string {
    return path.join(this.directory, "integration", `${appId}.json`);
  }
  private settingsFile(): string {
    return path.join(this.directory, "integration", "settings.json");
  }
  async settings(): Promise<CompanionSettings> {
    try {
      const settings = object(
        JSON.parse(await readFile(this.settingsFile(), "utf8")),
      );
      return {
        enabled: settings.enabled === true,
        available: typeof settings.executable === "string",
        name:
          typeof settings.executable === "string"
            ? path.basename(settings.executable)
            : null,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { enabled: false, available: false, name: null };
      throw error;
    }
  }
  async configure(
    executable: string | null,
    enabled: boolean,
  ): Promise<CompanionSettings> {
    let current: Record<string, unknown> = {};
    try {
      current = object(JSON.parse(await readFile(this.settingsFile(), "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (executable) {
      const canonical = await realpath(executable);
      const stats = await lstat(canonical);
      if (
        process.platform === "darwin" &&
        canonical.endsWith(".app") &&
        stats.isDirectory()
      )
        current.executable = canonical;
      else {
        if (!stats.isFile())
          throw new Error("Choose the installed Photo Processor application");
        await access(
          canonical,
          process.platform === "win32" ? constants.F_OK : constants.X_OK,
        );
        current.executable = canonical;
      }
    }
    if (enabled && typeof current.executable !== "string")
      throw new Error("Locate Photo Processor before enabling integration");
    await atomicWrite(
      this.settingsFile(),
      JSON.stringify({ version: 1, executable: current.executable, enabled }),
    );
    return this.settings();
  }
  async start(): Promise<void> {
    const endpoint: Endpoint = {
      version: 1,
      port: 0,
      token: randomBytes(32).toString("hex"),
      pid: process.pid,
      instance: randomUUID(),
    };
    this.server = createServer(async (incoming, response) => {
      const finish = (status: number, value: object) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(value));
      };
      if (
        incoming.method !== "POST" ||
        incoming.url !== "/v1/task" ||
        !authenticated(incoming.headers.authorization, endpoint.token)
      ) {
        finish(403, { error: "Unauthorized" });
        incoming.resume();
        return;
      }
      let body = "";
      let oversized = false;
      incoming.on("data", (chunk) => {
        body += chunk;
        if (Buffer.byteLength(body) > 16_384) {
          oversized = true;
          incoming.destroy();
        }
      });
      incoming.on("end", async () => {
        if (oversized) return;
        try {
          await this.receive(validateMessage(JSON.parse(body)));
          finish(200, { accepted: true, version: 1 });
        } catch (error) {
          finish(400, { error: String(error) });
        }
      });
    });
    this.server.requestTimeout = 5000;
    this.server.headersTimeout = 5000;
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", resolve);
    });
    const address = this.server.address();
    if (!address || typeof address === "string")
      throw new Error("Could not bind companion service");
    endpoint.port = address.port;
    this.endpoint = endpoint;
    await atomicWrite(this.endpointFile(this.appId), JSON.stringify(endpoint));
  }
  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.server) this.server.close(() => resolve());
      else resolve();
    });
    try {
      const current = JSON.parse(
        await readFile(this.endpointFile(this.appId), "utf8"),
      ) as Endpoint;
      if (current.instance === this.endpoint?.instance)
        await rm(this.endpointFile(this.appId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  private async send(appId: AppId, message: Message): Promise<void> {
    const endpoint = JSON.parse(
      await readFile(this.endpointFile(appId), "utf8"),
    ) as Endpoint;
    if (
      endpoint.version !== 1 ||
      !Number.isInteger(endpoint.port) ||
      endpoint.port < 1 ||
      endpoint.port > 65535 ||
      !/^[a-f0-9]{64}$/.test(endpoint.token)
    )
      throw new Error("Invalid companion endpoint");
    await new Promise<void>((resolve, reject) => {
      const outgoing = request(
        {
          hostname: "127.0.0.1",
          port: endpoint.port,
          path: "/v1/task",
          method: "POST",
          headers: {
            Authorization: `Bearer ${endpoint.token}`,
            "Content-Type": "application/json",
          },
          timeout: 3000,
        },
        (response) => {
          response.resume();
          response.on("end", () =>
            response.statusCode === 200
              ? resolve()
              : reject(
                  new Error(`Companion rejected task (${response.statusCode})`),
                ),
          );
        },
      );
      outgoing.on("timeout", () =>
        outgoing.destroy(new Error("Companion did not respond")),
      );
      outgoing.on("error", reject);
      outgoing.end(JSON.stringify(message));
    });
  }
  private async receive(message: Message): Promise<void> {
    if (message.kind === "open") {
      if (this.appId !== "photo-processor")
        throw new Error("Only Photo Processor accepts editing tasks");
      if (this.received.has(message.id))
        throw new Error("Task was already received");
      const canonical = await realpath(message.workspacePath);
      if (digest(canonical) !== message.workspaceId)
        throw new Error("Workspace identity mismatch");
      const workspace = await this.registry.select(canonical);
      if (
        message.operation === "reframe" &&
        !workspace.catalogs.photography.photos.some(
          (photo) => photo.file === message.photoKey,
        )
      )
        throw new Error("Photograph is not in the selected catalog");
      const task: CompanionTask = {
        version: 1,
        id: message.id,
        workspace,
        operation: message.operation,
        photoKey: message.photoKey,
      };
      this.received.set(message.id, task);
      this.onTask(task);
    } else {
      if (this.appId !== "portfolio-studio")
        throw new Error("Only Studio accepts completion notifications");
      const pending = this.pending.get(message.id);
      if (!pending || pending.workspaceId !== message.workspaceId)
        throw new Error("Unknown companion task");
      const workspace = await this.registry.read(message.workspaceId);
      if (
        workspace.revision !== message.revision ||
        workspace.revision === pending.revision
      )
        throw new Error("Task has no verified catalog change");
      this.pending.delete(message.id);
      this.onCompletion(message.workspaceId);
    }
  }
  async launch(
    workspaceId: string,
    operation: unknown,
    photoKey?: unknown,
  ): Promise<string> {
    if (this.appId !== "portfolio-studio")
      throw new Error("Only Studio launches companion tasks");
    const settings = await this.settings();
    if (!settings.enabled)
      throw new Error(
        "Link Photo Processor in Settings, or open it independently and choose this portfolio folder.",
      );
    const workspace = await this.registry.read(workspaceId);
    const task = validateMessage({
      version: 1,
      kind: "open",
      id: randomUUID(),
      workspaceId,
      workspacePath: this.registry.root(workspaceId),
      operation,
      photoKey,
    }) as PrivateTask;
    if (
      operation === "reframe" &&
      !workspace.catalogs.photography.photos.some(
        (photo) => photo.file === photoKey,
      )
    )
      throw new Error("Select a catalog photograph first");
    this.pending.set(task.id, { workspaceId, revision: workspace.revision });
    try {
      await this.send("photo-processor", task);
      return task.id;
    } catch {
      /* Launch the explicitly chosen installed application, then wait for its private endpoint. */
    }
    try {
      const stored = JSON.parse(
        await readFile(this.settingsFile(), "utf8"),
      ) as { executable: string };
      const executable = await realpath(stored.executable);
      const child =
        process.platform === "darwin" && executable.endsWith(".app")
          ? spawn("/usr/bin/open", ["-a", executable], {
              detached: true,
              stdio: "ignore",
            })
          : spawn(executable, [], { detached: true, stdio: "ignore" });
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      child.unref();
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        try {
          await this.send("photo-processor", task);
          return task.id;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
      throw new Error(
        "Photo Processor did not become available. Open it independently and choose this portfolio folder.",
      );
    } catch (error) {
      this.pending.delete(task.id);
      throw error;
    }
  }
  currentTasks(): CompanionTask[] {
    return [...this.received.values()];
  }
  /** Called by the main-process publication transaction after its durable commit, never by renderer IPC. */
  recordPublication(taskId: string, photoKey: string, revision: string): void {
    const task = this.received.get(taskId);
    if (
      !task ||
      (task.operation === "reframe" && task.photoKey !== photoKey) ||
      !/^[a-f0-9]{64}$/.test(revision)
    )
      throw new Error("Publication does not match the companion task");
    this.publications.set(taskId, { photoKey, revision });
  }
  async complete(taskId: string): Promise<void> {
    const task = this.received.get(taskId);
    if (!task) throw new Error("Unknown editing task");
    const workspace = await this.registry.read(task.workspace.id);
    const publication = this.publications.get(taskId);
    if (
      !publication ||
      publication.revision !== workspace.revision ||
      !workspace.catalogs.photography.photos.some(
        (photo) => photo.file === publication.photoKey,
      ) ||
      workspace.revision === task.workspace.revision
    )
      throw new Error(
        "Publish the processed photograph before completing this task",
      );
    await this.send("portfolio-studio", {
      version: 1,
      kind: "completed",
      id: task.id,
      workspaceId: workspace.id,
      revision: workspace.revision,
    });
    this.received.delete(task.id);
    this.publications.delete(task.id);
  }
}
