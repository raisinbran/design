import { describe, expect, it } from "vitest";
import { newId } from "./ItemList";

describe("newId", () => {
  it("same title gets a distinct id", () => {
    const first = newId("Clip It", []);

    const second = newId("Clip It", [first]);

    expect(first).toBe("collapseClipIt");
    expect(second).toBe("collapseClipIt-2");
  });
});
