import sys,os,shutil,tempfile,json,hashlib
from pathlib import Path
repo=Path.cwd(); root=Path(tempfile.mkdtemp(prefix='studio-disposable-checkout-'))
shutil.copytree(repo/'tools/portfolio-studio',root/'tools/portfolio-studio',ignore=shutil.ignore_patterns('.venv','.venv-macos','__pycache__'))
sys.path.insert(0,str(root/'tools/portfolio-studio'))
for name in ('APPDATA','LOCALAPPDATA'):os.environ[name]=str(root/'private')
from PIL import Image
import test_engineering,photo_studio,engineering_catalog,recycle_bin
(root/'data').mkdir();(root/'js').mkdir();(root/'photography/published').mkdir(parents=True);(root/'images').mkdir();(root/'videos').mkdir()
Image.new('RGB',(1200,800),(60,100,140)).save(root/'original.png')
Image.new('RGB',(500,300),'green').save(root/'images/test.jpg');(root/'videos/test.mp4').write_bytes(b'synthetic video placeholder')
(root/'engineeringdesign.html').write_text(test_engineering.PAGE)
(root/'data/engineering-catalog.json').write_text(json.dumps(engineering_catalog.migrate(test_engineering.PAGE)))
(root/'data/media-catalog.json').write_text(json.dumps({'schemaVersion':1,'photoTags':['Day'],'photos':[]}))
(root/'js/photography-catalog.js').write_text('')
fixture=root/'windows-parity-native-recycle-fixture.txt';fixture.write_text('Disposable Windows parity fixture; safe to recycle')
recycle_bin.recycle_files([fixture]);assert not fixture.exists()
(repo/'docs/verification/windows-evidence/disposable.json').write_text(json.dumps({'root':str(root),'native_recycle_source_absent':True,'recycle_name':fixture.name},indent=2))
app=photo_studio.Studio();app.title('Windows parity - synthetic disposable checkout');app.geometry('1280x850')
p=root/'original.png';app.files=[p];app.settings[str(p)]=photo_studio.new_settings(p);app.files_list.insert('end',p.name);app.files_list.selection_set(0);app.load_current(0)
app.mainloop()
