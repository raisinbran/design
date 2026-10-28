"""Local, nonmodal product information and export documentation."""
import platform
import sys
import tkinter as tk
from tkinter import ttk
from tkinter.scrolledtext import ScrolledText
from importlib.metadata import version, PackageNotFoundError

from studio_info import APP_NAME, VERSION, BUILD, LAST_UPDATED, AUTHOR, COPYRIGHT
from export_rights import NOTICE, DATA_MINING
from window_state import remember_window
from studio_theme import palette


def component_versions():
    result = [("Python", platform.python_version()), ("Tcl/Tk", str(tk.TkVersion))]
    for name in ("Pillow", "numpy", "opencv-python-headless", "pillow-heif"):
        try: installed = version(name)
        except PackageNotFoundError: installed = "Not installed"
        result.append((name, installed))
    return result


def product_details():
    return (f"{APP_NAME} {VERSION} (build {BUILD})\n"
            f"Last updated: {LAST_UPDATED}\nAuthor: {AUTHOR}\n{COPYRIGHT}\n"
            f"Runtime: {platform.system()} / {platform.machine()}, {64 if sys.maxsize > 2**32 else 32}-bit Python\n" +
            "\n".join(f"{name}: {value}" for name,value in component_versions()))


EXPORT_SECTIONS = [
    ("Engineering workspace", "The Engineering tab manages project titles, context, formatted descriptions, ordered image/video/document media, cover images and visibility. New projects start as drafts. Preview uses the website layout; Save changes locally updates the project catalog and page with backups and stale-edit checks. Original media is retained when removing a project or media entry."),
    ("1. Prepare a derived copy", "JPEG, PNG, WebP, TIFF and HEIC/HEIF originals are supported. Read the selected original locally, apply its EXIF orientation, rotation/straightening and export crop, then reduce to the selected maximum side. Smaller sources are not enlarged. Originals are opened read-only."),
    ("2. Full-size JPEG", "Apply adaptive tiled watermarks plus the bottom-right author/logo mark. Encode a progressive, optimized JPEG at the selected quality, with full color sampling (4:4:4). The longest-side default is 1080 pixels; your saved size preference takes precedence."),
    ("3. Gallery thumbnail", "Create one WebP from clean source pixels, with the selected gallery framing and bottom-right mark only. Tiled watermarks are omitted. Limit its longest side to 800 pixels and encode at quality 78. Repeated exports reuse the same paired filenames; image hashes refresh browser caches."),
    ("4. Embed rights automatically", "Both files receive Author: Brandon J. Chen, copyright, the app version, an EXIF anti-AI notice and an XMP rights notice. The IPTC/PLUS Data Mining field is set to 'Prohibited for AI/ML training'. No additional permission dialog is shown for these notices."),
    ("5. Publish and review", "Stage the JPEG, thumbnail and public catalog changes together, with rollback if publishing fails. Existing names offer overwrite or a numbered copy. Preview publish uses the same encoders as publishing. The saved 'Open after publishing' preference controls whether the exported JPEG opens for review. Publishing updates local files; Studio does not push Git commits automatically."),
    ("Gallery presentation", "Prominence adjusts preferred display size, not sort order. Featured photos receive stronger layout emphasis; order is set in Arrange gallery. Public gallery photos have no click-through link to the full-size JPEG."),
    ("Crops", "A drawn crop is immediately active for Preview publish and Publish. Crop exported JPEG changes both outputs; Gallery framing changes only the gallery thumbnail. Right-click in Crop mode or select Full photo to clear the box."),
    ("Existing publications", "These rights notices apply to new exports, overwrites and newly built/rebuilt thumbnails. Existing JPEGs are not changed automatically; republish to add the notices. Build/update thumbnails can refresh the paired WebP without re-exporting its JPEG.")
]

PROTECTION_SECTIONS = [
    ("Embedded notice", NOTICE),
    ("What the signal means", "The notices express the author's restrictions in human-readable and machine-readable metadata. They do not encrypt the photograph, prevent copying, or force a scraper/model trainer to comply. Metadata can be removed by a third party or lost during conversion."),
    ("Public metadata and privacy", "Source camera metadata is not copied into newly encoded files. GPS, camera serial numbers, capture-time records and original paths are omitted. Only the public authorship, copyright, app identification and rights notices described here are added."),
    ("Local processing", "Image preparation, watermarking, rights embedding and catalog updates run locally. Private original paths and rendering recipes are stored in the local Studio settings folder outside the public repository. Automatic descriptions use a small local MobileNet classifier with generic labels. Its model is downloaded once during setup, stored outside the repository, and used offline afterward. No photo is sent to a hosted caption service. Suggested labels remain editable and require review."),
    ("Standards and further reading", "IPTC/PLUS Data Mining vocabulary:\n" + DATA_MINING + "\n\nIPTC guidance:\nhttps://iptc.org/news/exclude-images-from-generative-ai-iptc-photo-metadata-standard-2023-1/")
]


def text_page(notebook, title, sections):
    frame = ttk.Frame(notebook, padding=12)
    notebook.add(frame, text=title)
    text = ScrolledText(frame, wrap="word", font="TkDefaultFont", relief="flat",
                        borderwidth=0, padx=6, pady=4, takefocus=True)
    text.pack(fill="both", expand=True)
    text.tag_configure("heading", font=("Segoe UI", 10, "bold"), spacing1=12, spacing3=4)
    text.tag_configure("body", spacing3=10, lmargin1=0, lmargin2=0)
    for heading, body in sections:
        text.insert("end", heading + "\n", "heading")
        text.insert("end", body + "\n", "body")
    text.configure(state="disabled")
    return frame


