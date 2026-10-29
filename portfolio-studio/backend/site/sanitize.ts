import sanitizeHtml from "sanitize-html";

// The tags the Engineering editor's TipTap configuration produces (frontend/app/RichText.tsx).
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "a", "ul", "ol", "li"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
};

/** Removes every tag, attribute and link scheme the site's project text does not use, such as scripts and `on*` handlers. */
export function sanitizeBody(html: string): string {
  // sanitize-html writes "<br />"; the pages use "<br>".
  return sanitizeHtml(html, OPTIONS).replaceAll("<br />", "<br>");
}
