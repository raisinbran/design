"""Owner-only local UI for editing existing Photography catalog metadata."""
import json
import tkinter as tk
from pathlib import Path
from tkinter import ttk,messagebox
from PIL import Image,ImageOps,ImageTk
from catalog_tools import read_json,generated_js,validate_catalog

ROOT=Path(__file__).resolve().parents[2]
C_PATH=ROOT/"data"/"media-catalog.json"
J_PATH=ROOT/"js"/"photography-catalog.js"

class Editor(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Portfolio Studio | Edit Published Photo Tags")
        self.geometry("850x620")
        self.catalog=read_json(C_PATH)
        validate_catalog(self.catalog,ROOT)
        self.photos=self.catalog["photos"]
        self.index=None
        self.tags={tag:tk.BooleanVar() for tag in self.catalog["photoTags"]}
        self.alt=tk.StringVar()
        self.priority=tk.StringVar()
        self.preview_image=None
        self.setup()

    def setup(self):
        bar=ttk.Frame(self,padding=10);bar.pack(fill="x")
        ttk.Button(bar,text="Save all metadata",command=self.save).pack(side="right")
        ttk.Label(bar,text="Tags are suggestions. Edit any photo and save once.").pack(side="left")
        outer=ttk.Frame(self,padding=10);outer.pack(fill="both",expand=True)
        left=ttk.Frame(outer);left.pack(side="left",fill="y",padx=(0,13))
        self.listbox=tk.Listbox(left,width=30,exportselection=False)
        self.listbox.pack(fill="both",expand=True)
        self.listbox.bind("<<ListboxSelect>>",self.select)
        for p in self.photos:self.listbox.insert("end",p["file"])
        right=ttk.Frame(outer);right.pack(side="left",fill="both",expand=True)
        self.canvas=tk.Canvas(right,height=290,bg="#e7e7e7",highlightthickness=0)
        self.canvas.pack(fill="both",expand=True)
        self.canvas.bind("<Configure>",lambda _:self.preview())
        ttk.Label(right,text="Description (alt text)").pack(anchor="w",pady=(8,2))
        ttk.Entry(right,textvariable=self.alt).pack(fill="x")
        ttk.Label(right,text="Display priority").pack(anchor="w",pady=(8,2))
        ttk.Combobox(right,textvariable=self.priority,values=["low","normal","portraitBoost","featured"],
                     state="readonly").pack(anchor="w")
        tags=ttk.LabelFrame(right,text="Filter tags",padding=8);tags.pack(fill="x",pady=11)
        for i,(text,var) in enumerate(self.tags.items()):
            ttk.Checkbutton(tags,text=text,variable=var).grid(row=i//3,column=i%3,sticky="w",padx=6,pady=4)
        self.listbox.selection_set(0)
        self.load(0)
    def select(self,_event=None):
        selected=self.listbox.curselection()
        if not selected:return
        self.store()
        self.load(selected[0])
    def store(self):
        if self.index is None:return
        p=self.photos[self.index]
        p["tags"]=[name for name,var in self.tags.items() if var.get()]
        p["alt"]=self.alt.get().strip()
        p["displayPriority"]=self.priority.get()
        p.pop("tagStatus",None)
    def load(self,index):
        self.index=index
        p=self.photos[index]
        self.alt.set(p["alt"])
        self.priority.set(p.get("displayPriority","featured" if p.get("featured") else "normal"))
        for name,var in self.tags.items():var.set(name in p.get("tags",[]))
        self.preview()
    def preview(self):
        if self.index is None:return
        try:
            path=ROOT/"photography"/"published"/self.photos[self.index]["file"]
            with Image.open(path) as file:
                img=ImageOps.exif_transpose(file).convert("RGB")
            img.thumbnail((max(200,self.canvas.winfo_width()-20),max(170,self.canvas.winfo_height()-20)),Image.Resampling.LANCZOS)
            self.preview_image=ImageTk.PhotoImage(img)
            self.canvas.delete("all")
            self.canvas.create_image(self.canvas.winfo_width()/2,self.canvas.winfo_height()/2,
                                    image=self.preview_image)
        except OSError:
            self.canvas.delete("all")
            self.canvas.create_text(200,100,text="Preview unavailable")
    def save(self):
        self.store()
        try:
            validate_catalog(self.catalog,ROOT)
            new_catalog=json.dumps(self.catalog,ensure_ascii=False,indent=2)+"\n"
            new_js=generated_js(self.catalog)
            old_catalog=C_PATH.read_text(encoding="utf-8")
            old_js=J_PATH.read_text(encoding="utf-8")
            try:
                C_PATH.write_text(new_catalog,encoding="utf-8")
                J_PATH.write_text(new_js,encoding="utf-8")
            except BaseException:
                C_PATH.write_text(old_catalog,encoding="utf-8")
                J_PATH.write_text(old_js,encoding="utf-8")
                raise
            messagebox.showinfo("Saved","Catalog and gallery data updated locally.\nReview Photography before committing.")
        except (ValueError,OSError) as e:
            messagebox.showerror("Save failed",str(e))

if __name__=="__main__":
    Editor().mainloop()
