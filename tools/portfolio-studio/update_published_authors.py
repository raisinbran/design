"""Backfill authorship/copyright losslessly. Dry run by default; --apply backs up files."""
import argparse
import datetime
import os
from pathlib import Path
import tempfile

from publication_metadata import set_authorship

ROOT=Path(__file__).resolve().parents[2]


def atomic_write(path,data):
    fd,name=tempfile.mkstemp(dir=path.parent,prefix=".author-")
    try:
        with os.fdopen(fd,"wb") as stream:stream.write(data)
        os.replace(name,path)
    finally:Path(name).unlink(missing_ok=True)


def update(root=ROOT,apply=False,backup_dir=None):
    root=Path(root).resolve()
    media=root/"photography"/"published"
    changes=[];total=0
    for path in sorted(media.iterdir()):
        if path.suffix.lower() not in (".jpg",".jpeg") or not path.is_file():continue
        if path.resolve().parent!=media.resolve():raise ValueError("Publication path leaves the media directory")
        total+=1
        original=path.read_bytes()
        updated=set_authorship(original)
        if original!=updated:changes.append((path,original,updated))
    print(f"Published JPEGs: {total}; metadata updates needed: {len(changes)}")
    if not apply or not changes:return len(changes)
    backup=(Path(backup_dir) if backup_dir else root/"_old")/("published-authors-"+datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f"))
    backup.mkdir(parents=True,exist_ok=False)
    for path,original,_updated in changes:(backup/path.name).write_bytes(original)
    installed=[]
    try:
        for path,original,updated in changes:
            if path.read_bytes()!=original:raise ValueError(f"File changed during update: {path.name}")
            atomic_write(path,updated);installed.append((path,original))
        for path,_original,updated in changes:
            if path.read_bytes()!=updated:raise ValueError(f"Verification failed: {path.name}")
    except BaseException:
        for path,original in reversed(installed):atomic_write(path,original)
        raise
    print(f"Updated {len(changes)} JPEGs without recompression. Backup: {backup}")
    return len(changes)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--backup-dir",type=Path,help="Optional backup folder outside the repository")
    args=parser.parse_args()
    update(apply=args.apply,backup_dir=args.backup_dir)
