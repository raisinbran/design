"""Edit existing Photography images' tags, descriptions and gallery framing."""
import copy
import json
import tkinter as tk
from pathlib import Path
from tkinter import ttk, messagebox
from PIL import Image, ImageOps, ImageTk
from catalog_tools import read_json, generated_js, validate_catalog
from processor import framed_preview

ROOT = Path(__file__).resolve().parents[2]
C_PATH = ROOT / "data" / "media-catalog.json"
J_PATH = ROOT / "js" / "photography-catalog.js"


class Editor(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Portfolio Studio | Edit Published Photo Metadata")
        self.geometry("980x780")
        self.catalog = read_json(C_PATH)
        validate_catalog(self.catalog, ROOT)
        self.photos = self.catalog["photos"]
        self.initial = copy.deepcopy(self.catalog)
        self.index = None
        self.tags = {tag: tk.BooleanVar() for tag in self.catalog["photoTags"]}
        self.alt = tk.StringVar()
        self.priority = tk.StringVar()
        self.zoom = tk.DoubleVar(value=1)
        self.focus_x = tk.DoubleVar(value=50)
        self.focus_y = tk.DoubleVar(value=50)
        self.preview_image = None
        self.suspend = False
        self.setup()

    def setup(self):
        bar = ttk.Frame(self, padding=10)
        bar.pack(fill="x")
        ttk.Button(bar, text="Save catalog locally", command=self.save).pack(side="right")
        ttk.Button(bar, text="Reset selected (unsaved)", command=self.reset_selected).pack(side="left")
        ttk.Button(bar, text="Reset all (unsaved)", command=self.reset_all).pack(side="left", padx=7)
        ttk.Label(bar, text="Gallery crops affect presentation, not image pixels.").pack(side="left", padx=5)

        outer = ttk.Frame(self, padding=10)
        outer.pack(fill="both", expand=True)
        left = ttk.Frame(outer)
        left.pack(side="left", fill="y", padx=(0, 13))
        self.listbox = tk.Listbox(left, width=33, exportselection=False)
        self.listbox.pack(fill="both", expand=True)
        self.listbox.bind("<<ListboxSelect>>", self.select)
        for p in self.photos: self.listbox.insert("end", p["file"])
        right = ttk.Frame(outer)
        right.pack(side="left", fill="both", expand=True)

        self.canvas = tk.Canvas(right, height=380, bg="#e7e7e7", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<Configure>", lambda _: self.preview())
        ttk.Label(right, text="Accessible photo description").pack(anchor="w", pady=(8, 2))
        ttk.Entry(right, textvariable=self.alt).pack(fill="x")
        ttk.Label(right, text="Display priority").pack(anchor="w", pady=(8, 2))
        ttk.Combobox(right, textvariable=self.priority,
                     values=["low", "normal", "portraitBoost", "featured"],
                     state="readonly").pack(anchor="w")

        framing = ttk.LabelFrame(right, text="Photography gallery framing (non-destructive)", padding=8)
        framing.pack(fill="x", pady=10)
        for row, (label, var, lower, upper) in enumerate((
            ("Gallery zoom", self.zoom, 1, 3),
            ("Focal horizontal (%)", self.focus_x, 0, 100),
            ("Focal vertical (%)", self.focus_y, 0, 100),
        )):
            ttk.Label(framing, text=label).grid(row=row, column=0, sticky="w", padx=4, pady=4)
            ttk.Scale(framing, variable=var, from_=lower, to=upper,
                      command=lambda _: self.preview()).grid(row=row, column=1, sticky="ew", padx=9)
            ttk.Label(framing, textvariable=var, width=5).grid(row=row, column=2, sticky="e")
        framing.grid_columnconfigure(1, weight=1)
        tags = ttk.LabelFrame(right, text="Filter tags", padding=8)
        tags.pack(fill="x", pady=8)
        for i, (name, var) in enumerate(self.tags.items()):
            ttk.Checkbutton(tags, text=name, variable=var).grid(
                row=i // 3, column=i % 3, sticky="w", padx=6, pady=4)
        self.listbox.selection_set(0)
        self.load(0)

    def select(self, _event=None):
        selected = self.listbox.curselection()
        if not selected: return
        if selected[0] == self.index: return
        self.store()
        self.load(selected[0])

    def store(self):
        if self.index is None or self.suspend: return
        p = self.photos[self.index]
        p["tags"] = [name for name, var in self.tags.items() if var.get()]
        p["alt"] = self.alt.get().strip()
        p["displayPriority"] = self.priority.get()
        p["galleryZoom"] = round(self.zoom.get(), 3)
        p["focusX"] = round(self.focus_x.get() / 100, 4)
        p["focusY"] = round(self.focus_y.get() / 100, 4)
        p.pop("tagStatus", None)

    def load(self, index):
        self.index = index
        p = self.photos[index]
        self.suspend = True
        self.alt.set(p["alt"])
        self.priority.set(p.get("displayPriority", "featured" if p.get("featured") else "normal"))
        self.zoom.set(p.get("galleryZoom", 1))
        self.focus_x.set(100 * p.get("focusX", .5))
        self.focus_y.set(100 * p.get("focusY", .5))
        for name, var in self.tags.items(): var.set(name in p.get("tags", []))
        self.suspend = False
        self.preview()

    def preview(self):
        if self.index is None or self.suspend: return
        try:
            image_path = ROOT / "photography" / "published" / self.photos[self.index]["file"]
            with Image.open(image_path) as file:
                image = ImageOps.exif_transpose(file).convert("RGB")
            image.thumbnail((1300, 1100), Image.Resampling.LANCZOS)
            image = framed_preview(image, self.zoom.get(), self.focus_x.get() / 100,
                                   self.focus_y.get() / 100)
            image.thumbnail((max(200, self.canvas.winfo_width() - 20),
                             max(170, self.canvas.winfo_height() - 20)), Image.Resampling.LANCZOS)
            self.preview_image = ImageTk.PhotoImage(image)
            self.canvas.delete("all")
            self.canvas.create_image(self.canvas.winfo_width() / 2, self.canvas.winfo_height() / 2,
                                     image=self.preview_image)
        except (OSError, ValueError):
            self.canvas.delete("all")
            self.canvas.create_text(200, 100, text="Preview unavailable")

    def reset_selected(self):
        if self.index is None: return
        if not messagebox.askyesno("Reset selected", "Discard unsaved metadata changes for this photo?"):
            return
        self.photos[self.index] = copy.deepcopy(self.initial["photos"][self.index])
        self.load(self.index)

    def reset_all(self):
        if not messagebox.askyesno("Reset all", "Discard all metadata edits not yet saved to the repository?"):
            return
        self.catalog = copy.deepcopy(self.initial)
        self.photos = self.catalog["photos"]
        self.load(self.index if self.index is not None else 0)

    def save(self):
        self.store()
        try:
            for p in self.photos:
                zoom, x, y = p.get("galleryZoom", 1), p.get("focusX", .5), p.get("focusY", .5)
                if not 1 <= zoom <= 3 or not 0 <= x <= 1 or not 0 <= y <= 1:
                    raise ValueError(f"Invalid gallery framing: {p['file']}")
            validate_catalog(self.catalog, ROOT)
            new_catalog = json.dumps(self.catalog, ensure_ascii=False, indent=2) + "\n"
            new_js = generated_js(self.catalog)
            old_catalog = C_PATH.read_text(encoding="utf-8")
            old_js = J_PATH.read_text(encoding="utf-8")
            try:
                C_PATH.write_text(new_catalog, encoding="utf-8")
                J_PATH.write_text(new_js, encoding="utf-8")
            except BaseException:
                C_PATH.write_text(old_catalog, encoding="utf-8")
                J_PATH.write_text(old_js, encoding="utf-8")
                raise
            self.initial = copy.deepcopy(self.catalog)
            messagebox.showinfo("Saved", "Catalog updated locally. Review the Photography page before pushing.")
        except (OSError, ValueError) as exc:
            messagebox.showerror("Save failed", str(exc))


if __name__ == "__main__":
    Editor().mainloop()
