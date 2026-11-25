import type { Catalogs } from "../backend/catalogs/schema";

export type Page = Catalogs["library"]["items"][number]["pages"][number];
export type Library = Catalogs["library"];
export type LibraryItem = Library["items"][number];
/** The catalogs without the library, which is what `deriveLibrary` reads. */
export type Content = Omit<Catalogs, "library">;

/** How each page is named in the app, matching the website's navigation. */
export const PAGE_LABELS: Record<Page, string> = {
  photography: "Photography",
  engineering: "Engineering",
  archive: "Design",
};

/** One place a file is used. `carriesAlt` is false for covers and posters, which have no description. */
export interface Use {
  page: Page;
  kind: "photo" | "image" | "video" | "cover" | "poster";
  /** The project title, or the photo's catalog key, for the Used in list. */
  where: string;
  carriesAlt: boolean;
}

/**
 * Returns why a `thumbnail` value is not allowed, or null. It is a bare filename, kept for the
 * photos in `photography/thumbnails/`, or a site path under `images/` with no `..`, scheme or
 * backslash.
 */
export function thumbnailProblem(value: string): string | null {
  if (!value.includes("/")) return value && !value.includes("\\") ? null : "must be a file name";
  const parts = value.split("/");
  const safe =
    parts[0] === "images" &&
    parts.length === 3 &&
    parts.every((part) => part && part !== "." && part !== "..") &&
    !/[\\:]/.test(value);
  return safe ? null : "must be a file name or a path under images/";
}

/** The site path of a Photography photo's image. */
export const photoSrc = (photo: { file: string; thumbnail?: string }): string =>
  photo.thumbnail
    ? photo.thumbnail.includes("/")
      ? photo.thumbnail
      : `photography/thumbnails/${photo.thumbnail}`
    : `photography/published/${photo.file}`;

/** Every use of every file in the catalogs, keyed by site path. */
export function usesByFile(content: Content): Map<string, Use[]> {
  const uses = new Map<string, Use[]>();
  const add = (src: string, use: Use) => {
    if (src) uses.set(src, [...(uses.get(src) ?? []), use]);
  };
  for (const photo of content.photography.photos)
    add(photoSrc(photo), {
      page: "photography",
      kind: "photo",
      where: photo.file,
      carriesAlt: true,
    });
  for (const project of content.engineering.projects) {
    add(project.cover, {
      page: "engineering",
      kind: "cover",
      where: project.title,
      carriesAlt: false,
    });
    for (const media of project.media) {
      add(media.src, {
        page: "engineering",
        kind: media.kind,
        where: project.title,
        carriesAlt: true,
      });
      if (media.poster)
        add(media.poster, {
          page: "engineering",
          kind: "poster",
          where: project.title,
          carriesAlt: false,
        });
    }
  }
  for (const project of content.archive.collections) {
    add(project.cover, { page: "archive", kind: "cover", where: project.title, carriesAlt: false });
    for (const media of project.media)
      add(media.src, { page: "archive", kind: "image", where: project.title, carriesAlt: true });
  }
  return uses;
}

const photoFileOf = (uses: Use[]) => uses.find((use) => use.kind === "photo")?.where;

/**
 * Returns the library with every use represented: a use adds its page to the file's item, the
 * Photography link and the description follow the catalogs, and assignments without a use stay.
 */
export function repairLibrary(library: Library, content: Content): Library {
  const uses = usesByFile(content);
  const items = library.items.map((item): LibraryItem => {
    const here = uses.get(item.src) ?? [];
    const pages: Page[] = item.pages.filter((page) => page !== "photography");
    for (const use of here) if (!pages.includes(use.page)) pages.push(use.page);
    const photoFile = photoFileOf(here);
    const keepsAlt = item.alt !== undefined && !here.some((use) => use.carriesAlt);
    return {
      src: item.src,
      pages: PAGE_ORDER.filter((page) => pages.includes(page)),
      ...(photoFile ? { photoFile } : {}),
      ...(keepsAlt ? { alt: item.alt } : {}),
    };
  });
  const known = new Set(items.map((item) => item.src));
  for (const [src, here] of uses) {
    if (known.has(src)) continue;
    const photoFile = photoFileOf(here);
    items.push({
      src,
      pages: PAGE_ORDER.filter((page) => here.some((use) => use.page === page)),
      ...(photoFile ? { photoFile } : {}),
    });
  }
  return { schemaVersion: 1, items };
}

const PAGE_ORDER: Page[] = ["photography", "engineering", "archive"];

/** The library a folder without `data/media-library.json` has: every used file on its pages. */
export const deriveLibrary = (content: Content): Library =>
  repairLibrary({ schemaVersion: 1, items: [] }, content);

/** The pages that use `src`, which cannot be unticked. */
export const pagesInUse = (content: Content, src: string): Page[] => [
  ...new Set((usesByFile(content).get(src) ?? []).map((use) => use.page)),
];

