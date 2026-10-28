"""Review additions, removal, and file reconciliation for published photographs.

Backs the Photography tab's add/remove actions. Each action re-reads the
catalog to refuse stale writes and keeps a backup under _old/ first.
Original source photos are never touched.
"""
import copy, datetime, json, shutil, tkinter as tk
from pathlib import Path
from tkinter import ttk, messagebox, simpledialog
from PIL import Image,ImageOps
from catalog_tools import read_json,generated_js,validate_catalog
from recycle_bin import recycle_files
from platform_support import trash_label
from gallery_thumbnails import thumbnail_name,read_registry,thumbnail_fields,digest,asset_transaction,save_registry,atomic

ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/"data"/"media-catalog.json"
JS=ROOT/"js"/"photography-catalog.js"
MEDIA=ROOT/"photography"/"published"
JOURNAL=ROOT/"_old"/"portfolio-photo-management"

def publication_path(name):
    """Path of a published photo; rejects names or symlinks that could escape the folder."""
    path=MEDIA/name
    if Path(name).name!=name or path.resolve().parent!=MEDIA.resolve() or path.is_symlink():
        raise ValueError("Invalid publication file path")
    return path


def paired_thumbnail(name,catalog):
    """Path of a published photo's gallery thumbnail, with the same safety checks."""
    photo=next((photo for photo in catalog["photos"] if photo["file"]==name),{})
    filename=photo.get("thumbnail",thumbnail_name(name))
    if Path(filename).name!=filename or '..' in filename:raise ValueError("Unsafe thumbnail path")
    path=MEDIA.parent/"thumbnails"/filename
    if path.resolve().parent!=(MEDIA.parent/"thumbnails").resolve() or path.is_symlink():raise ValueError("Unsafe thumbnail path")
    return path


def save_transaction(catalog, *, archive_files=()):
    """Write the catalog pair; only the explicit Archive action backs up JPEGs.

    archive_files are copied into the backup before being removed. On any
    failure, removed files and the previous catalog pair are restored.
    """
    validate_catalog(catalog)
    newdata=(json.dumps(catalog,indent=2,ensure_ascii=False)+"\n").encode("utf-8")
    newjs=generated_js(catalog).encode("utf-8")
    archives=list(archive_files)
    allowed={MEDIA.resolve(),(MEDIA.parent/"thumbnails").resolve()}
    if any(path.resolve().parent not in allowed or path.is_symlink() for path in archives):raise ValueError("Invalid publication asset path")
    if any(not path.is_file() for path in archives):raise FileNotFoundError("A selected publication file is missing")
    previous=[(DATA,DATA.read_bytes()),(JS,JS.read_bytes())]
    backup=JOURNAL/datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    backup.mkdir(parents=True,exist_ok=False)
    for path,data in previous:(backup/path.name).write_bytes(data)
    copied=[]
    try:
        for path in archives:
            target=backup/path.parent.name/path.name;target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(path,target);copied.append((path,target))
        atomic(DATA,newdata);atomic(JS,newjs)
        for path in archives:path.unlink()
    except BaseException:
        for path,target in copied:
            if not path.exists():shutil.copy2(target,path)
        for path,data in previous:atomic(path,data)
        raise
    return backup


def enumerate_files():
    """Published photo files on disk, sorted by name."""
    return sorted((p for p in MEDIA.iterdir() if p.is_file() and p.suffix.casefold() in (".jpg",".jpeg",".png",".webp")),
                  key=lambda p:p.name.casefold())

def selection_summary(names):
    text="\n".join(names[:15])
    return text+(f"\n… and {len(names)-15} more" if len(names)>15 else "")


