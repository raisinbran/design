"""Local Portfolio Studio: import, level, watermark, tag and publish photographs.
Public site visitors never execute this tool.
"""
import json
import math
import sys
import subprocess
from pathlib import Path
import tkinter as tk
from tkinter import filedialog,messagebox,ttk
from PIL import Image, ImageOps,ImageTk

from catalog_tools import TAGS,read_json,validate_catalog,generated_js
from processor import conservative_level,publish_image,unique_destination

ROOT=Path(__file__).resolve().parents[2]
PHOTO_DIR=ROOT/"photography"/"published"
CATALOG=ROOT/"data"/"media-catalog.json"
RUNTIME=ROOT/"js"/"photography-catalog.js"
LOGO=ROOT/"assets"/"homepage-2026"/"grape-default.png"

class Studio(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Portfolio Studio | Local Photo Publisher")
        self.minsize(930,640)
        self.geometry("1120x760")
        self.files=[]
        self.settings={}
        self.current=None
        self.preview_photo=None
        self.dragstart=None
        self.preview_transform=None
        self.max_var=tk.StringVar(value="1000")
        self.deg_var=tk.StringVar(value="0.0")
        self.alt_var=tk.StringVar()
        self.priority_var=tk.StringVar(value="normal")
        self.tag_vars={tag:tk.BooleanVar(value=False) for tag in TAGS}
        self.status=tk.StringVar(value="Choose files outside your public GitHub repository.")
        self.setup_ui()

    def setup_ui(self):
        toolbar=ttk.Frame(self,padding=10);toolbar.pack(fill="x")
        ttk.Button(toolbar,text="Choose photos",command=self.choose).pack(side="left")
        ttk.Button(toolbar,text="Edit published tags",command=self.edit_tags).pack(side="left",padx=7)
        ttk.Button(toolbar,text="Preview rotation",command=self.preview).pack(side="left",padx=7)
        ttk.Button(toolbar,text="Auto-level suggestion",command=self.auto_level).pack(side="left",padx=7)
        ttk.Button(toolbar,text="Publish chosen photos",command=self.publish).pack(side="right")
        ttk.Label(self,textvariable=self.status,wraplength=1050).pack(fill="x",padx=13,pady=(0,7))
        outer=ttk.Frame(self);outer.pack(fill="both",expand=True,padx=10,pady=4)
        left=ttk.Frame(outer,width=230);left.pack(side="left",fill="y",padx=(0,10))
        ttk.Label(left,text="Selected photos").pack(anchor="w")
        self.files_list=tk.Listbox(left,width=31,exportselection=False)
        self.files_list.pack(fill="both",expand=True,pady=5)
        self.files_list.bind("<<ListboxSelect>>",self.choose_current)
        right=ttk.Frame(outer);right.pack(side="left",fill="both",expand=True)
        self.canvas=tk.Canvas(right,bg="#e8e9e9",highlightthickness=0,height=440)
        self.canvas.pack(fill="both",expand=True)
        self.canvas.bind("<ButtonPress-1>",self.line_start)
        self.canvas.bind("<B1-Motion>",self.line_move)
        self.canvas.bind("<ButtonRelease-1>",self.line_end)
        self.canvas.bind("<Configure>",lambda _:self.preview())
        ttk.Label(right,text="Drag a line on the image along a horizon or structural reference. It will be leveled horizontally.").pack(anchor="w",pady=(5,4))
        controls=ttk.Frame(right);controls.pack(fill="x")
        ttk.Label(controls,text="Max side (px)").grid(row=0,column=0,sticky="w",pady=3)
        ttk.Entry(controls,textvariable=self.max_var,width=9).grid(row=0,column=1,sticky="w",padx=(5,14))
        ttk.Label(controls,text="Rotation (degrees CCW)").grid(row=0,column=2,sticky="w")
        ttk.Entry(controls,textvariable=self.deg_var,width=9).grid(row=0,column=3,sticky="w",padx=5)
        ttk.Label(controls,text="Priority").grid(row=0,column=4,sticky="w",padx=(15,4))
        ttk.Combobox(controls,textvariable=self.priority_var,width=14,
                     state="readonly",values=["low","normal","portraitBoost","featured"]).grid(row=0,column=5)
        ttk.Label(controls,text="Accessible photo description").grid(row=1,column=0,columnspan=2,sticky="w",pady=(8,0))
        ttk.Entry(controls,textvariable=self.alt_var).grid(row=1,column=2,columnspan=4,sticky="ew",padx=5,pady=(8,0))
        controls.grid_columnconfigure(3,weight=0);controls.grid_columnconfigure(5,weight=1)
        tags=ttk.LabelFrame(right,text="Photography tags (multiple allowed)",padding=7)
        tags.pack(fill="x",pady=9)
        for i,tag in enumerate(TAGS):
            ttk.Checkbutton(tags,text=tag,variable=self.tag_vars[tag]).grid(row=i//3,column=i%3,sticky="w",padx=(0,15),pady=3)
        ttk.Label(right,text="Processed copies only. Existing publication files are never overwritten. Originals stay outside GitHub.").pack(anchor="w")

    def edit_tags(self):
        script=Path(__file__).with_name("edit_tags.py")
        subprocess.Popen([sys.executable,str(script)],cwd=str(script.parent))

    def choose(self):
        selected=filedialog.askopenfilenames(title="Choose photos outside the public repository",
             filetypes=[("Photographs","*.jpg *.jpeg *.png *.webp *.tif *.tiff"),("All files","*.*")])
        if not selected:return
        paths=[Path(s).resolve() for s in selected]
        for p in paths:
            if p==ROOT or ROOT in p.parents:
                messagebox.showerror("Source location",f"Select originals outside the GitHub working tree:\n{p}")
                return
        self.save_current()
        for p in paths:
            if p not in self.files:
                self.files.append(p)
                self.settings[str(p)]={"maxSide":1000,"degrees":0.0,"alt":p.stem.replace("_"," ").strip(),
                 "tags":[],"displayPriority":"normal"}
        self.files_list.delete(0,"end")
        for p in self.files:self.files_list.insert("end",p.name)
        if self.files:
            self.files_list.selection_clear(0,"end")
            self.files_list.selection_set(0)
            self.load_current(0)

    def choose_current(self,event=None):
        which=self.files_list.curselection()
        if not which:return
        self.save_current()
        self.load_current(which[0])

    def save_current(self):
        if self.current is None:return
        self.settings[str(self.current)]={
           "maxSide":self.max_var.get(),"degrees":self.deg_var.get(),
           "alt":self.alt_var.get(),"tags":[x for x,var in self.tag_vars.items() if var.get()],
           "displayPriority":self.priority_var.get()
        }

    def load_current(self,i):
        self.current=self.files[i]
        s=self.settings[str(self.current)]
        self.max_var.set(s["maxSide"]);self.deg_var.set(s["degrees"])
        self.alt_var.set(s["alt"]);self.priority_var.set(s["displayPriority"])
        for tag,var in self.tag_vars.items():var.set(tag in s["tags"])
        self.preview()

    def preview(self):
        if self.current is None:return
        try:
            with Image.open(self.current) as f:
                image=ImageOps.exif_transpose(f).convert("RGB")
            try: angle=float(self.deg_var.get())
            except ValueError:angle=0
            # Preview without cropping; final publication automatically removes empty corners.
            image.thumbnail((max(300,self.canvas.winfo_width()-22),max(260,self.canvas.winfo_height()-22)),
                            Image.Resampling.LANCZOS)
            if abs(angle)>.0001:
                image=image.rotate(angle,Image.Resampling.BICUBIC,expand=False,fillcolor=(232,233,233))
            photo=ImageTk.PhotoImage(image)
            self.preview_photo=photo
            self.canvas.delete("all")
            x=(self.canvas.winfo_width()-image.width)/2
            y=(self.canvas.winfo_height()-image.height)/2
            self.canvas.create_image(x,y,anchor="nw",image=photo)
        except (OSError,ValueError) as exc:
            self.status.set(f"Preview error: {exc}")

    def auto_level(self):
        if self.current is None:return
        with Image.open(self.current) as f:
            sample=ImageOps.exif_transpose(f).convert("RGB")
        proposed=conservative_level(sample)
        if proposed is None:
            self.status.set("No reliable automatic reference detected. Use the guide line or manual rotation.")
        else:
            self.deg_var.set(str(proposed))
            self.status.set(f"Auto-level suggests {proposed:+.2f} degrees. Review before publishing.")
            self.preview()

    def line_start(self,event):
        if self.current is None:return
        self.dragstart=(event.x,event.y)
        self.canvas.delete("level-line")

    def line_move(self,event):
        if self.dragstart is None:return
        self.canvas.delete("level-line")
        self.canvas.create_line(*self.dragstart,event.x,event.y,fill="#fcbf49",width=3,tags="level-line")

    def line_end(self,event):
        if self.dragstart is None:return
        x,y=self.dragstart
        dx=event.x-x
        dy=event.y-y
        self.dragstart=None
        if math.hypot(dx,dy)<25:
            self.status.set("Guide line too short; draw across a longer visible reference.")
            return
        while dx<0:
            dx=-dx;dy=-dy
        proposed=math.degrees(math.atan2(dy,dx))
        if abs(proposed)>35:
            self.status.set("Guide line outside +/-35 degrees. Draw a near-horizontal reference.")
            return
        self.deg_var.set(f"{proposed:.3f}")
        self.status.set(f"Guide line correction: {proposed:+.3f} degrees CCW. Preview to confirm.")

    def publish(self):
        if not self.files:return
        self.save_current()
        if not CATALOG.is_file():
            messagebox.showerror("Catalog missing","Install the Photography catalog package first.")
            return
        try:
            catalog=read_json(CATALOG)
            validate_catalog(catalog,ROOT)
            planned=[]
            reserved=set()
            for p in self.files:
                settings=self.settings[str(p)]
                size=int(settings["maxSide"]);degree=float(settings["degrees"])
                if not 300<=size<=6000 or not -35<=degree<=35:
                    raise ValueError(f"Invalid size or rotation for {p.name}")
                if not settings["alt"].strip():
                    raise ValueError(f"Description required for accessibility: {p.name}")
                dest=unique_destination(PHOTO_DIR,p)
                suffix=2
                while dest.name.casefold() in reserved:
                    dest=PHOTO_DIR/(p.stem+"_web_"+str(suffix)+".jpg")
                    suffix+=1
                reserved.add(dest.name.casefold())
                planned.append((p,settings,dest))
        except (OSError,ValueError) as exc:
            messagebox.showerror("Validation failed",str(exc));return
        if not messagebox.askyesno("Publish local copies",
           f"Generate {len(planned)} watermarked publication copies and update the media catalog?\n\n"
           "No originals will be modified or uploaded. Changes remain local until you commit/push."):
            return
        created=[]
        try:
            for path,s,dest in planned:
                data=publish_image(path,dest,max_side=int(s["maxSide"]),degrees=float(s["degrees"]),
                                   logo=LOGO if LOGO.is_file() else None)
                created.append(dest)
                catalog["photos"].append({
                  "file":dest.name,"alt":s["alt"].strip(),"visible":True,
                  "featured":s["displayPriority"]=="featured",
                  "displayPriority":s["displayPriority"],
                  "aspectRatio":data["aspectRatio"],"tags":s["tags"]
                })
            validate_catalog(catalog,ROOT)
            new_catalog=json.dumps(catalog,ensure_ascii=False,indent=2)+"\n"
            new_js=generated_js(catalog)
            # Atomic replacements; retain previous text for rollback if write fails.
            old_catalog=CATALOG.read_text(encoding="utf-8")
            old_js=RUNTIME.read_text(encoding="utf-8")
            try:
                CATALOG.write_text(new_catalog,encoding="utf-8")
                RUNTIME.write_text(new_js,encoding="utf-8")
            except BaseException:
                CATALOG.write_text(old_catalog,encoding="utf-8")
                RUNTIME.write_text(old_js,encoding="utf-8")
                raise
            messagebox.showinfo("Published locally",
                f"Added {len(created)} photographs.\nReview the site locally, then commit/push when approved.")
            self.files=[];self.settings={};self.current=None
            self.files_list.delete(0,"end")
            self.canvas.delete("all")
            self.status.set("Publication copies ready. Original photographs remain outside the repository.")
        except Exception as exc:
            for p in created:p.unlink(missing_ok=True)
            messagebox.showerror("Publishing stopped",
                f"Processing failed: {exc}\n\nNewly created copies have been removed.")

if __name__=="__main__":
    if not CATALOG.is_file():
        messagebox.showerror("Not installed","Please run INSTALL_STAGE6B.py before launching Portfolio Studio.")
        sys.exit(1)
    Studio().mainloop()