/** The description shown for a file: the first use that carries one, else the item's own. */
export function descriptionOf(catalogs: Catalogs, item: LibraryItem): string {
  const used = describedUses(catalogs, item.src);
  return used.find((text) => text.trim() !== "") ?? item.alt ?? "";
}

function describedUses(catalogs: Catalogs, src: string): string[] {
  const texts: string[] = [];
  for (const photo of catalogs.photography.photos)
    if (photoSrc(photo) === src) texts.push(photo.alt);
  for (const project of catalogs.engineering.projects)
    for (const media of project.media) if (media.src === src) texts.push(media.alt);
  for (const project of catalogs.archive.collections)
    for (const media of project.media) if (media.src === src) texts.push(media.alt);
  return texts;
}

/** Writes `alt` to every use of the file that carries a description, or to the item when none does. */
export function setAlt(catalogs: Catalogs, src: string, alt: string): Catalogs {
  const carries = (usesByFile(catalogs).get(src) ?? []).some((use) => use.carriesAlt);
  if (!carries)
    return {
      ...catalogs,
      library: {
        ...catalogs.library,
        items: catalogs.library.items.map((item) => (item.src === src ? { ...item, alt } : item)),
      },
    };
  return {
    ...catalogs,
    photography: {
      ...catalogs.photography,
      photos: catalogs.photography.photos.map((photo) =>
        photoSrc(photo) === src ? { ...photo, alt } : photo,
      ),
    },
    engineering: {
      ...catalogs.engineering,
      projects: catalogs.engineering.projects.map((project) => ({
        ...project,
        media: project.media.map((media) => (media.src === src ? { ...media, alt } : media)),
      })),
    },
    archive: {
      ...catalogs.archive,
      collections: catalogs.archive.collections.map((project) => ({
        ...project,
        media: project.media.map((media) => (media.src === src ? { ...media, alt } : media)),
      })),
    },
  };
}

/** Ticks or unticks Engineering or Archive for a file; refuses a page that uses it. */
export function setPage(catalogs: Catalogs, src: string, page: Page, on: boolean): Catalogs {
  if (page === "photography" || (!on && pagesInUse(catalogs, src).includes(page))) return catalogs;
  return {
    ...catalogs,
    library: {
      ...catalogs.library,
      items: catalogs.library.items.map((item) =>
        item.src !== src
          ? item
          : {
              ...item,
              pages: PAGE_ORDER.filter((each) => (each === page ? on : item.pages.includes(each))),
            },
      ),
    },
  };
}

/** Drops an unused file from the library; the file stays on disk. */
export function removeItem(catalogs: Catalogs, src: string): Catalogs {
  if (usesByFile(catalogs).has(src)) return catalogs;
  return {
    ...catalogs,
    library: {
      ...catalogs.library,
      items: catalogs.library.items.filter((item) => item.src !== src),
    },
  };
}

/** Where `src` is used, as a sentence for a refusal such as "Archive project Charcoal". */
export function describeUses(content: Content, src: string, except?: Page): string {
  return (usesByFile(content).get(src) ?? [])
    .filter((use) => use.page !== except)
    .map((use) => `${PAGE_LABELS[use.page]} (${use.where})`)
    .join(", ");
}

/** Points the item of a renamed file at its new path, keeping its pages. */
export function moveItem(catalogs: Catalogs, from: string, to: string): Catalogs {
  if (from === to) return catalogs;
  return {
    ...catalogs,
    library: {
      ...catalogs.library,
      items: catalogs.library.items.map((item) =>
        item.src === from ? { ...item, src: to } : item,
      ),
    },
  };
}

/** Points every Engineering and Design use of `from` (media, covers, posters) at `to`. */
export function repointUses(catalogs: Catalogs, from: string, to: string): Catalogs {
  if (from === to) return catalogs;
  const swap = (src: string) => (src === from ? to : src);
  return {
    ...catalogs,
    engineering: {
      ...catalogs.engineering,
      projects: catalogs.engineering.projects.map((project) => ({
        ...project,
        cover: swap(project.cover),
        media: project.media.map((media) => ({
          ...media,
          src: swap(media.src),
          ...(media.poster ? { poster: swap(media.poster) } : {}),
        })),
      })),
    },
    archive: {
      ...catalogs.archive,
      collections: catalogs.archive.collections.map((project) => ({
        ...project,
        cover: swap(project.cover),
        media: project.media.map((media) => ({ ...media, src: swap(media.src) })),
      })),
    },
  };
}

export const isVideo = (src: string): boolean => /\.(mp4|webm)$/i.test(src);

/** The description a project starts with when it adds a file the library already describes. */
export function describeSource(catalogs: Catalogs | null, src: string): string {
  const item = catalogs?.library.items.find((each) => each.src === src);
  return catalogs && item ? descriptionOf(catalogs, item) : "";
}
