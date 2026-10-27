"""Read-only preview of fully encoded publication JPEGs, using the export pipeline."""
import io
import tkinter as tk
from tkinter import ttk

from PIL import Image
from photo_viewport import PhotoViewport
from processor import encode_publication_pair
from window_state import remember_window


def show_export_preview(parent,items,quality,logo=None):
    win=tk.Toplevel(parent)
    win.title("Export preview")
    win.geometry("1040x780");win.minsize(660,440)
    remember_window(win,"export-preview")
    header=ttk.Frame(win,padding=8);header.pack(fill="x")
    title=tk.StringVar(master=win)
    details=tk.StringVar(master=win)
    zoom=tk.DoubleVar(master=win,value=1)
    variant=tk.StringVar(master=win,value="gallery")
    viewport=PhotoViewport(win)
    viewport.set_mode("pan")
    previous=ttk.Button(header,text="Previous")
    previous.pack(side="left")
    following=ttk.Button(header,text="Next")
    following.pack(side="left",padx=(4,10))
    ttk.Label(header,textvariable=title).pack(side="left")
    ttk.Button(header,text="Close",command=win.destroy).pack(side="right")
    controls=ttk.Frame(win,padding=(8,0,8,6));controls.pack(fill="x")
    ttk.Label(controls,text="Inspect").pack(side="left",padx=(0,6))
    def set_zoom(value):
        value=float(value)
        if abs(zoom.get()-value)>.001:zoom.set(value)
        viewport.set_zoom(value)
    for label,value in (("Fit",1),("2× fit",2),("4× fit",4)):
        ttk.Button(controls,text=label,command=lambda value=value:set_zoom(value)).pack(side="left",padx=2)
    ttk.Scale(controls,variable=zoom,from_=1,to=4,command=set_zoom).pack(side="left",fill="x",expand=True,padx=8)
    ttk.Label(win,textvariable=details,padding=(8,0,8,6),wraplength=980).pack(fill="x")
    viewport.pack(fill="both",expand=True,padx=8,pady=(0,8))
    win._preview_index=0
    win._preview_viewport=viewport
    def display():
        data=win._encoded_thumbnail if variant.get()=="gallery" else win._encoded_jpeg
        if data is None:return
        with Image.open(io.BytesIO(data)) as encoded:image=encoded.convert("RGB")
        viewport.set_source(image,identity=(win._preview_index,variant.get(),id(data)))
        viewport.measurement_size=image.size
        set_zoom(1)
        mode="Gallery WebP · Corner watermark only" if variant.get()=="gallery" else f"Full-size JPEG · Quality {quality} · Both watermarks"
        details.set(f"{mode} · {image.width} × {image.height} px · {len(data)/1024:.0f} KB. "+win._preview_note+
            "Preview only; no photos have been published or changed.")
    for label,value in (("Gallery thumbnail","gallery"),("Full-size export","full")):
        ttk.Radiobutton(controls,text=label,variable=variant,value=value,command=display).pack(side="left",padx=5)
    def show(index):
        win._preview_index=index
        source,settings=items[index]
        title.set(f"{index+1} of {len(items)} — {source.name}")
        previous.configure(state="normal" if index else "disabled")
        following.configure(state="normal" if index+1<len(items) else "disabled")
        crop=settings.get("galleryCrop")
        export_crop=crop if settings.get("cropAction")=="export" else None
        try:
            win.configure(cursor="watch");win.update_idletasks()
            data,thumbnail,size=encode_publication_pair(source,max_side=int(settings["maxSide"]),
                degrees=float(settings["degrees"]),quality=quality,logo=logo,export_crop=export_crop,
                gallery_crop=crop if crop and export_crop is None else None)
            win._encoded_jpeg=data;win._encoded_thumbnail=thumbnail
            win._preview_note=""
            display()
        except (OSError,ValueError,KeyError) as exc:
            win._encoded_jpeg=None;win._encoded_thumbnail=None
            viewport.set_source(None);details.set(f"Cannot preview {source.name}: {exc}")
        finally:win.configure(cursor="")
    previous.configure(command=lambda:show(win._preview_index-1))
    following.configure(command=lambda:show(win._preview_index+1))
    win.bind("<Escape>",lambda _:win.destroy())
    show(0)
    return win
