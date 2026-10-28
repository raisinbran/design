import assert from "node:assert/strict";
import { readFile, rm, mkdir, writeFile, cp, copyFile } from "node:fs/promises";
import path from "node:path";
import { fixture } from "../tests/workspace-fixture";
import { SitePreview } from "../src/main/site-preview";
import { createServer } from "node:http";
import { chromium } from "playwright";
async function until(check: () => Promise<boolean>) {
  for (let index = 0; index < 100; index++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Durable save did not complete");
}
(async () => {
  const f = await fixture();
  const initialCount = f.workspace.catalogs.photography.photos.length;
  const artifacts =
    process.env.PORTFOLIO_QA_OUTPUT || path.join(f.directory, "artifacts");
  await mkdir(artifacts, { recursive: true });
  const sitePreview = new SitePreview();
  const measurements: Record<string, number> = {};
  const server = createServer(async (request, response) => {
    try {
      if (request.url!.startsWith("/api/")) {
        let raw = "";
        for await (const chunk of request) raw += chunk;
        const args = raw ? JSON.parse(raw) : [];
        const action = request.url!.slice(5);
        let value: unknown;
        if (action === "workspace")
          value = await f.registry.read(f.workspace.id);
        else if (action === "save")
          value = await f.publication.save(
            ...(args as [string, string, unknown]),
          );
        else if (action === "render")
          value = await f.processing.render(args[0], args[1], () => {});
        else if (action === "publish")
          value = await f.publication.publish(args[0]);
        else if (action === "image")
          value =
            "data:image/png;base64," +
            (await readFile(f.original)).toString("base64");
        else value = null;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ value }));
        return;
      }
      const [app, ...parts] = request.url!.slice(1).split("/");
      const base =
        app === "processor"
          ? "photo-processor-electron"
          : "portfolio-studio-electron";
      const relative = parts.join("/") || "index.html";
      const filename = path.join(
        process.cwd(),
        "tools",
        base,
        ".vite/renderer/main_window",
        relative,
      );
      response.setHeader(
        "Content-Type",
        filename.endsWith(".js")
          ? "application/javascript"
          : filename.endsWith(".css")
            ? "text/css"
            : "text/html",
      );
      response.end(await readFile(filename));
    } catch (error) {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const browser = await chromium.launch({
    ...(process.env.PORTFOLIO_CHROMIUM_PATH
      ? { executablePath: process.env.PORTFOLIO_CHROMIUM_PATH }
      : {}),
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1560, height: 1000 },
  });
  const errors: string[] = [];
  context.setDefaultTimeout(15000);
  await context.addInitScript({
    content:
      "(()=>{\n  const rpc=async(action,...args)=>{const response=await fetch('/api/'+action,{method:'POST',body:JSON.stringify(args)});const result=await response.json();if(result.error)throw new Error(result.error);return result.value;};\n  window.portfolio={ version:1,appId:'portfolio-studio',getAppearance:async()=>({theme:'system'}),setTheme:async(theme)=>({theme}),chooseWorkspace:()=>rpc('workspace'),refreshWorkspace:()=>rpc('workspace'),saveLocally:(...args)=>rpc('save',...args),readWorkspaceImage:()=>rpc('image'),getCompanionSettings:async()=>({enabled:false,available:false,name:null}),getCompanionTasks:async()=>[],onCompanionTask:()=>()=>{},onWorkspaceChanged:(listener)=>{window.__workspaceChanged=listener;return()=>{};},chooseOriginals:async()=>[{id:'source',name:'Original.png'}],getProcessingDefaults:async()=>null,onProcessingProgress:()=>()=>{},saveProcessingDraft:async()=>{},renderPreview:(...args)=>rpc('render',...args),publishPhoto:(...args)=>rpc('publish',...args),getProcessingDrafts:async()=>[],getRecovery:async()=>({items:[],locked:false})};\n })();",
  });
  try {
    console.log("Browser smoke: Studio");
    const studio = await context.newPage();
    studio.on(
      "pageerror",
      (e: Error) => (
        errors.push(e.message),
        console.error("renderer", e.message)
      ),
    );
    const start = performance.now();
    await studio.goto(`http://127.0.0.1:${address.port}/studio/`);
    await studio
      .getByRole("button", { name: "Open Portfolio", exact: true })
      .waitFor();
    measurements.rendererReadyMs = performance.now() - start;
    await studio
      .getByRole("button", { name: "Open Portfolio", exact: true })
      .click();
    await studio
      .getByLabel("Description / alternative text")
      .fill("Actual saved UI description");
    await studio
      .getByRole("button", { name: "Save Locally", exact: true })
      .click();
    await studio
      .getByText(
        "Management changes saved locally. Review with GitHub Desktop.",
      )
      .waitFor();
    assert.equal(
      (await f.registry.read(f.workspace.id)).catalogs.photography.photos[0]
        .alt,
      "Actual saved UI description",
    );
    await studio
      .getByRole("button", { name: "Engineering", exact: true })
      .click();
    await studio.getByLabel("Project title").fill("Actual UI Engineering save");
    await studio
      .getByRole("button", { name: "Save Locally", exact: true })
      .click();
    await studio
      .getByText(
        "Management changes saved locally. Review with GitHub Desktop.",
      )
      .waitFor();
    await until(
      async () =>
        (await f.registry.read(f.workspace.id)).catalogs.engineering.projects[0]
          .title === "Actual UI Engineering save",
    );
    assert.ok(
      (
        await readFile(path.join(f.root, "engineeringdesign.html"), "utf8")
      ).includes("Actual UI Engineering save"),
    );
    await studio.getByRole("button", { name: "Archive", exact: true }).click();
    await studio.getByLabel("Collection title").fill("Actual UI Archive save");
    await studio
      .getByRole("button", { name: "Save Locally", exact: true })
      .click();
    await studio
      .getByText(
        "Management changes saved locally. Review with GitHub Desktop.",
      )
      .waitFor();
    await until(
      async () =>
        (await f.registry.read(f.workspace.id)).catalogs.archive.collections[0]
          .title === "Actual UI Archive save",
    );
    assert.ok(
      (
        await readFile(path.join(f.root, "creativedesign.html"), "utf8")
      ).includes("Actual UI Archive save"),
    );
    await studio.screenshot({
      path: path.join(artifacts, "studio.png"),
      fullPage: true,
    });
    console.log("Browser smoke: Processor");
    const processor = await context.newPage();
    processor.on(
      "pageerror",
      (e: Error) => (
        errors.push(e.message),
        console.error("renderer", e.message)
      ),
    );
    await processor.goto(`http://127.0.0.1:${address.port}/processor/`);
    await processor
      .getByRole("button", { name: "Choose Portfolio Folder", exact: true })
      .click();
    await processor
      .getByRole("button", { name: "Import Originals", exact: true })
      .click();
    const cropStart = performance.now();
    await processor.getByLabel("Crop photograph", { exact: true }).check();
    measurements.cropControlMs = performance.now() - cropStart;
    await processor.getByLabel("Crop photograph", { exact: true }).uncheck();
    await processor
      .getByLabel("Description", { exact: true })
      .fill("Actual UI publication");
    await processor
      .getByRole("button", { name: "Render Encoded Preview", exact: true })
      .click();
    await processor
      .getByRole("button", { name: "Add to Photo Catalog", exact: true })
      .waitFor({ state: "visible" });
    await processor
      .getByRole("button", { name: "Add to Photo Catalog", exact: true })
      .click();
    await processor
      .getByText(
        "One Published Image and its catalog entry saved locally. Review with GitHub Desktop.",
      )
      .waitFor();
    const saved = await f.registry.read(f.workspace.id);
    assert.equal(saved.catalogs.photography.photos.length, initialCount + 1);
    assert.equal(
      saved.catalogs.photography.photos.at(-1)!.alt,
      "Actual UI publication",
    );
    assert.equal(
      await processor
        .getByRole("button", { name: "Add to Photo Catalog", exact: true })
        .isDisabled(),
      true,
    );
    await processor
      .getByRole("img", { name: /Encoded Published Image preview/ })
      .waitFor();
    await processor.screenshot({
      path: path.join(artifacts, "processor.png"),
      fullPage: true,
    });
    await studio.evaluate(
      (id: string) => (window as any).__workspaceChanged(id),
      f.workspace.id,
    );
    await studio
      .getByRole("button", { name: "Photography", exact: true })
      .click();
    await studio
      .getByText(`${initialCount + 1} photographs`, { exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    await studio.bringToFront();
    console.log("Browser smoke: scrolling");
    const scrollStart = performance.now();
    await studio.evaluate(async () => {
      const panel = document.querySelector(".record-scroll")!;
      for (let i = 0; i < 60; i++) {
        panel.scrollTop = (i % 2) * panel.scrollHeight;
        await new Promise(requestAnimationFrame);
      }
    });
    measurements.scroll60FramesMs = performance.now() - scrollStart;
    // Render the actual generated website with both models, using real image bytes.
    await cp(path.join(process.cwd(), "css"), path.join(f.root, "css"), {
      recursive: true,
    });
    await cp(path.join(process.cwd(), "js"), path.join(f.root, "js"), {
      recursive: true,
      filter: (source) =>
        !["photography-catalog.js", "archive-photo-settings.js"].includes(
          path.basename(source),
        ),
    });
    const legacy = saved.catalogs.photography.photos.find(
      (photo) => !photo.publishedImage && photo.visible,
    )!;
    for (const photo of saved.catalogs.photography.photos.filter(
      (photo) => !photo.publishedImage,
    )) {
      const relative = `photography/${photo.thumbnail ? "thumbnails/" + photo.thumbnail : "published/" + photo.file}`;
      await copyFile(
        path.join(process.cwd(), relative),
        path.join(f.root, relative),
      );
    }
    await cp(path.join(process.cwd(), "assets"), path.join(f.root, "assets"), {
      recursive: true,
    });
    const website = await context.newPage();
    await website.goto(await sitePreview.start(f.root, "photography.html"));
    for (const photo of [legacy, saved.catalogs.photography.photos.at(-1)!]) {
      const img = website
        .locator(".photo-tile")
        .filter({
          has: website.locator(`img[alt=${JSON.stringify(photo.alt)}]`),
        })
        .locator("img");
      await img.scrollIntoViewIfNeeded();
      await img.evaluate((node: HTMLImageElement) => node.decode());
      assert.ok(
        (await img.getAttribute("src"))!.includes(
          photo.thumbnail
            ? "photography/thumbnails/"
            : "photography/published/",
        ),
      );
      assert.equal(
        await img.evaluate((node: HTMLImageElement) => node.naturalWidth > 0),
        true,
      );
    }
    await website.screenshot({ path: path.join(artifacts, "website.png") });
    console.log(JSON.stringify(measurements));
    await writeFile(
      path.join(artifacts, "browser-metrics.json"),
      JSON.stringify(measurements, null, 2),
    );
    console.log(
      "Actual service-backed Chromium QA passed: Photography/Engineering/Archive Save Locally, encoded rendering, Add to Photo Catalog, companion-style refresh, no renderer errors.",
    );
  } finally {
    await sitePreview.stop();
    await browser.close();
    server.closeAllConnections();
    server.close();
    await rm(f.directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
