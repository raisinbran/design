"""Small Windows/macOS adapters; never permanently delete as a Trash fallback."""
import os
from pathlib import Path
import subprocess
import sys


def open_path(path):
    """Open a file with the system's default app (does not wait or report viewer errors off Windows)."""
    path=str(Path(path).resolve())
    if sys.platform=="win32":os.startfile(path)
    else:subprocess.Popen(["open" if sys.platform=="darwin" else "xdg-open",path],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)


def local_data_path():
    """Private per-user data folder, outside the repository; holds Studio backups."""
    if sys.platform=="darwin":return Path.home()/"Library"/"Application Support"/"PortfolioStudio"
    return Path(os.environ.get("LOCALAPPDATA",Path.home()/".local"/"share"))/"PortfolioStudio"


def backup_root(kind):
    """Folder for one kind of private backup, e.g. "archive-backups"."""
    return local_data_path()/kind


def cache_path():
    """Disposable per-user folder for previews and the offline model."""
    if sys.platform=="darwin":return Path.home()/"Library"/"Caches"/"PortfolioStudio"
    return local_data_path()


def trash_label():return "Trash" if sys.platform=="darwin" else "Recycle Bin"


def wheel_units(delta):
    """Scroll steps for a mouse-wheel event: Windows reports multiples of 120, macOS small steps."""
    return -int(delta) if sys.platform=="darwin" else -int(delta/120)