def show_about(parent):
    existing = getattr(parent, "_about_window", None)
    if existing is not None and existing.winfo_exists():
        existing.deiconify(); existing.lift(); existing.focus_set()
        return existing
    win = tk.Toplevel(parent)
    parent._about_window = win
    win.title("About Portfolio Studio")
    win.geometry("740x640"); win.minsize(560,430)
    remember_window(win, "about")
    win.transient(parent)
    heading = ttk.Frame(win, padding=(20,18,20,12)); heading.pack(fill="x")
    ttk.Label(heading, text=APP_NAME, font=("Segoe UI",22,"normal")).pack(anchor="w")
    ttk.Label(heading, text="Local photography and Engineering project publishing").pack(anchor="w",pady=(4,0))
    # Keep Notebook as a direct child for existing automation and keyboard use.
    # Hide the unstable native tab strip and render a fixed-size, flat navigation.
    if sys.platform!='win32':
        notebook=ttk.Notebook(win)
        notebook.pack(fill='both',expand=True,padx=16)
    else:
        colors=lambda:getattr(parent,'_studio_colors',None) or palette('system')
        nav=tk.Frame(win,bd=0,highlightthickness=0)
        nav.pack(fill='x',padx=16)
        style=ttk.Style(win)
        style.layout('About.Hidden.TNotebook.Tab',[])
        notebook=ttk.Notebook(win,style='About.Hidden.TNotebook')
        notebook.pack(fill="both",expand=True,padx=16)
        labels=('Overview','Photo export','Rights & privacy','Components')
        buttons=[];hover=[-1]
        def paint(_event=None):
            try:active=notebook.index('current') if notebook.tabs() else 0
            except tk.TclError:active=0
            c=colors();nav.configure(bg=c['bg'])
            for i,(item,line) in enumerate(buttons):
                selected=i==active
                bg=c['selected'] if selected else c['hover'] if hover[0]==i else c['bg']
                item.configure(bg=bg,fg=c['text'] if selected else c['muted'],
                               activebackground=c['hover'],activeforeground=c['text'],
                               font=('TkDefaultFont',10,'normal'))
                line.configure(bg=c['accent'] if selected else c['bg'])
        for i,label in enumerate(labels):
            slot=tk.Frame(nav,bd=0,highlightthickness=0)
            slot.pack(side='left',padx=(5 if i==0 else 1,0))
            item=tk.Button(slot,text=label,font=('TkDefaultFont',10,'normal'),padx=9,pady=5,
                           bd=0,relief='flat',highlightthickness=0,cursor='hand2',
                           command=lambda i=i:notebook.select(i))
            item.pack(fill='x')
            line=tk.Frame(slot,height=2,bd=0);line.pack(fill='x')
            def enter(_event,i=i):hover[0]=i;paint()
            def leave(_event):hover[0]=-1;paint()
            slot.bind('<Enter>',enter,add='+');slot.bind('<Leave>',leave,add='+')
            item.bind('<Enter>',enter,add='+');item.bind('<Leave>',leave,add='+')
            buttons.append((item,line))
        notebook.bind('<<NotebookTabChanged>>',paint,add='+')
        win._studio_paint_detail_tabs=paint
        win.after_idle(paint)
    overview = ttk.Frame(notebook,padding=18); notebook.add(overview,text="Overview")
    for row,(label,value) in enumerate((("Version",VERSION),("Build",BUILD),
            ("Last updated",LAST_UPDATED),("Author",AUTHOR),
            ("Runtime",f"{platform.system()} / {platform.machine()}"))):
        ttk.Label(overview,text=label).grid(row=row,column=0,sticky="w",padx=(0,24),pady=5)
        ttk.Label(overview,text=value).grid(row=row,column=1,sticky="w",pady=5)
    ttk.Separator(overview).grid(row=5,column=0,columnspan=2,sticky="ew",pady=16)
    ttk.Label(overview,text=COPYRIGHT).grid(row=6,column=0,columnspan=2,sticky="w")
    ttk.Label(overview,text="Prepare, preview and publish derived copies while preserving your originals.",
              wraplength=480).grid(row=7,column=0,columnspan=2,sticky="w",pady=(12,0))
    text_page(notebook,"Photo export",EXPORT_SECTIONS)
    text_page(notebook,"Rights & privacy",PROTECTION_SECTIONS)
    text_page(notebook,"Components",[("Installed components", "\n".join(f"{name}  {value}" for name,value in component_versions())),
        ("Acknowledgments", "Built with Python and Tcl/Tk, Pillow, NumPy, OpenCV, pillow-heif, Beautiful Soup and Send2Trash. Offline descriptions use the ONNX Model Zoo MobileNet v2 model and ImageNet labels through OpenCV. Third-party components retain their respective copyrights and licenses; this authorship credit does not claim ownership of them.")])
    bottom=ttk.Frame(win,padding=(16,12)); bottom.pack(fill="x")
    def copy_details():
        win.clipboard_clear(); win.clipboard_append(product_details())
    ttk.Button(bottom,text="Copy app details",command=copy_details).pack(side="left")
    ttk.Button(bottom,text="Close",command=win.destroy).pack(side="right")
    win.bind("<Escape>",lambda event:win.destroy())
    return win
