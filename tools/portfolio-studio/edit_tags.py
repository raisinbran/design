"""Edit the site's existing photo metadata, using free-aspect-ratio crop outlines."""
import copy
import json
import os
import tempfile
import tkinter as tk
from pathlib import Path
from tkinter import ttk, messagebox, simpledialog
import math

from PIL import Image, ImageOps
from catalog_tools import read_json, generated_js, validate_catalog
from photo_viewport import PhotoViewport, normalize_crop
from thumbnail_list import ThumbnailList
from studio_notifications import notify
from manage_published import ManagementActions, enumerate_files
from responsive_toolbar import ResponsiveToolbar, choices
from window_state import remember_window
from gallery_thumbnails import run_builder,read_registry,create_thumbnail,asset_transaction,save_registry,photo_framing

ROOT = Path(__file__).resolve().parents[2]
C_PATH = ROOT / "data" / "media-catalog.json"
J_PATH = ROOT / "js" / "photography-catalog.js"


def legacy_framing(p):
    """A visual estimate of old zoom/focus if a crop has not yet been drawn.

    This is used only to explain the old setting visually. It is not written
    to catalog until a crop is intentionally drawn.
    """
    zoom = max(1., float(p.get("galleryZoom") or 1))
    if zoom <= 1:
        return None
    w = h = 1 / zoom
    fx, fy = float(p.get("focusX", .5)), float(p.get("focusY", .5))
    x = max(0.0, min(1-w, fx - w/2))
    y = max(0.0, min(1-h, fy - h/2))
    return normalize_crop({"x": x, "y": y, "width": w, "height": h})


