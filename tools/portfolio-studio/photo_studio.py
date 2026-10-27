"""Portfolio Studio: private local image preparation and catalog publishing."""
import json
import math
import re
import subprocess
import sys
import os
import tempfile
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk

from PIL import Image, ImageOps
from catalog_tools import read_json, validate_catalog, generated_js
from processor import conservative_level, publish_image, unique_destination, straighten_and_crop, rotation_crop_size
from photo_viewport import PhotoViewport, normalize_crop
from studio_preferences import load_preferences, save_preferences
from studio_notifications import notify, preferences
from responsive_toolbar import ResponsiveToolbar, choices
from window_state import remember_window
from export_preview import show_export_preview
from platform_support import open_path
from studio_about import show_about
from gallery_thumbnails import thumbnail_name,source_record,save_registry,VERSION,photo_framing

ROOT = Path(__file__).resolve().parents[2]
PHOTO_DIR = ROOT / "photography" / "published"
CATALOG = ROOT / "data" / "media-catalog.json"
RUNTIME = ROOT / "js" / "photography-catalog.js"
def choose_outline_grape():
    """Prefer existing transparent-outline artwork, not a filled-color logo."""
    candidates = [
        ROOT / "assets" / "homepage-2026" / "grape-hover.png",
        ROOT / "assets" / "homepage-2026" / "grape-default.png",
    ]
    # Never silently use filled fallback: inspect candidate transparency and
    # favor the artwork with the least opaque interior by alpha coverage.
    ranked=[]
    for f in candidates:
        if not f.is_file():
            continue
        try:
            with Image.open(f) as im:
                a=im.convert("RGBA").getchannel("A")
                bbox=a.getbbox()
                if bbox:
                    a=a.crop(bbox).resize((64,64))
                    coverage=sum(a.histogram()[97:])/4096
                    ranked.append((coverage,f))
        except OSError:
            pass
    # An outline should have substantially fewer filled pixels.
    if ranked:
        ranked.sort(key=lambda x:x[0])
        return ranked[0][1] if ranked[0][0] < .70 else None
    return None

LOGO = choose_outline_grape()
SIZE_PRESETS = ("480", "720", "960", "1080", "1440", "1920")


# Generic vocabulary deliberately excludes personal and geographic proper nouns.
GENERIC_SUBJECTS = (
    ("cat", ("cat", "cats")), ("dog", ("dog", "dogs")), ("bird", ("bird", "birds", "duck", "ducks")),
    ("boat", ("boat", "boats", "gondola")), ("food", ("food", "meal")),
    ("sunrise", ("sunrise",)), ("windmills", ("windmill", "windmills", "turbine", "turbines")),
    ("waterfall", ("waterfall", "waterfalls")), ("temple", ("temple", "temples", "torii")),
    ("courtyard", ("courtyard", "courtyards")), ("cityscape", ("city", "cityscape", "skyline")),
    ("street", ("street", "streets")), ("train", ("train", "trains", "locomotive")),
    ("railway", ("railway", "railroad")), ("bridge", ("bridge", "bridges", "aqueduct")),
    ("castle", ("castle", "fortress")), ("mountains", ("mountain", "mountains")),
    ("beach", ("beach", "beaches")), ("coast", ("coast", "coastline", "seascape")),
    ("forest", ("forest", "woods")), ("trees", ("tree", "trees")),
    ("flowers", ("flower", "flowers")), ("sunset", ("sunset", "dusk")),
    ("sky", ("sky", "cloud", "clouds")), ("building", ("building", "buildings", "tower")),
    ("landscape", ("landscape",)), ("portrait", ("portrait",)),
    ("water", ("water", "river", "lake", "sea", "ocean")), ("rocks", ("rock", "rocks", "pebbles")),
)


def generic_description(filename="", known_description=""):
    words=set(re.findall(r"[a-z]+", (known_description+" "+Path(filename).stem).casefold()))
    return next((label.capitalize() for label,terms in GENERIC_SUBJECTS if words.intersection(terms)), "Photograph")


def filename_suggestion(filename):
    return generic_description(filename)


def local_caption(image):
    """Local CPU classifier; no downloads or network activity during analysis."""
    from offline_descriptions import describe
    return describe(image)


def new_settings(path, maximum=1080):
    return {
        "maxSide": str(maximum), "degrees": "0", "alt": generic_description(str(path)),
        "_initialAlt": generic_description(str(path)),
        "altReviewed": False, "tags": [], "displayPriority": "normal",
        "galleryCrop": None, "galleryZoom": 1.0, "focusX": 0.5, "focusY": 0.5,
        "undoRotation": None,
        "cropApplied": False, "cropAction": "export",
    }


def open_exported_photos(paths):
    """Open committed exports in the Windows default viewer; report launch failures."""
    errors=[]
    for path in paths:
        try:
            open_path(str(Path(path).resolve()))
        except OSError as exc:
            errors.append(f"{Path(path).name}: {exc}")
    return errors


def selected_originals(studio):
    scope=studio.publish_scope.get()
    if scope=="current":return [studio.current] if studio.current else []
    if scope=="highlighted":return [studio.files[index] for index in studio.files_list.curselection()]
    return list(studio.files)


