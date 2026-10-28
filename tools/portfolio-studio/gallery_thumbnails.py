"""Gallery thumbnails and the private registry of each photo's original file.

Thumbnails are always rebuilt from clean original pixels, never from a
watermarked export, so the gallery can be re-cropped without quality loss.
The registry (stored with the user's preferences, outside the repository)
remembers which original produced each published file.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from contextlib import contextmanager

from PIL import Image, ImageFilter, ImageOps, ImageStat
from catalog_tools import read_json, generated_js
from processor import prepare_publication, encode_gallery_thumbnail,framed_preview
from studio_preferences import preferences_path

ROOT=Path(__file__).resolve().parents[2]
VERSION=2


def photo_framing(photo):
    """The catalog fields that decide how a photo is framed in its gallery tile."""
    return {"galleryCrop":photo.get("galleryCrop"),"galleryZoom":photo.get("galleryZoom",1),
        "focusX":photo.get("focusX",.5),"focusY":photo.get("focusY",.5)}


def encode_for_gallery(clean,photo,logo):
    """Encode a thumbnail using the photo's gallery crop, or its legacy zoom framing."""
    if not photo.get("galleryCrop") and float(photo.get("galleryZoom",1) or 1)>1:
        clean=framed_preview(clean,photo["galleryZoom"],photo.get("focusX",.5),photo.get("focusY",.5))
    return encode_gallery_thumbnail(clean,logo,photo.get("galleryCrop"))


def thumbnail_name(filename):
    """Thumbnail filename for a published photo; rejects names that could escape the folder."""
    if Path(filename).name!=filename or ".." in filename:raise ValueError("Unsafe publication filename")
    return filename+".webp"


def registry_path():
    return preferences_path().with_name("original-sources.json")


def read_registry(root):
    try:data=read_json(registry_path())
    except (OSError,ValueError):return {}
    return data.get(str(Path(root).resolve()).casefold(),{})


def atomic(path,data):
    """Replace a file in one step: write a flushed temp file beside it, then rename."""
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,name=tempfile.mkstemp(dir=path.parent,prefix=".studio-")
    try:
        with os.fdopen(fd,"wb") as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
        os.replace(name,path)
    finally:Path(name).unlink(missing_ok=True)


def save_registry(root,records):
    """Merge original-file records for one repository into the private registry."""
    try:data=read_json(registry_path())
    except (OSError,ValueError):data={}
    key=str(Path(root).resolve()).casefold()
    data.setdefault(key,{}).update(records)
    atomic(registry_path(),(json.dumps(data,indent=2)+"\n").encode("utf-8"))


def signature(path):
    """Cheap change detector for an original: size and modification time."""
    stat=Path(path).stat()
    return [stat.st_size,stat.st_mtime_ns]


def digest(data):return hashlib.sha256(data).hexdigest()


def source_record(source,settings,published):
    """Registry entry linking a published file to its original and edit settings."""
    return {"source":str(Path(source).resolve()),"signature":signature(source),
        "settings":{key:copy.deepcopy(settings.get(key)) for key in
            ("maxSide","degrees","cropApplied","cropAction","galleryCrop")},"publishedHash":digest(published)}


def thumbnail_fields(name,data,size):
    return {"thumbnail":thumbnail_name(name),"thumbnailVersion":digest(data)[:12],
        "thumbnailWidth":size["width"],"thumbnailHeight":size["height"],"thumbnailFramed":True}


@contextmanager
def asset_transaction(updates):
    """Replace deterministic derivative paths, rolling back if metadata saving fails."""
    old={path:path.read_bytes() if path.exists() else None for path in updates}
    installed=[]
    try:
        for path,data in updates.items():atomic(path,data);installed.append(path)
        yield
    except BaseException:
        for path in reversed(installed):
            if old[path] is None:path.unlink(missing_ok=True)
            else:atomic(path,old[path])
        raise


