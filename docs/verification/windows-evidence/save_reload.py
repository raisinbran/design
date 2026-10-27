import os,sys,tempfile,json
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path.cwd()/'tools/portfolio-studio'))
folder=tempfile.mkdtemp(prefix='studio-save-reload-')
os.environ['APPDATA']=folder;os.environ['LOCALAPPDATA']=folder
import test_studio,test_engineering
p=test_studio.PublicationTests('test_overwrite_updates_existing_entry_without_duplicates');p.setUp()
try:
 p.test_overwrite_updates_existing_entry_without_duplicates()
 reloaded=json.loads(p.catalog_path.read_text());assert reloaded['photos'][0]['alt']=='New description'
 assert p.source.read_bytes()==p.before[p.source]
 print('Photography publish/readback/source byte preservation: PASS (dialogs/viewer mocked)')
finally:p.doCleanups()
e=test_engineering.EditorTests('test_import_derivative_preserves_source_and_save_outputs');e.setUp()
try:
 e.test_import_derivative_preserves_source_and_save_outputs();e.editor.reload()
 assert e.editor.values['title'].get()=='Updated project'
 assert len(e.editor.data['projects'][0]['media'])==3
 print('Engineering import/save/Reload/source byte preservation: PASS (picker/confirmation mocked)')
finally:e.doCleanups()
