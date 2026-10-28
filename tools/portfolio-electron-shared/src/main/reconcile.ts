const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
/** Three-way reconciliation keeps disjoint edits and refuses competing changes to the same field/order. */
export function reconcile<T>(
  base: T,
  local: T,
  remote: T,
  location = "catalog",
): T {
  if (equal(local, base)) return structuredClone(remote);
  if (equal(remote, base) || equal(local, remote))
    return structuredClone(local);
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    const values = [...base, ...local, ...remote];
    const key =
      values.length &&
      values.every(
        (value) =>
          value !== null &&
          typeof value === "object" &&
          typeof (value as Record<string, unknown>).file === "string",
      )
        ? "file"
        : values.length &&
            values.every(
              (value) =>
                value !== null &&
                typeof value === "object" &&
                typeof (value as Record<string, unknown>).id === "string",
            )
          ? "id"
          : null;
    if (key) {
      const ids = (array: Record<string, unknown>[]) =>
        array.map((value) => String(value[key]));
      const b = ids(base);
      const l = ids(local);
      const r = ids(remote);
      const shared = b.filter((id) => l.includes(id) && r.includes(id));
      const order = (list: string[]) =>
        list.filter((id) => shared.includes(id));
      const localReordered = !equal(order(l), order(b));
      const remoteReordered = !equal(order(r), order(b));
      if (localReordered && remoteReordered && !equal(order(l), order(r)))
        throw new Error(
          `Competing ordering changes at ${location}. Reload or resolve manually.`,
        );
      const map = new Map<string, unknown>();
      for (const id of new Set([...b, ...l, ...r])) {
        const before = base.find((value) => value[key] === id);
        const ours = local.find((value) => value[key] === id);
        const theirs = remote.find((value) => value[key] === id);
        if (ours === undefined || theirs === undefined) {
          const remaining = ours ?? theirs;
          if (before !== undefined && !equal(remaining, before))
            throw new Error(
              `Removal conflicts with an edit at ${location}.${id}`,
            );
          if (before === undefined) map.set(id, structuredClone(remaining));
        } else
          map.set(id, reconcile(before, ours, theirs, `${location}.${id}`));
      }
      const sequence = localReordered ? [...l, ...r] : [...r, ...l];
      return [...new Set(sequence)]
        .filter((id) => map.has(id))
        .map((id) => map.get(id)) as T;
    }
  }
  if (
    base &&
    local &&
    remote &&
    typeof base === "object" &&
    typeof local === "object" &&
    typeof remote === "object" &&
    !Array.isArray(base) &&
    !Array.isArray(local) &&
    !Array.isArray(remote)
  ) {
    const result: Record<string, unknown> = {};
    const b = base as Record<string, unknown>;
    const l = local as Record<string, unknown>;
    const r = remote as Record<string, unknown>;
    for (const key of new Set([
      ...Object.keys(b),
      ...Object.keys(l),
      ...Object.keys(r),
    ])) {
      const value = reconcile(b[key], l[key], r[key], `${location}.${key}`);
      if (value !== undefined) result[key] = value;
    }
    return result as T;
  }
  throw new Error(
    `Competing changes at ${location}. Your staged edits are retained; resolve this field before saving.`,
  );
}