def clean_from_record(record,reference):
    """Rebuild a published photo's clean (unwatermarked) pixels from its original."""
    source=Path(record["source"])
    if signature(source)!=record["signature"]:raise ValueError("Original changed; rebuild its source match")
    if record.get("transform"):
        with open_original(source) as raw:image=ImageOps.exif_transpose(raw).convert("RGB")
        return image.transform(tuple(record["referenceSize"]),Image.Transform.AFFINE,
            tuple(record["transform"]),Image.Resampling.BICUBIC)
    settings=record["settings"]
    crop=settings.get("galleryCrop") if settings.get("cropApplied") and settings.get("cropAction")=="export" else None
    return prepare_publication(source,int(settings["maxSide"]),float(settings["degrees"]),crop)


def open_original(path):
    if Path(path).suffix.lower() in (".heic",".heif"):
        try:
            import pillow_heif
            pillow_heif.register_heif_opener()
        except ImportError as exc:raise ValueError("HEIC support requires pillow-heif; run the Studio launcher to install it.") from exc
    return Image.open(path)


def match_original(source,reference):
    """Recover an existing export's crop/rotation from original pixels, never erase marks."""
    import cv2
    import numpy as np
    with open_original(source) as raw:original=ImageOps.exif_transpose(raw).convert("RGB")
    with Image.open(reference) as raw:target=ImageOps.exif_transpose(raw).convert("RGB")
    sample=original.copy();sample.thumbnail((1600,1600),Image.Resampling.LANCZOS)
    ref=target.copy();ref.thumbnail((1200,1200),Image.Resampling.LANCZOS)
    detector=cv2.SIFT_create(nfeatures=3500)
    key_a,desc_a=detector.detectAndCompute(cv2.cvtColor(np.array(sample),cv2.COLOR_RGB2GRAY),None)
    key_b,desc_b=detector.detectAndCompute(cv2.cvtColor(np.array(ref),cv2.COLOR_RGB2GRAY),None)
    if desc_a is None or desc_b is None:raise ValueError("Insufficient image features")
    pairs=cv2.BFMatcher().knnMatch(desc_a,desc_b,k=2)
    good=[a for pair in pairs if len(pair)==2 for a,b in [pair] if a.distance<.7*b.distance]
    if len(good)<20:raise ValueError("No reliable original-image match")
    points_a=np.float32([key_a[item.queryIdx].pt for item in good])
    points_b=np.float32([key_b[item.trainIdx].pt for item in good])
    matrix,inliers=cv2.estimateAffinePartial2D(points_a,points_b,method=cv2.RANSAC,ransacReprojThreshold=2)
    if matrix is None or int(inliers.sum())<20 or float(inliers.mean())<.6:
        raise ValueError("Source match is ambiguous")
    scale_a=np.diag([sample.width/original.width,sample.height/original.height,1])
    scale_b=np.diag([target.width/ref.width,target.height/ref.height,1])
    affine=scale_b@np.vstack([matrix,[0,0,1]])@scale_a
    inverse=np.linalg.inv(affine)
    corners=np.array([[0,0,1],[target.width,0,1],[0,target.height,1],[target.width,target.height,1]]).T
    mapped=inverse@corners
    if mapped[0].min() < -3 or mapped[1].min() < -3 or mapped[0].max()>original.width+3 or mapped[1].max()>original.height+3:
        raise ValueError("Recovered crop extends outside original")
    coefficients=inverse[:2].reshape(-1).tolist()
    clean=original.transform(target.size,Image.Transform.AFFINE,coefficients,Image.Resampling.BICUBIC)
    small_a=clean.copy();small_b=target.copy()
    small_a.thumbnail((500,500));small_b.thumbnail((500,500))
    error=float(np.abs(np.array(small_a.filter(ImageFilter.GaussianBlur(1)),dtype=float)-
        np.array(small_b.filter(ImageFilter.GaussianBlur(1)),dtype=float)).mean())
    if error>12:raise ValueError(f"Matched scene has different color treatment or framing ({error:.1f})")
    record={"source":str(Path(source).resolve()),"signature":signature(source),
        "transform":coefficients,"referenceSize":list(target.size),"publishedHash":digest(reference.read_bytes())}
    return clean,record


