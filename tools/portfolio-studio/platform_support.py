"""Small Windows/macOS adapters; never permanently delete as a Trash fallback."""
import os
from pathlib import Path
import subprocess
import sys


def open_path(path):
    path=str(Path(path).resolve())
    if sys.platform=="win32":os.startfile(path)
    else:subprocess.Popen(["open" if sys.platform=="darwin" else "xdg-open",path],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)


def local_data_path():
    if sys.platform=="darwin":return Path.home()/"Library"/"Application Support"/"PortfolioStudio"
    return Path(os.environ.get("LOCALAPPDATA",Path.home()/".local"/"share"))/"PortfolioStudio"


def backup_root(kind):
    return local_data_path()/kind


def cache_path():
    if sys.platform=="darwin":return Path.home()/"Library"/"Caches"/"PortfolioStudio"
    return local_data_path()


def trash_label():return "Trash" if sys.platform=="darwin" else "Recycle Bin"


def wheel_units(delta):
    return -int(delta) if sys.platform=="darwin" else -int(delta/120)
