import { describe, expect, it } from "vitest";
import {
  fileOutputFormat,
  isPhotoOutputFormat,
  photoBaseNameProblem,
  publishedFilename,
} from "../../shared/photo-format";
import { catalogNameWithSuffix, validSuffix } from "./naming";

describe("photo import naming", () => {
  it("adds the selected suffix without adding the original's extension", () => {
    expect(catalogNameWithSuffix("DSCF4154.heic", "_crop")).toBe("DSCF4154_crop");
    expect(catalogNameWithSuffix("DSCF4154_crop.heic", "_crop")).toBe("DSCF4154_crop");
    expect(catalogNameWithSuffix("DSCF4154.heic", "_edit")).toBe("DSCF4154_edit");
  });

  it("uses the explicit output format as the only extension", () => {
    expect(publishedFilename("DSCF4154_crop", "webp")).toBe("DSCF4154_crop.webp");
    expect(publishedFilename("DSCF3655_crop", "jpg")).toBe("DSCF3655_crop.jpg");
    expect(publishedFilename("DSCF3655_crop", "png")).toBe("DSCF3655_crop.png");
    expect(fileOutputFormat("DSCF3655_crop.jpg")).toBe("jpg");
    expect(fileOutputFormat("DSCF3655_crop.heic")).toBeNull();
    expect(isPhotoOutputFormat("heic")).toBe(false);
  });

  it("rejects attempts to hide or repeat the source extension in the Name field", () => {
    expect(photoBaseNameProblem("DSCF4154_crop")).toBeNull();
    expect(photoBaseNameProblem("DSCF4154_crop.heic")).not.toBeNull();
    expect(photoBaseNameProblem("DSCF4154_crop.webp")).not.toBeNull();
    expect(photoBaseNameProblem("../escape")).not.toBeNull();
    expect(photoBaseNameProblem("CON")).not.toBeNull();
    expect(validSuffix("_portfolio")).toBe(true);
    expect(validSuffix("crop")).toBe(false);
  });
});
