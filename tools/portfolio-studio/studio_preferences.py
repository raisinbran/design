"""Portfolio Studio preferences stored outside the public GitHub repository."""
import json
import os
import sys
from pathlib import Path

DEFAULTS = {"maxSide": 1080, "openAfterPublish": True}
MAX_MIN, MAX_MAX = 300, 6000


def preferences_path():
    if sys.platform=="darwin":return Path.home()/"Library"/"Application Support"/"PortfolioStudio"/"preferences.json"
    home = os.environ.get("APPDATA")
    if home:
        return Path(home) / "PortfolioStudio" / "preferences.json"
    return Path.home() / ".config" / "PortfolioStudio" / "preferences.json"


def load_preferences(path=None):
    target = Path(path) if path else preferences_path()
    result = dict(DEFAULTS)
    if not target.exists():
        return result
    data = json.loads(target.read_text(encoding="utf-8"))
    size = int(data.get("maxSide", DEFAULTS["maxSide"]))
    if not MAX_MIN <= size <= MAX_MAX:
        raise ValueError("Saved maximum side is outside the supported range.")
    result["maxSide"] = size
    result["openAfterPublish"] = data.get("openAfterPublish",True) if type(data.get("openAfterPublish",True)) is bool else True
    return result


def save_preferences(defaults, path=None):
    target = Path(path) if path else preferences_path()
    settings=load_preferences(target)
    settings.update(defaults)
    value = int(settings["maxSide"])
    if not MAX_MIN <= value <= MAX_MAX:
        raise ValueError(f"Maximum side must be {MAX_MIN} to {MAX_MAX} pixels.")
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".tmp")
    if type(settings["openAfterPublish"]) is not bool:raise ValueError("Open after publishing must be on or off.")
    settings["maxSide"]=value
    tmp.write_text(json.dumps(settings, indent=2)+"\n", encoding="utf-8")
    tmp.replace(target)
    return target
