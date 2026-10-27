"""Compile without bytecode writes and import Studio modules without opening GUI."""
import importlib
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
studio = ROOT / 'tools/portfolio-studio'
sys.path.insert(0, str(studio))
files = sorted(studio.glob('*.py')) + sorted((ROOT / 'tools/validation').glob('*.py'))
for path in files:
    compile(path.read_bytes(), str(path), 'exec')
# Imports only: no main entrypoints, Tk roots, processing, model setup or save calls.
with tempfile.TemporaryDirectory(prefix='portfolio-imports-') as folder:
    os.environ['LOCALAPPDATA'] = folder
    for path in sorted(studio.glob('*.py')):
        if not path.stem.startswith('test_'):
            importlib.import_module(path.stem)
print(f'Compiled {len(files)} Python files; imported Studio modules without a display or model download.')
