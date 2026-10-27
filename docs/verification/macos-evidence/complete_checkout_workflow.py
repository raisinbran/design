"""Scripted workflows on a complete disposable baseline checkout; dialogs mocked."""
import sys,os,json,hashlib
from pathlib import Path
from unittest.mock import patch
repo=Path('/private/tmp/portfolio-macos-synthetic')
os.environ['HOME']='/private/tmp/portfolio-macos-private'
sys.path.insert(0,str(repo/'tools/portfolio-studio'))
import photo_studio,engineering_editor
source=Path('/private/tmp/portfolio-macos-originals/mac-grid.png')
hashfile=lambda:hashlib.sha256(source.read_bytes()).hexdigest()
before=hashfile();app=photo_studio.Studio();app.withdraw()
try:
 app.files=[source];app.settings[str(source)]=photo_studio.new_settings(source)
 app.files_list.insert('end',source.name);app.files_list.selection_set(0);app.load_current(0)
 app.alt_var.set('Synthetic Mac grid workflow');app.review_var.set(True);app.filename_suffix.set('_workflow')
 app.open_after_publish.set(False)
 with patch.object(photo_studio.messagebox,'askyesno',return_value=True),patch.object(photo_studio.messagebox,'askyesnocancel',return_value=True),patch.object(photo_studio.messagebox,'showerror') as errors,patch.object(photo_studio,'notify'):
  app.publish();assert not errors.called,errors.call_args
 catalog=json.loads((repo/'data/media-catalog.json').read_text());assert len(catalog['photos'])==1
 assert catalog['photos'][0]['alt']=='Synthetic Mac grid workflow'
 assert (repo/'photography/published'/catalog['photos'][0]['file']).exists()
 assert (repo/'photography/thumbnails'/catalog['photos'][0]['thumbnail']).exists()
 assert hashfile()==before
 editor=engineering_editor.EngineeringEditor(app,repo)
 with patch.object(engineering_editor.filedialog,'askopenfilenames',return_value=[str(source)]):editor.add_media()
 editor.values['title'].set('Mac synthetic saved project')
 with patch.object(engineering_editor.messagebox,'askyesno',return_value=True):assert editor.save()
 editor.reload();assert editor.values['title'].get()=='Mac synthetic saved project';assert len(editor.data['projects'][0]['media'])==3
 assert hashfile()==before
 result={'photography_publish_catalog_reload':'PASS','engineering_import_edit_save_reload':'PASS','original_sha256_before':before,'original_sha256_after':hashfile(),'catalog_photo':catalog['photos'][0],'engineering_title':editor.values['title'].get(),'repository':str(repo),'dialogs':'mocked; not native usability evidence'}
 Path('/private/tmp/portfolio-macos-final/docs/verification/macos-evidence/complete-workflow.json').write_text(json.dumps(result,indent=2))
 print(json.dumps(result,indent=2))
finally:app.destroy()
