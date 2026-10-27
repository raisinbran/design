"""Atomic sync regressions using only disposable catalog/media fixtures."""
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import catalog_tools


class CatalogSyncTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory();self.addCleanup(self.folder.cleanup)
        self.root=Path(self.folder.name)
        (self.root/'data').mkdir();(self.root/'js').mkdir()
        media=self.root/'photography'/'published';media.mkdir(parents=True)
        (media/'synthetic.jpg').write_bytes(b'synthetic existence fixture; not a real photograph')
        self.catalog={'schemaVersion':1,'photoTags':['Day'],'photos':[
            {'file':'synthetic.jpg','alt':'Synthetic scene','aspectRatio':1.5,'tags':['Day']}]}
        self.data=self.root/'data'/'media-catalog.json'
        self.data.write_text(json.dumps(self.catalog),encoding='utf-8')
        self.target=self.root/'js'/'photography-catalog.js'
        self.target.write_bytes(b'// original JavaScript\n')
        self.original={p.relative_to(self.root):p.read_bytes() for p in self.root.rglob('*') if p.is_file()}

    def inventory(self):
        return {p.relative_to(self.root):p.read_bytes() for p in self.root.rglob('*') if p.is_file()}

    def test_success_stages_in_same_directory_fsyncs_then_replaces(self):
        real_replace=os.replace
        def replace(source,destination):
            self.assertEqual(Path(source).parent,self.target.parent)
            self.assertNotEqual(Path(source),self.target)
            self.assertEqual(Path(source).read_text(encoding='utf-8'),catalog_tools.generated_js(self.catalog))
            self.assertEqual(self.target.read_bytes(),self.original[self.target.relative_to(self.root)])
            synced.assert_called_once()
            real_replace(source,destination)
        with patch.object(catalog_tools.os,'fsync',wraps=os.fsync) as synced, \
                patch.object(catalog_tools.os,'replace',side_effect=replace) as replaced:
            self.assertEqual(catalog_tools.sync(self.root),1)
        replaced.assert_called_once()
        expected=copy.deepcopy(self.original)
        expected[self.target.relative_to(self.root)]=catalog_tools.generated_js(self.catalog).encode('utf-8')
        self.assertEqual(self.inventory(),expected)

    def test_noop_does_not_create_stage_or_replace_file(self):
        self.target.write_text(catalog_tools.generated_js(self.catalog),encoding='utf-8')
        before=self.inventory();stat=self.target.stat()
        with patch.object(catalog_tools.tempfile,'NamedTemporaryFile') as stage, \
                patch.object(catalog_tools.os,'replace') as replace:
            self.assertEqual(catalog_tools.sync(self.root),1)
        stage.assert_not_called();replace.assert_not_called()
        self.assertEqual(self.inventory(),before)
        self.assertEqual(self.target.stat().st_mtime_ns,stat.st_mtime_ns)

    def test_replace_failure_preserves_original_and_cleans_stage(self):
        with patch.object(catalog_tools.os,'replace',side_effect=OSError('destination locked')):
            with self.assertRaisesRegex(OSError,'destination locked'):catalog_tools.sync(self.root)
        self.assertEqual(self.inventory(),self.original)

    def test_fsync_failure_preserves_original_and_cleans_stage(self):
        with patch.object(catalog_tools.os,'fsync',side_effect=OSError('flush failed')), \
                patch.object(catalog_tools.os,'replace') as replace:
            with self.assertRaisesRegex(OSError,'flush failed'):catalog_tools.sync(self.root)
        replace.assert_not_called();self.assertEqual(self.inventory(),self.original)

    def test_invalid_catalog_modifies_nothing(self):
        self.catalog['photos'][0]['tags']=['Unknown']
        self.data.write_text(json.dumps(self.catalog),encoding='utf-8');before=self.inventory()
        with patch.object(catalog_tools.tempfile,'NamedTemporaryFile') as stage:
            with self.assertRaises(ValueError):catalog_tools.sync(self.root)
        stage.assert_not_called();self.assertEqual(self.inventory(),before)

    def test_missing_destination_is_created_without_leftover_stage(self):
        self.target.unlink()
        self.assertEqual(catalog_tools.sync(self.root),1)
        self.assertEqual(self.target.read_text(encoding='utf-8'),catalog_tools.generated_js(self.catalog))
        self.assertEqual(sorted(p.name for p in self.target.parent.iterdir()),[self.target.name])


if __name__=='__main__':unittest.main()
