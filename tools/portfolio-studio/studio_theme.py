"""Consistent high-legibility Portfolio Studio light/dark palettes across Tk windows.

No third party theme. Title bar adjustments are best-effort OS integrations.
"""
import ctypes
import sys
import subprocess
import tkinter as tk
from tkinter import ttk

COLORS = {
    'light': dict(bg='#F1F3F6',panel='#FFFFFF',field='#FFFFFF',text='#202B39',
                  muted='#617084',disabled='#8894A3',disabled_bg='#E4E8EE',
                  edge='#C2CBD6',hover='#E1E7EF',selected='#FFFFFF',
                  button='#E7EBF1',button_hover='#D8E1EC',accent='#4966B1',
                  select_text='#FFFFFF',canvas='#E9EDF2',scroll='#B8C2CD'),
    'dark': dict(bg='#35383F',panel='#2E3138',field='#414650',text='#F0F2F6',
                 muted='#C4CCD7',disabled='#87919F',disabled_bg='#34373D',
                 edge='#555E6A',hover='#4A5160',selected='#434956',
                 button='#454C58',button_hover='#556072',accent='#9AAFF6',
                 select_text='#111725',canvas='#393D45',scroll='#6C7889'),
}



# Windows refinement only. macOS retains the previously accepted palette
# until a genuine native macOS review identifies a parity issue.
WINDOWS_DARK = dict(bg='#2F3036',panel='#282930',field='#363840',text='#E7E8EC',
                    muted='#ABB1BC',disabled='#777D88',disabled_bg='#303139',
                    edge='#43454E',hover='#3C3E48',selected='#3B3D46',
                    button='#3A3C46',button_hover='#474A56',accent='#7486E8',
                    select_text='#FFFFFF',canvas='#303139',scroll='#626773',
                    scroll_hover='#9299A6')


def system_dark():
    if sys.platform=='darwin':
        try:
            result=subprocess.run(['/usr/bin/defaults','read','-g','AppleInterfaceStyle'],
                                  capture_output=True,text=True,timeout=2,check=False)
            return result.returncode==0 and 'dark' in result.stdout.lower()
        except (OSError,subprocess.TimeoutExpired):return False
    if sys.platform=='win32':
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                    r'Software\Microsoft\Windows\CurrentVersion\Themes\Personalize') as key:
                return winreg.QueryValueEx(key,'AppsUseLightTheme')[0]==0
        except (OSError,ImportError):return False
    return False


def palette(mode='system'):
    if mode not in ('system','light','dark'):raise ValueError('Invalid appearance option')
    dark = mode=='dark' or (mode=='system' and system_dark())
    if dark and sys.platform=='win32':return WINDOWS_DARK
    return COLORS['dark' if dark else 'light']


def _colorref(value):
    value=value.lstrip('#')
    r,g,b=(int(value[i:i+2],16) for i in (0,2,4))
    return r|(g<<8)|(b<<16)


def _native_titlebar(window,colors):
    """Windows 10/11 DWM titlebar tint; errors never block the application."""
    if sys.platform!='win32':return
    try:
        from ctypes import wintypes
        get_ancestor=ctypes.windll.user32.GetAncestor
        get_ancestor.restype=ctypes.c_void_p
        get_ancestor.argtypes=[ctypes.c_void_p,ctypes.c_uint]
        hwnd=get_ancestor(int(window.winfo_id()),2) or int(window.winfo_id())
        dwm=ctypes.windll.dwmapi.DwmSetWindowAttribute
        dark=ctypes.c_int(1 if colors in (COLORS['dark'],WINDOWS_DARK) else 0)
        size=ctypes.sizeof(dark)
        if dwm(wintypes.HWND(hwnd),20,ctypes.byref(dark),size)!=0:
            dwm(wintypes.HWND(hwnd),19,ctypes.byref(dark),size)
        # Custom caption/text colors are Windows 11 features. Older releases
        # return a nonzero status; leaving the system title bar is safe.
        caption=ctypes.c_uint32(_colorref(colors['bg']))
        text=ctypes.c_uint32(_colorref(colors['text']))
        dwm(wintypes.HWND(hwnd),35,ctypes.byref(caption),ctypes.sizeof(caption))
        dwm(wintypes.HWND(hwnd),36,ctypes.byref(text),ctypes.sizeof(text))
    except (OSError,AttributeError,ValueError,tk.TclError):pass


