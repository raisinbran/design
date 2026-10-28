"""Synthetic safety and roundtrip tests for the Phase 5B Archive writer."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import archive_catalog as archive
import archive_writer as writer
import platform_support
from test_archive import section

SETTINGS='// retained comment\nwindow.ARCHIVE_PHOTO_PROMINENCE = Object.freeze({});\n'


class ArchiveWriterTests(unittest.TestCase):
    def setUp(self):
        folder=tempfile.TemporaryDirectory();self.addCleanup(folder.cleanup)
        self.root=Path(folder.name)
        private=tempfile.TemporaryDirectory();self.addCleanup(private.cleanup)
        self.private=Path(private.name)
        backups=patch.object(platform_support,'local_data_path',return_value=self.private)
        backups.start();self.addCleanup(backups.stop)
        (self.root/'images').mkdir()
        (self.root/'data').mkdir()
        (self.root/'js').mkdir()
        for name in ('cover.jpg','one.jpg','two.jpg','third.jpg'):
            (self.root/'images'/name).write_bytes(b'synthetic '+name.encode())
        self.page=('\ufeff<!doctype html>\r\n<html><head><script src="js/archive-photo-settings.js"></script></head><body>'
                   '<nav>Unchanged site chrome</nav><main id="archive-main"><div id="pilot-projects">\r\n'
                   +section('art','Art','one.jpg')+'\r\n<!-- separator -->\r\n'
                   +section('design','Industrial Design','two.jpg')+
                   '\r\n</div></main><footer>Unchanged footer</footer></body></html>').encode()
        self.settings=SETTINGS.encode()
        self.data=archive.migrate(self.page,self.settings)
        self.cat=(json.dumps(self.data,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
        (self.root/'creativedesign.html').write_bytes(self.page)
        (self.root/'js/archive-photo-settings.js').write_bytes(self.settings)
        (self.root/'data/archive-catalog.json').write_bytes(self.cat)

    def test_noop_exact_bom_crlf_site_chrome_and_script(self):
        self.assertEqual(writer.render_page(self.data,self.root,self.page),self.page)
        self.assertEqual(writer.render_settings(self.data),self.settings)
        self.assertIsNone(writer.save(self.root,self.data,self.cat,self.page,self.settings))
        self.assertEqual((self.root/'creativedesign.html').read_bytes(),self.page)

    def test_collection_add_reorder_remove_and_roundtrip(self):
        data=copy.deepcopy(self.data)
        extra=copy.deepcopy(data['collections'][0]);extra.update(id='other',title='Other',heading='Other',media=[])
        data['collections'].insert(0,extra)
        result=writer.render_page(data,self.root,self.page)
        self.assertIn(b'id="other"',result)
        self.assertIn(b'Unchanged site chrome',result)
        self.assertIn(b'Unchanged footer',result)
        fresh=archive.migrate(result,self.settings)
        self.assertEqual([c['id'] for c in fresh['collections']],['other','art','design'])
        # Render a removal and relocation as a single update.
        data['collections']=[data['collections'][2],data['collections'][0]]
        result=writer.render_page(data,self.root,self.page)
        fresh=archive.migrate(result,self.settings)
        self.assertEqual([c['id'] for c in fresh['collections']],['design','other'])
        self.assertEqual(writer.render_page(fresh,self.root,result),result)

    def test_media_insertion_and_caption_edit(self):
        data=copy.deepcopy(self.data)
        item=copy.deepcopy(data['collections'][0]['media'][0])
        item.update(id='art-media-09',src='images/third.jpg',alt='Another image',
                    caption='New caption',credit='Artist')
        data['collections'][0]['media'].append(item)
        page=writer.render_page(data,self.root,self.page)
        self.assertIn(b'New caption',page)
        migrated=archive.migrate(page,self.settings)
        self.assertEqual(len(migrated['collections'][0]['media']),2)
        self.assertEqual(migrated['collections'][0]['media'][1]['src'],'images/third.jpg')

    def test_prominence_script_and_atomic_three_file_save(self):
        data=copy.deepcopy(self.data)
        data['collections'][0]['media'][0]['prominence']='featured'
        self.assertEqual(writer.render_page(data,self.root,self.page),self.page)
        new_settings=writer.render_settings(data)
        self.assertIn(b'"one.jpg":"featured"',new_settings)
        backup=writer.save(self.root,data,self.cat,self.page,self.settings)
        self.assertTrue((backup/'creativedesign.html').exists())
        self.assertEqual(backup.parent,self.private/'archive-backups')
        self.assertEqual((self.root/'creativedesign.html').read_bytes(),self.page)
        self.assertEqual((self.root/'js/archive-photo-settings.js').read_bytes(),new_settings)
        saved=archive.read_catalog(self.root)
        self.assertEqual(saved['collections'][0]['media'][0]['prominence'],'featured')
        self.assertEqual(saved['settingsSource'].encode(),new_settings)

    def test_pending_add_and_original_retained(self):
        data=copy.deepcopy(self.data)
        relative='assets/archive/art/third.jpg'
        target=self.root/relative
        item=copy.deepcopy(data['collections'][0]['media'][0])
        item.update(id='art-media-03',src=relative,alt='Third synthetic image')
        data['collections'][0]['media'].append(item)
        with self.assertRaises(ValueError):writer.validate(data,self.root)
        asset=b'pending synthetic image bytes'
        before=(self.root/'images/one.jpg').read_bytes()
        backup=writer.save(self.root,data,self.cat,self.page,self.settings,{target:asset})
        self.assertIsNotNone(backup)
        self.assertEqual(target.read_bytes(),asset)
        self.assertEqual((self.root/'images/one.jpg').read_bytes(),before)

    def test_removing_featured_image_cleans_settings_reference(self):
        data=copy.deepcopy(self.data)
        media=data['collections'][0]['media'][0]
        media['prominence']='featured'
        backup=writer.save(self.root,data,self.cat,self.page,self.settings)
        current=archive.read_catalog(self.root)
        current['collections'][0]['media'].clear()
        # A previously featured image can be removed without rejecting the old
        # settings key. Its old file must remain on disk.
        newer_page=(self.root/'creativedesign.html').read_bytes()
        newer_settings=(self.root/'js/archive-photo-settings.js').read_bytes()
        newer_catalog=(self.root/'data/archive-catalog.json').read_bytes()
        backup2=writer.save(self.root,current,newer_catalog,newer_page,newer_settings)
        self.assertIsNotNone(backup2)
        self.assertNotIn(b'one.jpg', (self.root/'js/archive-photo-settings.js').read_bytes())
        self.assertTrue((self.root/'images/one.jpg').is_file())

    def test_stale_files_and_unsafe_media_rejected_without_write(self):
        data=copy.deepcopy(self.data)
        for bad in ('../private.jpg','images/%2e%2e/private.jpg','C:/private.jpg'):
            with self.subTest(bad=bad):
                invalid=copy.deepcopy(data)
                invalid['collections'][0]['media'][0]['src']=bad
                with self.assertRaises(ValueError):writer.validate(invalid,self.root)
        (self.root/'creativedesign.html').write_bytes(self.page+b'elsewhere')
        with self.assertRaises(ValueError):writer.save(self.root,data,self.cat,self.page,self.settings)
        self.assertEqual((self.root/'creativedesign.html').read_bytes(),self.page+b'elsewhere')

    def test_transaction_rolls_back_after_failure(self):
        import gallery_thumbnails
        data=copy.deepcopy(self.data)
        data['collections'][0]['title']='Changed'
        old_atomic=gallery_thumbnails.atomic
        calls=[0]
        def fail_once(path,blob):
            calls[0]+=1
            if calls[0]==2:raise OSError('injected failure')
            return old_atomic(path,blob)
        with patch.object(gallery_thumbnails,'atomic',side_effect=fail_once):
            with self.assertRaises(OSError):writer.save(self.root,data,self.cat,self.page,self.settings)
        self.assertEqual((self.root/'creativedesign.html').read_bytes(),self.page)
        self.assertEqual((self.root/'js/archive-photo-settings.js').read_bytes(),self.settings)
        self.assertEqual((self.root/'data/archive-catalog.json').read_bytes(),self.cat)


if __name__=='__main__':unittest.main()
