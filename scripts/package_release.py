#!/usr/bin/env python3
"""Create a new BUILD670 release: increment visible serial exactly once, then ZIP."""
import subprocess,sys,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(root/'scripts'/'bump_release.py')],check=True)
from json import loads
v=loads((root/'build-version.json').read_text(encoding='utf-8'))['version']
out=root.parent/f'BUILD670_V{v}_TAM_KAYNAK.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(root.rglob('*')):
        if p.is_file() and '__pycache__' not in p.parts and '.pytest_cache' not in p.parts:
            z.write(p,p.relative_to(root).as_posix())
print('Paket:',out)
