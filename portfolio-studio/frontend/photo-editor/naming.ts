import { sourceNameWithoutExtension } from "../../shared/photo-format";

export const SUFFIX_OPTIONS = [
  { value: "_crop", label: "_crop — cropped or straightened" },
  { value: "_edit", label: "_edit — edited image" },
  { value: "_fix", label: "_fix — correction" },
  { value: "_small", label: "_small — reduced image" },
  { value: "custom", label: "Custom suffix…" },
];

export const FORMAT_CHOICES = [
  { value: "webp", label: ".webp (rec)" },
  { value: "jpg", label: ".jpg" },
  { value: "png", label: ".png" },
];

export const validSuffix = (suffix: string) => /^_[a-zA-Z0-9_-]{1,20}$/.test(suffix);

/** Appends a recognizable edit suffix to the base name, without retaining the source type. */
export function catalogNameWithSuffix(source: string, suffix: string): string {
  const stem = sourceNameWithoutExtension(source);
  return stem.toLowerCase().endsWith(suffix.toLowerCase()) ? stem : stem + suffix;
}
