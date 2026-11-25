import { describe, expect, it } from "vitest";
import { MANUAL, searchManual } from "./manual";

describe("searchManual", () => {
  it("returns every section for an empty query", () => {
    expect(searchManual(MANUAL, "  ")).toHaveLength(MANUAL.length);
  });

  it("matches words anywhere in a section, ignoring case", () => {
    expect(searchManual(MANUAL, "WATERMARK").map((s) => s.id)).toEqual(
      expect.arrayContaining(["settings", "photo-editor"]),
    );
  });

  it("needs every word and returns nothing when one is missing", () => {
    expect(searchManual(MANUAL, "crop zzzz")).toEqual([]);
  });

  it("gives every section a unique id", () => {
    expect(new Set(MANUAL.map((s) => s.id)).size).toBe(MANUAL.length);
  });
});
