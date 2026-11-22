import { describe, expect, it } from "vitest";
import { catalogNameWithSuffix, validSuffix, webpOutputName } from "./naming";

describe("photo import naming", () => {
  it("adds the selected suffix before the original extension", () => {
    expect(catalogNameWithSuffix("DSCF4154.heic", "_crop")).toBe("DSCF4154_crop.heic");
    expect(catalogNameWithSuffix("DSCF4154_crop.heic", "_crop")).toBe("DSCF4154_crop.heic");
    expect(catalogNameWithSuffix("DSCF4154.heic", "_edit")).toBe("DSCF4154_edit.heic");
  });

  it("shows the actual WebP derivative separately from the source-style label", () => {
    expect(webpOutputName("DSCF4154_crop.heic")).toBe("DSCF4154_crop.webp");
    expect(webpOutputName("DSCF3655_crop.jpg")).toBe("DSCF3655_crop.webp");
  });

  it("accepts only safe custom suffixes", () => {
    expect(validSuffix("_portfolio")).toBe(true);
    expect(validSuffix("crop")).toBe(false);
    expect(validSuffix("_../../escape")).toBe(false);
  });
});
