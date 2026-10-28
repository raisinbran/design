"""Lossless anti-AI metadata backfill. Dry run by default; backups outside Git."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path

from catalog_tools import generated_js, validate_catalog
from export_rights import set_jpeg_rights
from gallery_thumbnails import atomic, registry_path
from platform_support import backup_root

ROOT=Path(__file__).resolve().parents[2]


def update(root=ROOT,apply=False,backup_dir=None):
    root=Path(root).resolve();media=root/"photography"/"published"
    changes={};hashes={};total=0
    for path in sorted(media.iterdir()):
        if not path.is_file() or path.suffix.lower() not in (".jpg",".jpeg"): continue
        if path.resolve().parent!=media.resolve(): raise ValueError("Photo path leaves published directory")
        total+=1;before=path.read_bytes();after=set_jpeg_rights(before)
        if before!=after:
            changes[path]=(before,after)
            hashes[path.name]=(hashlib.sha256(before).hexdigest(),hashlib.sha256(after).hexdigest())
    count=len(hashes)
    print(f"Published JPEGs: {total}; rights updates needed: {count}; already current: {total-count}")
    if not count:return 0
    # Preserve current catalog and exact private source matches after metadata-only edits.
    catalog_path=root/"data"/"media-catalog.json"
    if catalog_path.is_file():
        before=catalog_path.read_bytes();catalog=json.loads(before)
        changed=False
        for photo in catalog["photos"]:
            if photo["file"] in hashes:
                photo["mediaVersion"]=hashes[photo["file"]][1][:12];changed=True
        if changed:
            validate_catalog(catalog)
            changes[catalog_path]=(before,(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n").encode())
            runtime=root/"js"/"photography-catalog.js"
            changes[runtime]=(runtime.read_bytes(),generated_js(catalog).encode())
    registry=registry_path()
    if registry.is_file():
        before=registry.read_bytes();data=json.loads(before);changed=False
        for name,record in data.get(str(root).casefold(),{}).items():
            if name in hashes and record.get("publishedHash")==hashes[name][0]:
                record["publishedHash"]=hashes[name][1];changed=True
        if changed:changes[registry]=(before,(json.dumps(data,indent=2)+"\n").encode())
    if not apply:return count
    base=Path(backup_dir) if backup_dir else backup_root("metadata-backups")
    backup=base/("published-rights-"+datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f"))
    backup.mkdir(parents=True,exist_ok=False)
    for path,(before,_after) in changes.items():
        relative=path.relative_to(root) if path.is_relative_to(root) else Path("private")/path.name
        target=backup/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(before)
    installed=[]
    try:
        # Guard the entire snapshot before starting; also check each file at commit.
        for path,(before,_after) in changes.items():
            if path.read_bytes()!=before:raise ValueError(f"Changed during preparation: {path.name}")
        for path,(before,after) in changes.items():
            if path.read_bytes()!=before:raise ValueError(f"Changed during update: {path.name}")
            atomic(path,after);installed.append(path)
        for path,(_before,after) in changes.items():
            if path.read_bytes()!=after:raise ValueError(f"Verification failed: {path.name}")
    except BaseException:
        for path in reversed(installed):atomic(path,changes[path][0])
        raise
    print(f"Updated {count} JPEGs without recompression. Backup: {backup}")
    return count


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--backup-dir",type=Path)
    args=parser.parse_args()
    update(apply=args.apply,backup_dir=args.backup_dir)
