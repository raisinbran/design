"""Low-profile secondary editor navigation with fixed text size and no animation."""
import tkinter as tk
from tkinter import ttk

def create_editor_tabs(parent, labels):
    from studio_theme import palette
    holder=ttk.Frame(parent)
    holder.pack(fill='both',expand=True)
    colors=lambda:getattr(parent.winfo_toplevel(),'_studio_colors',None) or palette('system')
    bar=tk.Frame(holder,bd=0,highlightthickness=0)
    bar.pack(fill='x')
    style=ttk.Style(holder)
    style.layout('Studio.Hidden.TNotebook.Tab',[])
    notebook=ttk.Notebook(holder,style='Studio.Hidden.TNotebook')
    notebook.pack(fill='both',expand=True)
    widgets=[];hover=[-1]
    font=('TkDefaultFont',10,'normal')
    def paint(event=None):
        try:sel=notebook.index('current') if notebook.tabs() else 0
        except tk.TclError:sel=0
        c=colors();bar.configure(bg=c['bg'])
        for i,(button,line) in enumerate(widgets):
            selected=i==sel
            bg=c['selected'] if selected else c['hover'] if hover[0]==i else c['bg']
            button.configure(bg=bg,fg=c['text'] if selected else c['muted'],
                             activebackground=c['hover'],activeforeground=c['text'],font=font)
            line.configure(bg=c['accent'] if selected else c['bg'])
    for i,label in enumerate(labels):
        area=tk.Frame(bar,bd=0,highlightthickness=0)
        area.pack(side='left',padx=(5 if i==0 else 1,0))
        btn=tk.Button(area,text=label,font=font,padx=8,pady=4,bd=0,relief='flat',
                      highlightthickness=0,cursor='hand2',
                      command=lambda i=i:notebook.select(i))
        btn.pack(fill='x')
        line=tk.Frame(area,height=2,bd=0);line.pack(fill='x')
        def enter(_e,i=i):hover[0]=i;paint()
        def leave(_e):hover[0]=-1;paint()
        for w in (area,btn):w.bind('<Enter>',enter,add='+');w.bind('<Leave>',leave,add='+')
        widgets.append((btn,line))
    notebook.bind('<<NotebookTabChanged>>',paint,add='+')
    holder._studio_paint_detail_tabs=paint
    holder.after_idle(paint)
    return holder,notebook
