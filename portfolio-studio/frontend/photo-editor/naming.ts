export const SUFFIX_OPTIONS = [
  { value: "_crop", label: "_crop — cropped or straightened" },
  { value: "_edit", label: "_edit — edited image" },
  { value: "_fix", label: "_fix — correction" },
  { value: "_small", label: "_small — reduced image" },
  { value: "custom", label: "Custom suffix…" },
];

export const validSuffix = (suffix: string) => /^_[a-zA-Z0-9_-]{1,20}$/.test(suffix);

/** Retains the source extension as a catalog label; the actual published asset is WebP. */
export function catalogNameWithSuffix(source: string, suffix: string): string {
  const dot = source.lastIndexOf(".");
  const stem = dot > 0 ? source.slice(0, dot) : source;
  const extension = dot > 0 ? source.slice(dot) : "";
  return (stem.toLowerCase().endsWith(suffix.toLowerCase()) ? stem : stem + suffix) + extension;
}

export function webpOutputName(catalogName: string): string {
  const dot = catalogName.lastIndexOf(".");
  return (dot > 0 ? catalogName.slice(0, dot) : catalogName) + ".webp";
}
