#!/usr/bin/env python3
"""Read uploaded reference identities and reproduce source-manifest differences.

Only the bundled unified diff is reversed in an isolated temporary copy. No
uploaded scripts or workflows are executed; APK/source inputs remain unchanged.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import tempfile
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def inspect(source_zip, apks, sdk, output):
    report = {'sourceZip': {'name': source_zip.name, 'sha256': digest(source_zip)},
              'apks': [], 'fullSourceApkParityAccepted': False}
    for apk in apks:
        identity = subprocess.run([str(sdk/'build-tools/35.0.0/aapt'), 'dump', 'badging', str(apk)],
                                  check=True, capture_output=True, text=True).stdout.splitlines()[0]
        signature = subprocess.run([str(sdk/'build-tools/35.0.0/apksigner'), 'verify', '--print-certs', str(apk)],
                                   check=True, capture_output=True, text=True).stdout
        report['apks'].append({'name': apk.name, 'sha256': digest(apk), 'packageIdentity': identity,
                              'signingCertificateSha256': [s.split(': ',1)[1] for s in signature.splitlines() if 'certificate SHA-256 digest:' in s]})
    with tempfile.TemporaryDirectory(prefix='build670-source-') as temporary:
        source = Path(temporary)/'source'; source.mkdir()
        with ZipFile(source_zip) as archive:
            if len(archive.infolist())>20000 or sum(i.file_size for i in archive.infolist())>128*1024*1024:
                raise ValueError('Source archive exceeds inspection bounds')
            for entry in archive.infolist():
                p = PurePosixPath(entry.filename)
                if p.is_absolute() or '..' in p.parts or stat.S_ISLNK(entry.external_attr>>16):
                    raise ValueError('Unsafe archive path')
            archive.extractall(source)
        manifest = json.loads((source/'SOURCE-SHA256.json').read_text())['source_sha256_by_path']
        for name in manifest:
            p = PurePosixPath(name)
            if p.is_absolute() or '..' in p.parts: raise ValueError('Unsafe manifest path')
        missing = [name for name in manifest if not (source/name).is_file()]
        mismatches = [{'path': name, 'recordedSha256': expected, 'uploadedSha256': digest(source/name)}
                      for name, expected in manifest.items() if name not in missing and digest(source/name)!=expected]
        patch = source/'BUILD670-TOUCH-FIX.patch'
        for line in patch.read_text().splitlines():
            if line.startswith(('--- ', '+++ ')):
                name=line[4:].split('\t')[0]
                if name=='/dev/null': continue
                p=PurePosixPath(name)
                if p.is_absolute() or '..' in p.parts: raise ValueError('Unsafe patch path')
        before=Path(temporary)/'before-touch';shutil.copytree(source,before)
        reverse=subprocess.run(['patch','--batch','--reverse','-p1','-i',str(patch)],cwd=before,capture_output=True,text=True)
        if reverse.returncode: raise RuntimeError('Bundled touch patch cannot be reversed cleanly')
        for row in mismatches:
            p=before/row['path'];row['beforeTouchPatchSha256']=digest(p) if p.is_file() else None
            row['explainedByTouchPatch']=row['beforeTouchPatchSha256']==row['recordedSha256']
            row['conclusion']='Touch patch reversal restores recorded bytes' if row['explainedByTouchPatch'] else 'Earlier manifest mismatch remains: the supplied touch patch alone does not restore recorded bytes'
        references=json.loads((ROOT/'android-core/source-manifest.json').read_text())['files']
        selected=[]
        for row in references:
            if row.get('kind')!='unchanged_android_source':continue
            path=source/'android-v6323/app/src/main/java'/row['path']
            selected.append({'path':row['path'],'webRecordedSha256':row['sha256'],
                             'uploadedSha256':digest(path) if path.is_file() else None,
                             'matches':path.is_file() and digest(path)==row['sha256']})
        full_manifest={p.relative_to(source).as_posix():digest(p) for p in sorted(source.rglob('*')) if p.is_file()}
        report.update(oldManifestEntries=len(manifest),missing=missing,mismatches=mismatches,
                      explainedByTouchPatch=sum(r['explainedByTouchPatch'] for r in mismatches),
                      selectedAndroidSources=selected,uploadedSourceSha256ByPath=full_manifest)
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'apks':len(apks),'manifestEntries':len(manifest),'mismatches':len(mismatches),
                      'explained':report['explainedByTouchPatch'],'selectedSourceMatches':sum(r['matches'] for r in selected)}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source-zip',type=Path,required=True)
    parser.add_argument('--apk',type=Path,action='append',required=True)
    parser.add_argument('--sdk',type=Path,default=ROOT/'.cache/android-sdk')
    parser.add_argument('--output',type=Path,default=ROOT/'test-results/reference-identity.json')
    args=parser.parse_args();inspect(args.source_zip,args.apk,args.sdk.resolve(),args.output)
