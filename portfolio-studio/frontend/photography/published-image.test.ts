import { describe, expect, it } from "vitest";
import { publishedImageDescription } from "./published-image";

describe("published photo description", () => {
  it.each([
    ["DSCF4154_crop.heic", "DSCF4154_crop.webp", "WebP"],
    ["Studio_7001.jpg", "Studio_7001.jpg", "JPEG"],
    ["Studio_7002.png", "Studio_7002.png", "PNG"],
    ["Legacy.jpeg", "Legacy.jpeg", "JPEG"],
  ])("reports the actual derivative format (%s)", (file, thumbnail, format) => {
    expect(publishedImageDescription({ file, thumbnail })).toBe(
      `photography/thumbnails/${thumbnail} (${format})`,
    );
  });

  it("describes a legacy published image without a derivative", () => {
    expect(publishedImageDescription({ file: "Legacy.jpg" })).toBe(
      "photography/published/Legacy.jpg",
    );
  });
});
