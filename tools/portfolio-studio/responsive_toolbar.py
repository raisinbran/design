"""Compact Tk toolbars with accessible equivalents for groups that do not fit."""
import tkinter as tk
from tkinter import ttk


class ResponsiveToolbar(ttk.Frame):
    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)
        self.groups = []
        self.hidden = []
        self.menu = tk.Menu(self, tearoff=False, postcommand=self.populate_menu)
        self.more = ttk.Button(self, text="More controls ▼", command=self.show_menu)
        self.bind("<Configure>", lambda _event: self.reflow())

    def group(self, label, menu_builder, priority=0):
        frame = ttk.Frame(self)
        frame.pack(side="left", padx=3)
        self.groups.append((frame, label, menu_builder, priority))
        self.after_idle(self.reflow)
        return frame

    def reflow(self):
        if not self.winfo_exists():
            return
        width = self.winfo_width()
        sizes = {frame: frame.winfo_reqwidth()+6 for frame, *_ in self.groups}
        required = sum(sizes.values())
        available = max(0, width - (self.more.winfo_reqwidth()+6 if required > width else 0))
        visible = set()
        # Crop application and ratio controls take precedence over secondary tools.
        for frame, _label, _builder, _priority in sorted(self.groups, key=lambda g: -g[3]):
            if sizes[frame] <= available:
                visible.add(frame)
                available -= sizes[frame]
        for frame, *_ in self.groups:
            frame.pack_forget()
        self.more.pack_forget()
        self.hidden = [group for group in self.groups if group[0] not in visible]
        if self.hidden:
            self.more.pack(side="right", padx=3)
        for frame, *_ in self.groups:
            if frame in visible:
                frame.pack(side="left", padx=3)

    def populate_menu(self):
        self.menu.delete(0, "end")
        for _frame, label, builder, _priority in self.hidden:
            submenu = tk.Menu(self.menu, tearoff=False)
            builder(submenu)
            self.menu.add_cascade(label=label, menu=submenu)

    def show_menu(self):
        self.menu.tk_popup(self.more.winfo_rootx(), self.more.winfo_rooty()+self.more.winfo_height())


def choices(menu, variable, values, command=None):
    for value in values:
        menu.add_radiobutton(label=str(value), variable=variable, value=value, command=command)
