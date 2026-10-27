"""Small paragraph editor retaining untouched legacy formatting exactly."""
import html
import tkinter as tk
from tkinter import ttk,simpledialog
from bs4 import BeautifulSoup,NavigableString


class RichText(ttk.Frame):
    def __init__(self,parent,on_change=lambda:None):
        super().__init__(parent);self.on_change=on_change;self.loading=False;self.changed=False;self.links={}
        bar=ttk.Frame(self);bar.pack(fill="x")
        for text,fn in (("Bold",lambda:self.toggle("bold")),("Italic",lambda:self.toggle("italic")),("Link…",self.link)):
            ttk.Button(bar,text=text,command=fn).pack(side="left",padx=(0,5))
        self.text=tk.Text(self,wrap="word",undo=True,font=("Segoe UI",10),height=12)
        scroll=ttk.Scrollbar(self,command=self.text.yview);self.text.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right",fill="y");self.text.pack(fill="both",expand=True)
        self.text.tag_configure("bold",font=("Segoe UI",10,"bold"));self.text.tag_configure("italic",font=("Segoe UI",10,"italic"))
        self.text.bind("<<Modified>>",self.modified)
    def modified(self,_event=None):
        if self.text.edit_modified():
            if not self.loading:self.changed=True;self.on_change()
            self.text.edit_modified(False)
    def set_html(self,source):
        self.loading=True;self.original=source;self.links={};self.text.delete("1.0","end")
        def write(node,tags=()):
            if isinstance(node,NavigableString):self.text.insert("end",str(node),tags);return
            if node.name=="br":self.text.insert("end","\n",tags);return
            if node.name in ("strong","b"):tags+=('bold',)
            if node.name in ("em","i"):tags+=('italic',)
            if node.name=="a":
                tag=f"link_{len(self.links)}";self.links[tag]=node.get("href","");tags+=(tag,)
                self.text.tag_configure(tag,foreground="#245b83",underline=True)
            for child in node.children:write(child,tags)
            if node.name in ("p","ul","ol"):self.text.insert("end","\n\n")
            if node.name=="li":self.text.insert("end","\n")
        for child in BeautifulSoup(source,"html.parser").contents:write(child)
        self.text.edit_modified(False);self.changed=False;self.loading=False
    def toggle(self,tag):
        try:a,b=self.text.index("sel.first"),self.text.index("sel.last")
        except tk.TclError:return
        if tag in self.text.tag_names(a):self.text.tag_remove(tag,a,b)
        else:self.text.tag_add(tag,a,b)
        self.changed=True;self.on_change()
    def link(self):
        try:a,b=self.text.index("sel.first"),self.text.index("sel.last")
        except tk.TclError:return
        url=simpledialog.askstring("Link","Web address or repository-relative link:",parent=self)
        if not url:return
        if ":" in url and not url.startswith(("https://","http://","mailto:")):return
        tag=f"link_{len(self.links)}";self.links[tag]=url;self.text.tag_configure(tag,foreground="#245b83",underline=True)
        self.text.tag_add(tag,a,b);self.changed=True;self.on_change()
    def get_html(self):
        if not self.changed:return self.original
        text=self.text.get("1.0","end-1c").rstrip("\n");parts=[];offset=0
        for paragraph in text.split("\n\n"):
            body=[];active=[]
            for char in paragraph:
                tags=[t for t in self.text.tag_names(f"1.0+{offset}c") if t in ("bold","italic") or t in self.links]
                if tags!=active:
                    body.extend('</a>' if t in self.links else '</strong>' if t=='bold' else '</em>' for t in reversed(active))
                    body.extend('<a href="'+html.escape(self.links[t],quote=True)+'">' if t in self.links else '<strong>' if t=='bold' else '<em>' for t in tags)
                    active=tags
                body.append('<br>' if char=='\n' else html.escape(char));offset+=1
            body.extend('</a>' if t in self.links else '</strong>' if t=='bold' else '</em>' for t in reversed(active))
            parts.append('<p class="card-text">'+''.join(body)+'</p>');offset+=2
        return ''.join(parts)
