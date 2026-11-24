import { describe, expect, it } from "vitest";
import { cropControlsEnabled, toggleTool } from "./tools";

describe("tools", () => {
  it("selects a tool and deselects it when clicked again", () => {
    expect(toggleTool("none", "crop")).toBe("crop");
    expect(toggleTool("crop", "levelH")).toBe("levelH");
    expect(toggleTool("levelH", "levelH")).toBe("none");
  });

  it("enables crop controls only while cropping or when a crop exists", () => {
    expect(cropControlsEnabled("none", false)).toBe(false);
    expect(cropControlsEnabled("levelH", false)).toBe(false);
    expect(cropControlsEnabled("crop", false)).toBe(true);
    expect(cropControlsEnabled("none", true)).toBe(true);
    expect(cropControlsEnabled("levelV", true)).toBe(true);
  });
});
