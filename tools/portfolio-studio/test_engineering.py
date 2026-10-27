"""Synthetic project-editing tests; never write the portfolio's real page/catalog."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import tkinter as tk
import unittest
from unittest.mock import patch,Mock
from PIL import Image
from bs4 import BeautifulSoup
import engineering_catalog as backend
import engineering_editor
import platform_support
import recycle_bin
import package_macos_launcher

PAGE='''<!doctype html><html><head></head><body><div id="pilot-projects">
<details class="project" id="first" open><summary class="project-header"><span class="project-header-bg" style="background-image: url('images/test.jpg'); background-position: 50% 40%"></span><span class="project-header-text">First project</span></summary><div class="project-body"><h2>Client</h2><p class="lead">Context</p><hr class="project-title-divider"><div class="project-prose"><p class="card-text">A <strong>bold</strong> paragraph with <a href="https://example.com">a link</a>.</p></div><div class="project-gallery" data-justified-gallery><figure class="project-media special" style="--media-position: 40% 50%"><img src="images/test.jpg" alt="Photo"><figcaption><span class="caption-main">Caption</span><small>Credit</small></figcaption></figure><figure class="project-media"><video controls preload="metadata"><source src="videos/test.mp4" type="video/mp4"></video><figcaption><span class="caption-main">Video</span></figcaption></figure></div></div></details>
</div><footer>Keep this footer</footer></body></html>'''


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        (self.root/"images").mkdir();Image.new("RGB",(500,300),(40,60,120)).save(self.root/"images/test.jpg")
        (self.root/"videos").mkdir();(self.root/"videos/test.mp4").write_bytes(b"fixture video")
        (self.root/"engineeringdesign.html").write_text(PAGE,encoding="utf-8")
        self.data=backend.migrate(PAGE)
    def test_migration_is_exact_and_preserves_media_types(self):
        self.assertEqual(backend.render_page(self.data,PAGE),PAGE)
        self.assertEqual([m['kind'] for m in self.data['projects'][0]['media']],["image","video"])
        backend.validate(self.data,self.root)
    def test_edit_render_retains_rich_content_media_styles_sources_and_shell(self):
        self.data['projects'][0]['title']='Updated & escaped'
        page=backend.render_page(self.data,PAGE);soup=BeautifulSoup(page,"html.parser")
        self.assertEqual(soup.select_one('.project-header-text').text,'Updated & escaped')
        self.assertEqual(soup.find('strong').text,'bold');self.assertEqual(soup.find('a')['href'],'https://example.com')
        self.assertIn('special',soup.find('figure')['class']);self.assertEqual(soup.find('source')['type'],'video/mp4')
        self.assertEqual(soup.find('footer').text,'Keep this footer')
    def test_new_draft_hidden_then_published_and_hidden_all_can_be_restored(self):
        p=backend.new_project('new-project','New project');self.data['projects'].append(p)
        self.assertNotIn('id="new-project"',backend.render_page(self.data,PAGE))
        p['visible']=True;page=backend.render_page(self.data,PAGE)
        self.assertIn('id="new-project"',page)
        for p in self.data['projects']:p['visible']=False
        empty=backend.render_page(self.data,page);self.assertNotIn('<details',empty)
        self.data['projects'][0]['visible']=True
        self.assertIn('id="first"',backend.render_page(self.data,empty))
    def test_save_rejects_stale_page_and_unsafe_asset(self):
        self.data['projects'][0]['cover']='../private.jpg'
        with self.assertRaises(ValueError):backend.validate(self.data,self.root)
        self.data['projects'][0]['cover']='images/test.jpg'
        with self.assertRaises(ValueError):backend.save_catalog(self.root,self.data,None,b'stale')
    def test_transaction_rolls_back_page_and_catalog_on_failed_validation(self):
        self.data['projects'][0]['title']='Updated'
        original_validate=backend.validate;calls=[0]
        def validate(*args,**kwargs):
            calls[0]+=1
            if calls[0]>1:raise ValueError('injected validation failure')
            return original_validate(*args,**kwargs)
        with patch.object(backend,'validate',side_effect=validate):
            with self.assertRaises(ValueError):backend.save_catalog(self.root,self.data,None,PAGE.encode())
        self.assertEqual((self.root/'engineeringdesign.html').read_text(encoding='utf-8'),PAGE)
        self.assertFalse((self.root/'data/engineering-catalog.json').exists())


class EditorTests(CatalogTests):
    def setUp(self):
        super().setUp();self.window=tk.Tk();self.window.withdraw()
        self.editor=engineering_editor.EngineeringEditor(self.window,self.root);self.editor.pack(fill='both',expand=True)
        self.window.update_idletasks();self.addCleanup(self.window.destroy)
    def test_fields_media_and_untouched_formatting_roundtrip(self):
        self.assertEqual(self.editor.values['title'].get(),'First project')
        self.assertEqual(len(self.editor.media.rows),2)
        self.editor.store();self.assertEqual(self.editor.data,self.data)
        self.editor.values['title'].set('Changed title');self.editor.store()
        self.assertEqual(self.editor.data['projects'][0]['title'],'Changed title')
        self.assertIn('<strong>bold</strong>',self.editor.data['projects'][0]['bodyHtml'])
    def test_add_duplicate_reorder_remove_and_undo(self):
        with patch.object(engineering_editor.simpledialog,'askstring',return_value='Another project'):self.editor.add_project()
        self.assertEqual(len(self.editor.data['projects']),2)
        self.assertFalse(self.editor.data['projects'][1]['visible'])
        self.editor.duplicate();self.assertEqual(len(self.editor.data['projects']),3)
        self.editor.move(-1);self.assertEqual(self.editor.index,1)
        with patch.object(engineering_editor.messagebox,'askyesno',return_value=True):self.editor.remove()
        self.assertEqual(len(self.editor.data['projects']),2)
        self.editor.undo();self.assertEqual(len(self.editor.data['projects']),3)
    def test_import_derivative_preserves_source_and_save_outputs(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'private-original.jpg';Image.new('RGB',(2400,1600),'red').save(source)
            before=source.read_bytes()
            with patch.object(engineering_editor.filedialog,'askopenfilenames',return_value=[str(source)]):self.editor.add_media()
            self.assertEqual(source.read_bytes(),before)
            self.assertEqual(len(self.editor.pending),1)
            self.editor.values['title'].set('Updated project')
            with patch.object(engineering_editor.messagebox,'askyesno',return_value=True):self.assertTrue(self.editor.save())
            self.assertTrue((self.root/'data/engineering-catalog.json').exists())
            path=self.root/self.editor.data['projects'][0]['media'][-1]['src']
            with Image.open(path) as image:self.assertEqual(max(image.size),1800)
            self.assertEqual(source.read_bytes(),before)


class PlatformTests(unittest.TestCase):
    def test_macos_open_uses_argument_vector(self):
        with patch.object(platform_support.sys,'platform','darwin'),patch.object(platform_support.subprocess,'Popen') as launch:
            platform_support.open_path(Path('file with spaces.jpg'))
        self.assertEqual(launch.call_args.args[0][0],'open');self.assertEqual(len(launch.call_args.args[0]),2)
    def test_macos_recycle_uses_recoverable_trash(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'test.txt';path.write_text('disposable fixture')
            with patch('send2trash.send2trash',side_effect=lambda paths:None) as trash,patch.object(recycle_bin.sys,'platform','darwin'):
                # Refuses to report success when a backend leaves the file behind.
                with self.assertRaises(OSError):recycle_bin.recycle_files([path])
                trash.assert_called_once();self.assertTrue(path.exists())
    def test_macos_launcher_archive_preserves_executable_modes(self):
        import zipfile
        with tempfile.TemporaryDirectory() as folder:
            path=package_macos_launcher.package(Path(folder)/'mac.zip')
            with zipfile.ZipFile(path) as archive:
                self.assertTrue(archive.getinfo('LAUNCH_PORTFOLIO_STUDIO_MAC.command').external_attr>>16 & 0o111)
                self.assertTrue(archive.getinfo('Portfolio Studio.app/Contents/MacOS/PortfolioStudio').external_attr>>16 & 0o111)


if __name__=='__main__':unittest.main()
