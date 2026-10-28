"""Safe local Archive HTML/catalog/settings edits; never deletes source media.

The current page and settings are the source of truth. All edits are validated,
then committed using the existing asset_transaction rollback facility.
"""
import copy
import datetime
import hashlib
import json
import math
import re
from pathlib import Path
from urllib.parse import unquote

from bs4 import BeautifulSoup
import archive_catalog as archive
from gallery_thumbnails import asset_transaction
from platform_support import backup_root

SETTINGS_RE = re.compile(r'(window\.ARCHIVE_PHOTO_PROMINENCE\s*=\s*Object\.freeze\()\{.*?\}(\)\s*;)', re.S)


def _percentages(value):
    return archive.percentages(value)


def _asset(root, name, pending):
    path = archive.local_asset(root, name)
    if not path.is_file() and path not in pending:
        raise ValueError(f"Missing Archive asset: {name}")
    return path


def validate(data, root, pending=None):
    """Validate a complete editable Archive catalog, including added collections."""
    pending = {Path(k).resolve(): bytes(v) for k, v in (pending or {}).items()}
    if not isinstance(data, dict) or data.get('schemaVersion') != 1:
        raise ValueError('Unsupported Archive catalog schema')
    source = data.get('sourceHtml')
    if not isinstance(source, str) or hashlib.sha256(source.encode('utf-8')).hexdigest() != data.get('sourceSha256'):
        raise ValueError('Archive source template changed unexpectedly')
    if not isinstance(data.get('settingsSource'), str):
        raise ValueError('Missing Archive settings source')
    if archive.settings_values(data['settingsSource']) != data.get('prominenceOverrides'):
        raise ValueError('Archive prominence settings changed unexpectedly')
    baseline = archive.parse_collections(source, data['prominenceOverrides'])
    if not baseline:
        raise ValueError('Archive has no template collections')
    collections = data.get('collections')
    if not isinstance(collections, list) or not collections:
        raise ValueError('Keep at least one Archive collection')
    seen_ids = set()
    srcs = set()
    basenames = {}
    for collection in collections:
        if not isinstance(collection, dict) or any(k not in collection for k in archive.FIELDS):
            raise ValueError('Incomplete Archive collection')
        ident = collection['id']
        if not isinstance(ident, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*', ident) or ident in seen_ids:
            raise ValueError('Invalid or duplicate Archive collection ID')
        seen_ids.add(ident)
        for k in ('title', 'heading', 'context'):
            if not isinstance(collection[k], str) or (k == 'title' and not collection[k].strip()):
                raise ValueError(f'Invalid Archive {k}')
        if type(collection['expanded']) is not bool:
            raise ValueError('Expanded must be true or false')
        if not _percentages(collection['coverPosition']) or collection['coverSize'] not in ('cover', 'contain', 'auto'):
            raise ValueError('Invalid Archive cover framing')
        if not isinstance(collection['headerMinHeight'], str) or not re.fullmatch(r'\d+(?:\.\d+)?(?:em|rem|px)', collection['headerMinHeight']):
            raise ValueError('Invalid Archive cover height')
        _asset(root, collection['cover'], pending)
        if not isinstance(collection['media'], list):
            raise ValueError('Archive media must be a list')
        for media in collection['media']:
            required = ('id', 'src', 'alt', 'caption', 'credit', 'cropMode', 'displayRatio', 'position',
                        'prominence', 'figureAttributes', 'imageAttributes')
            if not isinstance(media, dict) or any(k not in media for k in required):
                raise ValueError('Incomplete Archive media')
            mid = media['id']
            if not isinstance(mid, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*', mid) or mid in seen_ids:
                raise ValueError('Invalid or duplicate Archive media ID')
            seen_ids.add(mid)
            for k in ('src', 'alt', 'caption', 'credit'):
                if not isinstance(media[k], str) or (k in ('src', 'alt') and not media[k].strip()):
                    raise ValueError(f'Invalid Archive media {k}')
            source_name = media['src'].casefold()
            if source_name in srcs:
                raise ValueError('An Archive image must not be listed twice')
            srcs.add(source_name)
            filename = Path(unquote(media['src'])).name.casefold()
            # The settings script keys prominence by basename, not full path.
            if filename in basenames and basenames[filename] != source_name:
                raise ValueError('Archive filenames must be unique across folders (prominence setting collision)')
            basenames[filename] = source_name
            _asset(root, media['src'], pending)
            ratio = media['displayRatio']
            if ratio is not None and (type(ratio) not in (int, float) or not math.isfinite(ratio) or not 0.25 <= ratio <= 7):
                raise ValueError('Invalid Archive image display ratio')
            if media['cropMode'] not in ('natural', 'square') or media['prominence'] not in archive.PRIORITIES or not _percentages(media['position']):
                raise ValueError('Invalid Archive media framing/prominence')
            for k in ('figureAttributes', 'imageAttributes'):
                attrs = media[k]
                allowed = {'class', 'style', 'data-display-ratio', 'data-crop-mode'} if k == 'figureAttributes' else {'class', 'style', 'loading', 'decoding', 'width', 'height', 'title'}
                if not isinstance(attrs, dict) or any(key not in allowed or not isinstance(value, (str, list)) or
                    (isinstance(value, list) and (key != 'class' or not all(isinstance(x, str) for x in value)))
                    for key, value in attrs.items()):
                    raise ValueError(f'Unsafe Archive {k}')
    # Existing script overrides refer to the last saved page, not the draft.
    # A user may remove a highlighted image; that old key must remain valid
    # until render_settings removes it from the new paired settings script.
    allowed_settings = {
        Path(unquote(m['src'])).name.casefold()
        for c in baseline for m in c['media']
    }
    if any(not isinstance(key, str) or key not in allowed_settings or
           not isinstance(value, str) or value not in archive.PRIORITIES
           for key, value in data['prominenceOverrides'].items()):
        raise ValueError('Unrecognized or unsafe Archive prominence setting')
    for key in pending:
        if not key.is_relative_to(Path(root).resolve()):
            raise ValueError('Pending Archive asset escapes repository')
        if key.exists() and key.read_bytes() != pending[key]:
            raise FileExistsError('Refusing to overwrite an existing Archive asset')
    return sum(len(c['media']) for c in collections)


def _prominence(data):
    """Non-default photo prominence by lower-case filename, as the settings script stores it."""
    result = {}
    for collection in data['collections']:
        for media in collection['media']:
            if media['prominence'] != 'normal':
                key = Path(unquote(media['src'])).name.lower()
                result[key] = media['prominence']
    return result


def render_settings(data):
    """The prominence settings script; unchanged settings return the original bytes."""
    original = data['settingsSource']
    overrides = _prominence(data)
    if overrides == data['prominenceOverrides']:
        return original.encode('utf-8')
    replacement = json.dumps(overrides, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    updated, count = SETTINGS_RE.subn(lambda match: match.group(1) + replacement + match.group(2), original)
    if count != 1:
        raise ValueError('Unexpected Archive prominence script format')
    return updated.encode('utf-8')


def render_page(data, root, page=None, pending=None):
    """Render creativedesign.html from the catalog, refusing if page differs from its template."""
    validate(data, root, pending)
    source = data['sourceHtml']
    if page is not None and page != source.encode('utf-8'):
        raise ValueError('Archive page changed elsewhere. Reload before saving.')
    positions = archive.sections(source)
    originals = archive.parse_collections(source, data['prominenceOverrides'])
    lookup = {c['id']: (c, raw) for c, (_, _, raw) in zip(originals, positions)}
    # Preserve exact bytes for a no-op and for settings-only edits.
    if data['collections'] == originals:
        return source.encode('utf-8')
    template = next(iter(lookup.values()))
    fragments = []
    for collection in data['collections']:
        original, raw = lookup.get(collection['id'], template)
        safe = copy.deepcopy(collection)
        # Prominence lives in the settings script, not the HTML, and
        # render_collection rejects changes to it. Mask it for the HTML pass.
        old_priority = {m['id']: m['prominence'] for m in original['media']}
        for item in safe['media']:
            item['prominence'] = old_priority.get(item['id'], 'normal')
        fragment = archive.render_collection(safe, original, raw)
        if collection['id'] != original['id']:
            soup = BeautifulSoup(fragment, 'html.parser')
            soup.find('details')['id'] = collection['id']
            fragment = str(soup.find('details'))
        fragments.append(fragment)
    newline = '\r\n' if '\r\n' in source else '\n'
    # Keep unrelated HTML and app chrome outside the collection boundaries.
    before = source[:positions[0][0]]
    after = source[positions[-1][1]:]
    if len(fragments) == len(positions):
        separators = [source[positions[i][1]:positions[i+1][0]] for i in range(len(positions)-1)]
        output = before + ''.join(f + (separators[i] if i < len(separators) else '') for i, f in enumerate(fragments)) + after
    else:
        output = before + (newline + newline).join(fragments) + after
    return output.encode('utf-8')


def save(root, data, expected_catalog, expected_page, expected_settings, pending=None):
    """Save the Archive page, settings script, catalog and new media together.

    expected_* are the bytes the editor loaded; any difference on disk refuses
    the save. Returns the backup folder, or None when nothing changed.
    """
    root = Path(root).resolve()
    cat = root / 'data/archive-catalog.json'
    html = root / 'creativedesign.html'
    settings = root / 'js/archive-photo-settings.js'
    pending = {Path(k).resolve(): bytes(v) for k, v in (pending or {}).items()}
    validate(data, root, pending)
    current = (cat.read_bytes() if cat.exists() else None, html.read_bytes(), settings.read_bytes())
    if current != (expected_catalog, expected_page, expected_settings):
        raise ValueError('Archive files changed since they were opened. Reload before saving.')
    if data['sourceHtml'].encode('utf-8') != expected_page or data['settingsSource'].encode('utf-8') != expected_settings:
        raise ValueError('Archive source template no longer matches the files on disk')
    page_bytes = render_page(data, root, expected_page, pending)
    settings_bytes = render_settings(data)
    # Re-migrate the exact committed output, so future edits have a fresh,
    # current template and stable media IDs after insertion/reordering.
    refreshed = archive.migrate(page_bytes, settings_bytes)
    # Revalidate generated IDs and rendered asset references, not just the
    # editor's in-memory draft. This catches migration-time ID collisions.
    validate(refreshed, root, pending)
    catalog_bytes = (json.dumps(refreshed, indent=2, ensure_ascii=False) + '\n').encode('utf-8')
    if page_bytes == expected_page and settings_bytes == expected_settings and catalog_bytes == expected_catalog and not pending:
        return None
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    folder = backup_root('archive-backups') / stamp
    folder.mkdir(parents=True, exist_ok=False)
    (folder / html.name).write_bytes(expected_page)
    (folder / settings.name).write_bytes(expected_settings)
    if expected_catalog is not None:
        (folder / cat.name).write_bytes(expected_catalog)
    # New assets are only added. Existing originals are never deleted or rewritten.
    updates = dict(pending)
    updates[html] = page_bytes
    updates[settings] = settings_bytes
    updates[cat] = catalog_bytes
    with asset_transaction(updates):
        reread = archive.migrate(html.read_bytes(), settings.read_bytes())
        if reread['collections'] != refreshed['collections']:
            raise ValueError('Installed Archive page failed verification')
    return folder