def _retint_classic(widget,c):
    if getattr(widget,'_studio_modern_scale',False):
        widget.set_palette(c)
        return
    if getattr(widget,'_studio_modern_scrollbar',False):
        widget.set_palette(c)
        return
    cls=widget.winfo_class()
    bg=c['canvas'] if cls=='Canvas' else c['panel'] if cls in ('Text','Listbox','Entry') else c['bg']
    opts={}
    for key,value in (('bg',bg),('fg',c['text']),('insertbackground',c['text']),
                      ('selectbackground',c['accent']),('selectforeground',c['select_text']),
                      ('activebackground',c['hover']),('activeforeground',c['text'])):
        if key in widget.keys():opts[key]=value
    if cls in ('Canvas','Listbox','Text','Entry'):
        for key,value in (('highlightthickness',0),('highlightbackground',c['edge'])):
            if key in widget.keys():opts[key]=value
    if cls=='Menu':
        opts.update(bg=c['panel'],fg=c['text'],activebackground=c['hover'],
                    activeforeground=c['text'],selectcolor=c['accent'])
    if opts:
        try:widget.configure(**opts)
        except tk.TclError:pass


def apply_appearance(root,mode='system'):
    c=palette(mode)
    root._appearance_mode=mode
    root._studio_colors=c
    style=ttk.Style(root)
    if 'clam' in style.theme_names():style.theme_use('clam')
    # Distinct control surfaces, muted borders, reduced glare, and emphatic
    # disabled-state text. Do not make everything the same flat background.
    style.configure('TFrame',background=c['bg'])
    style.configure('TLabel',background=c['bg'],foreground=c['text'])
    style.configure('TLabelframe',background=c['bg'],bordercolor=c['edge'],
                    lightcolor=c['edge'],darkcolor=c['edge'],borderwidth=1)
    style.configure('TLabelframe.Label',background=c['bg'],foreground=c['text'])
    style.configure('TButton',background=c['button'],foreground=c['text'],
                    bordercolor=c['edge'],lightcolor=c['button'],darkcolor=c['button'],
                    borderwidth=1,relief='flat',padding=(8,5),focuscolor=c['accent'])
    style.map('TButton',background=[('disabled',c['disabled_bg']),('pressed',c['selected']),
                                    ('active',c['button_hover'])],
              foreground=[('disabled',c['disabled'])],
              bordercolor=[('disabled',c['disabled_bg']),('focus',c['accent']),
                           ('active',c['edge'])])
    for key in ('TEntry','TCombobox','TSpinbox'):
        style.configure(key,fieldbackground=c['field'],background=c['field'],
                        foreground=c['text'],bordercolor=c['edge'],
                        lightcolor=c['edge'],darkcolor=c['edge'],
                        selectbackground=c['accent'],selectforeground=c['select_text'],
                        insertcolor=c['text'],padding=3)
        style.map(key,fieldbackground=[('disabled',c['disabled_bg']),('readonly',c['field'])],
                  foreground=[('disabled',c['disabled']),('readonly',c['text'])],
                  bordercolor=[('focus',c['accent'])])
    style.configure('TCombobox',arrowcolor=c['text'])
    style.map('TCombobox',arrowcolor=[('disabled',c['disabled'])])
    for key in ('TCheckbutton','TRadiobutton'):
        style.configure(key,background=c['bg'],foreground=c['text'],padding=3,
                        indicatorbackground=c['field'],indicatorcolor=c['edge'])
        style.map(key,foreground=[('disabled',c['disabled'])],
                  background=[('active',c['bg'])])
    for key in ('Treeview','CatalogPhotos.Treeview'):
        style.configure(key,background=c['panel'],fieldbackground=c['panel'],
                        foreground=c['text'],bordercolor=c['edge'],borderwidth=0)
        style.map(key,background=[('selected',c['accent'])],
                  foreground=[('selected',c['select_text'])])
    style.configure('Treeview.Heading',background=c['button'],foreground=c['text'],
                    bordercolor=c['edge'],relief='flat')
    style.configure('TNotebook',background=c['bg'],borderwidth=0)
    style.configure('TNotebook.Tab',background=c['button'],foreground=c['text'],
                    padding=(10,5),bordercolor=c['edge'])
    style.map('TNotebook.Tab',background=[('selected',c['selected'])],
              foreground=[('selected',c['text'])])
    # Thin flat scroll tracks without the old double-arrow Windows controls.
    # Keep actual native Tk scrollbar behavior (keyboard/wheel and dragging).
    for orient,sticky in (('Vertical','ns'),('Horizontal','ew')):
        name=f'{orient}.TScrollbar'
        style.layout(name,[(f'{orient}.Scrollbar.trough',{'sticky':sticky,
            'children':[(f'{orient}.Scrollbar.thumb',{'expand':1,'sticky':'nswe'})]})])
        style.configure(name,background=c['scroll'],troughcolor=c['bg'],
                        bordercolor=c['bg'],lightcolor=c['scroll'],darkcolor=c['scroll'],
                        width=9,gripcount=0,relief='flat',borderwidth=0)
        style.map(name,background=[('active',c['muted'])])
    style.configure('TPanedwindow',background=c['bg'])
    for key,value in (('*Background',c['bg']),('*Foreground',c['text']),
                      ('*Listbox.background',c['panel']),('*Listbox.foreground',c['text']),
                      ('*Text.background',c['panel']),('*Text.foreground',c['text']),
                      ('*Menu.background',c['panel']),('*Menu.foreground',c['text']),
                      ('*Entry.background',c['field']),('*Entry.foreground',c['text'])):
        root.option_add(key,value,75)
    def walk(w):
        _retint_classic(w,c)
        if isinstance(w,(tk.Tk,tk.Toplevel)):_native_titlebar(w,c)
        for child in w.winfo_children():walk(child)
    walk(root)
    def paint_detail(w):
        callback=getattr(w,'_studio_paint_detail_tabs',None)
        if callable(callback):callback()
        for child in w.winfo_children():paint_detail(child)
    paint_detail(root)
    if hasattr(root,'_studio_paint_tabs'):root._studio_paint_tabs()
    if sys.platform=='win32':
        root.after_idle(lambda: _native_titlebar(root,c))
        root.after(350,lambda: _native_titlebar(root,c))
    # Aqua manages the macOS titlebar; avoid unsafe Objective-C runtime hooks.
    return c


