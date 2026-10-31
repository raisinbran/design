import type { Catalogs } from "../catalogs/schema";

type Engineering = Catalogs["engineering"];
type Archive = Catalogs["archive"];

const escapeText = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!,
  );
const escapeAttribute = (text: string) => escapeText(text).replace(/'/g, "&#x27;");

function figcaption(caption: string, credit: string): string {
  if (!caption && !credit) return "";
  const main = caption ? `<span class="caption-main">${escapeText(caption)}</span>` : "";
  return `<figcaption>${main}${credit ? `<small>${escapeText(credit)}</small>` : ""}</figcaption>`;
}

const image = (src: string, alt: string) =>
  `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" loading="lazy" decoding="async">`;

function engineeringProject(project: Engineering["projects"][number]): string {
  const size = project.coverSize ? `; background-size: ${project.coverSize}` : "";
  const cover = `background-image: url('${project.cover}'); background-position: ${project.coverPosition}${size}`;
  const figures = project.media.map((media) => {
    const style = media.position
      ? ` style="--media-position: ${escapeAttribute(media.position)}"`
      : "";
    const poster = media.poster ? ` poster="${escapeAttribute(media.poster)}"` : "";
    const content =
      media.kind === "image"
        ? image(media.src, media.alt)
        : `<video muted autoplay loop playsinline preload="metadata"${poster}><source src="${escapeAttribute(media.src)}" type="video/mp4"></video>`;
    const variant = media.variant ? ` ${escapeAttribute(media.variant)}` : "";
    return `<figure class="project-media${variant}"${style}>${content}${figcaption(media.caption, media.credit)}</figure>`;
  });
  return (
    `<details class="project${project.hero ? " project--hero" : ""}" id="${project.id}"${project.expanded ? " open" : ""}>` +
    `<summary class="project-header"><span class="project-header-bg" style="${escapeAttribute(cover)}" aria-hidden="true"></span>` +
    `<span class="project-header-shade" aria-hidden="true"></span><span class="project-header-text">${escapeText(project.title)}</span>` +
    `<span class="project-chevron-wrap" aria-hidden="true"><span class="project-chevron"></span></span></summary>` +
    `<div class="project-body"><h2>${escapeText(project.heading)}</h2>` +
    (project.context ? `<p class="lead">${escapeText(project.context)}</p>` : "") +
    `<hr class="project-title-divider"><div class="project-prose">${project.bodyHtml}</div>` +
    `<div class="project-gallery" data-justified-gallery>${figures.join("")}</div></div></details>`
  );
}

function archiveCollection(collection: Archive["collections"][number]): string {
  const cover = `background-image:url("${collection.cover}");background-position:${collection.coverPosition};background-size:${collection.coverSize}`;
  const figures = collection.media.map((media) => {
    const ratio = media.displayRatio === null ? "" : ` data-display-ratio="${media.displayRatio}"`;
    const crop = media.cropMode === "square" ? ' data-crop-mode="square"' : "";
    const style =
      media.position === "50% 50%"
        ? ""
        : ` style="--media-position:${escapeAttribute(media.position)}"`;
    return `<figure class="project-media"${ratio}${crop} ${style}>${image(media.src, media.alt)}${figcaption(media.caption, media.credit)}</figure>`;
  });
  return [
    `<details class="project" id="${collection.id}"${collection.expanded ? " open" : ""}>`,
    `<summary class="project-header" style="min-height:${escapeAttribute(collection.headerMinHeight)}">`,
    `<span class="project-header-bg" style="${escapeAttribute(cover)}" aria-hidden="true"></span>`,
    `<span class="project-header-shade" aria-hidden="true"></span>`,
    `<span class="project-header-text">${escapeText(collection.title)}</span>`,
    `<span class="project-chevron-wrap" aria-hidden="true"><span class="project-chevron"></span></span>`,
    `</summary>`,
    `<div class="project-body"><h2>${escapeText(collection.heading)}</h2>` +
      (collection.context ? `<p class="lead">${escapeText(collection.context)}</p>` : "") +
      `<hr class="project-title-divider"><div class="project-gallery" data-justified-gallery>${figures.join("\n")}</div></div>`,
    `</details>`,
  ].join("\n");
}

/** Rebuilds the text between the page's two markers for `name` and keeps every other byte. */
function replaceRegion(page: string, name: string, source: string, items: string[]): string {
  const start = `<!-- portfolio-studio:${name} start: generated from ${source}; edits here are replaced on save -->`;
  const end = `<!-- portfolio-studio:${name} end -->`;
  const from = page.indexOf(start);
  const to = page.indexOf(end);
  if (
    from < 0 ||
    to < from ||
    page.indexOf(start, from + 1) >= 0 ||
    page.indexOf(end, to + 1) >= 0
  ) {
    throw new Error(`The page needs exactly one "${start}" followed by one "${end}"`);
  }
  return (
    page.slice(0, from + start.length) +
    "\n" +
    items.map((item) => item + "\n").join("") +
    page.slice(to)
  );
}

export function engineeringPage(page: string, catalog: Engineering): string {
  const visible = catalog.projects.filter((project) => project.visible);
  return replaceRegion(
    page,
    "engineering",
    "data/engineering-catalog.json",
    visible.map(engineeringProject),
  );
}

export function archivePage(page: string, catalog: Archive): string {
  return replaceRegion(
    page,
    "archive",
    "data/archive-catalog.json",
    catalog.collections.map(archiveCollection),
  );
}

export function photographyScript(catalog: Catalogs["photography"]): string {
  const photos = catalog.photos.map(({ aspectRatio, locked, ...photo }) => photo);
  // Whole numbers keep the Python form, such as 1.0, that the committed script uses.
  const ratios = catalog.photos.map(
    ({ file, aspectRatio }) =>
      `  ${JSON.stringify(file)}: ${Number.isInteger(aspectRatio) ? aspectRatio.toFixed(1) : aspectRatio}`,
  );
  return (
    "// GENERATED FROM data/media-catalog.json. DO NOT EDIT THIS FILE DIRECTLY.\n" +
    `window.PORTFOLIO_PHOTOS = ${JSON.stringify(photos, null, 2)};\n` +
    `window.PHOTO_ASPECT_RATIOS = ${ratios.length ? `{\n${ratios.join(",\n")}\n}` : "{}"};\n` +
    `window.PHOTO_TAG_LABELS = [${catalog.photoTags.map((tag) => JSON.stringify(tag)).join(", ")}];\n`
  );
}

/** js/projects.js reads prominence by lowercase file name. */
export function archiveSettingsScript(catalog: Archive): string {
  const entries = catalog.collections
    .flatMap((collection) => collection.media)
    .filter((media) => media.prominence !== "normal")
    .map((media) => [fileKey(media.src), media.prominence])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return (
    "// GENERATED FROM data/archive-catalog.json. DO NOT EDIT THIS FILE DIRECTLY.\n" +
    `window.ARCHIVE_PHOTO_PROMINENCE = Object.freeze(${JSON.stringify(Object.fromEntries(entries))});\n`
  );
}

// The same key as mediaFilename in js/projects.js.
function fileKey(src: string): string {
  const name = src.split("/").pop()!;
  try {
    return decodeURIComponent(name).toLowerCase();
  } catch {
    return name.toLowerCase();
  }
}