def atomic_catalog_pair(c_text, j_text):
    import datetime
    backup = ROOT / "_old" / ("portfolio-studio-catalog-" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f"))
    backup.mkdir(parents=True, exist_ok=False)
    targets = [(C_PATH, c_text), (J_PATH, j_text)]
    old = {}
    staged = {}
    try:
        for path, content in targets:
            old[path] = path.read_bytes()
            (backup / path.name).write_bytes(old[path])
            fd, name = tempfile.mkstemp(dir=path.parent, suffix=".staged")
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
                stream.write(content)
            staged[path] = Path(name)
        json.loads(staged[C_PATH].read_text(encoding="utf-8"))
        for path, _ in targets:
            os.replace(staged[path], path)
    except BaseException:
        for path in old:
            if path.exists() and path.read_bytes() != old[path]:
                path.write_bytes(old[path])
        raise
    finally:
        for p in staged.values():
            p.unlink(missing_ok=True)

class Editor(ManagementActions, tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Portfolio Studio | Published Photo Catalog")
        self.geometry(f"{max(960,min(1430,self.winfo_screenwidth()-60))}x{max(620,min(910,self.winfo_screenheight()-85))}")
        self.minsize(960, 620)
        self.catalog_root=ROOT
        remember_window(self,"published-catalog")
        self.catalog = read_json(C_PATH)
        validate_catalog(self.catalog)
        self.photos = self.catalog["photos"]
        self.initial = copy.deepcopy(self.catalog)
        self.index = None
        self.tags = {tag: tk.BooleanVar() for tag in self.catalog["photoTags"]}
        self.alt = tk.StringVar()
        self.review_var = tk.BooleanVar(value=False)
        self.priority = tk.StringVar(value="normal")
        self.zoom = tk.DoubleVar(value=1)
        self.mode_var = tk.StringVar(value="crop")
        self.status = tk.StringVar(value="Draw any rectangular crop, without a fixed aspect ratio.")
        self.dimensions_text = tk.StringVar(value="Published image: none | Gallery crop: none")
        self.crop_rect = None
        self.crop_touched = False
        self.crop_pending = False
        self.suspend = False
        self.cache = {}
        self.tabs=ttk.Notebook(self)
        self.tabs.pack(fill="both",expand=True)
        self.catalog_page=ttk.Frame(self.tabs)
        self.tabs.add(self.catalog_page,text="Edit published photos")
        self.setup()
        self.alt.trace_add("write", self.description_changed)
        for variable in [self.alt,self.review_var,self.priority,*self.tags.values()]:
            variable.trace_add("write", lambda *_: self.after_idle(self.refresh_dirty))
        self.protocol("WM_DELETE_WINDOW", self.close_editor)
        self.refresh_dirty()

    def description_changed(self, *_):
        if not self.suspend and self.index is not None and self.alt.get().strip():
            self.review_var.set(True)

    def setup(self):
        management = ResponsiveToolbar(self.catalog_page, padding=(10, 4, 10, 2))
        self.management_toolbar = management
        management.pack(fill="x")
        for label, action in (
            ("Refresh", self.refresh),
            ("Build/update thumbnails…", lambda:run_builder(self)),
            ("Add to gallery…", self.import_unlisted),
            ("Remove gallery entries", lambda: self.remove(False)),
            ("Remove and archive JPEGs", lambda: self.remove(True)),
            ("Remove from repository…", self.delete_published),
            ("Match renamed JPEG…", self.match_rename),
        ):
            command=lambda action=action: self.run_management(action)
            group=management.group(label,lambda menu,label=label,command=command:
                menu.add_command(label=label,command=command),
                priority=10 if label=="Add to gallery…" else 0)
            ttk.Button(group,text=label,command=command).pack(side="left")
        bar = ttk.Frame(self.catalog_page, padding=(10, 5, 10, 8))
        self.catalog_actions_bar=bar
        bar.pack(fill="x")
        self.save_button = ttk.Button(bar, text="Save changes locally", command=self.save)
        self.dirty_label = ttk.Label(bar, text="")
        self.dirty_label.pack(side="right", padx=12)
        ttk.Button(bar, text="Arrange gallery...", command=self.open_arranger).pack(side="left", padx=(3,6))
        for label, call in (
            ("Reset selected", self.reset_selected),
            ("Reset all unsaved", self.reset_all),
            ("Use full photo", self.full_crop),
        ):
            ttk.Button(bar, text=label, command=call).pack(side="left", padx=(0, 6))
        self.save_button.pack(side="left",padx=(0,6))
        ttk.Label(self.catalog_page, text="Gallery crops affect website framing only. Published JPEG pixels are unchanged.",
                  padding=(12,0,12,4)).pack(fill="x")

        body = ttk.Frame(self.catalog_page, padding=(10, 0, 10, 5))
        body.pack(fill="both", expand=True)
        left = ttk.Frame(body)
        left.pack(side="left", fill="y", padx=(0, 12))
        ttk.Label(left,text="Unlisted photos: select, then Add to gallery…\nCtrl/Shift: select multiple photos").pack(anchor="w",pady=(0,4))
        self.listbox = ThumbnailList(left)
        self.listbox.pack(fill="both", expand=True)
        self.listbox.bind("<<ListboxSelect>>", self.select)
        self.populate_photo_list()
        right = ttk.Frame(body)
        right.pack(side="left", fill="both", expand=True)

        self.viewport = PhotoViewport(right, on_crop=self.crop_changed)
        self.grid_var = tk.StringVar(value="off")
        self.ratio_var = tk.StringVar(value="Free")
        self.custom_width = tk.StringVar(value="7")
        self.custom_height = tk.StringVar(value="5")
        self.viewport.pack(fill="both", expand=True)

        viewer = ttk.Frame(right, padding=(0, 4))
        viewer.pack(fill="x")
        ttk.Label(viewer, text="Inspect").pack(side="left", padx=(0, 5))
        for label, value in (("100%", 1), ("200%", 2), ("400%", 4)):
            ttk.Button(viewer, text=label, width=6,
                       command=lambda v=value: self.set_zoom(v)).pack(side="left", padx=2)
        ttk.Scale(viewer, variable=self.zoom, from_=1, to=4,
                  command=self.set_zoom).pack(side="left", fill="x", expand=True, padx=9)
        crop_toolbar=ResponsiveToolbar(right,padding=(0,4))
        self.crop_toolbar=crop_toolbar
        crop_toolbar.pack(fill="x")
        mode_group=crop_toolbar.group("Editing mode",lambda menu: choices(menu,self.mode_var,
            ("crop","pan"),self.change_mode), 7)
        for label, mode in (("Draw crop", "crop"), ("Pan", "pan")):
            ttk.Radiobutton(mode_group, text=label, variable=self.mode_var,
                            value=mode, command=self.change_mode
                            ).pack(side="left", padx=5)

        ratio_group=crop_toolbar.group("Crop Ratio",self.ratio_menu,9)
        ttk.Label(ratio_group,text="Crop Ratio").pack(side="left",padx=(3,2))
        ttk.Combobox(ratio_group,textvariable=self.ratio_var,state="readonly",width=10,
                     values=("Free","Original","1:1","3:2","2:3","4:3","3:4","5:4","4:5","16:9","9:16","Custom")).pack(side="left")
        custom_group=crop_toolbar.group("Custom crop ratio", lambda menu: menu.add_command(
            label="Enter width and height…",command=self.prompt_custom_ratio),2)
        ttk.Entry(custom_group,textvariable=self.custom_width,width=4).pack(side="left",padx=(5,1))
        ttk.Label(custom_group,text=":").pack(side="left")
        ttk.Entry(custom_group,textvariable=self.custom_height,width=4).pack(side="left",padx=(1,2))
        ttk.Button(custom_group,text="Set custom",command=self.set_custom_ratio).pack(side="left",padx=3)
        self.ratio_var.trace_add("write", self.set_crop_ratio)
        grid_group=crop_toolbar.group("Composition grid",lambda menu: choices(menu,self.grid_var,
            ("off","thirds","center","golden")),3)
        ttk.Label(grid_group,text="Grid").pack(side="left",padx=(3,3))
        ttk.Combobox(grid_group,textvariable=self.grid_var,state="readonly",
                     values=("off","thirds","center","golden"),width=9).pack(side="left")
        self.grid_var.trace_add("write",lambda *_:self.viewport.set_grid(self.grid_var.get()))
        apply_group=crop_toolbar.group("Gallery crop",self.crop_menu,10)
        self.apply_crop_button=ttk.Button(apply_group,text="Apply gallery crop",command=self.apply_gallery_crop,state="disabled")
        self.apply_crop_button.pack(side="left",padx=3)
        ttk.Button(apply_group,text="Preview crop",command=self.preview_crop).pack(side="left",padx=3)

        info = ttk.Frame(right, padding=(0, 4))
        info.pack(fill="x")
        ttk.Label(info, text="Accessible description").pack(side="left", padx=(0, 6))
        ttk.Entry(info, textvariable=self.alt).pack(side="left", fill="x", expand=True)
        ttk.Checkbutton(info, text="Reviewed", variable=self.review_var).pack(side="left", padx=6)
        ttk.Label(info, text="Priority").pack(side="left", padx=(13, 5))
        ttk.Combobox(info, textvariable=self.priority, state="readonly",
                     values=["low", "normal", "portraitBoost", "featured"],
                     width=14).pack(side="left")

        tags = ttk.LabelFrame(right, text="Photography tags", padding=(7, 3))
        tags.pack(fill="x", pady=(2, 4))
        for name, var in self.tags.items():
            ttk.Checkbutton(tags, text=name, variable=var).pack(side="left", padx=(0, 12))
        self.edit_control_frames=(info,tags,crop_toolbar)

        ttk.Label(right, textvariable=self.dimensions_text,foreground="#3a5960",
                  padding=(0,4)).pack(fill="x")
        ttk.Label(self.catalog_page, textvariable=self.status, padding=(10, 0, 10, 5),
                  wraplength=1170).pack(fill="x")

        if self.photo_rows:
            self.listbox.selection_set(0)
            self.select()
        else:self.clear_empty_view()

    def update_dimensions(self):
        if self.index is None:
            self.dimensions_text.set("Published image: none | Gallery crop: none")
            return
        try:
            path=ROOT/"photography"/"published"/self.photos[self.index]["file"]
            with Image.open(path) as source:
                w,h=ImageOps.exif_transpose(source).size
            crop=self.crop_rect
            if crop:
                cw=max(1,round(w*crop["width"]))
                ch=max(1,round(h*crop["height"]))
                self.dimensions_text.set(f"Published image: {w} × {h} px | Gallery crop: {cw} × {ch} px (framing only)")
            else:
                self.dimensions_text.set(f"Published image: {w} × {h} px | Gallery crop: Full photograph")
        except (OSError,ValueError,TypeError,KeyError) as exc:
            self.dimensions_text.set(f"Dimensions unavailable: {exc}")

    def populate_photo_list(self):
        files={path.name.casefold() for path in enumerate_files()}
        self.photo_rows=[]
        self.listbox.delete(0,"end")
        tracked=set()
        for index,photo in enumerate(self.photos):
            name=photo["file"];tracked.add(name.casefold())
            state="Published" if name.casefold() in files else "Missing file"
            self.photo_rows.append((state,name,index))
            thumb=ROOT/"photography"/"thumbnails"/photo.get("thumbnail", "")
            preview=thumb if photo.get("thumbnail") and thumb.is_file() else ROOT/"photography"/"published"/name
            self.listbox.insert("end",name if state=="Published" else f"[Missing] {name}",path=preview)
        for path in enumerate_files():
            if path.name.casefold() not in tracked:
                self.photo_rows.append(("Unlisted file",path.name,None))
                self.listbox.insert("end",f"[Unlisted] {path.name}",path=path)

    def selected(self):
        selection=self.listbox.curselection()
        if not selection:return None,None
        active=self.listbox.index("active")
        row=active if active in selection else selection[0]
        state,name,_index=self.photo_rows[row]
        return state,name

    def selected_rows(self):
        return [(self.photo_rows[row][0],self.photo_rows[row][1]) for row in self.listbox.curselection()]

    def run_management(self,action):
        self.refresh_dirty()
        if self.catalog!=self.initial or self.crop_pending:
            messagebox.showwarning("Save changes first",
                "Save or reset your edits before managing published photographs.")
            return
        if read_json(C_PATH)!=self.initial:
            messagebox.showwarning("Catalog changed","Refresh the photo list before managing photographs.")
            self.refresh()
            return
        action()

    def refresh(self):
        _state,name=self.selected()
        names={filename for _state,filename in self.selected_rows()}
        self.catalog=read_json(C_PATH)
        self.initial=copy.deepcopy(self.catalog)
        self.photos=self.catalog["photos"]
        self.cache.clear()
        self.viewport.set_source(None)
        self.index=None
        self.populate_photo_list()
        rows=[i for i,(_,filename,_) in enumerate(self.photo_rows) if filename in names]
        if not rows and self.photo_rows:rows=[0]
        for row in rows:self.listbox.selection_set(row)
        if rows:
            active=next((i for i,(_,filename,_) in enumerate(self.photo_rows) if filename==name),rows[0])
            self.listbox.activate(active)
            self.select()
        else:self.clear_empty_view()
        self.refresh_dirty()

    def clear_empty_view(self):
        self.index=None;self.suspend=True
        self.alt.set("");self.review_var.set(False);self.priority.set("normal")
        for var in self.tags.values():var.set(False)
        self.suspend=False
        self.crop_rect=None;self.crop_pending=False;self.crop_touched=False
        self.viewport.set_source(None);self.viewport.set_crop(None)
        self.set_edit_controls(False)
        self.dimensions_text.set("Published image: none | Gallery crop: none")
        self.status.set("No published or unlisted photographs. Publish photos from the main editor to get started.")

    def set_edit_controls(self,enabled):
        def visit(parent):
            for child in parent.winfo_children():
                if isinstance(child,(ttk.Button,ttk.Entry,ttk.Combobox,ttk.Checkbutton,ttk.Radiobutton)):
                    child.state(["!disabled"] if enabled else ["disabled"])
                visit(child)
        for frame in self.edit_control_frames:visit(frame)
        self.apply_crop_button.configure(state="normal" if enabled and self.crop_pending else "disabled")

    def load_unlisted(self,name):
        self.index=None
        self.suspend=True
        self.alt.set("");self.review_var.set(False)
        self.priority.set("normal")
        for var in self.tags.values():var.set(False)
        self.suspend=False
        self.crop_rect=None;self.crop_touched=False;self.crop_pending=False
        self.set_edit_controls(False)
        self.viewport.set_crop(None);self.viewport.set_mode("pan")
        self.viewport.set_zoom(1)
        try:
            with Image.open(ROOT/"photography"/"published"/name) as source:
                image=ImageOps.exif_transpose(source).convert("RGB")
                self.dimensions_text.set(f"Published image: {image.width} × {image.height} px | Unlisted photo")
                image.thumbnail((2600,2600),Image.Resampling.LANCZOS)
            self.viewport.set_source(image,identity=("unlisted",name))
            self.status.set("Unlisted photo. Choose Import unlisted photo to add it to the gallery and edit its metadata.")
        except (OSError,ValueError) as exc:
            self.viewport.set_source(None)
            self.dimensions_text.set("Preview unavailable")
            self.status.set(f"Cannot show photograph: {exc}")
        self.refresh_dirty()

    def set_custom_ratio(self):
        try:
            a,b=float(self.custom_width.get()),float(self.custom_height.get())
            if not all(math.isfinite(v) and v>0 for v in (a,b)):raise ValueError()
        except ValueError:
            messagebox.showerror("Invalid ratio","Enter two positive numbers.");return
        self.ratio_var.set("Custom")
        self.viewport.set_aspect_ratio(a/b)

    def set_crop_ratio(self,*_):
        if self.index is None:return
        label=self.ratio_var.get()
        if label=="Free":target=None
        elif label=="Original":
            target=self.viewport.source.width/self.viewport.source.height if self.viewport.source else None
        elif label=="Custom":
            try:target=float(self.custom_width.get())/float(self.custom_height.get())
            except (ValueError,ZeroDivisionError):return
        else:
            a,b=map(float,label.split(":"));target=a/b
        self.viewport.set_aspect_ratio(target)

    def preview_crop(self):
        from PIL import ImageTk
        pic=self.viewport.crop_preview()
        if pic is None:return
        win=tk.Toplevel(self)
        win.title("Published gallery crop preview")
        win.geometry("820x650")
        remember_window(win,"catalog-crop-preview")
        label=tk.Label(win,bg="#242424")
        label.pack(fill="both",expand=True)
        def resize(_event=None):
            if not win.winfo_exists():return
            im=pic.copy()
            im.thumbnail((max(10,label.winfo_width()-20),
                          max(10,label.winfo_height()-20)),Image.Resampling.LANCZOS)
            label.image=ImageTk.PhotoImage(im)
            label.configure(image=label.image)
        label.bind("<Configure>",resize)
        win.after(50,resize)

    def change_mode(self):
        self.viewport.set_mode(self.mode_var.get() if self.index is not None else "pan")

    def ratio_menu(self,menu):
        choices(menu,self.ratio_var,("Free","Original","1:1","3:2","2:3","4:3","3:4","5:4","4:5","16:9","9:16"))
        menu.add_command(label="Custom…",command=self.prompt_custom_ratio)

    def prompt_custom_ratio(self):
        value=simpledialog.askstring("Crop Ratio","Width:height (for example 7:5)",
            initialvalue=f"{self.custom_width.get()}:{self.custom_height.get()}",parent=self)
        if value is None:return
        try:
            a,b=value.split(":")
            if not all(math.isfinite(float(v)) and float(v)>0 for v in (a,b)):raise ValueError()
        except ValueError:
            messagebox.showerror("Crop Ratio","Enter two positive numbers separated by a colon.");return
        self.custom_width.set(a);self.custom_height.set(b);self.set_custom_ratio()

    def crop_menu(self,menu):
        menu.add_command(label="Apply gallery crop",command=self.apply_gallery_crop,
            state=str(self.apply_crop_button.cget("state")))
        menu.add_command(label="Preview crop",command=self.preview_crop)

    def set_zoom(self, value):
        value = min(4., max(1., float(value)))
        if abs(self.zoom.get() - value) > .001:
            self.zoom.set(value)
        self.viewport.set_zoom(value)

    def select(self, _event=None):
        selected = self.listbox.curselection()
        if not selected: return
        active=self.listbox.index("active")
        row=active if active in selected else selected[0]
        _state,name,index=self.photo_rows[row]
        if index is not None and index == self.index: return
        self.store()
        if index is None:self.load_unlisted(name)
        else:self.load(index,preserve_selection=True)

    def store(self):
        if self.index is None or self.suspend: return
        photo = self.photos[self.index]
        tags = [tag for tag, var in self.tags.items() if var.get()]
        if tags != photo.get("tags", []): photo["tags"] = tags
        if self.alt.get().strip() != photo.get("alt", ""): photo["alt"] = self.alt.get().strip()
        needs_review = not self.review_var.get()
        if needs_review != photo.get("altNeedsReview", False):
            photo["altNeedsReview"] = needs_review
        priority = self.priority.get()
        if priority != photo.get("displayPriority", "featured" if photo.get("featured") else "normal"):
            photo["displayPriority"] = priority
        if self.crop_touched:
            if self.crop_rect is not None:
                photo["galleryCrop"] = normalize_crop(self.crop_rect)
            else:
                photo.pop("galleryCrop", None)
            # The new crop tool supersedes legacy framing when edited.
            photo.pop("galleryZoom", None)
            photo.pop("focusX", None)
            photo.pop("focusY", None)

    def load(self, index, preserve_selection=False):
        self.index = index
        photo = self.photos[index]
        row=next(i for i,(_,name,_) in enumerate(self.photo_rows) if name==photo["file"])
        if not preserve_selection:
            self.listbox.selection_clear(0,"end");self.listbox.selection_set(row)
        self.listbox.activate(row)
        self.set_edit_controls(True)
        self.viewport.set_mode(self.mode_var.get())
        self.suspend = True
        self.alt.set(photo["alt"])
        self.review_var.set(not photo.get("altNeedsReview", False))
        self.priority.set(photo.get("displayPriority", "featured" if photo.get("featured") else "normal"))
        for tag, var in self.tags.items():
            var.set(tag in photo.get("tags", []))
        self.crop_rect = photo.get("galleryCrop")
        self.crop_touched = False
        self.crop_pending = False
        self.apply_crop_button.configure(state="disabled")
        self.zoom.set(1)
        self.viewport.set_zoom(1)
        self.suspend = False
        try:
            filename = photo["file"]
            path = ROOT / "photography" / "published" / filename
            if filename not in self.cache:
                with Image.open(path) as inp:
                    image = ImageOps.exif_transpose(inp).convert("RGB")
                    image.thumbnail((2600, 2600), Image.Resampling.LANCZOS)
                if len(self.cache) > 8:
                    self.cache.clear()
                self.cache[filename] = image
            self.viewport.set_source(self.cache[filename], identity=filename)
            with Image.open(path) as original:
                self.viewport.measurement_size=ImageOps.exif_transpose(original).size
            self.viewport.set_crop(self.crop_rect if self.crop_rect else legacy_framing(photo))
            self.update_dimensions()
            if self.crop_rect:
                self.status.set("Saved custom crop. Draw another rectangle to change its ratio.")
            elif float(photo.get("galleryZoom", 1) or 1) > 1:
                self.status.set("Legacy zoom/focus is retained. Outline is approximate until you draw a new crop.")
            else:
                self.status.set("Full photograph shown. Draw a rectangle to define the final gallery crop.")
        except (OSError, ValueError) as exc:
            self.viewport.set_source(None)
            self.dimensions_text.set("Published image unavailable | Missing file")
            self.status.set(f"Cannot show photograph: {exc}")

    def crop_changed(self, crop):
        if self.index is None:return
        self.crop_rect = normalize_crop(crop) if crop else None
        self.crop_pending = self.crop_rect is not None
        if self.crop_rect is None:self.crop_touched=True
        self.apply_crop_button.configure(state="normal" if self.crop_rect else "disabled")
        self.after_idle(self.refresh_dirty)
        self.update_dimensions()
        if self.crop_rect and self.viewport.source:
            ratio = self.viewport.source.width / self.viewport.source.height
            ratio *= self.crop_rect["width"] / self.crop_rect["height"]
            self.status.set(f"New crop {ratio:.2f}:1. Only the outlined region will appear on the gallery.")
        else:
            self.status.set("Full photo selected.")

    def apply_gallery_crop(self):
        if self.index is None or not self.crop_pending: return
        self.crop_touched = True
        self.crop_pending = False
        self.apply_crop_button.configure(state="disabled")
        self.refresh_dirty()
        self.status.set("Gallery crop applied to pending catalog edits. Use Save changes locally to publish metadata.")

    def full_crop(self):
        if self.index is None: return
        self.crop_touched = True
        self.crop_pending = False
        self.apply_crop_button.configure(state="disabled")
        self.crop_rect = None
        self.viewport.set_crop(None)
        self.update_dimensions()
        self.refresh_dirty()
        self.status.set("Full photograph selected; older zoom/focus will be cleared after saving.")

    def reset_selected(self):
        if self.index is None: return
        if not messagebox.askyesno("Reset selected", "Discard unsaved changes to this photo?"):
            return
        self.photos[self.index] = copy.deepcopy(self.initial["photos"][self.index])
        self.load(self.index)
        self.refresh_dirty()

    def reset_all(self):
        if not messagebox.askyesno("Reset all", "Discard ALL unsaved catalog edits?"):
            return
        self.suspend = True
        self.catalog = copy.deepcopy(self.initial)
        self.photos = self.catalog["photos"]
        self.crop_touched = False
        self.suspend = False
        if self.photos:self.load(self.index if self.index is not None else 0)
        elif self.photo_rows:self.select()
        else:self.clear_empty_view()
        self.refresh_dirty()

    def refresh_dirty(self):
        if self.suspend: return
        self.store()
        changed = self.catalog != self.initial
        self.save_button.configure(state="normal" if changed else "disabled")
        self.dirty_label.configure(text="Unsaved changes" if changed else "")

    def close_editor(self):
        self.refresh_dirty()
        if self.catalog != self.initial:
            if not messagebox.askyesno("Unsaved changes", "Discard unsaved catalog changes and close?"):
                return
        self.destroy()

    def open_arranger(self):
        import subprocess, sys
        self.refresh_dirty()
        if self.catalog != self.initial:
            messagebox.showwarning("Save first", "Save or reset your catalog edits before opening Arrange Gallery.")
            return
        subprocess.Popen([sys.executable, str(Path(__file__).with_name("arrange_gallery.py"))])

    def save(self):
        self.store()
        try:
            if read_json(C_PATH)!=self.initial:raise ValueError("Catalog changed in another window. Reopen or refresh before saving.")
            updates={};record_updates={};records=read_registry(ROOT)
            original={photo["file"]:photo for photo in self.initial["photos"]}
            for photo in self.photos:
                if photo.get("thumbnail") and photo_framing(photo)!=photo_framing(original[photo["file"]]):
                    from photo_studio import LOGO
                    if photo["file"] not in records:raise ValueError("Build/update thumbnails from originals before changing this gallery crop.")
                    data,fields,record=create_thumbnail(ROOT,photo,records[photo["file"]],LOGO)
                    updates[ROOT/"photography"/"thumbnails"/fields["thumbnail"]]=data
                    photo.update(fields);record_updates[photo["file"]]=record
            for p in self.photos:
                if p.get("galleryCrop") is not None:
                    normalize_crop(p["galleryCrop"])
            new_catalog = json.dumps(self.catalog, ensure_ascii=False, indent=2) + "\n"
            new_js = generated_js(self.catalog)
            with asset_transaction(updates):
                validate_catalog(self.catalog, ROOT)
                atomic_catalog_pair(new_catalog, new_js)
            registry_warning=""
            if record_updates:
                try:save_registry(ROOT,record_updates)
                except (OSError,ValueError) as exc:registry_warning=f"\nLocal source records could not be saved: {exc}"
            self.initial = copy.deepcopy(self.catalog)
            self.crop_touched = False
            self.refresh_dirty()
            notify(self, "Saved locally", "Gallery catalog updated. Review Photography before pushing."+registry_warning, kind="success")
        except (OSError, ValueError, KeyError) as exc:
            messagebox.showerror("Save failed", str(exc))


if __name__ == "__main__":
    Editor().mainloop()
