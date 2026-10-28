"""Thumbnail rows with the small Listbox interface used by the catalog editor."""
import tkinter as tk
from tkinter import ttk
from modern_scrollbar import create_scrollbar
from PIL import Image, ImageOps, ImageTk, ImageDraw
from thumbnail_ui import THUMB_SIZE, ROW_HEIGHT, cover_thumbnail
from video_preview import image_frame, VIDEO_SUFFIXES
from pathlib import Path


class ThumbnailList(ttk.Frame):
    def __init__(self,parent):
        super().__init__(parent)
        ttk.Style(self).configure("CatalogPhotos.Treeview",rowheight=ROW_HEIGHT)
        self.tree=ttk.Treeview(self,show="tree",selectmode="extended",style="CatalogPhotos.Treeview")
        self.tree.column("#0",width=355,minwidth=270,stretch=True)
        scrollbar=create_scrollbar(self,orient="vertical",command=self.tree.yview,autohide=True)
        self.scrollbar=scrollbar
        self.tree.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right",fill="y");self.tree.pack(fill="both",expand=True)
        # Tk Treeview reports changing fractions when rows resize or a scrollbar
        # itself disappears; refresh once after layout to avoid persistent rails.
        def refresh_scrollbar(_event=None):
            def update():
                try:
                    if self.tree.winfo_exists():scrollbar.set(*self.tree.yview())
                except tk.TclError:pass
            self.after_idle(update)
        self.tree.bind('<Configure>',refresh_scrollbar,add='+')
        self.after_idle(refresh_scrollbar)
        self.images={};self.rows=[];self.pending=None;self.queue=[]
        self.bind("<Destroy>",self._destroyed,add="+")

    def bind(self,event,func=None,add=None):
        if event=="<<ListboxSelect>>":return self.tree.bind("<<TreeviewSelect>>",func,add)
        return super().bind(event,func,add)

    def _destroyed(self,event):
        if event.widget is self and self.pending:
            try:self.after_cancel(self.pending)
            except tk.TclError:pass
            self.pending=None

    def insert(self,index,text,path=None,placeholder="Missing"):
        item=self.tree.insert("","end",text=text)
        self.rows.append(item)
        self.queue.append((item,path,placeholder))
        if self.pending is None:self.pending=self.after_idle(self._load_batch)
        return item

    def _load_batch(self):
        self.pending=None
        for _ in range(min(6,len(self.queue))):
            item,path,placeholder=self.queue.pop(0)
            if not self.tree.exists(item):continue
            canvas=Image.new("RGB",THUMB_SIZE,"#e7e9eb")
            try:
                if path is None:raise ValueError("No image preview")
                if Path(path).suffix.lower() in VIDEO_SUFFIXES:
                    frame=image_frame(path,max_side=192)
                    if frame is None:raise ValueError('Video frame unavailable')
                    canvas=ImageOps.fit(frame,THUMB_SIZE,method=Image.Resampling.LANCZOS)
                else:
                    with Image.open(path) as source:canvas=cover_thumbnail(source)
            except (OSError,ValueError,TypeError):
                ImageDraw.Draw(canvas).text((4,18),placeholder[:10],fill="#59636b")
            photo=ImageTk.PhotoImage(canvas,master=self.tree)
            self.images[item]=photo;self.tree.item(item,image=photo)
        if self.queue:self.pending=self.after(1,self._load_batch)

    def delete(self,first,last=None):
        if self.pending:self.after_cancel(self.pending);self.pending=None
        items=self.rows[int(first):None if last=="end" else int(last if last is not None else first)+1]
        if items:self.tree.delete(*items)
        self.rows=[item for item in self.rows if item not in items]
        self.images={item:img for item,img in self.images.items() if item in self.rows}
        self.queue=[row for row in self.queue if row[0] in self.rows]

    def curselection(self):
        selected=set(self.tree.selection())
        return tuple(i for i,item in enumerate(self.rows) if item in selected)

    def selection_set(self,first,last=None):
        end=len(self.rows) if last=="end" else int(last if last is not None else first)+1
        items=self.rows[int(first):end]
        if items:self.tree.selection_add(*items)

    def selection_clear(self,first,last=None):
        end=len(self.rows) if last=="end" else int(last if last is not None else first)+1
        items=self.rows[int(first):end]
        if items:self.tree.selection_remove(*items)

    def index(self,value):
        if value=="active":
            item=self.tree.focus()
            return self.rows.index(item) if item in self.rows else 0
        return int(value)

    def activate(self,index):
        if self.rows:self.tree.focus(self.rows[int(index)])

    def see(self,index):
        if self.rows:self.tree.see(self.rows[int(index)])
