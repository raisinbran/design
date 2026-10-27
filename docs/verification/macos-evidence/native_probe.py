"""Synthetic native integration probes; no production content or UI certification."""
import os, sys, json, platform, hashlib, subprocess, importlib.metadata
from pathlib import Path
repo=Path('/private/tmp/portfolio-macos-synthetic')
sys.path.insert(0,str(repo/'tools/portfolio-studio'))
os.environ['HOME']='/private/tmp/portfolio-macos-private'
import processor, recycle_bin, studio_notifications
from PIL import Image
out=Path('/private/tmp/portfolio-macos-final/docs/verification/macos-evidence')
source=Path('/private/tmp/portfolio-macos-originals/mac-grid.png')
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before=hashfile(source)
destination=repo/'photography/published/mac-native-export.jpg'
size=processor.publish_image(source,destination,degrees=7,max_side=1080,export_crop={'x':.1,'y':.1,'width':.7,'height':.7})
with Image.open(destination) as im: im.verify()
assert hashfile(source)==before
fixture=Path('/private/tmp/mac-native-trash-fixture-20261027.txt')
fixture.write_text('Disposable Portfolio Studio native Trash verification fixture\n')
trashhash=hashfile(fixture)
result={'export':str(destination),'export_dimensions':size,'original_sha256_before':before,'original_sha256_after':hashfile(source),'source_unchanged':True}
try:
 recycle_bin.recycle_files([fixture]);result['trash_source_absent']=not fixture.exists()
except Exception as exc:result['trash_error']=repr(exc)
result['trash_fixture_sha256']=trashhash
result['trash_fixture_name']=fixture.name
result['audio']={}
for mode,sound in [('soft','Glass.aiff'),('system','Tink.aiff')]:
 studio_notifications._play('info',{'mode':mode,'volume':30})
 completed=subprocess.run(['/usr/bin/afplay','-v','0.3','/System/Library/Sounds/'+sound],capture_output=True,text=True)
 result['audio'][mode]={'exit_code':completed.returncode,'stderr':completed.stderr,'audibility':'not observable through tool'}
studio_notifications._play('info',{'mode':'silent','volume':30})
result['silent_adapter_returned']=True
result['environment']={'macOS':platform.mac_ver()[0],'architecture':platform.machine(),'python':platform.python_version(),'packages':{n:importlib.metadata.version(n) for n in ['Pillow','numpy','opencv-python-headless','pillow_heif','beautifulsoup4','Send2Trash']}}
(out/'native-results.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
