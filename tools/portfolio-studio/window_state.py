"""Remember each Studio window's normal size and maximized state locally."""
import json
import os
from pathlib import Path
import tempfile
import tkinter as tk

from studio_preferences import preferences_path


def window_state_path():
    return preferences_path().with_name("window-state.json")


def read_states():
    try:
        data=json.loads(window_state_path().read_text(encoding="utf-8"))
        return data if isinstance(data,dict) else {}
    except (OSError,ValueError):
        return {}


def valid_state(value):
    return (isinstance(value,dict) and
            all(type(value.get(key)) is int and 100<=value[key]<=20000 for key in ("width","height")) and
            type(value.get("maximized")) is bool)


def save_state(key,state):
    target=window_state_path()
    target.parent.mkdir(parents=True,exist_ok=True)
    states=read_states()
    states[key]=state
    fd,name=tempfile.mkstemp(dir=target.parent,suffix=".tmp")
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as stream:
            json.dump(states,stream,indent=2)
            stream.write("\n")
        os.replace(name,target)
    finally:
        Path(name).unlink(missing_ok=True)


class WindowMemory:
    def __init__(self,window,key):
        self.window=window
        self.key=key
        self.record=None
        saved=read_states().get(key)
        if valid_state(saved):
            self.record=dict(saved)
            width=min(saved["width"],max(100,window.winfo_screenwidth()-40))
            height=min(saved["height"],max(100,window.winfo_screenheight()-80))
            window.geometry(f"{width}x{height}")
            if saved["maximized"]:
                window.after_idle(self.restore_maximized)
        window.bind("<Configure>",self.capture,add="+")
        window.bind("<Map>",self.capture,add="+")
        window.bind("<Destroy>",self.closed,add="+")

    def restore_maximized(self):
        # Respect callers that deliberately keep a window hidden (including tests).
        if self.window.winfo_exists() and self.window.state()!="withdrawn":
            try:self.window.state("zoomed")
            except tk.TclError:
                self.window.geometry(f"{self.window.winfo_screenwidth()-40}x{self.window.winfo_screenheight()-80}+20+20")

    def capture(self,event):
        if event.widget is not self.window:return
        state=self.window.state()
        if state=="normal" and self.window.winfo_ismapped():
            width,height=self.window.winfo_width(),self.window.winfo_height()
            if width>=100 and height>=100:
                self.record={"width":width,"height":height,"maximized":False}
        elif state=="zoomed":
            if self.record is None:
                # Keep restore-down dimensions separate from maximized screen size.
                geometry=self.window.geometry().split("+",1)[0].split("-",1)[0]
                width,height=map(int,geometry.split("x"))
                self.record={"width":max(100,width),"height":max(100,height),"maximized":True}
            else:self.record["maximized"]=True
        # Iconifying or hiding a window does not replace its previous usable state.

    def closed(self,event):
        if event.widget is not self.window:return
        if isinstance(self.window,tk.Tk):
            # A destroyed root must not leave callbacks in the shared Tk event loop.
            for callback in self.window.tk.splitlist(self.window.tk.call("after","info")):
                try:self.window.after_cancel(callback)
                except tk.TclError:pass
        if self.record is None:return
        try:save_state(self.key,self.record)
        except (OSError,ValueError):pass


def remember_window(window,key):
    window._window_memory=WindowMemory(window,key)
