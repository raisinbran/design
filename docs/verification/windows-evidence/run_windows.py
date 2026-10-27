import os,sys,tempfile,shutil,json,platform,importlib.metadata,tkinter,unittest
from pathlib import Path
root=Path.cwd(); studio=root/'tools/portfolio-studio';sys.path.insert(0,str(studio))
folder=Path(tempfile.mkdtemp(prefix='studio-windows-parity-'))
model=Path(os.environ['LOCALAPPDATA'])/'PortfolioStudio/models'
for key in ('APPDATA','LOCALAPPDATA'):os.environ[key]=str(folder/key)
target=Path(os.environ['LOCALAPPDATA'])/'PortfolioStudio/models'
if model.exists():shutil.copytree(model,target)
r=tkinter.Tk(); env={'platform':platform.platform(),'windows':platform.win32_ver(),'python':sys.version,'executable':sys.executable,'tcl':r.tk.call('info','patchlevel'),'tk':r.tk.call('package','require','Tk'),'packages':{d.metadata['Name']:d.version for d in importlib.metadata.distributions()},'isolated_storage':str(folder)};r.destroy()
(root/'docs/verification/windows-evidence/environment.json').write_text(json.dumps(env,indent=2))
suite=unittest.defaultTestLoader.discover(str(studio),pattern='test_*.py')
with (root/'docs/verification/windows-evidence/regression.txt').open('w') as out:
 result=unittest.TextTestRunner(stream=out,verbosity=2).run(suite)
summary={'selected':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skips':result.skipped}
print(json.dumps(summary));(root/'docs/verification/windows-evidence/result.json').write_text(json.dumps(summary,indent=2))
sys.exit(not result.wasSuccessful())