def ask_import_descriptions(parent,names):
    if len(names)==1:
        alt=simpledialog.askstring("Accessible description",f"Describe {names[0]}:",parent=parent)
        return {names[0]:alt.strip()} if alt and alt.strip() else None
    result=None
    win=tk.Toplevel(parent);win.title("Import selected photographs")
    win.transient(parent);win.geometry("760x480");win.grab_set()
    ttk.Label(win,text="Enter an accessible description for each selected photo.",padding=12).pack(fill="x")
    body=ttk.Frame(win);body.pack(fill="both",expand=True)
    canvas=tk.Canvas(body,highlightthickness=0)
    scrollbar=ttk.Scrollbar(body,orient="vertical",command=canvas.yview)
    canvas.configure(yscrollcommand=scrollbar.set)
    scrollbar.pack(side="right",fill="y");canvas.pack(side="left",fill="both",expand=True)
    rows=ttk.Frame(canvas,padding=10);item=canvas.create_window(0,0,window=rows,anchor="nw")
    rows.bind("<Configure>",lambda _:canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.bind("<Configure>",lambda event:canvas.itemconfigure(item,width=event.width))
    entries={}
    rows.columnconfigure(1,weight=1)
    for i,name in enumerate(names):
        ttk.Label(rows,text=name,wraplength=250).grid(row=i,column=0,sticky="w",padx=5,pady=5)
        entry=ttk.Entry(rows);entry.grid(row=i,column=1,sticky="ew",padx=5,pady=5)
        entries[name]=entry
    def accept():
        nonlocal result
        values={name:entry.get().strip() for name,entry in entries.items()}
        if not all(values.values()):
            messagebox.showerror("Descriptions required","Describe every selected photograph before importing.",parent=win);return
        result=values;win.destroy()
    buttons=ttk.Frame(win,padding=10);buttons.pack(fill="x")
    ttk.Button(buttons,text=f"Import {len(names)} photos",command=accept).pack(side="right")
    ttk.Button(buttons,text="Cancel",command=win.destroy).pack(side="right",padx=8)
    win.bind("<Escape>",lambda _:win.destroy())
    next(iter(entries.values())).focus_set();win.wait_window()
    return result


class ManagementActions:
    """Batch photo actions; hosts provide selected_rows(), catalog and refresh()."""
    def action_rows(self,states):
        rows=self.selected_rows()
        return [(state,name) for state,name in rows if state in states]

    def latest_catalog(self):
        """Catalog from disk; raises if another window changed it since this one loaded."""
        latest=read_json(DATA)
        if latest!=self.catalog:raise ValueError("The catalog changed. Refresh before trying again.")
        return latest

    def import_unlisted(self):
        """Add published files that are not in the catalog yet, after asking for descriptions."""
        rows=self.action_rows({"Unlisted file"})
        if not rows:
            messagebox.showinfo("Select unlisted photos","Select one or more [Unlisted] photos, then choose Add to gallery.");return
        names=[name for _,name in rows]
        descriptions=ask_import_descriptions(self,names)
        if descriptions is None:return
        try:
            new=self.latest_catalog()
            tracked={photo["file"].casefold() for photo in new["photos"]}
            for name in names:
                if name.casefold() in tracked:raise ValueError(f"Already included: {name}")
                with Image.open(publication_path(name)) as src:
                    image=ImageOps.exif_transpose(src);w,h=image.size
                new["photos"].append({"file":name,"alt":descriptions[name],"visible":True,
                    "featured":False,"displayPriority":"normal","aspectRatio":w/h,"tags":[]})
                # Reuse an existing thumbnail only if it was made from this exact file.
                thumb=paired_thumbnail(name,new)
                record=read_registry(ROOT).get(name,{})
                if thumb.is_file() and record.get("publishedHash")==digest(publication_path(name).read_bytes()):
                    with Image.open(thumb) as image:size={"width":image.width,"height":image.height}
                    new["photos"][-1].update(thumbnail_fields(name,thumb.read_bytes(),size))
                    if record.get("thumbnailFraming"):new["photos"][-1]["galleryCrop"]=record["thumbnailFraming"]
            backup=save_transaction(new)
        except Exception as exc:messagebox.showerror("Import failed",str(exc));return
        self.refresh()
        messagebox.showinfo("Added locally",f"Imported {len(names)} photo(s).\nCatalog backup: {backup}")

    def remove(self,archive):
        """Remove gallery entries; with archive=True, also move their files into the backup."""
        states={"Published","Missing file","Unlisted file"} if archive else {"Published","Missing file"}
        rows=self.action_rows(states)
        if not rows:
            messagebox.showinfo("No gallery entries selected",
                "Unlisted photos are already outside the gallery. Use Remove from repository to remove their files.");return
        names=[name for _,name in rows]
        details=("Back up the selected JPEGs and remove them from the publication folder."
            if archive else "Keep their JPEGs in the publication folder as unlisted files.")
        if not messagebox.askyesno("Confirm removal",f"Remove {len(names)} selected photo(s) from the gallery?\n\n"
            +selection_summary(names)+"\n\n"+details+"\nOriginal source photos are unchanged.",parent=self):return
        try:
            new=self.latest_catalog();keys={name.casefold() for name in names}
            new["photos"]=[p for p in new["photos"] if p["file"].casefold() not in keys]
            paths=[publication_path(name) for name in names]
            if archive:paths.extend(paired_thumbnail(name,self.catalog) for name in names)
            backup=save_transaction(new,archive_files=[path for path in paths if path.is_file()] if archive else [])
        except Exception as exc:messagebox.showerror("Removal failed",str(exc));return
        self.refresh()
        messagebox.showinfo("Removed locally",f"Updated {len(names)} photo(s).\nBackup: {backup}")

    def delete_published(self):
        """Send published files to the system Trash/Recycle Bin and drop their gallery entries."""
        rows=self.action_rows({"Published","Unlisted file"})
        if not rows:
            messagebox.showinfo("Select photo files","Select one or more published or unlisted photo files to recycle.");return
        names=[name for _,name in rows]
        if not messagebox.askyesno("Remove from repository",f"Move {len(names)} selected photo(s) to {trash_label()}?\n\n"
            +selection_summary(names)+"\n\nTheir gallery entries will also be removed."
            "\nNo JPEG copies will be archived in this repository. Original source photos are unchanged.",parent=self):return
        try:
            initial=self.latest_catalog()
            full_paths=[publication_path(name) for name in names]
            if any(not path.is_file() for path in full_paths):raise FileNotFoundError("A selected file is missing. Refresh first.")
            paths=full_paths+[path for name in names if (path:=paired_thumbnail(name,initial)).is_file()]
            keys={name.casefold() for name in names}
            new=copy.deepcopy(initial)
            new["photos"]=[p for p in initial["photos"] if p["file"].casefold() not in keys]
            previous=[(DATA,DATA.read_bytes()),(JS,JS.read_bytes())]
            if new!=initial:save_transaction(new)
            try:recycle_files(paths)
            except Exception:
                # A Windows batch can partially complete. Retain entries for any
                # files that stayed on disk; successfully recycled files stay removed.
                recycled={path.name.casefold() for path in full_paths if not path.exists()}
                if not recycled:
                    for path,data in previous:atomic(path,data)
                else:
                    restored=copy.deepcopy(initial)
                    restored["photos"]=[p for p in initial["photos"] if p["file"].casefold() not in recycled]
                    atomic(DATA,(json.dumps(restored,ensure_ascii=False,indent=2)+"\n").encode("utf-8"))
                    atomic(JS,generated_js(restored).encode("utf-8"))
                raise
        except Exception as exc:
            self.refresh()
            messagebox.showerror(f"{trash_label()} operation incomplete",str(exc)+"\n\nThe list has been refreshed. Files not moved remain available.");return
        self.refresh()
        messagebox.showinfo(f"Moved to {trash_label()}",f"Recycled {len(names)} photo(s).\nRestore them through {trash_label()} if needed.")

    def match_rename(self):
        """Re-link [Missing] entries to files renamed outside Studio, keeping their metadata."""
        rows=self.action_rows({"Missing file"})
        if not rows:
            messagebox.showinfo("Select missing entries","Select one or more [Missing] photo entries.");return
        try:
            new=self.latest_catalog();matches=[];thumbnail_updates={};old_thumbnails=[];record_updates={}
            records=read_registry(ROOT)
            tracked={p["file"].casefold() for p in new["photos"]}
            for _,name in rows:
                newname=simpledialog.askstring("Match renamed file",f"Existing publication filename for {name}:",parent=self)
                if newname is None:return
                newname=newname.strip();path=publication_path(newname)
                if not path.is_file():raise FileNotFoundError(newname)
                if newname.casefold() in tracked:raise ValueError(f"Already tracked: {newname}")
                tracked.add(newname.casefold());matches.append((name,newname))
                with Image.open(path) as image:w,h=ImageOps.exif_transpose(image).size
                entry=next(p for p in new["photos"] if p["file"]==name)
                old_thumb=paired_thumbnail(name,self.catalog)
                new_thumb=MEDIA.parent/"thumbnails"/thumbnail_name(newname)
                if entry.get("thumbnail") and old_thumb.is_file() and old_thumb!=new_thumb:
                    if new_thumb.exists():raise ValueError(f"A thumbnail already exists for {newname}; refresh or rebuild it first.")
                    thumbnail_updates[new_thumb]=old_thumb.read_bytes();old_thumbnails.append(old_thumb)
                    entry["thumbnail"]=new_thumb.name
                if name in records and records[name].get("publishedHash")==digest(path.read_bytes()):
                    record_updates[newname]=records[name]
                entry.update(file=newname,aspectRatio=w/h)
            if not messagebox.askyesno("Confirm filename matches","\n".join(f"{old} → {new}" for old,new in matches)+
                "\n\nKeep existing descriptions, tags and gallery crops?"):return
            # Refuse a stale write if another window saved while the dialogs were open.
            self.latest_catalog()
            with asset_transaction(thumbnail_updates):save_transaction(new)
            referenced={photo.get("thumbnail") for photo in new["photos"]}
            for old in old_thumbnails:
                if old.name not in referenced:
                    try:old.unlink()
                    except OSError:pass
            if record_updates:
                try:save_registry(ROOT,record_updates)
                except (OSError,ValueError):pass
        except Exception as exc:messagebox.showerror("Match failed",str(exc));return
        self.refresh()
