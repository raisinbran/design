"""Reviewable local gallery arrangement based on image appearance, not semantic AI."""
import copy, json, math, tkinter as tk
from pathlib import Path
from tkinter import ttk, messagebox
from PIL import Image, ImageOps, ImageStat, ImageTk
from catalog_tools import read_json, generated_js, validate_catalog
from edit_tags import ROOT, C_PATH, J_PATH, atomic_catalog_pair
from window_state import remember_window
from platform_support import wheel_units

class Arrange(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Portfolio Studio | Arrange Gallery")
        self.geometry("1150x750")
        remember_window(self,"arrange-gallery")
        self.catalog=read_json(C_PATH)
        self.original=copy.deepcopy(self.catalog["photos"])
        self.working=list(self.original)
        self.opening_order=tuple(p["file"] for p in self.original)
        self.applied_order=self.opening_order
        self.generated_state=None
        self.mode=tk.StringVar(value="Balanced")
        self.locks=set()
        self.suggestion_generated=False
        self.images={}
        self.cache={}
        self.build()
        self.populate()
        self.mode.trace_add("write",lambda *_:self.refresh_buttons())
    def build(self):
        top=ttk.Frame(self,padding=12);top.pack(fill="x")
        ttk.Label(top,text="Arrangement strategy").pack(side="left")
        ttk.Combobox(top,textvariable=self.mode,state="readonly",width=20,
                     values=["Balanced","Color harmony","Thematic groups","Visual contrast"]).pack(side="left",padx=8)
        self.generate_button=ttk.Button(top,text="Generate suggestion",command=self.suggest)
        self.generate_button.pack(side="left",padx=8)
        self.reverse_button=ttk.Button(top,text="Reverse suggestion",command=self.reverse_suggestion,state="disabled")
        self.reverse_button.pack(side="left",padx=8)
        self.restore_button=ttk.Button(top,text="Restore original order",command=self.restore,state="disabled")
        self.restore_button.pack(side="left",padx=8)
        self.apply_button=ttk.Button(top,text="Apply reviewed order",command=self.save,state="disabled")
        self.apply_button.pack(side="right")
        ttk.Label(self,text="Select an image to lock its current position or move it manually. "
                  "Suggestions never save automatically.",padding=(12,0,12,8)).pack(fill="x")
        outer=ttk.Frame(self,padding=10);outer.pack(fill="both",expand=True)
        l=ttk.Frame(outer);l.pack(side="left",fill="y")
        self.lst=tk.Listbox(l,width=43,exportselection=False)
        self.lst.pack(fill="both",expand=True)
        tools=ttk.Frame(l);tools.pack(fill="x",pady=8)
        for txt,fn in [("Move up",lambda:self.move(-1)),("Move down",lambda:self.move(1)),
                       ("Lock / unlock",self.toggle_lock)]:
            ttk.Button(tools,text=txt,command=fn).pack(side="left",padx=2)
        self.preview=tk.Canvas(outer,bg="#f7f7f7",highlightthickness=0)
        self.preview.pack(side="left",fill="both",expand=True,padx=(14,0))
        self.preview.bind("<Configure>",lambda _:self.draw_preview())
        self.lst.bind("<<ListboxSelect>>",lambda _:self.draw_preview())
        self.info=tk.StringVar(value="")
        ttk.Label(self,textvariable=self.info,padding=10).pack(fill="x")
    def populate(self,selected=0):
        self.lst.delete(0,"end")
        for idx,p in enumerate(self.working):
            self.lst.insert("end",(" [LOCKED] " if p["file"] in self.locks else " ")+p["file"])
        if self.working:
            self.lst.selection_set(min(selected,len(self.working)-1))
        self.draw_preview()
        self.refresh_buttons()
    def order(self):
        return tuple(p["file"] for p in self.working)
    def refresh_buttons(self):
        order=self.order()
        unlocked=sum(p["file"] not in self.locks for p in self.working)
        state=(self.mode.get(),order)
        self.generate_button.configure(state="normal" if unlocked>1 and state!=self.generated_state else "disabled")
        self.apply_button.configure(state="normal" if order!=self.applied_order else "disabled")
        self.restore_button.configure(state="normal" if order!=self.opening_order else "disabled")
    def selection(self):
        rows=self.lst.curselection()
        return rows[0] if rows else None
    def move(self,offset):
        i=self.selection()
        if i is None:return
        j=i+offset
        if not 0<=j<len(self.working):return
        if self.working[i]["file"] in self.locks or self.working[j]["file"] in self.locks:
            messagebox.showinfo("Locked","Unlock the affected photos before moving them.")
            return
        self.working[i],self.working[j]=self.working[j],self.working[i]
        self.populate(j)
    def toggle_lock(self):
        i=self.selection()
        if i is None:return
        name=self.working[i]["file"]
        if name in self.locks:self.locks.remove(name)
        else:self.locks.add(name)
        self.populate(i)
    def restore(self):
        self.working=list(self.original);self.locks.clear();self.suggestion_generated=False
        self.reverse_button.configure(state="disabled");self.populate()
    def features(self,p):
        name=p["file"]
        if name not in self.cache:
            path=ROOT/"photography"/"published"/name
            try:
                with Image.open(path) as src:
                    im=ImageOps.exif_transpose(src).convert("RGB")
                    crop=p.get("galleryCrop")
                    if isinstance(crop,dict):
                        x,y,w,h=(float(crop[k]) for k in ("x","y","width","height"))
                        a,b=im.size
                        im=im.crop((int(x*a),int(y*b),max(1,int((x+w)*a)),max(1,int((y+h)*b))))
                    im.thumbnail((110,110),Image.Resampling.LANCZOS)
                    stat=ImageStat.Stat(im)
                    means=stat.mean
                    brightness=sum(means)/3
                    saturation=(max(means)-min(means))/255
                    self.cache[name]=(means,brightness,saturation,im.copy())
            except OSError:
                self.cache[name]=([128,128,128],128,0,None)
        return self.cache[name]
    def cost(self,a,b):
        am,ab,ass,_=self.features(a);bm,bb,bss,_=self.features(b)
        rgb=math.sqrt(sum((x-y)**2 for x,y in zip(am,bm)))/441.67
        tone=abs(ab-bb)/255
        sat=abs(ass-bss)
        taga=set(a.get("tags",[]));tagb=set(b.get("tags",[]))
        theme=1-len(taga&tagb)/max(1,len(taga|tagb))
        ra=float(a.get("aspectRatio",1.5) or 1.5);rb=float(b.get("aspectRatio",1.5) or 1.5)
        ratio=min(1,abs(math.log(max(.1,ra)/max(.1,rb)))/2)
        strategy=self.mode.get()
        weights={"Balanced":(.38,.20,.14,.16,.12),
                 "Color harmony":(.64,.22,.06,.04,.04),
                 "Thematic groups":(.14,.12,.08,.60,.06),
                 "Visual contrast":(.48,.22,.12,.10,.08)}[strategy]
        components=[rgb,tone,sat,theme,ratio]
        c=sum(w*x for w,x in zip(weights,components))
        return -c if strategy=="Visual contrast" else c
    def suggest(self):
        if not self.working or (self.mode.get(),self.order())==self.generated_state:return
        # A greedy path with both ends considered. Locked positions remain exactly fixed.
        original=self.working[:]
        fixed={i:p for i,p in enumerate(original) if p["file"] in self.locks}
        pool=[p for p in original if p["file"] not in self.locks]
        if not pool:return
        result=[]
        for i in range(len(original)):
            if i in fixed:result.append(fixed[i]);continue
            if not result:
                candidate=pool.pop(0)
            else:
                j=min(range(len(pool)),key=lambda j:self.cost(result[-1],pool[j]))
                candidate=pool.pop(j)
            result.append(candidate)
        self.working=result
        self.generated_state=(self.mode.get(),self.order())
        self.suggestion_generated=True;self.reverse_button.configure(state="normal")
        self.populate()
        self.info.set("Suggestion generated. Review thumbnails and manually adjust before applying.")
    def reverse_suggestion(self):
        if not self.suggestion_generated:return
        selected=self.selection()
        name=self.working[selected]["file"] if selected is not None else None
        unlocked=iter(reversed([p for p in self.working if p["file"] not in self.locks]))
        self.working=[p if p["file"] in self.locks else next(unlocked) for p in self.working]
        index=next((i for i,p in enumerate(self.working) if p["file"]==name),0)
        self.populate(index)
        self.info.set("Suggestion reversed. Locked positions are unchanged. Review before applying.")

    def draw_preview(self):
        if not hasattr(self,"preview"):return
        c=self.preview;c.delete("all");self.images={}
        width=max(250,c.winfo_width()-12);cell=130;columns=max(1,int(width//cell))
        for i,p in enumerate(self.working):
            x=8+(i%columns)*cell;y=12+(i//columns)*115
            _,_,_,im=self.features(p)
            if im:
                thumb=im.copy();thumb.thumbnail((116,83),Image.Resampling.LANCZOS)
                tkimg=ImageTk.PhotoImage(thumb,master=c);self.images[i]=tkimg
                c.create_image(x+57,y+42,image=tkimg)
            else:c.create_rectangle(x,y,x+114,y+82,fill="#ddd")
            color="#296a70" if i==self.selection() else "#666"
            c.create_text(x+56,y+98,text=f"{i+1}: {p['file'][:17]}",width=125,font=("Segoe UI",8),fill=color)
        c.configure(scrollregion=(0,0,width,20+math.ceil(len(self.working)/columns)*115))
        if not getattr(self,"scrollbar_done",False):
            c.bind("<MouseWheel>",lambda ev:c.yview_scroll(wheel_units(ev.delta),"units"))
            c.configure(yscrollincrement=40)
            self.scrollbar_done=True
    def save(self):
        if self.order()==self.applied_order:return
        if not messagebox.askyesno("Apply gallery arrangement",
                                   "Save this photo order to the local catalog and regenerate gallery data?"):
            return
        # Refuse if another process edited the catalog after this window opened.
        latest=read_json(C_PATH)
        if latest!=self.catalog:
            messagebox.showerror("Catalog changed","The catalog was edited elsewhere. Reopen Arrange Gallery.")
            return
        updated=copy.deepcopy(self.catalog);updated["photos"]=copy.deepcopy(self.working)
        try:
            validate_catalog(updated,ROOT)
            atomic_catalog_pair(json.dumps(updated,ensure_ascii=False,indent=2)+"\n",generated_js(updated))
        except (OSError,ValueError,KeyError) as exc:
            messagebox.showerror("Save failed",str(exc));return
        self.catalog=updated;self.applied_order=self.order();self.refresh_buttons()
        messagebox.showinfo("Saved","Arrangement saved locally. Review Photography before committing.")
if __name__=="__main__":
    Arrange().mainloop()
