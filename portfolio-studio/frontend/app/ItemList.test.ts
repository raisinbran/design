import { describe, expect, it } from "vitest";
import { newId } from "./ItemList";

describe("newId", () => {
  // Ids become page anchors, so two items with the same title must still get different ones.
  it("gives a repeated title a distinct id", () => {
    const first = newId("Clip It", []);

    const second = newId("Clip It", [first]);

    expect(first).toBe("collapseClipIt");
    expect(second).toBe("collapseClipIt-2");
  });
});