def center_window(dialog,parent=None,force=False):
    if not dialog.winfo_exists():return
    dialog.update_idletasks()
    width=max(dialog.winfo_reqwidth(),dialog.winfo_width())
    height=max(dialog.winfo_reqheight(),dialog.winfo_height())
    target=parent or dialog.master
    if target is not None and target.winfo_exists() and target.winfo_ismapped():
        x=target.winfo_rootx()+(target.winfo_width()-width)//2
        y=target.winfo_rooty()+(target.winfo_height()-height)//2
    else:
        x=max(5,(dialog.winfo_screenwidth()-width)//2)
        y=max(5,(dialog.winfo_screenheight()-height)//2)
    dialog.geometry(f'+{x}+{y}')


def install_dialog_placement(root):
    def mapped(event):
        win=event.widget
        if win is root:
            _native_titlebar(root,getattr(root,'_studio_colors',palette()))
            return
        if not isinstance(win,tk.Toplevel):return
        def check():
            if not win.winfo_exists():return
            if win.winfo_rootx()<=25 and win.winfo_rooty()<=25:
                center_window(win,root)
            c=getattr(root,'_studio_colors',None)
            if c is not None:
                _retint_classic(win,c)
                _native_titlebar(win,c)
        try:win.after_idle(check)
        except tk.TclError:pass
    root.bind_all('<Map>',mapped,add='+')
