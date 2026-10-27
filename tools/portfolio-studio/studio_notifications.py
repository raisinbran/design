"""Soft, optional local notifications for Portfolio Studio."""
import json, os, math, wave, struct, tempfile, threading, tkinter as tk
from pathlib import Path
import sys, subprocess
from studio_preferences import preferences_path
from tkinter import ttk

CONFIG = preferences_path().with_name("notifications.json")

def settings():
    try:
        data=json.loads(CONFIG.read_text(encoding="utf-8"))
        return {"mode":data.get("mode","soft"),"volume":max(0,min(100,int(data.get("volume",30))))}
    except (OSError,ValueError,TypeError):
        return {"mode":"soft","volume":30}

def save_settings(mode, volume):
    CONFIG.parent.mkdir(parents=True,exist_ok=True)
    CONFIG.write_text(json.dumps({"mode":mode,"volume":int(volume)},indent=2)+"\n",encoding="utf-8")

def _play(kind, options):
    if options["mode"]=="silent" or options["volume"]==0:return
    if sys.platform=="darwin":
        sound="Glass.aiff" if options["mode"]=="soft" else "Tink.aiff"
        try:subprocess.run(["/usr/bin/afplay","-v",str(options["volume"]/100),"/System/Library/Sounds/"+sound],check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        except OSError:pass
        return
    try:
        import winsound
        if options["mode"]=="system":
            winsound.MessageBeep()
            return
        fd, name=tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        rate=22050
        notes={"success":[(580,.08),(740,.12)],"warning":[(450,.13)],"info":[(590,.09)]}.get(kind,[(430,.13)])
        samples=[]
        for hz,duration in notes:
            length=int(rate*duration)
            for n in range(length):
                fade=min(1,n/(rate*.018),(length-n)/(rate*.045))
                amp=.16*options["volume"]/100*max(0,fade)
                samples.append(int(32767*amp*math.sin(2*math.pi*hz*n/rate)))
            samples.extend([0]*int(rate*.025))
        with wave.open(name,"wb") as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(rate)
            wav.writeframes(struct.pack("<"+"h"*len(samples),*samples))
        winsound.PlaySound(name,winsound.SND_FILENAME)
        os.unlink(name)
    except (OSError,ImportError):
        pass

def notify(parent,title,message,kind="info"):
    options=settings()
    if options["mode"]!="silent":
        threading.Thread(target=_play,args=(kind,options),daemon=True).start()
    win=tk.Toplevel(parent)
    win.title(title);win.transient(parent);win.grab_set()
    frame=ttk.Frame(win,padding=20);frame.pack(fill="both",expand=True)
    ttk.Label(frame,text=message,justify="left",wraplength=440).pack(fill="x",pady=(0,18))
    ttk.Button(frame,text="OK",command=win.destroy).pack(anchor="e")
    win.bind("<Return>",lambda _:win.destroy())
    win.bind("<Escape>",lambda _:win.destroy())
    win.update_idletasks()
    win.geometry(f"490x{max(130,win.winfo_reqheight())}")
    win.wait_window()

def preferences(parent):
    win=tk.Toplevel(parent);win.title("Settings");win.transient(parent)
    opts=settings()
    mode=tk.StringVar(value=opts["mode"])
    vol=tk.IntVar(value=opts["volume"])
    frm=ttk.Frame(win,padding=18);frm.pack()
    ttk.Label(frm,text="Notifications").pack(anchor="w",pady=(0,10))
    def preview():
        options={"mode":mode.get(),"volume":vol.get()}
        threading.Thread(target=_play,args=("info",options),daemon=True).start()
    win._preview_sound=preview
    for name,val in [("Soft notification sounds","soft"),("Silent","silent"),("System notification sounds","system")]:
        ttk.Radiobutton(frm,text=name,variable=mode,value=val,command=preview).pack(anchor="w")
    ttk.Label(frm,text="Volume").pack(anchor="w",pady=(12,0))
    pending=[None]
    def volume_preview(_value):
        if pending[0] is not None:win.after_cancel(pending[0])
        pending[0]=win.after(250,preview)
    ttk.Scale(frm,from_=0,to=100,variable=vol,command=volume_preview).pack(fill="x")
    def cancel_pending(event):
        if event.widget is win and pending[0] is not None:
            try:win.after_cancel(pending[0])
            except tk.TclError:pass
    win.bind("<Destroy>",cancel_pending,add="+")
    def commit():
        save_settings(mode.get(),vol.get());win.destroy()
    ttk.Button(frm,text="Save preferences",command=commit).pack(pady=12)
    return win
