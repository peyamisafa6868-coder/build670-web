#!/usr/bin/env python3
"""BUILD670 visible release version: increment once per produced build.
Usage: python scripts/bump_release.py [--check]
Version file is committed/preserved between releases. Do not invoke at server startup.
"""
import json,re,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'build-version.json'
TARGETS=(ROOT/'android-app.js',ROOT/'android-programmatic.js')
PATTERN=re.compile(r'(?<![0-9])V?6\.3\.(\d+)(?![0-9])')

def bump(check=False):
    manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
    current=int(manifest['build'])
    nxt=current if check else current+1
    if nxt<0: raise ValueError('invalid build number')
    for path in TARGETS:
        content=path.read_text(encoding='utf-8')
        matches=PATTERN.findall(content)
        if not matches: raise ValueError(f'No visible version found: {path}')
        if any(int(x)!=current for x in matches):
            raise ValueError(f'Version mismatch: {path}, expected 6.3.{current}, found {matches}')
        if not check:
            content=PATTERN.sub(lambda m: ('V' if m.group().startswith('V') else '')+f'6.3.{nxt}',content)
            path.write_text(content,encoding='utf-8')
    if not check:
        manifest['build']=nxt
        manifest['version']=f'6.3.{nxt}'
        MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(('CHECK ' if check else 'RELEASE ')+f'V6.3.{nxt}')

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--check',action='store_true');a=ap.parse_args()
    bump(a.check)
