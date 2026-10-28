"""Archive foundation contracts: disposable fixtures and read-only real roundtrip."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from bs4 import BeautifulSoup
import archive_catalog as archive

SETTINGS='// retain this comment\nwindow.ARCHIVE_PHOTO_PROMINENCE = Object.freeze({"one.jpg":"featured"});\n'


def section(key,title,src):
    return f'''<details class="project" id="{key}" data-extra="keep"><summary class="project-header" style="min-height:8em"><span class="project-header-bg" style="background-image:url(&quot;images/cover.jpg&quot;);background-position:50% 30%;background-size:cover"></span><span class="project-header-text">{title}</span></summary><div class="project-body"><h2>{title}</h2><hr><div class="project-gallery" data-justified-gallery><figure class="project-media" data-display-ratio="1" data-crop-mode="square" style="--media-position:15% 90%"><img src="images/{src}" alt="Accessible {title}" loading="lazy" decoding="async"><figcaption><span class="caption-main">Caption &amp; more</span><small>Credit</small></figcaption></figure></div></div></details>'''


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);(self.root/'images').mkdir()
        for name in ('cover.jpg','one.jpg','two.jpg'):(self.root/'images'/name).write_bytes(b'synthetic asset')
        self.page=('\ufeff<!doctype html>\r\n<html><head><script src="keep.js"></script></head><body>'
            '<nav data-extra="keep">Chrome</nav><details id="unrelated">Outside</details>'
            '<main id="archive-main"><div id="pilot-projects">\r\n'+section('art','Art','one.jpg')+
            '\r\n<!-- keep separator -->\r\n'+section('design','Industrial Design','two.jpg')+
            '\r\n</div></main><footer>Keep footer</footer><script src="settings.js"></script></body></html>').encode('utf-8')
        self.catalog=archive.migrate(self.page,SETTINGS)

    def test_exact_crlf_bom_roundtrip_and_metadata(self):
        self.assertEqual(archive.validate(self.catalog,self.root),2)
        self.assertEqual(archive.render(self.catalog,self.root,self.page),self.page)
        first=self.catalog['collections'][0]['media'][0]
        self.assertEqual((first['caption'],first['credit'],first['alt']),('Caption & more','Credit','Accessible Art'))
        self.assertEqual((first['cropMode'],first['position'],first['displayRatio'],first['prominence']),('square','15% 90%',1,'featured'))

    def test_reader_json_roundtrip_is_exact_and_deterministic(self):
        (self.root/'data').mkdir();(self.root/'data/archive-catalog.json').write_text(json.dumps(self.catalog),encoding='utf-8')
        loaded=archive.read_catalog(self.root)
        self.assertEqual(archive.render(loaded,self.root),self.page)
        self.assertEqual(archive.render(loaded,self.root),archive.render(loaded,self.root))

    def test_edit_changes_only_collection_boundary_and_escapes_text(self):
        self.catalog['collections'][0]['title']='Art <script> & text'
        self.catalog['collections'][0]['media'][0]['caption']='New <caption> & text'
        before=archive.sections(self.catalog['sourceHtml']);after=archive.render(self.catalog,self.root).decode('utf-8')
        original=self.page.decode('utf-8');self.assertEqual(after[:before[0][0]],original[:before[0][0]])
        new_bounds=archive.sections(after)
        self.assertEqual(after[new_bounds[0][1]:],original[before[0][1]:])
        soup=BeautifulSoup(after,'html.parser')
        self.assertEqual(soup.select_one('#art .project-header-text').text,'Art <script> & text')
        self.assertEqual(soup.select_one('#art .caption-main').text,'New <caption> & text')
        self.assertEqual(soup.select_one('#art figure')['data-crop-mode'],'square')

    def test_reordering_collections_retains_chrome_and_media(self):
        self.catalog['collections'].reverse();rendered=archive.render(self.catalog,self.root).decode('utf-8')
        self.assertLess(rendered.index('id="design"'),rendered.index('id="art"'))
        self.assertIn('<details id="unrelated">Outside</details>',rendered)
        self.assertIn('<!-- keep separator -->',rendered)

    def test_invalid_metadata_and_identifiers(self):
        mutations=[lambda c:c.update(schemaVersion=9),
            lambda c:c['collections'][0].update(id='../bad'),
            lambda c:c['collections'][1].update(id='art'),
            lambda c:c['collections'][1]['media'][0].update(id=c['collections'][0]['media'][0]['id']),
            lambda c:c['collections'][0].update(title=''),
            lambda c:c['collections'][0].update(expanded='yes'),
            lambda c:c['collections'][0].update(coverPosition='101% 50%'),
            lambda c:c['collections'][0]['media'][0].update(alt=''),
            lambda c:c['collections'][0]['media'][0].update(displayRatio=float('nan')),
            lambda c:c['collections'][0]['media'][0].update(cropMode='stretch'),
            lambda c:c['collections'][0]['media'][0].update(prominence='very high'),
            lambda c:c['collections'][0]['media'][0].update(position='-1% 50%'),
            lambda c:c['collections'][0]['media'][0].update(imageAttributes={'onerror':'alert(1)'}),
            lambda c:c['collections'][1]['media'][0].update(src='images/one.jpg')]
        inventory={p:p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        for mutate in mutations:
            c=copy.deepcopy(self.catalog);mutate(c)
            with self.subTest(c=c):
                with self.assertRaises(ValueError):archive.render(c,self.root)
        self.assertEqual({p:p.read_bytes() for p in self.root.rglob('*') if p.is_file()},inventory)

    def test_unsafe_paths_and_missing_assets(self):
        for path in ('../outside.jpg','images/%2e%2e/%2e%2e/private.jpg','/absolute.jpg','C:/private.jpg','images\\private.jpg','https://example.com/a.jpg','images/x.jpg?bad'):
            with self.subTest(path=path):
                c=copy.deepcopy(self.catalog);c['collections'][0]['media'][0]['src']=path
                with self.assertRaises(ValueError):archive.validate(c,self.root)
        for field in ('cover','src'):
            c=copy.deepcopy(self.catalog)
            (c['collections'][0] if field=='cover' else c['collections'][0]['media'][0])[field]='images/missing.jpg'
            with self.assertRaises(ValueError):archive.validate(c,self.root)

    def test_stale_page_template_and_unknown_boundaries_rejected(self):
        with self.assertRaises(ValueError):archive.render(self.catalog,self.root,self.page+b'changed')
        c=copy.deepcopy(self.catalog);c['sourceHtml']+='changed'
        with self.assertRaises(ValueError):archive.validate(c,self.root)
        c=copy.deepcopy(self.catalog);c['collections'].pop()
        # Phase 5B permits removing a collection while retaining the site chrome.
        self.assertEqual(archive.validate(c,self.root),1)
        self.assertNotIn(b'id="design"',archive.render(c,self.root))
        with self.assertRaises(ValueError):archive.migrate(b'<main></main>',SETTINGS)

    def test_prominence_reference_and_script_literal_validation(self):
        c=copy.deepcopy(self.catalog);c['prominenceOverrides']['missing.jpg']='featured'
        c['settingsSource']='window.ARCHIVE_PHOTO_PROMINENCE=Object.freeze('+json.dumps(c['prominenceOverrides'])+');'
        with self.assertRaises(ValueError):archive.validate(c,self.root)
        with self.assertRaises(ValueError):archive.migrate(self.page,'window.ARCHIVE_PHOTO_PROMINENCE=runCode();')

    def test_real_repository_catalog_roundtrip_readonly(self):
        root=archive.ROOT;page=(root/'creativedesign.html').read_bytes()
        settings=(root/'js/archive-photo-settings.js').read_bytes()
        catalog=archive.read_catalog(root)
        self.assertTrue(catalog['collections'])
        self.assertEqual(archive.validate(catalog,root),sum(len(c['media']) for c in catalog['collections']))
        self.assertEqual(archive.render(catalog,root,page),page)
        self.assertEqual(catalog['settingsSource'].encode('utf-8'),settings)
        self.assertEqual((root/'creativedesign.html').read_bytes(),page)


if __name__=='__main__':unittest.main()
