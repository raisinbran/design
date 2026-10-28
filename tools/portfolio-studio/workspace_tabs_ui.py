"""Compact stable-dimension workspace navigation. No hover previews or animation."""
import tkinter as tk
from tkinter import ttk


def create_workspace_tabs(parent,labels=('Photography','Engineering','Archive'),trailing_actions=()):
    from studio_theme import palette
    style=ttk.Style(parent)
    style.layout('Studio.Hidden.TNotebook.Tab',[])
    c=getattr(parent,'_studio_colors',None) or palette(getattr(parent,'_appearance_mode','system'))
    nav=tk.Frame(parent,bg=c['bg'],bd=0,highlightthickness=0)
    nav.pack(fill='x')
    notebook=ttk.Notebook(parent,style='Studio.Hidden.TNotebook')
    buttons=[]
    action_buttons=[]
    hover=[None]
    # Use the SAME font for all states: bold selected text changes the
    # requested geometry on Windows when measured during theme changes.
    font=('TkDefaultFont',10,'normal')
    def paint(event=None):
        colors=getattr(parent,'_studio_colors',None) or palette(getattr(parent,'_appearance_mode','system'))
        nav.configure(bg=colors['bg'])
        selected=notebook.index('current') if notebook.tabs() else 0
        for i,(area,button,line) in enumerate(buttons):
            active=(i==selected)
            bg=colors['selected'] if active else colors['hover'] if hover[0]==i else colors['bg']
            area.configure(bg=bg)
            button.configure(bg=bg,fg=colors['text'] if active else colors['muted'],
                             activebackground=colors['hover'],activeforeground=colors['text'],
                             font=font)
            line.configure(bg=colors['accent'] if active else colors['bg'])
        for action in action_buttons:
            button=action
            try:disabled=str(button['state'])=='disabled'
            except tk.TclError:disabled=False
            button.configure(bg=colors['bg'] if disabled else colors['button'],
                             fg=colors['disabled'] if disabled else colors['text'],
                             activebackground=colors['button_hover'],
                             activeforeground=colors['text'],font=font)
    for i,label in enumerate(labels):
        area=tk.Frame(nav,bd=0,highlightthickness=0)
        area.pack(side='left',padx=(6 if i==0 else 2,0),pady=(2,0))
        button=tk.Button(area,text=label,command=lambda i=i:notebook.select(i),
                         font=font,width=12,padx=8,pady=4,bd=0,relief='flat',
                         highlightthickness=0,cursor='hand2',takefocus=True)
        button.pack(side='top')
        line=tk.Frame(area,height=2,bd=0);line.pack(fill='x',side='bottom')
        def enter(_event,i=i):hover.__setitem__(0,i);paint()
        def leave(_event):hover.__setitem__(0,None);paint()
        for widget in (area,button):
            widget.bind('<Enter>',enter,add='+')
            widget.bind('<Leave>',leave,add='+')
        buttons.append((area,button,line))
    # This action area shares the exact row and geometry of the workspace tabs.
    # Pack the right-side frame after the left tabs: there is no second bar.
    if trailing_actions:
        actions=tk.Frame(nav,bd=0,highlightthickness=0)
        actions.pack(side='right',padx=(8,10),pady=(3,1))
        for label,command in trailing_actions:
            action=tk.Button(actions,text=label,command=command,bd=0,
                             relief='flat',font=font,padx=11,pady=5,
                             highlightthickness=0,takefocus=True,cursor='hand2')
            action.pack(side='left',padx=(5,0))
            action.bind('<Enter>',lambda event,w=action:
                w.configure(bg=(getattr(parent,'_studio_colors',None) or palette('system'))['button_hover']),add='+')
            action.bind('<Leave>',lambda event:paint(),add='+')
            action_buttons.append(action)
        parent.workspace_action_buttons=action_buttons
    ttk.Frame(nav,height=1).pack(side='bottom',fill='x')
    notebook.bind('<<NotebookTabChanged>>',paint,add='+')
    parent.workspace_nav=nav
    parent.workspace_tab_buttons=[item[1] for item in buttons]
    parent._studio_paint_tabs=paint
    parent.after_idle(paint)
    keybinds=[]
    def choose_tab(index):
        if notebook.winfo_exists():notebook.select(index)
    for i in range(len(labels)):
        for sequence in (f'<Alt-Key-{i+1}>',f'<Control-Key-{i+1}>'):
            keybinds.append((sequence,parent.bind(sequence,lambda e,i=i:choose_tab(i),add='+')))
        if parent.tk.call('tk','windowingsystem')=='aqua':
            sequence=f'<Command-Key-{i+1}>'
            keybinds.append((sequence,parent.bind(sequence,lambda e,i=i:choose_tab(i),add='+')))
    def cleanup(event):
        if event.widget is nav:
            for sequence,callback_id in keybinds:
                try:parent.unbind(sequence,callback_id)
                except tk.TclError:pass
    nav.bind('<Destroy>',cleanup,add='+')
    return notebook
