"""Synthetic, read-only appearance and thumbnail tests. No public media are written."""
import tempfile
import unittest
from pathlib import Path
from PIL import Image
import studio_preferences
from studio_theme import palette, COLORS
from thumbnail_ui import cover_thumbnail, THUMB_SIZE

class ThemeTests(unittest.TestCase):
    def test_explicit_palettes_and_default_appearance(self):
        self.assertEqual(studio_preferences.DEFAULTS['appearance'],'system')
        self.assertEqual(palette('light'),COLORS['light'])
        self.assertEqual(palette('dark'),COLORS['dark'])
        self.assertNotEqual(palette('light')['bg'],palette('dark')['bg'])
        with self.assertRaises(ValueError):palette('nonsense')

    def test_mode_persistence_and_preserve_other_settings(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'prefs.json'
            self.assertEqual(studio_preferences.load_preferences(target)['appearance'],'system')
            studio_preferences.save_preferences({'appearance':'dark'},target)
            result=studio_preferences.load_preferences(target)
            self.assertEqual(result['appearance'],'dark')
            self.assertEqual(result['maxSide'],1080)
            self.assertTrue(result['openAfterPublish'])
            studio_preferences.save_preferences({'openAfterPublish':False},target)
            self.assertEqual(studio_preferences.load_preferences(target)['appearance'],'dark')
            with self.assertRaises(ValueError):studio_preferences.save_preferences({'appearance':'hotpink'},target)
            self.assertEqual(studio_preferences.load_preferences(target)['appearance'],'dark')

    def test_thumbnail_fills_canvas_without_letterboxing(self):
        wide=Image.new('RGB',(300,60),(226,40,70))
        tall=Image.new('RGB',(45,190),(30,130,210))
        for src,color in ((wide,(226,40,70)),(tall,(30,130,210))):
            with self.subTest(size=src.size):
                result=cover_thumbnail(src)
                self.assertEqual(result.size,THUMB_SIZE)
                self.assertEqual(result.getpixel((0,0)),color)
                self.assertEqual(result.getpixel((THUMB_SIZE[0]-1,THUMB_SIZE[1]-1)),color)

    def test_graphical_tabs_and_centering_if_display_available(self):
        import tkinter as tk
        from tkinter import ttk
        from studio_theme import apply_appearance, center_window
        from workspace_tabs_ui import create_workspace_tabs
        try:root=tk.Tk()
        except tk.TclError:self.skipTest('No graphical display available')
        try:
            root.geometry('980x670+120+100')
            apply_appearance(root,'light')
            tabs=create_workspace_tabs(root)
            for name in ('Photography','Engineering','Archive'):
                tabs.add(ttk.Frame(tabs),text=name)
            tabs.pack(fill='both',expand=True)
            root.update()
            self.assertLessEqual(max(x.winfo_height() for x in root.workspace_tab_buttons),38)
            y=tabs.winfo_y();tabs.select(2);root.update()
            self.assertEqual(tabs.winfo_y(),y)
            self.assertEqual(tabs.index('current'),2)
            dialog=tk.Toplevel(root)
            ttk.Label(dialog,text='Settings').pack(padx=40,pady=40)
            center_window(dialog,root);root.update()
            self.assertGreater(dialog.winfo_rootx(),100)
            dialog.destroy()
            apply_appearance(root,'dark');root.update()
            self.assertEqual(root.cget('bg'),COLORS['dark']['bg'])
        finally:root.destroy()

    def test_palette_does_not_query_system_for_explicit_modes(self):
        from unittest.mock import patch
        with patch('studio_theme.system_dark',side_effect=AssertionError('OS queried')):
            self.assertEqual(palette('dark')['bg'],COLORS['dark']['bg'])
            self.assertEqual(palette('light')['bg'],COLORS['light']['bg'])

if __name__=='__main__':unittest.main()
