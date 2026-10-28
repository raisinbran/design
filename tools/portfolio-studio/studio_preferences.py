"""Portfolio Studio preferences stored outside the public GitHub repository."""
import json
import os
import sys
from pathlib import Path

DEFAULTS = {"maxSide": 1080, "openAfterPublish": True, "appearance": "system"}
MAX_MIN, MAX_MAX = 300, 6000


def preferences_path():
    if sys.platform=="darwin":return Path.home()/"Library"/"Application Support"/"PortfolioStudio"/"preferences.json"
    home = os.environ.get("APPDATA")
    if home:
        return Path(home) / "PortfolioStudio" / "preferences.json"
    return Path.home() / ".config" / "PortfolioStudio" / "preferences.json"


def saved_settings(target):
    """Return the stored settings, or nothing when the file is missing or damaged."""
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def saved_size(value):
    try:
        size = int(value)
    except (TypeError, ValueError, OverflowError):
        return DEFAULTS["maxSide"]
    return size if MAX_MIN <= size <= MAX_MAX else DEFAULTS["maxSide"]


def load_preferences(path=None):
    target = Path(path) if path else preferences_path()
    result = dict(DEFAULTS)
    # A damaged file must never block startup; saving rewrites it cleanly.
    data = saved_settings(target)
    result["maxSide"] = saved_size(data.get("maxSide", DEFAULTS["maxSide"]))
    result["openAfterPublish"] = data.get("openAfterPublish",True) if type(data.get("openAfterPublish",True)) is bool else True
    appearance=data.get('appearance','system')
    result['appearance']=appearance if appearance in ('system','light','dark') else 'system'
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
    if settings.get('appearance') not in ('system','light','dark'):
        raise ValueError('Appearance must be System, Light or Dark.')
    settings["maxSide"]=value
    tmp.write_text(json.dumps(settings, indent=2)+"\n", encoding="utf-8")
    tmp.replace(target)
    return target
