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
        self.loading=True;self.original=source;self.links={};self.link_attributes={};self.blocks={};self.text.delete("1.0","end")
        def write(node,tags=()):
            if isinstance(node,NavigableString):self.text.insert("end",str(node),tags);return
            if node.name=="br":self.text.insert("end","\n",tags);return
            if node.name in ("strong","b"):tags+=('bold',)
            if node.name in ("em","i"):tags+=('italic',)
            if node.name=="a":
                tag=f"link_{len(self.links)}";self.links[tag]=node.get("href","");tags+=(tag,)
                # Rebuilt links keep how the original opened (new tab, noopener).
                self.link_attributes[tag]=''.join(f' {key}="'+html.escape(" ".join(node.get_attribute_list(key)),quote=True)+'"'
                    for key in ("rel","target") if node.has_attr(key))
                self.text.tag_configure(tag,foreground="#245b83",underline=True)
            for child in node.children:write(child,tags)
            if node.name in ("p","ul","ol"):self.text.insert("end","\n\n")
            if node.name=="li":self.text.insert("end","\n")
        # Tag each top-level node's text, so get_html can return untouched
        # blocks verbatim. Markup without text travels with the next block
        # (or the last one, at the end).
        markup=""
        for child in BeautifulSoup(source,"html.parser").contents:
            start=self.text.index("end-1c");write(child);markup+=str(child)
            if self.text.compare(start,"==","end-1c"):continue
            tag=f"block_{len(self.blocks)}";self.text.tag_add(tag,start,"end-1c");self.blocks[tag]=markup;markup=""
        if markup and self.blocks:self.blocks[tag]+=markup
        self.saved_blocks={block:[c[:2] for c in chars] for block,chars in self.block_runs(self.styled_chars())}
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
    def styled_chars(self):
        """Every character with its formatting tags and the source block it came from."""
        chars=[]
        for offset,char in enumerate(self.text.get("1.0","end-1c")):
            names=self.text.tag_names(f"1.0+{offset}c")
            formats=tuple(t for t in names if t in ("bold","italic") or t in self.links)
            chars.append((char,formats,next((t for t in names if t in self.blocks),None)))
        return chars
    def block_runs(self,chars):
        """Group characters by source block; text typed between blocks joins the next one."""
        runs=[];loose=[]
        for item in chars:
            if item[2] is None:loose.append(item)
            elif runs and runs[-1][0]==item[2] and not loose:runs[-1][1].append(item)
            else:runs.append((item[2],loose+[item]));loose=[]
        if loose and runs:runs[-1][1].extend(loose)
        elif loose:runs.append((None,loose))
        return runs
    def paragraphs(self,chars):
        """Rebuild edited text as card-text paragraphs with bold, italic and links."""
        def opening(t):return '<a href="'+html.escape(self.links[t],quote=True)+'"'+self.link_attributes.get(t,'')+'>' if t in self.links else '<strong>' if t=='bold' else '<em>'
        def closing(t):return '</a>' if t in self.links else '</strong>' if t=='bold' else '</em>'
        text=''.join(c for c,_,_ in chars).rstrip("\n");parts=[];offset=0
        for paragraph in text.split("\n\n"):
            body=[];active=()
            for char in paragraph:
                tags=chars[offset][1]
                if tags!=active:
                    body.extend(closing(t) for t in reversed(active))
                    body.extend(opening(t) for t in tags)
                    active=tags
                body.append('<br>' if char=='\n' else html.escape(char));offset+=1
            body.extend(closing(t) for t in reversed(active))
            parts.append('<p class="card-text">'+''.join(body)+'</p>');offset+=2
        return ''.join(parts)
    def get_html(self):
        if not self.changed:return self.original
        parts=[];edited=[]
        for block,chars in self.block_runs(self.styled_chars()):
            # Edited text that no longer ends its paragraph (a deleted break or
            # a paste across blocks) runs into the next block: rebuild them together.
            if edited and ''.join(c for c,_,_ in edited).endswith("\n\n"):parts.append(self.paragraphs(edited));edited=[]
            if not edited and block is not None and [c[:2] for c in chars]==self.saved_blocks.get(block):parts.append(self.blocks[block])
            else:edited.extend(chars)
        if edited or not parts:parts.append(self.paragraphs(edited))
        return ''.join(parts)
