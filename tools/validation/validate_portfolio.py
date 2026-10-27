"""Read-only catalog and generated-reference validation; never calls sync/save."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/portfolio-studio'))
import catalog_tools
import engineering_catalog


def validate(root):
    root = Path(root).resolve()
    media = catalog_tools.read_json(root / 'data/media-catalog.json')
    engineering = catalog_tools.read_json(root / 'data/engineering-catalog.json')
    count = catalog_tools.validate_catalog(media, root)
    engineering_catalog.validate(engineering, root)
    # Check even hidden project assets, which may later be published.
    for project in engineering['projects']:
        for name in [project.get('cover')] + [m['src'] for m in project['media']]:
            if name and not engineering_catalog.local_asset(root, name).is_file():
                raise ValueError(f'Missing project asset: {name}')
    expected = catalog_tools.generated_js(media)
    if (root / 'js/photography-catalog.js').read_text(encoding='utf-8') != expected:
        raise ValueError('Published photography references differ from media catalog')
    print(f'Validated {count} photos and {len(engineering["projects"])} projects; no files written.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    try:
        validate(args.root)
    except (ValueError, OSError, KeyError, TypeError, AttributeError) as exc:
        print(f'Validation failed: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
