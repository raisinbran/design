import { z } from "zod";

// Field order is the order in the JSON files, because saving writes the parsed value back.
const position = z
  .string()
  .regex(/^\d+(\.\d+)?% \d+(\.\d+)?%$/, "must be two percentages, such as 50% 50%");
const description = z.string().refine((text) => text.trim() !== "", "description is required");

export const Photo = z
  .object({
    file: z.string(),
    alt: description,
    /** Shown as "Unlist", so checked means false. */
    visible: z.boolean(),
    displayPriority: z.enum(["low", "normal", "portraitBoost", "featured"]),
    aspectRatio: z.number().positive(),
    tags: z.array(z.string()),
    /** Keeps its index during arrangement; never written to the site. */
    locked: z.literal(true).optional(),
    thumbnail: z.string().optional(),
    thumbnailVersion: z.string().optional(),
    thumbnailWidth: z.number().int().optional(),
    thumbnailHeight: z.number().int().optional(),
    /** Only on a photo without a gallery image. */
    mediaVersion: z.string().optional(),
  })
  .strict();

export const PhotoCatalog = z
  .object({
    schemaVersion: z.literal(1),
    /** Also the order of the site's filter chips. */
    photoTags: z.array(z.string()),
    photos: z.array(Photo),
  })
  .strict()
  .superRefine((catalog, context) => {
    catalog.photos.forEach((photo, index) => {
      for (const tag of photo.tags) {
        if (!catalog.photoTags.includes(tag)) {
          context.addIssue({
            code: "custom",
            path: ["photos", index, "tags"],
            message: `unknown tag "${tag}"`,
          });
        }
      }
    });
  });

const EngineeringMedia = z
  .object({
    kind: z.enum(["image", "video"]),
    src: z.string().min(1),
    alt: z.string(),
    caption: z.string(),
    credit: z.string(),
    position: position.optional(),
    poster: z.string().optional(),
    /** An extra class on the figure, styled in css/projects.css. */
    variant: z.string().optional(),
  })
  .strict();

const EngineeringProject = z
  .object({
    id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "must be a page anchor"),
    title: z.string(),
    heading: z.string(),
    context: z.string(),
    bodyHtml: z.string(),
    cover: z.string(),
    coverPosition: position,
    /** CSS background-size of the cover, such as "145% auto". */
    coverSize: z.string().optional(),
    media: z.array(EngineeringMedia),
    visible: z.boolean(),
    expanded: z.boolean(),
    hero: z.boolean(),
  })
  .strict();

export const EngineeringCatalog = z
  .object({ schemaVersion: z.literal(1), projects: z.array(EngineeringProject) })
  .strict();

const ArchiveMedia = z
  .object({
    id: z.string(),
    src: z.string().min(1),
    alt: description,
    caption: z.string(),
    credit: z.string(),
    cropMode: z.enum(["natural", "square"]),
    /** The width-to-height ratio the gallery uses instead of the image's own; square sets 1. */
    displayRatio: z.number().min(0.25).max(7).nullable(),
    position,
    prominence: z.enum(["low", "normal", "portraitBoost", "featured"]),
  })
  .strict();

const ArchiveCollection = z
  .object({
    id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "must be a page anchor"),
    title: z.string(),
    heading: z.string(),
    context: z.string(),
    cover: z.string(),
    coverPosition: position,
    coverSize: z.string(),
    headerMinHeight: z.string(),
    expanded: z.boolean(),
    media: z.array(ArchiveMedia),
  })
  .strict();

export const ArchiveCatalog = z
  .object({ schemaVersion: z.literal(1), collections: z.array(ArchiveCollection) })
  .strict();

export const Catalogs = z.object({
  photography: PhotoCatalog,
  engineering: EngineeringCatalog,
  archive: ArchiveCatalog,
});
export type Catalogs = z.infer<typeof Catalogs>;

/** Returns one line per problem, such as "data/media-catalog.json photos #1 (DSCF3655_crop.jpg) alt: description is required". */
export function listProblems(
  error: z.ZodError,
  input: unknown,
  files: Record<string, string>,
): string[] {
  return error.issues.map((issue) => {
    const [catalog, ...rest] = issue.path;
    const where = [files[String(catalog)] ?? String(catalog)];
    let value = (input as Record<PropertyKey, unknown>)[catalog];
    for (const part of rest) {
      value = (value as Record<PropertyKey, unknown> | undefined)?.[part];
      const record = value as { file?: unknown; id?: unknown; src?: unknown } | undefined;
      const name = [record?.file, record?.id, record?.src].find(
        (field) => typeof field === "string",
      );
      if (typeof part !== "number") where.push(String(part));
      else where.push(name ? `#${part + 1} (${name})` : `#${part + 1}`);
    }
    return `${where.join(" ")}: ${issue.message}`;
  });
}