def create_thumbnail(root,photo,record,logo=None):
    """Build one thumbnail from a known original; refuses if the export has changed since."""
    reference=Path(root)/"photography"/"published"/photo["file"]
    if record["publishedHash"]!=digest(reference.read_bytes()):raise ValueError("Full-size export changed; rebuild its source match")
    clean=clean_from_record(record,reference)
    data,size=encode_for_gallery(clean,photo,logo)
    record=dict(record,thumbnailPipeline=VERSION,thumbnailFraming=photo.get("galleryCrop"),thumbnailGeometry=photo_framing(photo))
    return data,thumbnail_fields(photo["file"],data,size),record


def build_thumbnails(root=ROOT,originals_dir=None,names=None,apply=False,progress=None,logo=None):
    """Rebuild gallery thumbnails for published photos, then optionally save them.

    Each photo is skipped when its thumbnail is current, rebuilt from its
    registry record when possible, and otherwise matched to an original in
    originals_dir. With apply=True, thumbnails and the catalog pair are written
    together and rolled back together.
    """
    root=Path(root);catalog_path=root/"data"/"media-catalog.json";js_path=root/"js"/"photography-catalog.js"
    before={catalog_path:catalog_path.read_bytes(),js_path:js_path.read_bytes()}
    catalog=json.loads(before[catalog_path]);records=read_registry(root)
    originals=[path for path in Path(originals_dir).rglob("*") if path.is_file() and path.suffix.lower()
        in (".jpg",".jpeg",".png",".tif",".tiff",".heic",".heif")] if originals_dir else []
    selected=[photo for photo in catalog["photos"] if names is None or photo["file"] in names]
    updates={};new_records={};report={"updated":[],"skipped":[],"errors":[],"bytes":0}
    for index,photo in enumerate(selected):
        name=photo["file"];reference=root/"photography"/"published"/name
        if progress:progress(index,len(selected),name)
        try:
            record=records.get(name)
            thumb=root/"photography"/"thumbnails"/thumbnail_name(name)
            cached=False
            if record and reference.is_file() and thumb.is_file():
                try:
                    cached=(record.get("thumbnailPipeline")==VERSION and record.get("thumbnailGeometry")==photo_framing(photo)
                        and signature(record["source"])==record["signature"] and record.get("publishedHash")==digest(reference.read_bytes())
                        and photo.get("thumbnailVersion")==digest(thumb.read_bytes())[:12])
                except OSError:pass
            if cached:report["skipped"].append(name);continue
            # Prefer the recorded original; fall back to searching originals_dir.
            clean=None
            if record:
                try:data,fields,record=create_thumbnail(root,photo,record,logo)
                except (OSError,ValueError):record=None
            if not record:
                identity=re.match(r"(?i)(DSCF\d+|IMG_\d+|R\d+|\d{8}_\d+_iOS)",Path(name).stem)
                candidates=[path for path in originals if path.stem.casefold()==Path(name).stem.casefold() or
                    identity and path.stem.casefold().startswith(identity[1].casefold())]
                saved_source=Path(records[name]["source"]) if name in records else None
                if saved_source and saved_source.is_file() and saved_source not in candidates:candidates.insert(0,saved_source)
                candidates.sort(key=lambda path:path.stem.casefold()!=Path(name).stem.casefold())
                if not candidates:raise ValueError("Original not found in selected folder")
                failures=[]
                for source in candidates:
                    try:clean,record=match_original(source,reference);break
                    except (OSError,ValueError) as exc:failures.append(str(exc))
                if clean is None:raise ValueError("; ".join(failures))
                data,size=encode_for_gallery(clean,photo,logo)
                fields=thumbnail_fields(name,data,size)
                record.update(thumbnailPipeline=VERSION,thumbnailFraming=photo.get("galleryCrop"),thumbnailGeometry=photo_framing(photo))
            photo.update(fields);updates[thumb]=data;new_records[name]=record
            report["updated"].append(name);report["bytes"]+=len(data)
        except (OSError,ValueError) as exc:report["errors"].append(f"{name}: {exc}")
    if progress:progress(len(selected),len(selected),"Ready")
    if apply and updates:
        # Conflict check: refuse if the catalog or a photo changed while building.
        if any(path.read_bytes()!=data for path,data in before.items()):raise ValueError("Catalog changed during thumbnail building. Please retry.")
        for name,record in new_records.items():
            if digest((root/"photography"/"published"/name).read_bytes())!=record["publishedHash"]:
                raise ValueError(f"Photo changed during thumbnail building: {name}")
        metadata={catalog_path:(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n").encode("utf-8"),js_path:generated_js(catalog).encode("utf-8")}
        with asset_transaction(updates):
            try:
                for path,data in metadata.items():atomic(path,data)
            except BaseException:
                for path,data in before.items():atomic(path,data)
                raise
        try:save_registry(root,new_records)
        except (OSError,ValueError) as exc:report["errors"].append(f"Thumbnails saved, but local source records could not be saved: {exc}")
    return report


def run_builder(parent):
    """Build thumbnails from the Photography tab, asking for an originals folder only if needed."""
    from tkinter import filedialog,messagebox,ttk
    import tkinter as tk
    from photo_studio import LOGO
    root=parent.catalog_root if hasattr(parent,"catalog_root") else ROOT
    records=read_registry(root)
    need_folder=any(photo["file"] not in records or not Path(records[photo["file"]]["source"]).is_file()
        for photo in parent.catalog["photos"])
    folder=None
    if need_folder:
        folder=filedialog.askdirectory(parent=parent,title="Folder containing original, unwatermarked photographs")
        if not folder:return
    scope=messagebox.askyesnocancel("Build gallery thumbnails","Yes: build/update all catalog photos.\nNo: selected catalog photos only.\nCancel: stop.",parent=parent)
    if scope is None:return
    names=None if scope else [name for state,name in parent.selected_rows() if state in ("Published","Missing file")]
    if names==[]:messagebox.showinfo("Select photos","Select catalog photos first.",parent=parent);return
    win=tk.Toplevel(parent);win.title("Building gallery thumbnails");win.transient(parent);win.grab_set()
    label=ttk.Label(win,padding=14);label.pack(fill="x")
    bar=ttk.Progressbar(win,length=420,maximum=100);bar.pack(padx=14,pady=(0,14))
    win.protocol("WM_DELETE_WINDOW",lambda:None)
    def progress(index,total,name):
        label.configure(text=f"{index} / {total}: {name}")
        bar.configure(value=100*index/max(1,total));win.update()
    try:
        report=build_thumbnails(root,folder,names,True,progress,LOGO)
        parent.refresh()
        summary=f"Built {len(report['updated'])}; unchanged {len(report['skipped'])}. Added/updated {report['bytes']/1024:.0f} KB."
        if report["errors"]:summary+="\n\nNeeds an original/source match:\n"+"\n".join(report["errors"])
        messagebox.showinfo("Gallery thumbnails",summary,parent=parent)
    except Exception as exc:messagebox.showerror("Thumbnail building stopped",str(exc),parent=parent)
    finally:win.destroy()


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--originals",type=Path);parser.add_argument("--apply",action="store_true")
    args=parser.parse_args()
    from photo_studio import LOGO
    print(json.dumps(build_thumbnails(originals_dir=args.originals,apply=args.apply,logo=LOGO),indent=2))
