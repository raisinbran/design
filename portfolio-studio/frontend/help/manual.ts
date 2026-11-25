export interface ManualSection {
  id: string;
  title: string;
  /** Paragraphs; a line starting with "- " is a bullet. */
  text: string[];
}

export const MANUAL: ManualSection[] = [
  {
    id: "overview",
    title: "Overview",
    text: [
      "Portfolio Studio edits the website in your website folder. It writes files only: to publish, commit and push in GitHub Desktop. The app never commits.",
      "The sidebar has the three site pages (Photography, Engineering, Design), then the Photo Editor. Settings and Help are the two icons at the bottom.",
    ],
  },
  {
    id: "start",
    title: "Saving and reloading",
    text: [
      "In Settings, press Choose folder and pick the website folder, the one that holds data and index.html. The app opens it at every launch.",
      "Edits stay unsaved until you press Save. Preview opens the saved page in your default browser. After a pull or a discard in GitHub Desktop, press Reload, which also drops unsaved edits.",
      "If a file changed outside the app since you loaded it, Save stops and asks you to Reload.",
    ],
  },
  {
    id: "photography",
    title: "Photography",
    text: [
      "The list is the gallery in site order. Search matches the description, file name and tags. Drag photos to reorder, or use the Arrangement menu to suggest an order.",
      "- Description: the alt text screen readers read aloud. It is required.",
      "- Tags: each tag is also a filter on the site.",
      "- Display priority: Low, Normal, Portrait boost or Featured.",
      "- Unlist hides the photo from the site; Lock position keeps it in place during arrangement.",
      "- Rename changes the catalog name and its image. Delete moves the photo's unshared files to the Trash.",
      "- Edit Image reopens the photo in the Photo Editor to replace its image.",
    ],
  },
  {
    id: "engineering",
    title: "Engineering",
    text: [
      "Each project has a title, heading, context, a cover image with its position, and a body written in the rich text editor. Visible, Expanded and Hero control how the project shows on the page.",
      "Add (beside the New project title field) creates a project; use the up and down buttons or drag to reorder.",
      "Media: Add from library lists the files assigned to Engineering in Media and adds the ones you tick; the file path is read-only, and Replace from library swaps it. Import media picks images (and mp4 or webm videos), copies them into the website folder and adds them to the project. Images follow the same rules as photos: upright, at most 800 px on the long side, WebP, with the watermark and rights. Each item has alt text, a caption, a credit line and a position.",
    ],
  },
  {
    id: "design",
    title: "Design",
    text: [
      "Design projects work like Engineering projects without a body. Each image needs a description (alt text) and has a caption, a credit line, a position, a prominence and a crop mode.",
      "Add from library lists the files assigned to Design in Media. Import images picks images and adds them to the project under the same photo rules. The file path is read-only; Replace from library swaps it. Alt text is the same on every page that uses the file, while the caption and credit belong to this project alone.",
    ],
  },
  {
    id: "media",
    title: "Media",
    text: [
      "Media lists every file the site uses, with the pages it is assigned to. Search by file name or description, or filter by page.",
      "- Description is the alt text. It is the same on every page, so editing it changes every use of the file.",
      "- Pages: Engineering and Design can be ticked for a file. A page that already uses the file stays ticked and cannot be unticked. Ticking Photography is not available yet.",
      "- Used in lists each place the file appears. Remove from library is available only for a file nothing uses; the file itself stays on disk.",
      "Renaming a photo in Photography renames its file everywhere it is used. Deleting a photo is refused while another page uses its file.",
    ],
  },
  {
    id: "photo-editor",
    title: "Photo Editor",
    text: [
      "Import originals picks one or more photos, each kept as a draft in the list until you add or discard it. Your private originals are never changed.",
      "- Crop draws, moves and resizes a crop. Aspect, W and H set its shape; Landscape and Portrait flip it; Clear crop removes it.",
      "- Level horizontal and Level vertical: drag along a line that should be level. Type an angle in the Angle box to rotate, or press Auto-level.",
      "- Undo and Redo step through angle and crop changes; Reset removes every edit after you confirm.",
      "- Grid shows Thirds, Center or Golden guides; Zoom and the mouse wheel zoom; with no tool selected, drag to move the photo. Hold Show original to compare.",
      "Name, Filename suffix and Output filetype decide the website file. Add to Photo Catalog needs a name, a description and at least one tag, and saves right away, so Save or reload other edits first. The image is converted to up to 800 px on its long side with the watermark and rights from Settings.",
    ],
  },
  {
    id: "settings",
    title: "Settings",
    text: [
      "Appearance is Light, Dark or System (follows your computer). Choose folder changes the website folder.",
      "Author, Copyright, Usage terms, Watermark text and the corner logo apply to every image the app adds or replaces.",
    ],
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    text: [
      "Shortcuts use Ctrl on Windows and Linux and Cmd on macOS.",
      "- Ctrl or Cmd + S: Save.",
      "- Ctrl or Cmd + Z: undo a catalog edit. Ctrl or Cmd + Shift + Z, or Y: redo.",
      "- Esc in the Photo Editor: back to moving the photo.",
    ],
  },
];

/** Sections whose title or text contains every word of `query`. */
export function searchManual(sections: ManualSection[], query: string): ManualSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return sections.filter((section) => {
    const haystack = `${section.title} ${section.text.join(" ")}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
