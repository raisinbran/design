"""CLI failure contracts against disposable synthetic fixtures only."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from validate_portfolio import archive_catalog, catalog_tools

ARCHIVE_PAGE = (
    '<!doctype html>\n<main id="archive-main"><div id="pilot-projects">\n'
    '<details class="project" id="archive"><summary class="project-header">'
    '<span class="project-header-bg" style="background-image:url(images/project.jpg)"></span>'
    '<span class="project-header-text">Archive</span></summary><div class="project-body"><h2>Archive</h2>'
    '<div class="project-gallery"></div></div></details>\n</div></main>\n')
ARCHIVE_SETTINGS = 'window.ARCHIVE_PHOTO_PROMINENCE = Object.freeze({});\n'


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for folder in ('data', 'js', 'photography/published', 'photography/thumbnails', 'images'):
            (self.root / folder).mkdir(parents=True, exist_ok=True)
        for name in ('photography/published/photo.jpg', 'photography/thumbnails/photo.webp', 'images/project.jpg'):
            (self.root / name).write_bytes(b'synthetic media')
        self.media = {'schemaVersion': 1, 'photoTags': ['Day'], 'photos': [
            {'file': 'photo.jpg', 'thumbnail': 'photo.webp', 'alt': 'Test', 'aspectRatio': 1.5, 'tags': ['Day']}]}
        self.engineering = {'schemaVersion': 1, 'projects': [
            {'id': 'project', 'title': 'Test', 'cover': 'images/project.jpg', 'media': [], 'visible': True}]}
        self.write_catalogs()
        (self.root / 'js/photography-catalog.js').write_text(catalog_tools.generated_js(self.media), encoding='utf-8')
        (self.root / 'creativedesign.html').write_bytes(ARCHIVE_PAGE.encode('utf-8'))
        (self.root / 'js/archive-photo-settings.js').write_bytes(ARCHIVE_SETTINGS.encode('utf-8'))
        self.write_archive(ARCHIVE_PAGE)

    def write_catalogs(self):
        for name, data in [('media', self.media), ('engineering', self.engineering)]:
            (self.root / f'data/{name}-catalog.json').write_text(json.dumps(data), encoding='utf-8')

    def write_archive(self, page):
        catalog = archive_catalog.migrate(page, ARCHIVE_SETTINGS)
        (self.root / 'data/archive-catalog.json').write_text(json.dumps(catalog), encoding='utf-8')

    def run_check(self, message=None):
        before = {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        result = subprocess.run([sys.executable, '-B', str(Path(__file__).with_name('validate_portfolio.py')),
                                 '--root', str(self.root)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1 if message else 0, result.stderr)
        if message:
            self.assertIn(message, result.stderr)
        self.assertEqual(before, {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob('*') if p.is_file()})

    def test_valid_read_only(self):
        self.run_check()

    def test_invalid_json(self):
        for name in ('media', 'engineering'):
            with self.subTest(catalog=name):
                self.write_catalogs()
                (self.root / f'data/{name}-catalog.json').write_text('{broken', encoding='utf-8')
                self.run_check('Validation failed')

    def test_missing_media(self):
        for name in ('photography/published/photo.jpg', 'photography/thumbnails/photo.webp', 'images/project.jpg'):
            with self.subTest(asset=name):
                path = self.root / name
                path.unlink()
                self.run_check('Missing')
                path.write_bytes(b'synthetic media')

    def test_unknown_tag_reference(self):
        self.media['photos'][0]['tags'] = ['Unknown']
        self.write_catalogs()
        self.run_check('Unknown photo tag')

    def test_unsafe_project_reference(self):
        self.engineering['projects'][0]['cover'] = '../private.jpg'
        self.write_catalogs()
        self.run_check('repository-relative')

    def test_stale_published_references(self):
        (self.root / 'js/photography-catalog.js').write_text('window.PORTFOLIO_PHOTOS = [];', encoding='utf-8')
        self.run_check('references differ')

    def test_archive_template_line_endings_must_match_page(self):
        self.write_archive(ARCHIVE_PAGE.replace('\n', '\r\n'))
        self.run_check('Archive catalog template differs from creativedesign.html')

    def test_stale_archive_settings_template(self):
        (self.root / 'js/archive-photo-settings.js').write_text('// edited\n' + ARCHIVE_SETTINGS, encoding='utf-8')
        self.run_check('Archive catalog template differs from js/archive-photo-settings.js')


if __name__ == '__main__':
    unittest.main()
