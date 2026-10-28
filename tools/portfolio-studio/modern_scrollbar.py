"""Low-profile, accessible Windows scrollbars for Portfolio Studio.

Single Canvas per bar; no images, polling, animations, or always-on callbacks.
Aqua and other non-Windows platforms keep native ttk scrollbars.
"""
import sys
import tkinter as tk
from tkinter import ttk


def create_scrollbar(parent, *, orient='vertical', command=None, autohide=False):
    if sys.platform != 'win32':
        return ttk.Scrollbar(parent, orient=orient, command=command)
    return ModernScrollbar(parent, orient=orient, command=command, autohide=autohide)


class ModernScrollbar(tk.Canvas):
    """Tk-compatible yscroll/xscroll command bridge with a subtle round thumb."""

    def __init__(self, parent, *, orient='vertical', command=None, autohide=False):
        if orient not in ('vertical','horizontal'):
            raise ValueError('Unsupported scrollbar direction')
        self.orient=orient
        self.command=command
        self.autohide=bool(autohide)
        self._first=0.0
        self._last=1.0
        self._drag=None
        self._hover=False
        self._geometry_before_hide=None
        self._studio_modern_scrollbar=True
        self._colors={}
        options={'width':11} if orient=='vertical' else {'height':11}
        super().__init__(parent, borderwidth=0,highlightthickness=0,relief='flat',
                         takefocus=1,**options)
        self.bind('<Configure>',self._draw)
        self.bind('<Enter>',self._enter)
        self.bind('<Leave>',self._leave)
        self.bind('<Button-1>',self._press)
        self.bind('<B1-Motion>',self._drag_motion)
        self.bind('<ButtonRelease-1>',self._release)
        self.bind('<MouseWheel>',self._wheel)
        self.bind('<Button-4>',lambda event:self._units(-1))
        self.bind('<Button-5>',lambda event:self._units(1))
        self.bind('<KeyPress-Up>',lambda event:self._units(-1))
        self.bind('<KeyPress-Down>',lambda event:self._units(1))
        self.bind('<KeyPress-Left>',lambda event:self._units(-1))
        self.bind('<KeyPress-Right>',lambda event:self._units(1))
        try:
            from studio_theme import palette
            self.set_palette(getattr(self.winfo_toplevel(),'_studio_colors',None) or palette())
        except (ImportError,tk.TclError):self.set_palette({})

    def set_palette(self,colors):
        self._colors=dict(colors)
        self.configure(bg=colors.get('panel','#2c2d33'))
        self._draw()

    def set(self,first,last):
        first=max(0.0,min(1.0,float(first)))
        last=max(first,min(1.0,float(last)))
        self._first,self._last=first,last
        if self.autohide:
            needed=first>0.001 or last<0.999
            if not needed and self.winfo_manager():
                manager=self.winfo_manager()
                self._geometry_before_hide=(manager,dict(self.pack_info() if manager=='pack' else self.grid_info()))
                if manager=='pack':self.pack_forget()
                elif manager=='grid':self.grid_remove()
            elif needed and not self.winfo_manager() and self._geometry_before_hide:
                manager,options=self._geometry_before_hide
                # Keep the scrollbar to the right of the list, not over the content.
                if manager=='pack':self.pack(**options)
                elif manager=='grid':self.grid(**options)
        self._draw()

    def _axis_length(self):
        return max(1,self.winfo_height() if self.orient=='vertical' else self.winfo_width())

    def _thumb_bounds(self):
        length=self._axis_length()
        start=length*self._first
        extent=max(19.0,length*(self._last-self._first))
        extent=min(length,extent)
        start=min(start,length-extent)
        return start,start+extent

    def _draw(self,event=None):
        if not self.winfo_exists():return
        self.delete('thumb')
        if self._last-self._first >= 0.999:return
        start,end=self._thumb_bounds()
        wide=self._hover or self._drag is not None
        size=8 if wide else 6
        fill=(self._colors.get('scroll_hover') or self._colors.get('muted','#7b8290')) if wide else self._colors.get('scroll','#5a606b')
        w,h=self.winfo_width(),self.winfo_height()
        if self.orient=='vertical':
            x=w/2
            self.create_line(x,start+size/2,x,max(start+size/2,end-size/2),fill=fill,
                             width=size,capstyle='round',tags='thumb')
        else:
            y=h/2
            self.create_line(start+size/2,y,max(start+size/2,end-size/2),y,
                             fill=fill,width=size,capstyle='round',tags='thumb')

    def _enter(self,event=None):self._hover=True;self._draw()
    def _leave(self,event=None):self._hover=False;self._draw()

    def _pointer(self,event):
        return float(event.y if self.orient=='vertical' else event.x)

    def _press(self,event):
        self.focus_set()
        start,end=self._thumb_bounds()
        pos=self._pointer(event)
        if start<=pos<=end:self._drag=pos-start
        else:
            self._drag=(end-start)/2
            self._move_to(pos-self._drag)
        self._draw()

    def _move_to(self,start):
        if self.command is None:return
        travel=max(1.0,self._axis_length()*(1.0-(self._last-self._first)))
        dest=max(0.0,min(1.0,start/travel))*(1.0-(self._last-self._first))
        self.command('moveto',str(dest))

    def _drag_motion(self,event):
        if self._drag is not None:self._move_to(self._pointer(event)-self._drag)

    def _release(self,event):self._drag=None;self._draw()

    def _units(self,n):
        if self.command:self.command('scroll',int(n),'units')
        return 'break'

    def _wheel(self,event):
        step=-1 if event.delta>0 else 1
        if event.delta:self._units(step*max(1,round(abs(event.delta)/120)))
        return 'break'
