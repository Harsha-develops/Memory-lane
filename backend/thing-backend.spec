from PyInstaller.utils.hooks import collect_all, collect_submodules
from pathlib import Path

root = Path(SPECPATH)
datas = [(str(root / 'migrations'), 'migrations')]
binaries = []
hiddenimports = collect_submodules('uvicorn') + collect_submodules('sqlalchemy.dialects.sqlite')
for package in ('rawpy', 'pillow_heif'):
    data, binary, hidden = collect_all(package)
    datas += data
    binaries += binary
    hiddenimports += hidden
a = Analysis([str(root / 'entry.py')], pathex=[str(root)], binaries=binaries, datas=datas,
             hiddenimports=hiddenimports, hookspath=[], hooksconfig={}, runtime_hooks=[],
             excludes=['pytest', 'httpx', 'httpx2', 'pip', 'setuptools', 'tkinter'])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='thing-backend', debug=False,
          bootloader_ignore_signals=False, strip=False, upx=False, console=True,
          disable_windowed_traceback=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='thing-backend')