class Studio(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Portfolio Studio | Local Photo Publisher")
        self.geometry(f"{max(980,min(1470,self.winfo_screenwidth()-60))}x{max(670,min(940,self.winfo_screenheight()-85))}")
        self.minsize(980, 670)
        remember_window(self,"main-editor")
        self.files = []
        self.settings = {}
        self.current = None
        self.source_cache = {}
        self.current_image_key = None
        self.suspend = False
        self.preferences = load_preferences()
        self.open_after_publish=tk.BooleanVar(value=self.preferences["openAfterPublish"])
        self.max_var = tk.StringVar(value=str(self.preferences["maxSide"]))
        self.deg_var = tk.StringVar(value="0")
        self.alt_var = tk.StringVar()
        self.review_var = tk.BooleanVar(value=False)
        self.priority_var = tk.StringVar(value="normal")
        self.inspect_zoom = tk.DoubleVar(value=1)
        self.mode_var = tk.StringVar(value="crop")
        self.crop_label = tk.StringVar(value="Crop: full photograph")
        self.grid_var = tk.StringVar(value="off")
        self.jpeg_quality = tk.StringVar(value="90")
        self.filename_suffix = tk.StringVar(value="_crop")
        self._previous_filename_suffix = self.filename_suffix.get()
        self.filename_suffix.trace_add("write", self.remember_filename_suffix)
        self.jpeg_hint = tk.StringVar(value="90: detailed photos, balanced size")
        self.publish_scope = tk.StringVar(value="current")
        self.crop_action = tk.StringVar(value="export")
        self.crop_status = tk.StringVar(value="Full photograph")
        self.custom_width = tk.StringVar(value="7")
        self.custom_height = tk.StringVar(value="5")
        self.ratio_var = tk.StringVar(value="Free")
        self.status = tk.StringVar(value="Choose original photos stored outside your public GitHub repository.")
        try:
            catalog_tags = read_json(CATALOG)["photoTags"]
        except (OSError, ValueError, KeyError):
            catalog_tags = ['Day','Moody','Dusk','Night','Concrete Jungle','"It\'s just rocks"','Sky']
        self.tag_vars = {tag: tk.BooleanVar(value=False) for tag in catalog_tags}
        self.crop_rect = None
        self.dimensions_text = tk.StringVar(value="Source: none    |    Selected crop: none    |    Exported image: none")
        self.setup_ui()
        self.after(100,self.update_toolbar_overflow)
        self.bind("<Configure>",self.schedule_toolbar_overflow,add="+")
        self.deg_var.trace_add("write", self.rotation_changed)
        self.after_idle(self.refresh_action_states)
        self.max_var.trace_add("write", lambda *_: self.update_dimensions())
        self.alt_var.trace_add("write", self.description_changed)
        self.crop_action.trace_add("write", lambda *_: (self.update_dimensions(),self.refresh_action_states()))
        for variable in (self.alt_var,self.review_var,self.priority_var,self.max_var,self.deg_var,self.publish_scope,*self.tag_vars.values()):
            variable.trace_add("write",lambda *_: self.after_idle(self.refresh_action_states))

    def description_changed(self, *_):
        if not self.suspend and self.current is not None and self.alt_var.get().strip():
            self.review_var.set(True)

    def set_suggested_description(self, text):
        previous = self.suspend
        self.suspend = True
        try:
            self.alt_var.set(text)
            self.review_var.set(False)
        finally:
            self.suspend = previous

    def setup_ui(self):
        # One fixed-height toolbar keeps the notebook stationary across workspaces.
        action = ttk.Frame(self, padding=(8, 4))
        action.pack(fill="x")
        self.toolbar_action = action
        self.action_left = ttk.Frame(action)
        self.action_buttons = []
        self.action_menu = tk.Menu(self,tearoff=False)
        actions=(
            ("Add original",self.choose),
            ("Published Catalog",self.edit_tags),
            ("Remove original from list",self.remove_from_list),
            ("Synchronize",self.synchronize_gallery),
            ("Suggest alt text",self.suggest_alt),
            ("AI alt text",self.ai_caption),
            ("Reset photo",self.reset_selected),
            ("Reset all",self.reset_all),
            ("Settings",lambda:preferences(self)),
            ("About",lambda:show_about(self)),
        )
        for label, command in actions:
            button=ttk.Button(self.action_left,text=label,command=command)
            self.action_buttons.append((label,button,command))
            if label=="Settings":self.settings_button=button
            if label=="About":self.about_button=button
            button.pack(side="left",padx=2)
        self.more_actions_button=ttk.Button(action,text="More actions ▼", command=self.show_action_menu)
        self.action_menu.configure(postcommand=self.populate_action_menu)
        self.more_actions_button.pack(side="left")
        self.publish_group=ttk.Frame(action)
        self.publish_group.pack(side="right")
        self.export_fields=ttk.Frame(self.publish_group)
        self.build_export_fields(self.export_fields)
        self.export_settings_button=ttk.Button(self.publish_group,text="Export settings…",command=self.show_export_settings)
        self.export_preview_button=ttk.Button(self.publish_group,text="Preview publish",command=self.preview_export)
        self.publish_button=ttk.Button(self.publish_group,text="Publish",command=self.publish)
        self.export_settings_button.pack(side="left",padx=(0,5))
        self.export_preview_button.pack(side="left",padx=(0,5))
        self.publish_button.pack(side="left")
        self.action_left.pack(side="left",fill="x",expand=True)
        self.update_idletasks()
        toolbar_height=max([button.winfo_reqheight() for _,button,_ in self.action_buttons]+[
            self.export_fields.winfo_reqheight(),self.export_settings_button.winfo_reqheight(),
            self.export_preview_button.winfo_reqheight(),self.publish_button.winfo_reqheight()])+8
        action.configure(height=toolbar_height)
        action.pack_propagate(False)
        self._export_dialog=None

        self.workspace_tabs=ttk.Notebook(self)
        self.workspace_tabs.pack(fill="both",expand=True)
        self.photography_page=ttk.Frame(self.workspace_tabs)
        self.engineering_page=ttk.Frame(self.workspace_tabs)
        self.workspace_tabs.add(self.photography_page,text="Photography")
        self.workspace_tabs.add(self.engineering_page,text="Engineering")
        self.engineering_editor=None
        self.workspace_tabs.bind("<<NotebookTabChanged>>",self.workspace_changed)
        self.protocol("WM_DELETE_WINDOW",self.close_studio)
        body = ttk.Frame(self.photography_page, padding=(10, 0, 10, 6))
        body.pack(fill="both", expand=True)
        left = ttk.Frame(body, width=190)
        left.pack(side="left", fill="y", padx=(0, 10))
        ttk.Label(left, text="Selected original photos").pack(anchor="w")
        self.files_list = tk.Listbox(left, width=27, exportselection=False, selectmode="extended")
        self.files_list.pack(fill="both", expand=True, pady=5)
        self.files_list.bind("<<ListboxSelect>>", self.choose_current)

        right = ttk.Frame(body)
        right.pack(side="left", fill="both", expand=True)

        self.viewport = PhotoViewport(
            right, on_crop=self.crop_changed,
            on_horizon=self.horizon_line, on_vertical=self.vertical_line, status=self.status)
        self.viewport.pack(fill="both", expand=True)
        self.viewport.set_mode("crop")

        toolbar = ResponsiveToolbar(right, padding=(0, 3))
        self.crop_toolbar = toolbar
        toolbar.pack(fill="x")
        modes = toolbar.group("Editing mode", lambda menu: choices(menu, self.mode_var,
            ("crop", "horizon", "vertical", "pan"), lambda: self.viewport.set_mode(self.mode_var.get())), 8)
        for label, mode in (("Crop", "crop"), ("Level H", "horizon"),
                            ("Level V", "vertical"), ("Pan", "pan")):
            ttk.Radiobutton(modes, text=label, variable=self.mode_var, value=mode,
                            command=lambda: self.viewport.set_mode(self.mode_var.get())
                            ).pack(side="left", padx=3)
        ratio_group = toolbar.group("Crop Ratio", self.ratio_menu, 9)
        ttk.Label(ratio_group, text="Crop Ratio").pack(side="left", padx=(3, 2))
        ttk.Combobox(ratio_group, textvariable=self.ratio_var, state="readonly", width=9,
                     values=("Free","Original","1:1","3:2","2:3","4:3","3:4","5:4","4:5","16:9","9:16","Custom")
                     ).pack(side="left")
        custom_group = toolbar.group("Custom crop ratio", lambda menu: menu.add_command(
            label="Enter width and height…", command=self.prompt_custom_ratio), 2)
        ttk.Entry(custom_group,textvariable=self.custom_width,width=3).pack(side="left",padx=(4,0))
        ttk.Label(custom_group,text=":").pack(side="left")
        ttk.Entry(custom_group,textvariable=self.custom_height,width=3).pack(side="left")
        ttk.Button(custom_group,text="Set",command=self.apply_custom_ratio).pack(side="left",padx=3)
        self.ratio_var.trace_add("write", self.change_crop_ratio)
        grid_group = toolbar.group("Composition grid", lambda menu: choices(menu, self.grid_var,
            ("off", "thirds", "center", "golden")), 3)
        ttk.Label(grid_group, text="Grid").pack(side="left", padx=(3, 2))
        ttk.Combobox(grid_group, textvariable=self.grid_var, state="readonly", width=8,
                     values=("off","thirds","center","golden")).pack(side="left")
        self.grid_var.trace_add("write", lambda *_: self.viewport.set_grid(self.grid_var.get()))
        apply_group = toolbar.group("Crop destination", self.crop_menu, 10)
        ttk.Radiobutton(apply_group, text="Gallery framing",variable=self.crop_action,
                        value="gallery").pack(side="left",padx=(7,0))
        ttk.Radiobutton(apply_group, text="Crop exported JPEG",variable=self.crop_action,
                        value="export").pack(side="left",padx=(4,0))
        self.crop_action.trace_add("write", self.crop_destination_changed)
        settings_bar = ResponsiveToolbar(right, padding=(0, 3))
        self.settings_toolbar = settings_bar
        settings_bar.pack(fill="x")
        inspect = settings_bar.group("Inspect", lambda menu: choices(menu, self.inspect_zoom,
            (1, 2, 4), lambda: self.set_zoom(self.inspect_zoom.get())), 4)
        ttk.Label(inspect, text="Inspect").pack(side="left", padx=(0, 5))
        for label, zoom in (("100%", 1), ("200%", 2), ("400%", 4)):
            ttk.Button(inspect, text=label, width=5,
                       command=lambda z=zoom: self.set_zoom(z)).pack(side="left", padx=2)
        ttk.Scale(inspect, variable=self.inspect_zoom, from_=1, to=4, length=75,
                  command=self.set_zoom).pack(side="left", padx=4)
        preview_group = settings_bar.group("Full photo", self.preview_menu, 3)
        ttk.Button(preview_group, text="Full photo", command=self.full_crop).pack(side="left", padx=2)

        settings = settings_bar.group("Export size", self.size_menu, 2)
        ttk.Label(settings, text="Max side").pack(side="left", padx=(0, 3))
        ttk.Combobox(settings, textvariable=self.max_var, values=SIZE_PRESETS,
                     width=7).pack(side="left", padx=(0, 5))
        ttk.Button(settings, text="Change default...", command=self.set_default_size
                   ).pack(side="left", padx=(0, 8))
        rotation = settings_bar.group("Rotation", self.rotation_menu, 5)
        ttk.Label(rotation, text="Rotate CCW").pack(side="left", padx=(0, 3))
        rotation_entry=ttk.Entry(rotation, textvariable=self.deg_var, width=7)
        rotation_entry.pack(side="left", padx=(0, 4))
        rotation_entry.bind("<FocusOut>",self.commit_rotation_edit)
        rotation_entry.bind("<Return>",self.commit_rotation_edit)
        self.undo_button=ttk.Button(rotation,text="Undo rotation",command=self.undo_rotation)
        self.undo_button.pack(side="left",padx=(0,4))
        ttk.Button(rotation, text="Auto-level", command=self.auto_level).pack(side="left", padx=(0, 4))
        priority = settings_bar.group("Prominence", lambda menu: choices(menu, self.priority_var,
            ("low", "normal", "portraitBoost", "featured")), 1)
        ttk.Label(priority, text="Prominence (size)").pack(side="left", padx=(3, 4))
        ttk.Combobox(priority, textvariable=self.priority_var, state="readonly",
                     values=["low", "normal", "portraitBoost", "featured"],
                     width=14).pack(side="left")
        after_publish=settings_bar.group("After publishing",lambda menu:menu.add_checkbutton(
            label="Open exported photos",variable=self.open_after_publish,command=self.save_open_after_publish))
        ttk.Checkbutton(after_publish,text="Open after publishing",variable=self.open_after_publish,
            command=self.save_open_after_publish).pack(side="left")

        accessible = ttk.Frame(right, padding=(0, 4))
        self.accessible_row = accessible
        accessible.pack(fill="x")
        ttk.Label(accessible, text="Accessible description").pack(side="left", padx=(0, 6))
        ttk.Entry(accessible, textvariable=self.alt_var).pack(side="left", fill="x", expand=True)
        ttk.Checkbutton(accessible, text="Reviewed", variable=self.review_var
                        ).pack(side="left", padx=(7, 0))

        tags = ttk.LabelFrame(right, text="Tags", padding=(7, 2, 7, 3))
        tags.pack(fill="x", pady=(2, 4))
        for name, var in self.tag_vars.items():
            ttk.Checkbutton(tags, text=name, variable=var).pack(side="left", padx=(0, 12))

        ttk.Label(right,textvariable=self.dimensions_text,foreground="#3a5960",
                  padding=(0,4)).pack(fill="x")
        ttk.Label(self, textvariable=self.status, padding=(10, 0, 10, 5),
                  wraplength=1220).pack(fill="x")

    def remember_filename_suffix(self, *_):
        if self.filename_suffix.get() != "Custom…":
            self._previous_filename_suffix = self.filename_suffix.get()

    def choose_filename_suffix(self, _event=None):
        if self.filename_suffix.get() != "Custom…": return
        self.filename_suffix.set(self._previous_filename_suffix)
        value = simpledialog.askstring("Custom filename suffix",
            "Enter a suffix beginning with _ (for example _portfolio).\n"
            "Use 1–20 letters, numbers, underscores or hyphens after the initial _.",
            initialvalue=self.filename_suffix.get(), parent=self)
        if value is None: return
        value = value.strip()
        if not re.fullmatch(r"_[a-zA-Z0-9_-]{1,20}", value):
            messagebox.showerror("Invalid filename suffix",
                "Begin with _ followed by 1–20 letters, numbers, underscores or hyphens.", parent=self)
            return
        self.filename_suffix.set(value)

    def ratio_menu(self, menu):
        choices(menu, self.ratio_var, ("Free","Original","1:1","3:2","2:3","4:3","3:4","5:4","4:5","16:9","9:16"))
        menu.add_command(label="Custom…", command=self.prompt_custom_ratio)

    def prompt_custom_ratio(self):
        value = simpledialog.askstring("Crop Ratio", "Width:height (for example 7:5)",
            initialvalue=f"{self.custom_width.get()}:{self.custom_height.get()}", parent=self)
        if value is None: return
        try:
            width, height = value.split(":")
            if not all(math.isfinite(float(v)) and float(v)>0 for v in (width,height)): raise ValueError()
        except ValueError:
            messagebox.showerror("Crop Ratio", "Enter two positive numbers separated by a colon."); return
        self.custom_width.set(width); self.custom_height.set(height)
        self.apply_custom_ratio()

    def crop_menu(self, menu):
        menu.add_radiobutton(label="Gallery framing", variable=self.crop_action, value="gallery")
        menu.add_radiobutton(label="Crop exported JPEG", variable=self.crop_action, value="export")

    def preview_menu(self, menu):
        menu.add_command(label="Full photo", command=self.full_crop)

    def size_menu(self, menu):
        choices(menu, self.max_var, SIZE_PRESETS)
        menu.add_command(label="Custom maximum…", command=lambda: self.prompt_number(self.max_var,
            "Maximum side", "Longest side in pixels (300–6000)", 300, 6000))
        menu.add_command(label="Change default…", command=self.set_default_size)

    def rotation_menu(self, menu):
        menu.add_command(label="Rotate CCW…", command=lambda: self.prompt_number(self.deg_var,
            "Rotation", "Counterclockwise degrees (−35 to 35)", -35, 35))
        menu.add_command(label="Undo rotation", command=self.undo_rotation, state=str(self.undo_button.cget("state")))
        menu.add_command(label="Auto-level", command=self.auto_level)

    def prompt_number(self, variable, title, prompt, minimum, maximum):
        try: initial = float(variable.get())
        except ValueError: initial = minimum
        value = simpledialog.askfloat(title, prompt, initialvalue=initial,
            minvalue=minimum, maxvalue=maximum, parent=self)
        if value is not None:
            if variable is self.deg_var:self.apply_rotation(str(value))
            else:variable.set(str(int(value)) if variable is self.max_var else str(value))

    def save_open_after_publish(self):
        try:
            save_preferences({"openAfterPublish":self.open_after_publish.get()})
            self.preferences["openAfterPublish"]=self.open_after_publish.get()
        except (OSError,ValueError) as exc:
            self.status.set(f"Could not save opening preference: {exc}")

    def show_action_menu(self):
        self.action_menu.tk_popup(self.more_actions_button.winfo_rootx(),
            self.more_actions_button.winfo_rooty()+self.more_actions_button.winfo_height())

    def populate_action_menu(self):
        self.refresh_action_states()
        self.action_menu.delete(0,"end")
        for label, button, command in getattr(self, "hidden_actions", []):
            self.action_menu.add_command(label=label, command=command, state=str(button.cget("state")))

    def refresh_action_states(self):
        if not hasattr(self,"action_buttons"):return
        self.export_preview_button.configure(state="normal" if selected_originals(self) else "disabled")
        current_settings=self.settings.get(str(self.current),{}) if self.current else {}
        defaults=new_settings(self.current,self.preferences["maxSide"]) if self.current else {}
        def defaults_for(path):
            result=new_settings(path,self.preferences["maxSide"])
            result["alt"]=self.settings.get(str(path),{}).get("_initialAlt",result["alt"])
            result["_initialAlt"]=result["alt"]
            return result
        if self.current is not None:defaults=defaults_for(self.current)
        any_edits=any(self.settings.get(str(path),{})!=defaults_for(path)
                      for path in self.files if path != self.current)
        if self.current is not None:
            # Form edits may not yet be stored in settings.
            changes=(self.max_var.get()!=str(defaults.get("maxSide","")) or
                     self.deg_var.get()!=str(defaults.get("degrees","")) or
                     self.alt_var.get()!=defaults.get("alt","") or
                     self.review_var.get() or any(var.get() for var in self.tag_vars.values()) or
                     self.priority_var.get()!=defaults.get("displayPriority","normal") or
                     bool(self.crop_rect) or bool(current_settings.get("cropApplied")))
            any_edits=any_edits or changes
        else:changes=False
        for label,button,_ in self.action_buttons:
            if label=="Reset photo":button.configure(state="normal" if changes else "disabled")
            if label=="Reset all":button.configure(state="normal" if any_edits else "disabled")
            if label=="Remove original from list":button.configure(
                state="normal" if self.files_list.curselection() else "disabled")
        if hasattr(self,"undo_button"):
            self.undo_button.configure(state="normal" if getattr(self,"_previous_rotation",None) is not None else "disabled")

    def workspace_changed(self,_event=None):
        if self.workspace_tabs.select()==str(self.engineering_page) and self.engineering_editor is None:
            try:
                from engineering_editor import EngineeringEditor
                self.engineering_editor=EngineeringEditor(self.engineering_page)
                self.engineering_editor.pack(fill="both",expand=True)
            except Exception as exc:
                messagebox.showerror("Engineering editor unavailable",str(exc),parent=self)
                self.workspace_tabs.select(self.photography_page)
        self._last_toolbar_width=None
        self.update_toolbar_overflow()

    def close_studio(self):
        if self.engineering_editor is not None and not self.engineering_editor.can_close():return
        self.destroy()

    def schedule_toolbar_overflow(self,event=None):
        if event is not None and event.widget is not self:return
        if getattr(self,"_overflow_queued",False):return
        self._overflow_queued=True
        self.after_idle(self.update_toolbar_overflow)

    def build_export_fields(self,parent):
        for label,variable,values,width,editable in (
                ("JPEG quality",self.jpeg_quality,("80","85","90","95"),4,False),
                ("Filename suffix",self.filename_suffix,("_crop","_edit","_fix","_small","Custom…"),8,True),
                ("Publish scope",self.publish_scope,("current","highlighted","all"),11,False)):
            ttk.Label(parent,text=label).pack(side="left",padx=(0,3))
            control=ttk.Combobox(parent,textvariable=variable,values=values,width=width,
                state="normal" if editable else "readonly")
            control.pack(side="left",padx=(0,7))
            if editable:control.bind("<<ComboboxSelected>>",self.choose_filename_suffix)

    def show_export_settings(self):
        if self._export_dialog is not None and self._export_dialog.winfo_exists():
            self._export_dialog.lift();return
        dialog=tk.Toplevel(self);self._export_dialog=dialog
        dialog.title("Export settings");dialog.transient(self);dialog.resizable(False,False)
        frame=ttk.Frame(dialog,padding=12);frame.pack(fill="both",expand=True)
        self.build_export_fields(frame)
        ttk.Button(dialog,text="Close",command=dialog.destroy).pack(pady=(0,10))
        dialog.bind("<Escape>",lambda _event:dialog.destroy())

    def update_toolbar_overflow(self):
        self._overflow_queued=False
        if not hasattr(self,"action_buttons"):return
        engineering=self.workspace_tabs.select()==str(self.engineering_page)
        current_width=self.toolbar_action.winfo_width()
        key=(current_width,engineering)
        if getattr(self,"_last_toolbar_width",None)==key:return
        self._last_toolbar_width=key
        for _,button,_ in self.action_buttons:button.pack_forget()
        self.more_actions_button.pack_forget()
        if engineering:
            self.publish_group.pack_forget();self.hidden_actions=[]
            for label,button,_ in self.action_buttons:
                if label in ("Settings","About"):button.pack(side="left",padx=2)
            return
        self.publish_group.pack(side="right")
        sizes={label:button.winfo_reqwidth()+4 for label,button,_ in self.action_buttons}
        primary=["Add original","Published Catalog","Remove original from list"]
        more=self.more_actions_button.winfo_reqwidth()
        fixed=self.export_preview_button.winfo_reqwidth()+5+self.publish_button.winfo_reqwidth()
        full_right=fixed+self.export_fields.winfo_reqwidth()
        # Only show inline fields when all actions also fit. The dialog always
        # shares the original variables, including custom suffix and scope.
        inline=sum(sizes.values())+full_right<=current_width-16
        self.export_fields.pack_forget();self.export_settings_button.pack_forget()
        if inline:self.export_fields.pack(side="left",before=self.export_preview_button)
        else:self.export_settings_button.pack(side="left",padx=(0,5),before=self.export_preview_button)
        right=full_right if inline else fixed+self.export_settings_button.winfo_reqwidth()+5
        available=max(0,current_width-16-right)
        total=sum(sizes.values())
        usable=available-(more if total>available else 0)
        visible_labels=set();remaining=usable
        for label in primary+[label for label,_,_ in self.action_buttons if label not in primary]:
            if sizes[label]<=remaining:
                visible_labels.add(label);remaining-=sizes[label]
        self.hidden_actions=[item for item in self.action_buttons if item[0] not in visible_labels]
        for label,button,_ in self.action_buttons:
            if label in visible_labels:button.pack(side="left",padx=2)
        if self.hidden_actions:self.more_actions_button.pack(side="left")

    def manage_published(self):
        subprocess.Popen([sys.executable,str(Path(__file__).with_name("manage_published.py"))],
                         cwd=str(Path(__file__).parent))

    def edit_tags(self):
        script = Path(__file__).with_name("edit_tags.py")
        subprocess.Popen([sys.executable, str(script)], cwd=str(script.parent))

    def set_zoom(self, new):
        value = max(1.0, min(4.0, float(new)))
        if abs(self.inspect_zoom.get() - value) > .001:
            self.inspect_zoom.set(value)
        self.viewport.set_zoom(value)

    def set_default_size(self):
        chosen = simpledialog.askinteger("Default publication size",
            "Maximum pixel dimension (longest side) for newly selected photos:",
            initialvalue=self.preferences["maxSide"], minvalue=300, maxvalue=6000, parent=self)
        if chosen is None:
            return
        try:
            loc = save_preferences({"maxSide": chosen})
            self.preferences["maxSide"] = chosen
            self.status.set(f"Default set to {chosen}px for newly selected photos and resets. Saved locally at {loc}")
        except (ValueError, OSError) as exc:
            messagebox.showerror("Preferences could not be saved", str(exc))

    def choose(self):
        files = filedialog.askopenfilenames(
            title="Choose original photos outside public repository",
            filetypes=[("Photographs", "*.jpg *.jpeg *.png *.webp *.tif *.tiff *.heic *.heif"), ("All files", "*.*")]
        )
        if not files:
            return
        paths = [Path(name).resolve() for name in files]
        if any(p == ROOT or ROOT in p.parents for p in paths):
            messagebox.showerror("Originals location", "Choose originals stored outside the Git working copy.")
            return
        self.save_current()
        for p in paths:
            if p not in self.files:
                self.files.append(p)
                self.settings[str(p)] = new_settings(p, self.preferences["maxSide"])
        self.files_list.delete(0, "end")
        for p in self.files:
            self.files_list.insert("end", p.name)
        if self.files:
            self.files_list.selection_clear(0, "end")
            self.files_list.selection_set(0)
            self.load_current(0)

    def choose_current(self, _event=None):
        selected = self.files_list.curselection()
        if not selected:
            return
        index = selected[0]
        if self.current == self.files[index]:
            return
        self.save_current()
        self.load_current(index)

    def save_current(self):
        self.commit_rotation_edit()
        if self.current is None or self.suspend:
            return
        self.settings[str(self.current)] = {
            "maxSide": self.max_var.get(),
            "degrees": self.deg_var.get(),
            "undoRotation": getattr(self, "_previous_rotation", None),
            "alt": self.alt_var.get(),
            "_initialAlt": self.settings.get(str(self.current),{}).get("_initialAlt",generic_description(str(self.current))),
            "altReviewed": self.review_var.get(),
            "tags": [name for name, var in self.tag_vars.items() if var.get()],
            "displayPriority": self.priority_var.get(),
            "galleryCrop": dict(self.crop_rect) if self.crop_rect else None,
            "cropApplied": bool(self.crop_rect),
            "cropAction": self.crop_action.get(),
            "galleryZoom": 1.0, "focusX": .5, "focusY": .5,
        }

    def load_current(self, index):
        if getattr(self, "_rotation_pending", None):
            self.after_cancel(self._rotation_pending)
            self._rotation_pending = None
        self.current = self.files[index]
        s = self.settings[str(self.current)]
        self.suspend = True
        self.max_var.set(s["maxSide"])
        self.deg_var.set(s["degrees"])
        self._last_rotation = s["degrees"]
        self._rotation_edit_start=None
        self._previous_rotation = s.get("undoRotation")
        if not s.get("alt") or (s.get("alt")=="Photograph" and not s.get("altReviewed")):
            s["alt"]=self.automatic_description(self.current)
            s["_initialAlt"]=s["alt"]
        self.alt_var.set(s["alt"])
        self.review_var.set(s.get("altReviewed", False))
        self.priority_var.set(s["displayPriority"])
        self.crop_rect = s.get("galleryCrop")
        self.crop_action.set(s.get("cropAction","export"))
        self.crop_status.set("Crop selected" if self.crop_rect else "Full photograph")
        for name, var in self.tag_vars.items():
            var.set(name in s["tags"])
        self.inspect_zoom.set(1)
        self.viewport.set_zoom(1)
        self.suspend = False
        self.viewport.set_crop(None)
        self.update_preview()
        self.change_crop_ratio()
        self.viewport.set_crop(self.crop_rect)
        self.update_crop_label()
        self.refresh_action_states()

    def _image_for_preview(self):
        if self.current is None:
            return None, None
        try:
            degrees = float(self.deg_var.get())
        except ValueError:
            degrees = 0.0
        key = (str(self.current), round(degrees, 4))
        if key not in self.source_cache:
            with Image.open(self.current) as inp:
                im = ImageOps.exif_transpose(inp).convert("RGB")
                # Small in-memory preparation avoids loading originals on every
                # pan, crop drag, or zoom action.
                im.thumbnail((2600, 2600), Image.Resampling.LANCZOS)
            if abs(degrees) > 0.0001:
                im = straighten_and_crop(im, degrees)
            if len(self.source_cache) >= 5:
                self.source_cache.clear()
            self.source_cache[key] = im
        return key, self.source_cache[key]

    def update_preview(self):
        if self.current is None or self.suspend:
            return
        try:
            key, img = self._image_for_preview()
            self.viewport.set_source(img, identity=key)
            self.viewport.measurement_size=self.photo_dimensions()[1]
            self.update_dimensions()
        except (ValueError, OSError, OverflowError) as exc:
            self.status.set(f"Photo preview unavailable: {exc}")

    def rotation_changed(self, *_args):
        if self.suspend or self.current is None:
            return
        try:
            value=float(self.deg_var.get())
            if not math.isfinite(value) or not -35<=value<=35: return
        except ValueError: return
        if not getattr(self, "_undoing_rotation", False) and not getattr(self,"_setting_rotation",False):
            if getattr(self,"_rotation_edit_start",None) is None:
                self._rotation_edit_start=getattr(self,"_last_rotation","0")
                self._previous_rotation=self._rotation_edit_start
        self._last_rotation=self.deg_var.get()
        if getattr(self, "_rotation_pending", None):
            self.after_cancel(self._rotation_pending)
        self._rotation_pending = self.after(250, self.update_preview)

    def commit_rotation_edit(self,_event=None):
        self._rotation_edit_start=None

    def apply_rotation(self,value):
        self.commit_rotation_edit()
        if float(value)==float(self.deg_var.get()):return
        self._previous_rotation=self.deg_var.get()
        self._setting_rotation=True
        try:self.deg_var.set(value)
        finally:self._setting_rotation=False

    def automatic_description(self,path):
        try:
            photos=read_json(CATALOG)["photos"]
            stem=re.sub(r"(?i)(?:_edit\d*|_crop|_fix|_small)+$", "", Path(path).stem).casefold()
            candidates=[p for p in photos if re.sub(r"(?i)(?:_edit\d*|_crop|_fix|_small)+$", "", Path(p["file"]).stem).casefold()==stem]
            known=" ".join(p.get("alt", "") for p in candidates)
        except (OSError,ValueError,KeyError):known=""
        label=generic_description(str(path),known)
        if label!="Photograph":return label
        try:
            with Image.open(path) as raw:
                image=ImageOps.exif_transpose(raw).convert("RGB")
                image.thumbnail((900,900),Image.Resampling.LANCZOS)
            try:return local_caption(image)
            except Exception:
                from offline_descriptions import fallback_label
                return fallback_label(image)
        except (OSError,ValueError):return "Photo unavailable"

    def crop_destination_changed(self,*_):
        if self.current is not None and not self.suspend:
            self.crop_changed(self.crop_rect)

    def crop_changed(self, rect):
        if self.current is None:return
        self.crop_rect = normalize_crop(rect) if rect else None
        s=self.settings[str(self.current)]
        s["galleryCrop"]=dict(self.crop_rect) if self.crop_rect else None
        s["cropApplied"]=bool(self.crop_rect)
        s["cropAction"]=self.crop_action.get()
        self.crop_status.set("Crop selected: "+("exported JPEG" if self.crop_action.get()=="export" else "gallery framing") if rect else "Full photograph")
        self.update_crop_label()
        self.refresh_action_states()
        self.status.set("Crop selected. Preview publish and Publish will use it." if rect else
            "Crop cleared. Full photograph selected.")

    def apply_custom_ratio(self):
        try:
            a,b=float(self.custom_width.get()),float(self.custom_height.get())
            if not all(math.isfinite(v) and v>0 for v in (a,b)):raise ValueError()
        except ValueError:
            messagebox.showerror("Crop Ratio","Custom crop ratio requires two positive numbers.")
            return
        self.ratio_var.set("Custom")
        self.viewport.set_aspect_ratio(a/b)
        self.crop_status.set("Custom crop ratio selected")

    def change_crop_ratio(self,*_):
        if self.suspend:return
        ratio=self.ratio_var.get()
        if ratio=="Free": target=None
        elif ratio=="Original":
            if self.current is None:target=None
            else:
                w,h=self.photo_dimensions()[0];target=w/h
        elif ratio=="Custom":
            try:
                target=float(self.custom_width.get())/float(self.custom_height.get())
            except (ValueError,ZeroDivisionError):return
        else:
            a,b=map(float,ratio.split(":"));target=a/b
        if hasattr(self.viewport,"set_aspect_ratio"):
            self.viewport.set_aspect_ratio(target)
        self.update_crop_label()

    def update_dimensions(self):
        if self.current is None:
            self.dimensions_text.set("Source: none | Selected crop: none | Exported image: none")
            return
        try:
            (source_w,source_h),(w,h)=self.photo_dimensions()
            cropped_width,cropped_height=w,h
            if self.crop_rect:
                c=self.crop_rect
                cropped_width=max(1,round(w*c["width"]))
                cropped_height=max(1,round(h*c["height"]))
            # These values are estimated before watermarking and final encode.
            max_side=max(1,int(self.max_var.get()))
            output_w,output_h=cropped_width,cropped_height
            if self.crop_action.get()!="export" or not self.crop_rect:
                output_w,output_h=w,h
            scale=min(1.0,max_side/max(output_w,output_h))
            output_w=max(1,round(output_w*scale))
            output_h=max(1,round(output_h*scale))
            self.dimensions_text.set(f"Source: {source_w} × {source_h} px  |  Crop before resizing: "
                f"{cropped_width} × {cropped_height} px  |  Exported image (estimate): {output_w} × {output_h} px")
        except (OSError,ValueError,KeyError,TypeError) as exc:
            self.dimensions_text.set(f"Dimensions unavailable: {exc}")

    def photo_dimensions(self):
        cache=getattr(self,"_dimension_cache",None)
        if cache is None: self._dimension_cache={}; cache=self._dimension_cache
        key=str(self.current)
        if key not in cache:
            with Image.open(self.current) as raw:
                w,h=raw.size
                if raw.getexif().get(274) in (5,6,7,8): w,h=h,w
                cache[key]=(w,h)
        w,h=cache[key]
        return (w,h), rotation_crop_size(w,h,float(self.deg_var.get()))

    def update_crop_label(self):
        if self.crop_rect:
            c = self.crop_rect
            try:
                ratio = (self.viewport.source.width / self.viewport.source.height) * c["width"] / c["height"]
                self.crop_label.set(f"Crop ratio {ratio:.2f}:1")
            except (AttributeError, ZeroDivisionError):
                self.crop_label.set("Custom crop")
        else:
            self.crop_label.set("Crop: full photograph")
        self.update_dimensions()

    def preview_export(self):
        self.save_current()
        chosen=selected_originals(self)
        if not chosen:return
        items=[]
        for path in chosen:
            settings=dict(self.settings[str(path)])
            items.append((path,settings))
        return show_export_preview(self,items,int(self.jpeg_quality.get()),
            logo=LOGO if LOGO and LOGO.is_file() else None)

    def full_crop(self):
        if self.current is None:
            return
        self.crop_rect = None
        self.viewport.set_crop(None)
        self.settings[str(self.current)]["cropApplied"]=False
        self.settings[str(self.current)]["galleryCrop"]=None
        self.crop_status.set("Crop cleared")
        self.update_crop_label()
        self.status.set("Crop cleared. Entire photograph will be visible.")

    def vertical_line(self,a,b):
        if self.current is None or self.viewport.source is None: return
        dx=(b[0]-a[0])*self.viewport.source.width
        dy=(b[1]-a[1])*self.viewport.source.height
        if abs(dx)<1e-7 and abs(dy)<1e-7: return
        angle=math.degrees(math.atan2(dy,dx))
        # Difference from nearest vertical direction.
        deviation=angle-(90 if angle>=0 else -90)
        if abs(deviation)>35:
            self.status.set("Reference must be approximately vertical (within 35 degrees).")
            return
        combined=float(self.deg_var.get() or 0)+deviation
        if abs(combined)>35:
            self.status.set("Cumulative rotation exceeds 35 degrees.")
            return
        self.apply_rotation(f"{combined:.3f}")
        self.update_preview()
        self.status.set(f"Vertical alignment corrected by {deviation:+.3f}°.")

    def horizon_line(self, a, b):
        if self.current is None or self.viewport.source is None:
            return
        dx = (b[0] - a[0]) * self.viewport.source.width
        dy = (b[1] - a[1]) * self.viewport.source.height
        if abs(dx) < 1e-7 and abs(dy) < 1e-7:
            return
        angle = math.degrees(math.atan2(dy, dx))
        while angle > 90: angle -= 180
        while angle < -90: angle += 180
        if abs(angle) > 35:
            self.status.set("Reference must be approximately horizontal (within 35 degrees).")
            return
        current = float(self.deg_var.get() or 0)
        combined = current + angle
        if abs(combined) > 35:
            self.status.set("Cumulative rotation exceeds 35 degrees.")
            return
        self.apply_rotation(f"{combined:.3f}")
        self.update_preview()
        self.status.set(f"Horizon line corrected by {angle:+.3f}°. Rotation {combined:+.3f}°.")

    def auto_level(self):
        if self.current is None: return
        with Image.open(self.current) as f:
            im = ImageOps.exif_transpose(f).convert("RGB")
            im.thumbnail((1600, 1600))
        proposed = conservative_level(im)
        if proposed is None:
            self.status.set("No reliable level reference found. Use Level H or Level V to draw a guide.")
        else:
            self.apply_rotation(str(proposed))
            self.update_preview()
            self.status.set("Auto-level: already level (within 0.05°)." if abs(proposed)<.05 else
                f"Auto-level applied {proposed:+.2f}°. Check the result; Undo rotation restores it.")

    def undo_rotation(self):
        self.commit_rotation_edit()
        previous = getattr(self, "_previous_rotation", None)
        if previous is None:
            self.status.set("No rotation to undo.")
            return
        self._undoing_rotation=True
        try: self.deg_var.set(previous)
        finally: self._undoing_rotation=False
        self._previous_rotation=None
        self.update_preview()
        self.status.set("Previous rotation restored.")
        self.refresh_action_states()

    def remove_from_list(self):
        """Remove selected original(s) from this session without deleting files."""
        indices=list(self.files_list.curselection())
        if not indices and self.current in self.files:
            indices=[self.files.index(self.current)]
        if not indices:
            self.status.set("Select a photo to remove from the list.")
            return
        self.save_current()
        removed=[self.files[i] for i in indices]
        for i in reversed(indices):
            del self.files[i]
        for p in removed:
            self.settings.pop(str(p), None)
        self.files_list.delete(0,"end")
        for p in self.files:
            self.files_list.insert("end",p.name)
        self.current=None
        if self.files:
            next_index=min(indices[0],len(self.files)-1)
            self.files_list.selection_set(next_index)
            self.load_current(next_index)
        else:
            self.viewport.set_source(None)
        self.status.set(f"Removed {len(removed)} photo(s) from this session. Source files unchanged.")
        self.refresh_action_states()

    def reset_selected(self):
        if self.current is None: return
        if not messagebox.askyesno("Reset selected photo", "Discard unpublished settings for this photo?"):
            return
        self.settings[str(self.current)] = new_settings(self.current, self.preferences["maxSide"])
        self.load_current(self.files.index(self.current))

    def reset_all(self):
        if not self.files: return
        if not messagebox.askyesno("Reset all unpublished", "Discard unpublished edits for every selected photo?"):
            return
        for p in self.files:
            self.settings[str(p)] = new_settings(p, self.preferences["maxSide"])
        self.load_current(self.files.index(self.current) if self.current in self.files else 0)
        self.refresh_action_states()

    def suggest_alt(self):
        if self.current is None: return
        suggested = self.automatic_description(self.current)
        if not suggested:
            self.status.set("Filename is too generic for a safe suggestion. Enter a description or use the optional local AI.")
            return
        if self.alt_var.get() and not messagebox.askyesno("Replace description", "Replace your existing description?"):
            return
        self.set_suggested_description(suggested)
        self.status.set("Generic description filled. Review it before publishing.")

    def ai_caption(self):
        if self.current is None: return
        try:
            self.configure(cursor="watch")
            self.update_idletasks()
            with Image.open(self.current) as inp:
                im = ImageOps.exif_transpose(inp).convert("RGB")
                im.thumbnail((900, 900))
            description = local_caption(im)
            if self.alt_var.get() and not messagebox.askyesno("Replace description", "Replace current description?"):
                return
            self.set_suggested_description(description)
            self.status.set("Local AI suggestion generated. Review it before publishing.")
        except Exception as exc:
            messagebox.showerror("Local AI description unavailable", str(exc))
        finally:
            self.configure(cursor="")

    def synchronize_gallery(self):
        """Review missing and new publication files; remove stale catalog links only on consent."""
        if not CATALOG.is_file() or not RUNTIME.is_file():
            messagebox.showerror("Catalog missing","Photography catalog not found.")
            return False
        try:
            catalog=read_json(CATALOG)
            media_files={p.name.casefold():p for p in PHOTO_DIR.iterdir()
                         if p.is_file() and p.suffix.lower() in (".jpg",".jpeg",".png",".webp")}
            tracked={p["file"].casefold() for p in catalog["photos"]}
            missing=[p["file"] for p in catalog["photos"] if p["file"].casefold() not in media_files]
            extras=[p.name for key,p in media_files.items() if key not in tracked]
            if not missing:
                summary="All catalog photographs exist.\n"
                if extras:
                    summary+=f"\n{len(extras)} unlisted files detected. These are left untouched.\n"+ ("\n".join(extras[:12]))

                notify(self, "Gallery synchronization",summary)
                return True
            preview="\n".join(missing[:18])
            if len(missing)>18: preview+=f"\n... and {len(missing)-18} more"
            ok=messagebox.askyesno(
                "Review missing gallery photos",
                f"{len(missing)} catalog photo(s) do not exist in photography/published/:\n\n"
                f"{preview}\n\n"
                "Remove only these missing entries from the catalog and regenerate the public gallery list?\n"
                "Existing photo files are not deleted, renamed or modified.\n\n"
                f"Other unlisted photo files found: {len(extras)} (left untouched)."
            )
            if not ok:
                return False
            catalog["photos"]=[p for p in catalog["photos"]
                               if p["file"].casefold() in media_files]
            if not catalog["photos"]:
                raise ValueError("No valid catalog entries remain. Nothing changed.")
            validate_catalog(catalog,ROOT)
            from manage_published import save_transaction
            backup_dir=save_transaction(catalog)
            notify(self, "Gallery synchronized",
                   f"Removed {len(missing)} missing references.\n"
                   f"Backup: {backup_dir}\n"
                   "Review Photography locally before committing.")
            return True
        except Exception as exc:
            messagebox.showerror("Synchronization failed",str(exc))
            return False

    def publish(self):
        if not self.files:
            return
        self.save_current()
        if not CATALOG.is_file() or not RUNTIME.is_file():
            messagebox.showerror("Catalog missing", "Photo catalog not found.")
            return
        try:
            catalog = read_json(CATALOG)
            try:
                validate_catalog(catalog, ROOT)
            except ValueError as exc:
                if "Missing publication image" not in str(exc):
                    raise
                if not self.synchronize_gallery():
                    return
                catalog = read_json(CATALOG)
                validate_catalog(catalog, ROOT)
            planned, names = [], set()
            scope=self.publish_scope.get()
            chosen=selected_originals(self)
            if not chosen:
                raise ValueError("No photos chosen for this publishing scope.")
            for p in chosen:
                s = self.settings[str(p)]
                size = int(s["maxSide"])
                degree = float(s["degrees"])
                crop = normalize_crop(s["galleryCrop"]) if s.get("galleryCrop") else None
                if not 300 <= size <= 6000 or not -35 <= degree <= 35:
                    raise ValueError(f"Invalid size/rotation for {p.name}")
                if not s["alt"].strip() or not s["altReviewed"]:
                    raise ValueError(f"Review the accessible description for {p.name}")
                suffix=self.filename_suffix.get().strip()
                if not re.fullmatch(r"_[a-zA-Z0-9_-]{1,20}",suffix):
                    raise ValueError("Filename suffix must begin with _ and contain only letters, numbers, _ or -.")
                base=p.stem
                if base.lower().endswith(suffix.lower()):
                    dest=PHOTO_DIR/(base+".jpg")
                else:
                    dest=PHOTO_DIR/(base+suffix+".jpg")
                overwrite = False
                numbered = dest.name.casefold() in names
                if dest.exists() and not numbered:
                    answer=messagebox.askyesnocancel("Photo already exists",
                        f"{dest.name} already exists.\n\n"
                        "Yes: overwrite the published photo.\n"
                        "No: save a numbered copy.\n"
                        "Cancel: stop publishing.\n\nOriginal source photos are not changed.")
                    if answer is None:return
                    overwrite = answer
                    numbered = not answer
                if numbered:
                    stem=dest.stem
                    counter=2
                    while True:
                        dest=PHOTO_DIR/f"{stem}_{counter}.jpg"
                        if not dest.exists() and dest.name.casefold() not in names:break
                        counter+=1
                names.add(dest.name.casefold())
                planned.append((p, s, dest, crop, overwrite))
        except (ValueError, OSError) as exc:
            messagebox.showerror("Validation failed", str(exc))
            return
        preview_names="\n".join(
            f"  {p.name} → {dest.name}"+(" (overwrite)" if overwrite else "")+
            f"\n    {('Crop exported JPEG' if s.get('cropAction')=='export' else 'Gallery framing') if crop else 'No crop'}"
            f" · Max side: {s['maxSide']} px"
            for p,s,dest,crop,overwrite in planned[:15])
        if len(planned)>15: preview_names+=f"\n  ... and {len(planned)-15} more"
        if not messagebox.askyesno("Confirm publishing",
            f"Scope: {scope} · JPEG quality: {self.jpeg_quality.get()}\n"
            f"Photos and crop settings ({len(planned)}):\n{preview_names}\n\n"
            "Publish these photos and update the catalog?"):
            return
        try:
            PHOTO_DIR.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix=".studio-publish-",dir=PHOTO_DIR) as folder:
                stage=Path(folder)
                backups={};source_records={}
                installed=[]
                metadata={CATALOG:CATALOG.read_bytes(),RUNTIME:RUNTIME.read_bytes()}
                if json.loads(metadata[CATALOG]) != catalog:
                    raise ValueError("Catalog changed while confirming publication. Please try again.")
                for index,(p, s, dest, crop, overwrite) in enumerate(planned):
                    if p.resolve()==dest.resolve():raise ValueError("Output may not overwrite the original.")
                    if dest.exists() and not overwrite:raise FileExistsError(f"File appeared after planning: {dest.name}")
                    backups[dest]=dest.read_bytes() if dest.exists() else None
                    thumbnail_dest=PHOTO_DIR.parent/"thumbnails"/thumbnail_name(dest.name)
                    backups[thumbnail_dest]=thumbnail_dest.read_bytes() if thumbnail_dest.exists() else None
                    result = publish_image(p, stage/f"{index}.jpg", max_side=int(s["maxSide"]),
                                           degrees=float(s["degrees"]),
                                           quality=int(self.jpeg_quality.get()),
                                           logo=LOGO if LOGO and LOGO.is_file() else None,
                                           export_crop=crop if s.get("cropAction")=="export" else None,
                                           thumbnail_destination=stage/f"{index}.webp",
                                           gallery_crop=crop if s.get("cropAction")!="export" else None)
                    source_records[dest.name]=source_record(p,s,(stage/f"{index}.jpg").read_bytes())
                    source_records[dest.name].update(thumbnailPipeline=VERSION,
                        thumbnailFraming=crop if s.get("cropAction")!="export" else None,
                        thumbnailGeometry=photo_framing({"galleryCrop":crop if s.get("cropAction")!="export" else None}))
                    existing=next((entry for entry in catalog["photos"] if entry["file"].casefold()==dest.name.casefold()),None)
                    # Replace in place so overwriting preserves the gallery's ordering.
                    entry = dict(existing) if existing is not None else {}
                    entry.update({
                        "file": dest.name, "alt": s["alt"].strip(), "visible": True,
                        "featured": s["displayPriority"] == "featured",
                        "displayPriority": s["displayPriority"],
                        "aspectRatio": result["aspectRatio"],
                        "tags": s["tags"],
                        "thumbnail":thumbnail_dest.name,"thumbnailVersion":result["thumbnailVersion"],
                        "thumbnailWidth":result["thumbnailWidth"],"thumbnailHeight":result["thumbnailHeight"],
                        "thumbnailFramed":True,"mediaVersion":result["mediaVersion"],
                    })
                    for key in ("galleryCrop","galleryZoom","focusX","focusY","altNeedsReview"):
                        entry.pop(key,None)
                    if crop is not None and s.get("cropAction")!="export":
                        entry["galleryCrop"] = crop
                    if existing is None:catalog["photos"].append(entry)
                    else:catalog["photos"][catalog["photos"].index(existing)]=entry
                validate_catalog(catalog)
                new_catalog = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
                new_js = generated_js(catalog)
                (stage/"catalog.json").write_text(new_catalog,encoding="utf-8")
                (stage/"catalog.js").write_text(new_js,encoding="utf-8")
                if any(target.read_bytes()!=content for target,content in metadata.items()):
                    raise ValueError("Gallery metadata changed during export. Please try again.")
                try:
                    for index,(_,_,dest,_,_) in enumerate(planned):
                        thumbnail_dest=PHOTO_DIR.parent/"thumbnails"/thumbnail_name(dest.name)
                        for staged,target in ((stage/f"{index}.jpg",dest),(stage/f"{index}.webp",thumbnail_dest)):
                            current=target.read_bytes() if target.exists() else None
                            if current!=backups[target]:raise ValueError(f"Photo changed during export: {target.name}")
                            target.parent.mkdir(parents=True,exist_ok=True)
                            os.replace(staged,target);installed.append(target)
                    validate_catalog(catalog, ROOT)
                    os.replace(stage/"catalog.json",CATALOG)
                    os.replace(stage/"catalog.js",RUNTIME)
                except Exception:
                    for dest in reversed(installed):
                        if backups[dest] is None:dest.unlink(missing_ok=True)
                        else:
                            (stage/"restore.jpg").write_bytes(backups[dest])
                            os.replace(stage/"restore.jpg",dest)
                    for target,content in metadata.items():
                        (stage/"restore-metadata").write_bytes(content)
                        os.replace(stage/"restore-metadata",target)
                    raise
        except Exception as exc:
            messagebox.showerror("Publishing stopped", f"Changes were rolled back: {exc}")
            return
        self.status.set(f"Published {len(planned)} photo(s). Originals and crop settings remain open for review.")
        try:save_registry(ROOT,source_records)
        except (OSError,ValueError) as exc:
            self.status.set(f"Published successfully. Could not save local original-file records: {exc}")
        errors=open_exported_photos(dest for _,_,dest,_,_ in planned) if self.open_after_publish.get() else []
        if errors:
            notify(self, "Published; photo viewer could not open", 
                "Your photos were published successfully, but some could not be opened for review:\n\n"
                +"\n".join(errors), kind="warning")


if __name__ == "__main__":
    if not CATALOG.is_file():
        messagebox.showerror("Catalog missing", "Install Stage 6B first.")
        sys.exit(1)
    Studio().mainloop()
