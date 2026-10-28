"""Compact modern track/thumb controls with ttk.Scale-compatible variables.

Windows uses a low-profile Canvas; macOS retains native ttk.Scale.  No timer,
image loading, or redraw loop is used.  Scale values are owned by Tk variables.
"""
import sys
import tkinter as tk
from tkinter import ttk


def create_scale(parent, *, variable=None, from_=0, to=100, command=None,
                 length=140, orient='horizontal', **options):
    if sys.platform != 'win32':
        return ttk.Scale(parent, variable=variable, from_=from_, to=to,
                         command=command, length=length, orient=orient, **options)
    return ModernScale(parent, variable=variable, from_=from_, to=to,
                       command=command, length=length, orient=orient, **options)


class ModernScale(tk.Canvas):
    def __init__(self, parent, *, variable=None, from_=0, to=100, command=None,
                 length=140, orient='horizontal', **options):
        if orient != 'horizontal':
            raise ValueError('ModernScale currently supports horizontal sliders only')
        self._studio_modern_scale=True
        self._var=variable if variable is not None else tk.DoubleVar(master=parent,value=from_)
        self._min=float(from_);self._max=float(to)
        if self._min == self._max:raise ValueError('Scale range must be nonzero')
        self._command=command
        self._disabled=False;self._hover=False;self._drag=False
        self._colors={};self._updating=False
        super().__init__(parent,width=max(65,int(length)),height=22,
                         borderwidth=0,highlightthickness=0,relief='flat',takefocus=1,
                         **options)
        self._trace=self._var.trace_add('write',self._value_changed)
        self.bind('<Configure>',self._draw)
        self.bind('<Enter>',self._enter)
        self.bind('<Leave>',self._leave)
        self.bind('<Button-1>',self._press)
        self.bind('<B1-Motion>',self._motion)
        self.bind('<ButtonRelease-1>',self._release)
        self.bind('<KeyPress-Left>',lambda event:self._key(-1))
        self.bind('<KeyPress-Right>',lambda event:self._key(1))
        self.bind('<KeyPress-Home>',lambda event:self._set_from_user(self._min))
        self.bind('<KeyPress-End>',lambda event:self._set_from_user(self._max))
        self.bind('<MouseWheel>',self._wheel)
        self.bind('<Destroy>',self._destroyed,add='+')
        try:
            from studio_theme import palette
            self.set_palette(getattr(self.winfo_toplevel(),'_studio_colors',None) or palette())
        except (ImportError,tk.TclError):self.set_palette({})

    def _destroyed(self,event):
        if event.widget is self:
            try:self._var.trace_remove('write',self._trace)
            except (tk.TclError,ValueError):pass

    def state(self,statespec=None):
        if statespec is None:return ('disabled',) if self._disabled else ()
        for name in statespec:
            if name=='disabled':self._disabled=True
            if name=='!disabled':self._disabled=False
        self._draw()
        return ('disabled',) if self._disabled else ()

    def set_palette(self,colors):
        self._colors=dict(colors)
        self.configure(bg=colors.get('bg','#2F3036'))
        self._draw()

    def get(self):return float(self._var.get())

    def set(self,value):self._var.set(self._coerce(value))

    def _coerce(self,value):
        value=max(min(float(value),max(self._min,self._max)),min(self._min,self._max))
        # IntVar must not receive decimal strings that fail IntVar.get().
        return int(round(value)) if isinstance(self._var,tk.IntVar) else value

    def _value_changed(self,*_):self._draw()

    def _fraction(self):
        try:value=float(self._var.get())
        except (ValueError,tk.TclError):value=self._min
        return max(0,min(1,(value-self._min)/(self._max-self._min)))

    def _geometry(self):
        width=max(self.winfo_width(),1)
        low=11;high=max(low+1,width-11)
        x=low+(high-low)*self._fraction()
        return low,high,x

    def _draw(self,event=None):
        if not self.winfo_exists():return
        self.delete('all')
        c=self._colors;low,high,x=self._geometry();y=max(2,self.winfo_height()/2)
        base=c.get('edge','#555A65');active=c.get('accent','#8F9FDF')
        if self._disabled:base=c.get('disabled_bg','#33363D');active=c.get('disabled','#767A84')
        self.create_line(low,y,high,y,fill=base,width=4,capstyle='round')
        self.create_line(low,y,x,y,fill=active,width=4,capstyle='round')
        radius=6 if self._hover or self._drag else 5
        self.create_oval(x-radius,y-radius,x+radius,y+radius,
                         fill=c.get('disabled','#767A84') if self._disabled else c.get('text','#E6E8ED'),
                         outline=c.get('bg','#2F3036'),width=1)

    def _enter(self,_event=None):self._hover=True;self._draw()
    def _leave(self,_event=None):self._hover=False;self._draw()

    def _set_from_user(self,value):
        if self._disabled:return 'break'
        v=self._coerce(value)
        self._var.set(v)
        if self._command is not None:self._command(str(v))
        return 'break'

    def _at(self,x):
        low,high,_=self._geometry()
        return self._min+(max(0,min(1,(x-low)/(high-low)))*(self._max-self._min))

    def _press(self,event):
        if self._disabled:return 'break'
        self.focus_set();self._drag=True
        return self._set_from_user(self._at(event.x))

    def _motion(self,event):
        if self._drag:return self._set_from_user(self._at(event.x))

    def _release(self,_event=None):self._drag=False;self._draw()

    def _key(self,direction):
        increment=1 if isinstance(self._var,tk.IntVar) else (self._max-self._min)/30
        return self._set_from_user(self.get()+direction*increment)

    def _wheel(self,event):
        return self._key(1 if event.delta>0 else -1)
