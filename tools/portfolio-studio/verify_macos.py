"""Repeat the shared Windows/Mac regressions with isolated private settings.

Run with the Studio environment's Python from a logged-in desktop session.
--headless explicitly excludes desktop tests and cannot certify GUI behavior.
"""
import argparse
import os
from pathlib import Path
import platform
import sys
import tempfile
import unittest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--headless', action='store_true')
    parser.add_argument('--download-model', action='store_true',
                        help='Download/check the model into disposable test storage')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('This wrapper isolates macOS settings; use unittest directly on Windows.')
    print(f'Python {platform.python_version()}; architecture {platform.machine()}; macOS {platform.mac_ver()[0]}', flush=True)
    root = Path(__file__).resolve().parent
    with tempfile.TemporaryDirectory(prefix='portfolio-studio-verification-') as folder:
        # Set before imports: all private preferences, backups and model files are
        # disposable. The regression tests create their own synthetic image data.
        previous = {key: os.environ.get(key) for key in ('HOME', 'LOCALAPPDATA')}
        os.environ.update(HOME=folder, LOCALAPPDATA=folder)
        try:
            if args.download_model:
                import setup_offline_descriptions
                import offline_descriptions
                setup_offline_descriptions.setup()
                if not offline_descriptions.model_ready():
                    raise RuntimeError('Model verification failed; cannot count inference as tested.')
            discovered = unittest.defaultTestLoader.discover(str(root), pattern='test_*.py')
            selected = unittest.TestSuite()
            excluded = []
            def visit(group):
                for test in group:
                    if isinstance(test, unittest.TestSuite):
                        visit(test)
                    elif args.headless and test.__class__.__name__ in {'WindowTests', 'EditorTests'}:
                        excluded.append(test.id())
                    else:
                        selected.addTest(test)
            visit(discovered)
            print(f'{selected.countTestCases()} selected; {len(excluded)} desktop tests excluded.', flush=True)
            result = unittest.TextTestRunner(verbosity=2).run(selected)
            return 0 if result.wasSuccessful() else 1
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value


if __name__ == '__main__':
    raise SystemExit(main())
