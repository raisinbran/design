"""Engineering workspace within Portfolio Studio's existing Tk application."""
import copy
import hashlib
import io
import json
import re
import tempfile
import tkinter as tk
from pathlib import Path
from tkinter import ttk,filedialog,messagebox,simpledialog
from PIL import Image,ImageOps
import engineering_catalog as catalog
from thumbnail_list import ThumbnailList
from photo_viewport import PhotoViewport
from editor_tabs import create_editor_tabs
from video_preview import image_frame
from rich_text import RichText
from platform_support import open_path,cache_path


class EngineeringEditor(ttk.Frame):
    def __init__(self,parent,root=catalog.ROOT):
        super().__init__(parent);self.root=Path(root);self.index=None;self.media_index=None;self.loading=False
        self.pending={};self.preview_files=[];self.history=[]
        self.data=catalog.read_catalog(self.root);self.initial=copy.deepcopy(self.data)
        self.expected_catalog=self.catalog_path.read_bytes() if self.catalog_path.exists() else None
        self.expected_page=self.page_path.read_bytes()
        bar=ttk.Frame(self,padding=(10,4));bar.pack(fill="x")
        for label,command in (("Reset",self.reload),("Add project…",self.add_project),("Duplicate",self.duplicate),
                ("Remove project…",self.remove),("Move up",lambda:self.move(-1)),("Move down",lambda:self.move(1)),
                ("Undo",self.undo),("Preview page",self.preview)):
            btn=ttk.Button(bar,text=label,command=command)
            btn.pack(side="left",padx=3)
            if label=="Reset":self.reset_button=btn
            if label=="Undo":self.undo_button=btn
        self.save_button=ttk.Button(bar,text="Save changes locally",command=self.save);self.save_button.pack(side="left",padx=3)
        body=ttk.Frame(self,padding=(10,0,10,5));body.pack(fill="both",expand=True)
        left=ttk.Frame(body);left.pack(side="left",fill="y",padx=(0,12))
        ttk.Label(left,text="Engineering projects • drafts stay off the website").pack(anchor="w",pady=(0,4))
        self.projects=ThumbnailList(left);self.projects.pack(fill="both",expand=True)
        self.projects.tree.configure(selectmode="browse");self.projects.bind("<<ListboxSelect>>",self.select)
        self.secondary_tab_holder,tabs=create_editor_tabs(body,("Project details","Project media"))
        details=ttk.Frame(tabs,padding=10);tabs.add(details,text="Project details")
        self.values={key:tk.StringVar() for key in ("title","heading","context","cover","coverPosition")}
        details.columnconfigure(1,weight=1)
        for row,(key,label) in enumerate((("title","Project title"),("heading","Client / heading"),("context","Organization / context"),("cover","Cover image"),("coverPosition","Cover focus (X% Y%)"))):
            ttk.Label(details,text=label).grid(row=row,column=0,sticky="w",padx=(0,9),pady=3)
            entry=ttk.Entry(details,textvariable=self.values[key]);entry.grid(row=row,column=1,sticky="ew",pady=3)
            if key=="cover":entry.configure(state="readonly")
        flags=ttk.Frame(details);flags.grid(row=5,column=0,columnspan=2,sticky="w",pady=6)
        self.visible=tk.BooleanVar();self.expanded=tk.BooleanVar()
        ttk.Checkbutton(flags,text="Show on Engineering page",variable=self.visible,command=self.changed).pack(side="left",padx=(0,12))
        ttk.Checkbutton(flags,text="Initially expanded",variable=self.expanded,command=self.changed).pack(side="left")
        ttk.Label(details,text="Project description / contributions").grid(row=6,column=0,columnspan=2,sticky="w",pady=(8,3))
        self.content=RichText(details,self.changed);self.content.grid(row=7,column=0,columnspan=2,sticky="nsew");details.rowconfigure(7,weight=1)
        media_page=ttk.Frame(tabs,padding=8);tabs.add(media_page,text="Project media")
        tools=ttk.Frame(media_page);tools.pack(fill="x",pady=(0,6))
        for label,command in (("Add media…",self.add_media),("Remove selected…",self.remove_media),
                ("Move up",lambda:self.move_media(-1)),("Move down",lambda:self.move_media(1)),("Use as cover",self.use_cover),("Open file",self.open_media)):
            ttk.Button(tools,text=label,command=command).pack(side="left",padx=3)
        media_body=ttk.Frame(media_page);media_body.pack(fill="both",expand=True)
        self.media=ThumbnailList(media_body);self.media.pack(side="left",fill="y",padx=(0,10));self.media.bind("<<ListboxSelect>>",self.select_media)
        pane=ttk.Frame(media_body);pane.pack(side="left",fill="both",expand=True)
        self.viewport=PhotoViewport(pane);self.viewport.set_mode("pan");self.viewport.pack(fill="both",expand=True)
        self.media_values={key:tk.StringVar() for key in ("caption","credit","alt")}
        for key,label in (("caption","Caption"),("credit","Credit / tools"),("alt","Accessible description")):
            row=ttk.Frame(pane);row.pack(fill="x",pady=3)
            ttk.Label(row,text=label,width=20).pack(side="left");ttk.Entry(row,textvariable=self.media_values[key]).pack(side="left",fill="x",expand=True)
        self.status=tk.StringVar(value="Select a project. Changes stay local until saved.")
        ttk.Label(self,textvariable=self.status,padding=(12,3,12,7)).pack(fill="x")
        for value in (*self.values.values(),*self.media_values.values()):value.trace_add("write",lambda *_:self.changed())
        self.populate()
    @property
    def catalog_path(self):return self.root/"data"/"engineering-catalog.json"
    @property
    def page_path(self):return self.root/"engineeringdesign.html"
    def changed(self):
        if self.loading:return
        self.store()
        self._refresh_actions()

    def _refresh_actions(self):
        modified=self.data!=self.initial or bool(self.pending)
        self.save_button.configure(state="normal" if modified else "disabled")
        self.reset_button.configure(state="normal" if modified else "disabled")
        self.undo_button.configure(state="normal" if self.history else "disabled")
    def checkpoint(self):
        self.store();self.history.append(copy.deepcopy(self.data));self.history=self.history[-30:];self._refresh_actions()
    def store_media(self):
        if self.index is None or self.media_index is None or self.loading:return
        items=self.data["projects"][self.index]["media"]
        if self.media_index<len(items):
            for key,value in self.media_values.items():items[self.media_index][key]=value.get()
    def store(self):
        if self.index is None or self.loading:return
        self.store_media();p=self.data["projects"][self.index]
        for key,value in self.values.items():p[key]=value.get()
        p["visible"]=self.visible.get();p["expanded"]=self.expanded.get();p["bodyHtml"]=self.content.get_html()
    def asset_preview(self,src):
        path=catalog.local_asset(self.root,src) if src else None
        if path in self.pending:
            folder=cache_path()/"project-previews";folder.mkdir(parents=True,exist_ok=True)
            target=folder/(hashlib.sha256(self.pending[path]).hexdigest()[:16]+path.suffix)
            if not target.exists():target.write_bytes(self.pending[path])
            return target
        return path
    def populate(self,selected=0):
        self.projects.delete(0,"end");self.index=None;self.media_index=None
        for p in self.data["projects"]:
            self.projects.insert("end","  "+("" if p["visible"] else "[Draft] ")+p["title"],self.asset_preview(p.get("cover","")),placeholder="No cover")
        if self.data["projects"]:
            selected=min(selected,len(self.data["projects"])-1);self.projects.selection_set(selected);self.projects.activate(selected);self.load(selected)
        else:
            self.loading=True
            for value in (*self.values.values(),*self.media_values.values()):value.set("")
            self.visible.set(False);self.expanded.set(False);self.content.set_html("")
            self.media.delete(0,"end");self.viewport.set_source(None)
            self.loading=False;self.status.set("Add a project to begin.")
        self._refresh_actions()
    def select(self,_event=None):
        selected=self.projects.curselection()
        if selected and selected[0]!=self.index:self.store();self.load(selected[0])
    def load(self,index):
        self.loading=True;self.index=index;self.media_index=None;p=self.data["projects"][index]
        for key,value in self.values.items():value.set(p.get(key,""))
        self.visible.set(p["visible"]);self.expanded.set(p["expanded"]);self.content.set_html(p["bodyHtml"])
        self.loading=False;self.populate_media();self.status.set(f"{p['id']} • {len(p['media'])} media items")
    def populate_media(self,selected=0):
        self.media.delete(0,"end");self.media_index=None
        for item in self.data["projects"][self.index]["media"]:
            self.media.insert("end",f"[{item['kind'].title()}] {Path(item['src']).name}",self.asset_preview(item["src"]) if item["kind"]=="image" else None,placeholder=item["kind"].title())
        if self.media.rows:self.media.selection_set(min(selected,len(self.media.rows)-1));self.select_media()
        else:self.viewport.set_source(None)
    def select_media(self,_event=None):
        if self.index is None:return
        rows=self.media.curselection()
        if not rows:return
        index=self.media.index("active");index=index if index in rows else rows[0]
        self.store_media();self.media_index=index;item=self.data["projects"][self.index]["media"][index]
        self.loading=True
        for key,value in self.media_values.items():value.set(item.get(key,""))
        self.loading=False
        try:
            if item["kind"]=="video":
                image=image_frame(self.asset_preview(item["src"]),max_side=1200)
                if image is None:self.viewport.set_source(None);return
                self.viewport.set_source(image,identity=(item["src"],"video-still"))
                return
            if item["kind"]!="image":self.viewport.set_source(None);return
            with Image.open(self.asset_preview(item["src"])) as raw:
                image=ImageOps.exif_transpose(raw).convert("RGB");image.thumbnail((1800,1800))
            self.viewport.set_source(image,identity=item["src"])
        except (OSError,ValueError):self.viewport.set_source(None)
    def unique_id(self,title):
        base=re.sub(r"[^a-z0-9]+","-",title.lower()).strip('-') or "project"
        if not base[0].isalpha():base="project-"+base
        used={p["id"] for p in self.data["projects"]};name=base;i=2
        while name in used:name=f"{base}-{i}";i+=1
        return name
    def add_project(self):
        title=simpledialog.askstring("Add Engineering project","Project title:",parent=self)
        if not title or not title.strip():return
        self.checkpoint();self.data["projects"].append(catalog.new_project(self.unique_id(title),title.strip()));self.populate(len(self.data["projects"])-1)
    def duplicate(self):
        if self.index is None:return
        self.checkpoint();p=copy.deepcopy(self.data["projects"][self.index]);p["id"]=self.unique_id(p["title"]);p["title"]+=" (copy)";p["visible"]=False
        self.data["projects"].insert(self.index+1,p);self.populate(self.index+1)
    def remove(self):
        if self.index is None:return
        if not messagebox.askyesno("Remove project","Remove this project from the Engineering page? Its media files will be retained.",parent=self):return
        self.checkpoint();index=self.index;self.data["projects"].pop(index);self.populate(max(0,index-1))
    def move(self,offset):
        if self.index is None or not 0<=self.index+offset<len(self.data["projects"]):return
        self.checkpoint();i=self.index;j=i+offset;items=self.data["projects"];items[i],items[j]=items[j],items[i];self.populate(j)
    def undo(self):
        if self.history:self.data=self.history.pop();self.populate(min(self.index or 0,max(0,len(self.data["projects"])-1)))
    def add_media(self):
        if self.index is None:return
        sources=filedialog.askopenfilenames(parent=self,title="Add project media",filetypes=[("Project media","*.jpg *.jpeg *.png *.webp *.tif *.tiff *.heic *.heif *.mp4 *.webm *.pdf"),("All files","*.*")])
        if not sources:return
        self.checkpoint();p=self.data["projects"][self.index]
        try:
            for source in map(Path,sources):
                suffix=source.suffix.lower();kind="video" if suffix in (".mp4",".webm") else "document" if suffix==".pdf" else "image"
                if source.resolve().is_relative_to(self.root.resolve()):name=source.resolve().relative_to(self.root.resolve()).as_posix()
                else:
                    if kind=="image":
                        with Image.open(source) as raw:im=ImageOps.exif_transpose(raw).convert("RGBA" if suffix==".png" else "RGB");im.thumbnail((1800,1800))
                        out=io.BytesIO();im.save(out,"PNG" if suffix==".png" else "JPEG",**({"optimize":True} if suffix==".png" else {"quality":90,"optimize":True}));data=out.getvalue();suffix=".png" if suffix==".png" else ".jpg"
                    else:data=source.read_bytes()
                    stem=re.sub(r"[^A-Za-z0-9_-]+","-",source.stem).strip('-') or "media"
                    name=f"assets/engineering/{p['id']}/{stem}-{hashlib.sha256(data).hexdigest()[:8]}{suffix}"
                    self.pending[self.root/name]=data
                p["media"].append({"kind":kind,"src":name,"caption":"","credit":"","alt":""})
                if not p["cover"] and kind=="image":p["cover"]=name;self.values["cover"].set(name)
            self.populate_media(len(p["media"])-1);self.changed()
        except (OSError,ValueError) as exc:messagebox.showerror("Media unavailable",str(exc),parent=self)
    def remove_media(self):
        if self.index is None or self.media_index is None:return
        if not messagebox.askyesno("Remove project media","Remove selected media from this project? The file will be retained.",parent=self):return
        self.checkpoint();p=self.data["projects"][self.index];index=self.media_index;p["media"].pop(index);self.media_index=None;self.populate_media(max(0,index-1));self.changed()
    def move_media(self,offset):
        if self.index is None or self.media_index is None:return
        items=self.data["projects"][self.index]["media"];i=self.media_index;j=i+offset
        if not 0<=j<len(items):return
        self.checkpoint();items[i],items[j]=items[j],items[i];self.media_index=None;self.populate_media(j);self.changed()
    def use_cover(self):
        if self.index is None or self.media_index is None:return
        item=self.data["projects"][self.index]["media"][self.media_index]
        if item["kind"]=="image":self.values["cover"].set(item["src"])
    def open_media(self):
        if self.index is not None and self.media_index is not None:open_path(self.asset_preview(self.data["projects"][self.index]["media"][self.media_index]["src"]))
    def preview(self):
        self.store()
        try:
            preview_data=copy.deepcopy(self.data)
            if self.index is not None:preview_data["projects"][self.index]["visible"]=True
            catalog.validate(preview_data,self.root,self.pending)
            page=catalog.render_page(preview_data,self.expected_page.decode("utf-8"))
            # A private preview uses an absolute base; links/media resolve without copying assets.
            base=self.root.as_uri()+"/";page=page.replace("<head>",f'<head><base href="{base}">',1)
            for path,data in self.pending.items():
                relative=path.relative_to(self.root).as_posix();page=page.replace(relative,self.asset_preview(relative).as_uri())
            folder=cache_path()/"project-previews";folder.mkdir(parents=True,exist_ok=True)
            path=folder/"engineering-preview.html";path.write_text(page,encoding="utf-8");open_path(path)
        except (OSError,ValueError) as exc:messagebox.showerror("Preview unavailable",str(exc),parent=self)
    def save(self):
        self.store()
        used={catalog.local_asset(self.root,name) for p in self.data["projects"] for name in [p.get("cover")]+[m["src"] for m in p["media"]] if name}
        self.pending={path:data for path,data in self.pending.items() if path.resolve() in used}
        if self.data==self.initial and not self.pending:return True
        if not messagebox.askyesno("Save Engineering changes","Save reviewed projects and update the Engineering page?",parent=self):return False
        try:
            backup=catalog.save_catalog(self.root,self.data,self.expected_catalog,self.expected_page,self.pending)
            self.expected_catalog=self.catalog_path.read_bytes();self.expected_page=self.page_path.read_bytes();self.initial=copy.deepcopy(self.data);self.pending={};self.history=[]
            self.populate(self.index or 0);self.status.set(f"Engineering changes saved. Backup: {backup}");return True
        except (OSError,ValueError,KeyError) as exc:messagebox.showerror("Save failed",str(exc),parent=self);return False
    def reload(self):
        self.store()
        if self.data!=self.initial and not messagebox.askyesno("Discard unsaved changes","Reload Engineering projects and discard unsaved edits?",parent=self):return
        self.data=catalog.read_catalog(self.root);self.initial=copy.deepcopy(self.data);self.expected_page=self.page_path.read_bytes();self.expected_catalog=self.catalog_path.read_bytes() if self.catalog_path.exists() else None
        self.pending={};self.history=[];self.populate()
    def can_close(self):
        self.store()
        if self.data==self.initial:return True
        choice=messagebox.askyesnocancel("Unsaved Engineering changes","Save Engineering changes before closing?",parent=self)
        return False if choice is None else self.save() if choice else True
