"""Private local photo publisher. Originals are read-only and never uploaded."""
import json
import math
import re
import subprocess
import sys
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from PIL import Image, ImageOps, ImageTk

from catalog_tools import TAGS, read_json, validate_catalog, generated_js
from processor import (
    conservative_level, framed_preview, publish_image, unique_destination,
    straighten_and_crop,
    straighten_and_crop
)

ROOT = Path(__file__).resolve().parents[2]
PHOTO_DIR = ROOT / "photography" / "published"
CATALOG = ROOT / "data" / "media-catalog.json"
RUNTIME = ROOT / "js" / "photography-catalog.js"
LOGO = ROOT / "assets" / "homepage-2026" / "grape-default.png"
DEFAULT_SIZE = 1080
SIZE_PRESETS = ("480", "720", "960", "1080", "1440", "1920")


def filename_suggestion(filename):
    """File-name-only suggestion; never claim semantic computer vision."""
    text = Path(filename).stem
    text = re.sub(r"(?i)(?:^|[_ -])(?:web|final|edit|crop|copy|resized)\d*$", "", text)
    text = re.sub(r"[_-]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text or re.fullmatch(r"(?i)(?:img|dscf|dsc|p|photo|image|pxl)[\s\d.]*", text):
        return ""
    if len(text) < 7 or not re.search(r"[A-Za-z]{3,}", text):
        return ""
    return "Photograph of " + text[0].lower() + text[1:].rstrip(".") + "."


def local_caption(image):
    """Optional caption model; only explicitly invoked by the site owner.

    Package must be installed separately. Images are passed as in-memory PIL
    objects, never sent to any hosted inference service.
    """
    try:
        from transformers import pipeline
    except ImportError as exc:
        raise RuntimeError(
            'Optional local captions are not installed. In the Studio folder run:\n'
            r'.venv\Scripts\python.exe -m pip install -r requirements-captions.txt'
            '\nThen restart Studio.'
        ) from exc
    captioner = pipeline("image-to-text", model="Salesforce/blip-image-captioning-base", device=-1)
    result = captioner(image.convert("RGB"), max_new_tokens=60)
    caption = str(result[0].get("generated_text", "")).strip()
    if not caption:
        raise RuntimeError("Local caption model did not return a description.")
    return caption[:1].upper() + caption[1:].rstrip(".") + "."


def new_settings(path):
    # No ungrounded fabricated visual descriptions.
    return {
        "maxSide": str(DEFAULT_SIZE), "degrees": "0", "alt": "",
        "altReviewed": False, "tags": [], "displayPriority": "normal",
        "galleryZoom": 1.0, "focusX": .5, "focusY": .5,
    }


class Studio(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Portfolio Studio | Local Photo Publisher")
        self.minsize(980, 700)
        self.geometry("1220x860")
        self.files = []
        self.settings = {}
        self.current = None
        self.preview_photo = None
        self.preview_bounds = None
        self.dragstart = None
        self.suspend = False

        self.max_var = tk.StringVar(value=str(DEFAULT_SIZE))
        self.deg_var = tk.StringVar(value="0")
        self.alt_var = tk.StringVar()
        self.review_var = tk.BooleanVar(value=False)
        self.priority_var = tk.StringVar(value="normal")
        self.gallery_zoom = tk.DoubleVar(value=1.0)
        self.focus_x = tk.DoubleVar(value=50)
        self.focus_y = tk.DoubleVar(value=50)
        self.inspect_zoom = tk.DoubleVar(value=1.0)
        self.gallery_preview = tk.BooleanVar(value=True)
        self.tag_vars = {tag: tk.BooleanVar(value=False) for tag in TAGS}
        self.status = tk.StringVar(value="Select original photos stored outside the GitHub repository.")
        self.setup_ui()

    def setup_ui(self):
        toolbar = ttk.Frame(self, padding=8)
        toolbar.pack(fill="x")
        first_row = ttk.Frame(toolbar)
        first_row.pack(fill="x")
        second_row = ttk.Frame(toolbar)
        second_row.pack(fill="x", pady=(5, 0))
        for title, callback in (
            ("Choose photos", self.choose),
            ("Edit existing catalog photos", self.edit_tags),
            ("Suggest description", self.suggest_alt),
            ("AI describe locally (optional)", self.ai_caption),
        ):
            ttk.Button(first_row, text=title, command=callback).pack(side="left", padx=(0, 5))
        ttk.Button(first_row, text="Publish selected copies", command=self.publish).pack(side="right")
        for title, callback in (
            ("Auto-level suggestion", self.auto_level),
            ("Reset selected", self.reset_selected),
            ("Reset all unpublished", self.reset_all),
        ):
            ttk.Button(second_row, text=title, command=callback).pack(side="left", padx=(0, 5))
        ttk.Label(self, textvariable=self.status, wraplength=1170).pack(fill="x", padx=12, pady=(0, 5))

        body = ttk.Frame(self, padding=(10, 2, 10, 8))
        body.pack(fill="both", expand=True)
        left = ttk.Frame(body, width=190)
        left.pack(side="left", fill="y", padx=(0, 10))
        ttk.Label(left, text="Selected original photos").pack(anchor="w")
        self.files_list = tk.Listbox(left, width=27, exportselection=False)
        self.files_list.pack(fill="both", expand=True, pady=6)
        self.files_list.bind("<<ListboxSelect>>", self.choose_current)

        right = ttk.Frame(body)
        right.pack(side="left", fill="both", expand=True)
        preview_frame = ttk.Frame(right)
        preview_frame.pack(fill="both", expand=True)
        self.canvas = tk.Canvas(preview_frame, bg="#e8e9e9", highlightthickness=0, height=390)
        hbar = ttk.Scrollbar(preview_frame, orient="horizontal", command=self.canvas.xview)
        vbar = ttk.Scrollbar(preview_frame, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(xscrollcommand=hbar.set, yscrollcommand=vbar.set)
        self.canvas.grid(row=0, column=0, sticky="nsew")
        vbar.grid(row=0, column=1, sticky="ns")
        hbar.grid(row=1, column=0, sticky="ew")
        preview_frame.grid_columnconfigure(0, weight=1)
        preview_frame.grid_rowconfigure(0, weight=1)
        self.canvas.bind("<ButtonPress-1>", self.line_start)
        self.canvas.bind("<B1-Motion>", self.line_move)
        self.canvas.bind("<ButtonRelease-1>", self.line_end)
        self.canvas.bind("<Configure>", lambda _: self.preview())
        self.canvas.bind("<Control-MouseWheel>", self.wheel_zoom)
        self.canvas.bind("<MouseWheel>", self.wheel_scroll)
        self.canvas.bind("<Button-4>", lambda _: self.canvas.yview_scroll(-3, "units"))
        self.canvas.bind("<Button-5>", lambda _: self.canvas.yview_scroll(3, "units"))

        zoom_bar = ttk.Frame(right)
        zoom_bar.pack(fill="x", pady=(5, 3))
        ttk.Label(zoom_bar, text="Inspect zoom").pack(side="left")
        for label, val in (("100%", 1), ("200%", 2), ("400%", 4)):
            ttk.Button(zoom_bar, text=label, width=6,
                       command=lambda n=val: self.set_inspect_zoom(n)).pack(side="left", padx=2)
        ttk.Scale(zoom_bar, variable=self.inspect_zoom, from_=1, to=4,
                  command=lambda _: self.preview()).pack(side="left", fill="x", expand=True, padx=10)
        ttk.Checkbutton(zoom_bar, text="Preview gallery crop", variable=self.gallery_preview,
                        command=self.preview).pack(side="left")
        ttk.Label(right, text="Draw a horizon reference line on the image. Scrollbars pan at high zoom; Ctrl + wheel zooms.").pack(anchor="w", pady=(0, 7))

        fields = ttk.Frame(right)
        fields.pack(fill="x")
        ttk.Label(fields, text="Maximum side").grid(row=0, column=0, sticky="w", pady=3)
        ttk.Combobox(fields, textvariable=self.max_var, values=SIZE_PRESETS,
                     width=9).grid(row=0, column=1, sticky="w", padx=(4, 15))
        ttk.Label(fields, text="Rotation CCW").grid(row=0, column=2, sticky="w")
        degree_entry = ttk.Entry(fields, textvariable=self.deg_var, width=9)
        degree_entry.grid(row=0, column=3, sticky="w", padx=5)
        degree_entry.bind("<Return>", lambda _: self.preview())
        degree_entry.bind("<FocusOut>", lambda _: self.preview())
        ttk.Label(fields, text="Priority").grid(row=0, column=4, padx=(15, 4), sticky="w")
        ttk.Combobox(fields, textvariable=self.priority_var,
                     state="readonly", values=["low", "normal", "portraitBoost", "featured"],
                     width=15).grid(row=0, column=5, sticky="w")
        ttk.Label(fields, text="Gallery zoom").grid(row=1, column=0, sticky="w", pady=7)
        ttk.Scale(fields, variable=self.gallery_zoom, from_=1, to=3,
                  command=lambda _: self.preview()).grid(row=1, column=1, columnspan=2, sticky="ew", padx=4)
        ttk.Label(fields, text="Focal X (%)").grid(row=1, column=3, sticky="w")
        ttk.Scale(fields, variable=self.focus_x, from_=0, to=100,
                  command=lambda _: self.preview()).grid(row=1, column=4, sticky="ew", padx=4)
        ttk.Label(fields, text="Focal Y (%)").grid(row=1, column=5, sticky="w")
        ttk.Scale(fields, variable=self.focus_y, from_=0, to=100,
                  command=lambda _: self.preview()).grid(row=1, column=6, sticky="ew", padx=4)
        fields.grid_columnconfigure(2, weight=1)
        fields.grid_columnconfigure(4, weight=1)
        fields.grid_columnconfigure(6, weight=1)

        alt_area = ttk.Frame(right)
        alt_area.pack(fill="x", pady=(8, 2))
        ttk.Label(alt_area, text="Accessible photo description").pack(side="left", padx=(0, 8))
        ttk.Checkbutton(alt_area, text="Reviewed for accuracy", variable=self.review_var).pack(side="right")
        ttk.Entry(right, textvariable=self.alt_var).pack(fill="x")
        tags = ttk.LabelFrame(right, text="Photography tags", padding=7)
        tags.pack(fill="x", pady=8)
        for i, (name, var) in enumerate(self.tag_vars.items()):
            ttk.Checkbutton(tags, text=name, variable=var).grid(
                row=i // 3, column=i % 3, sticky="w", padx=8, pady=2
            )
        ttk.Label(
            right, text="Gallery crop is presentation-only metadata. Originals are never changed. "
                        "Reset affects unpublished edits only."
        ).pack(anchor="w", pady=2)

    def edit_tags(self):
        script = Path(__file__).with_name("edit_tags.py")
        subprocess.Popen([sys.executable, str(script)], cwd=str(script.parent))

    def set_inspect_zoom(self, new):
        self.inspect_zoom.set(new)
        self.preview()

    def wheel_zoom(self, event):
        self.set_inspect_zoom(min(4, max(1, self.inspect_zoom.get() + (.25 if event.delta > 0 else -.25))))
        return "break"

    def wheel_scroll(self, event):
        self.canvas.yview_scroll(-1 if event.delta > 0 else 1, "units")
        return "break"

    def choose(self):
        selected = filedialog.askopenfilenames(
            title="Choose original photos outside the public repository",
            filetypes=[("Photographs", "*.jpg *.jpeg *.png *.webp *.tif *.tiff"), ("All files", "*.*")]
        )
        if not selected: return
        paths = [Path(s).resolve() for s in selected]
        if any(p == ROOT or ROOT in p.parents for p in paths):
            messagebox.showerror("Source location", "Choose originals outside the GitHub working tree.")
            return
        self.save_current()
        for p in paths:
            if p not in self.files:
                self.files.append(p)
                self.settings[str(p)] = new_settings(p)
        self.files_list.delete(0, "end")
        for p in self.files: self.files_list.insert("end", p.name)
        if self.files:
            self.files_list.selection_clear(0, "end")
            self.files_list.selection_set(0)
            self.load_current(0)

    def choose_current(self, _event=None):
        selected = self.files_list.curselection()
        if not selected: return
        i = selected[0]
        if self.current == self.files[i]: return
        self.save_current()
        self.load_current(i)

    def save_current(self):
        if self.current is None or self.suspend: return
        self.settings[str(self.current)] = {
            "maxSide": self.max_var.get(), "degrees": self.deg_var.get(),
            "alt": self.alt_var.get(), "altReviewed": self.review_var.get(),
            "tags": [t for t, var in self.tag_vars.items() if var.get()],
            "displayPriority": self.priority_var.get(),
            "galleryZoom": round(self.gallery_zoom.get(), 3),
            "focusX": round(self.focus_x.get() / 100, 4),
            "focusY": round(self.focus_y.get() / 100, 4),
        }

    def load_current(self, i):
        self.current = self.files[i]
        s = self.settings[str(self.current)]
        self.suspend = True
        self.max_var.set(s["maxSide"])
        self.deg_var.set(s["degrees"])
        self.alt_var.set(s["alt"])
        self.review_var.set(s.get("altReviewed", False))
        self.priority_var.set(s["displayPriority"])
        self.gallery_zoom.set(s["galleryZoom"])
        self.focus_x.set(100 * s["focusX"])
        self.focus_y.set(100 * s["focusY"])
        for t, var in self.tag_vars.items(): var.set(t in s["tags"])
        self.inspect_zoom.set(1)
        self.suspend = False
        self.preview()

    def reset_selected(self):
        if self.current is None: return
        if not messagebox.askyesno("Reset selected photo", "Discard all unpublished settings for this photo?"):
            return
        self.settings[str(self.current)] = new_settings(self.current)
        self.load_current(self.files.index(self.current))
        self.status.set("Reset selected photo to defaults. No files changed.")

    def reset_all(self):
        if not self.files: return
        if not messagebox.askyesno("Reset all unpublished edits",
            "Discard all unsaved processing settings for every selected photo? Originals and existing published photos are unaffected."):
            return
        for p in self.files: self.settings[str(p)] = new_settings(p)
        self.load_current(self.files.index(self.current) if self.current in self.files else 0)
        self.status.set("All unpublished photo settings reset.")

    def suggest_alt(self):
        if self.current is None: return
        suggested = filename_suggestion(self.current.name)
        if not suggested:
            self.status.set("Filename is not descriptive enough for a safe suggestion. Use AI describe locally or enter a description.")
            return
        if self.alt_var.get() and not messagebox.askyesno("Replace description", "Replace existing description with a filename-based suggestion?"):
            return
        self.alt_var.set(suggested)
        self.review_var.set(False)
        self.status.set("Filename-derived suggestion only. Verify the description accurately represents the photograph.")

    def ai_caption(self):
        if self.current is None: return
        if not messagebox.askyesno("Optional local image caption",
            "This feature requires a separately installed local image-captioning model. "
            "On first use, model files may be downloaded to your computer. "
            "Your image is processed locally, not sent to a hosted inference API. "
            "Generated descriptions may be inaccurate. Continue?"):
            return
        try:
            self.configure(cursor="watch")
            self.status.set("Generating a tentative local description. It must be reviewed.")
            self.update_idletasks()
            with Image.open(self.current) as im:
                image = ImageOps.exif_transpose(im).convert("RGB")
                image.thumbnail((900, 900))
            caption = local_caption(image)
            if self.alt_var.get() and not messagebox.askyesno("Replace description", "Replace existing description with AI suggestion?"):
                return
            self.alt_var.set(caption)
            self.review_var.set(False)
            self.status.set("Local AI suggestion generated. Review and edit it before publishing.")
        except Exception as exc:
            messagebox.showerror("Local caption unavailable", str(exc))
        finally:
            self.configure(cursor="")

    def _source_preview(self):
        with Image.open(self.current) as f:
            image = ImageOps.exif_transpose(f).convert("RGB")
        try: degrees = float(self.deg_var.get())
        except ValueError: degrees = 0
        # Use a resampled local thumbnail for responsive inspection and avoid
        # allocating huge photo buffers at 400% zoom.
        image.thumbnail((2400, 1800), Image.Resampling.LANCZOS)
        if abs(degrees) > .0001:
            image = straighten_and_crop(image, degrees)
        if self.gallery_preview.get():
            image = framed_preview(image, self.gallery_zoom.get(),
                                   self.focus_x.get() / 100, self.focus_y.get() / 100)
        return image

    def preview(self):
        if self.current is None or self.suspend: return
        try:
            image = self._source_preview()
            vw = max(320, self.canvas.winfo_width() - 25)
            vh = max(250, self.canvas.winfo_height() - 25)
            image.thumbnail((vw, vh), Image.Resampling.LANCZOS)
            zoom = self.inspect_zoom.get()
            if zoom != 1:
                image = image.resize((max(1, round(image.width * zoom)),
                                      max(1, round(image.height * zoom))), Image.Resampling.BICUBIC)
            x = max(0, (self.canvas.winfo_width() - image.width) / 2)
            y = max(0, (self.canvas.winfo_height() - image.height) / 2)
            self.preview_bounds = (x, y, x + image.width, y + image.height)
            self.preview_photo = ImageTk.PhotoImage(image)
            self.canvas.delete("all")
            self.canvas.create_image(x, y, anchor="nw", image=self.preview_photo)
            self.canvas.configure(scrollregion=(0, 0, max(vw + 25, x + image.width),
                                                max(vh + 25, y + image.height)))
            self.status.set(f"Inspect {zoom:.1f}x | Gallery zoom {self.gallery_zoom.get():.2f}x "
                            f"| Focus {self.focus_x.get():.0f}% / {self.focus_y.get():.0f}%")
        except (OSError, ValueError, ZeroDivisionError) as exc:
            self.status.set(f"Preview error: {exc}")

    def auto_level(self):
        if self.current is None: return
        with Image.open(self.current) as f:
            image = ImageOps.exif_transpose(f).convert("RGB")
        proposed = conservative_level(image)
        if proposed is None:
            self.status.set("No reliable automatic horizon found. Draw a reference line or enter a rotation.")
        else:
            self.deg_var.set(str(proposed))
            self.preview()
            self.status.set(f"Auto-level suggests {proposed:+.2f} degrees. Review before publishing.")

    def line_start(self, event):
        if self.current is None or self.preview_bounds is None: return
        x, y = self.canvas.canvasx(event.x), self.canvas.canvasy(event.y)
        x0, y0, x1, y1 = self.preview_bounds
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            self.dragstart = None
            return
        self.dragstart = (x, y)
        self.canvas.delete("level-line")

    def line_move(self, event):
        if self.dragstart is None: return
        x, y = self.canvas.canvasx(event.x), self.canvas.canvasy(event.y)
        self.canvas.delete("level-line")
        self.canvas.create_line(*self.dragstart, x, y, fill="#edab36", width=3, tags="level-line")

    def line_end(self, event):
        if self.dragstart is None or self.preview_bounds is None: return
        x1, y1 = self.dragstart
        x2, y2 = self.canvas.canvasx(event.x), self.canvas.canvasy(event.y)
        self.dragstart = None
        bx0, by0, bx1, by1 = self.preview_bounds
        if not (bx0 <= x2 <= bx1 and by0 <= y2 <= by1):
            self.status.set("End the guide line inside the image.")
            return
        dx, dy = x2 - x1, y2 - y1
        if math.hypot(dx, dy) < 25:
            self.status.set("Guide line too short. Zoom in or draw a longer line.")
            return
        if dx < 0: dx, dy = -dx, -dy
        correction = math.degrees(math.atan2(dy, dx))
        if abs(correction) > 35:
            self.status.set("Reference must be near-horizontal, within 35 degrees.")
            return
        # The line is drawn in the *already-rotated* preview, so add it.
        current = float(self.deg_var.get())
        new = current + correction
        if abs(new) > 35:
            self.status.set("Combined rotation exceeds the supported 35-degree range.")
            return
        self.deg_var.set(f"{new:.3f}")
        self.preview()
        self.status.set(f"Reference-line correction {correction:+.3f} degrees. Total rotation {new:+.3f} degrees.")

    def publish(self):
        if not self.files: return
        self.save_current()
        if not CATALOG.is_file():
            messagebox.showerror("Catalog missing", "Install Stage 6B before using this tool.")
            return
        try:
            catalog = read_json(CATALOG)
            validate_catalog(catalog, ROOT)
            planned = []
            reserved = set()
            for p in self.files:
                s = self.settings[str(p)]
                size = int(s["maxSide"])
                degree = float(s["degrees"])
                zoom = float(s["galleryZoom"])
                fx, fy = float(s["focusX"]), float(s["focusY"])
                if not 300 <= size <= 6000 or not -35 <= degree <= 35:
                    raise ValueError(f"Invalid size or rotation for {p.name}")
                if not 1 <= zoom <= 3 or not 0 <= fx <= 1 or not 0 <= fy <= 1:
                    raise ValueError(f"Invalid gallery crop settings for {p.name}")
                if not s["alt"].strip() or not s.get("altReviewed"):
                    raise ValueError(f"Review and confirm the accessible photo description for {p.name}")
                dest = unique_destination(PHOTO_DIR, p)
                suffix = 2
                while dest.name.casefold() in reserved:
                    dest = PHOTO_DIR / (p.stem + "_web_" + str(suffix) + ".jpg")
                    suffix += 1
                reserved.add(dest.name.casefold())
                planned.append((p, s, dest))
        except (ValueError, OSError) as exc:
            messagebox.showerror("Validation failed", str(exc))
            return
        if not messagebox.askyesno("Publish local copies",
            f"Generate {len(planned)} watermarked publication copies and update the catalog?\n\n"
            "All originals remain unchanged and outside GitHub. The new files stay local until you commit/push."):
            return
        created = []
        old_catalog = CATALOG.read_text(encoding="utf-8")
        old_js = RUNTIME.read_text(encoding="utf-8")
        try:
            for path, s, dest in planned:
                result = publish_image(path, dest, max_side=int(s["maxSide"]),
                                       degrees=float(s["degrees"]),
                                       logo=LOGO if LOGO.is_file() else None)
                created.append(dest)
                catalog["photos"].append({
                    "file": dest.name, "alt": s["alt"].strip(), "visible": True,
                    "featured": s["displayPriority"] == "featured",
                    "displayPriority": s["displayPriority"],
                    "aspectRatio": result["aspectRatio"], "tags": s["tags"],
                    "galleryZoom": round(float(s["galleryZoom"]), 3),
                    "focusX": round(float(s["focusX"]), 4),
                    "focusY": round(float(s["focusY"]), 4),
                })
            validate_catalog(catalog, ROOT)
            new_catalog = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
            new_js = generated_js(catalog)
            try:
                CATALOG.write_text(new_catalog, encoding="utf-8")
                RUNTIME.write_text(new_js, encoding="utf-8")
            except BaseException:
                CATALOG.write_text(old_catalog, encoding="utf-8")
                RUNTIME.write_text(old_js, encoding="utf-8")
                raise
            messagebox.showinfo("Ready for local review", f"Added {len(created)} processed photographs. "
                                "Review the local site before committing.")
            self.files, self.settings, self.current = [], {}, None
            self.files_list.delete(0, "end")
            self.canvas.delete("all")
            self.status.set("Publication copies ready. Original photographs remain unchanged.")
        except Exception as exc:
            for p in created: p.unlink(missing_ok=True)
            # Restore catalog if processing failed after partial update.
            if CATALOG.read_text(encoding="utf-8") != old_catalog:
                CATALOG.write_text(old_catalog, encoding="utf-8")
            if RUNTIME.read_text(encoding="utf-8") != old_js:
                RUNTIME.write_text(old_js, encoding="utf-8")
            messagebox.showerror("Publishing stopped", f"Processing failed: {exc}. New copies were removed.")


if __name__ == "__main__":
    if not CATALOG.is_file():
        messagebox.showerror("Not installed", "Install Stage 6B before launching Portfolio Studio.")
        sys.exit(1)
    Studio().mainloop()
