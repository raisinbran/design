import type { EditRecipe } from "../models";
/** Validate recipes in the trusted process as well as the worker, before decoding large originals. */
export function validateRecipe(value: unknown): EditRecipe {
  if (!value || typeof value !== "object")
    throw new Error("An edit recipe is required");
  const recipe = value as EditRecipe;
  const finite = (number: unknown, min: number, max: number) =>
    typeof number === "number" &&
    Number.isFinite(number) &&
    number >= min &&
    number <= max;
  if (
    recipe.version !== 1 ||
    !finite(recipe.rotation, -270, 270) ||
    recipe.rotation % 90 !== 0 ||
    !finite(recipe.straighten, -45, 45)
  )
    throw new Error("Invalid orientation settings");
  if (
    !Number.isInteger(recipe.maxSide) ||
    !finite(recipe.maxSide, 64, 12000) ||
    !Number.isInteger(recipe.quality) ||
    !finite(recipe.quality, 1, 100) ||
    !["webp", "jpeg", "png"].includes(recipe.format)
  )
    throw new Error("Invalid Published Image settings");
  if (recipe.crop) {
    const { x, y, width, height } = recipe.crop;
    if (
      !finite(x, 0, 1) ||
      !finite(y, 0, 1) ||
      !finite(width, 0.0001, 1) ||
      !finite(height, 0.0001, 1) ||
      x + width > 1.000001 ||
      y + height > 1.000001
    )
      throw new Error(
        "Crop must fit inside the oriented and straightened image",
      );
  }
  if (
    !recipe.watermark ||
    typeof recipe.watermark.tiled !== "boolean" ||
    typeof recipe.watermark.corner !== "boolean" ||
    !finite(recipe.watermark.strength, 0, 1) ||
    typeof recipe.watermark.text !== "string" ||
    recipe.watermark.text.length > 500
  )
    throw new Error("Invalid watermark settings");
  if (
    !recipe.rights ||
    ["author", "copyright", "usageNotice"].some(
      (key) =>
        typeof recipe.rights[key as keyof EditRecipe["rights"]] !== "string" ||
        recipe.rights[key as keyof EditRecipe["rights"]].length > 8000,
    )
  )
    throw new Error("Invalid authorship settings");
  return structuredClone(recipe);
}
