"""Thumbnail rows with the small Listbox interface used by the catalog editor."""
import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageOps, ImageTk, ImageDraw


class ThumbnailList(ttk.Frame):
    def __init__(self,parent):
        super().__init__(parent)
        ttk.Style(self).configure("CatalogPhotos.Treeview",rowheight=76)
        self.tree=ttk.Treeview(self,show="tree",selectmode="extended",style="CatalogPhotos.Treeview")
        self.tree.column("#0",width=355,minwidth=270,stretch=True)
        scrollbar=ttk.Scrollbar(self,orient="vertical",command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right",fill="y");self.tree.pack(fill="both",expand=True)
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
            canvas=Image.new("RGB",(94,66),"#e7e9eb")
            try:
                if path is None:raise ValueError("No image preview")
                with Image.open(path) as source:
                    image=ImageOps.exif_transpose(source).convert("RGB")
                    image.thumbnail((94,66),Image.Resampling.LANCZOS)
                    canvas.paste(image,((94-image.width)//2,(66-image.height)//2))
            except (OSError,ValueError,TypeError):
                ImageDraw.Draw(canvas).text((9,25),placeholder,fill="#59636b")
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
