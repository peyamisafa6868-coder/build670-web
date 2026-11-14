#!/usr/bin/env python3
"""Build the unchanged Android calculation kernel with pinned Maven artifacts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import shutil
import urllib.request
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo

ROOT=Path(__file__).resolve().parents[1]
CORE=ROOT/'android-core'

def build(run_tests=False):
    for filename,kind in [('source-manifest.json','main'),('test-source-manifest.json','test')]:
        manifest=json.loads((CORE/filename).read_text())
        for entry in manifest['files'] if isinstance(manifest,dict) else manifest:
            path=CORE/('src/'+kind+'/kotlin')/entry['path']
            if hashlib.sha256(path.read_bytes()).hexdigest()!=entry['sha256']:
                raise RuntimeError('Android reference source changed: '+entry['path'])
    for entry in json.loads((CORE/'reference/manifest.json').read_text()):
        if hashlib.sha256((CORE/'reference'/entry['path']).read_bytes()).hexdigest()!=entry['sha256']:raise RuntimeError('Android UI reference changed: '+entry['path'])
    lock=json.loads((CORE/'dependencies.lock.json').read_text())
    cache=ROOT/'.cache/core-deps';cache.mkdir(parents=True,exist_ok=True)
    for item in lock:
        target=cache/item['name']
        if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest()!=item['sha256']:
            request=urllib.request.Request(item['url'],headers={'User-Agent':'BIST-VIOP-core-build/1'})
            with urllib.request.urlopen(request,timeout=120) as response:data=response.read(90_000_000)
            if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('Dependency checksum mismatch: '+item['name'])
            target.write_bytes(data)
    compiler=os.pathsep.join(str(cache/i['name']) for i in lock if i['kind'] in {'compiler','runtime'})
    runtime=[cache/i['name'] for i in lock if i['kind']=='runtime']
    tests=[cache/i['name'] for i in lock if i['kind']=='test']
    classes=CORE/'build/classes';shutil.rmtree(classes,ignore_errors=True);classes.mkdir(parents=True,exist_ok=True)
    sources=sorted((CORE/'src/main/kotlin').rglob('*.kt'))
    command=['java','-Xmx768m','-cp',compiler,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect',
        '-jvm-target','17','-classpath',os.pathsep.join(map(str,runtime)),'-d',str(classes),*map(str,sources)]
    subprocess.run(command,check=True)
    jar=CORE/'build/android-core.jar'
    staged_jar=jar.with_suffix('.jar.tmp')
    seen=set()
    with ZipFile(staged_jar,'w',ZIP_DEFLATED) as output:
        def add(name,data):
            if name in seen or name.endswith('/') or name=='module-info.class' or name.upper().endswith(('.SF','.RSA','.DSA')):return
            seen.add(name);info=ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=ZIP_DEFLATED;output.writestr(info,data)
        add('META-INF/MANIFEST.MF',b'Manifest-Version: 1.0\nMain-Class: web.CoreMainKt\n\n')
        for path in sorted(classes.rglob('*.class')):add(path.relative_to(classes).as_posix(),path.read_bytes())
        for dependency in runtime:
            with ZipFile(dependency) as archive:
                for entry in archive.infolist():
                    if entry.filename!='META-INF/MANIFEST.MF':add(entry.filename,archive.read(entry))
        add('reference-source-manifest.json',(CORE/'source-manifest.json').read_bytes())
    staged_jar.replace(jar)  # Running JVMs retain their complete old inode during a local rebuild.
    if run_tests:
        test_classes=CORE/'build/test-classes';shutil.rmtree(test_classes,ignore_errors=True);test_classes.mkdir(exist_ok=True)
        test_sources=sorted((CORE/'src/test/kotlin').rglob('*.kt'))
        cp=os.pathsep.join(map(str,[jar,*tests]))
        subprocess.run(['java','-Xmx768m','-cp',compiler,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect',
            '-jvm-target','17','-classpath',cp,'-d',str(test_classes),*map(str,test_sources)],check=True)
        names=[]
        import re
        for p in test_sources:
            text=p.read_text();package=re.search(r'^package\s+([\w.]+)',text,re.M).group(1)
            names.extend(package+'.'+name for name in re.findall(r'^class\s+(\w+Test)\b',text,re.M))
        result=subprocess.run(['java','-cp',os.pathsep.join(map(str,[test_classes,jar,*tests])),'org.junit.runner.JUnitCore',*names],cwd=CORE/'reference',capture_output=True,text=True)
        (CORE/'build/junit-results.txt').write_text(result.stdout+result.stderr)
        print(result.stdout+result.stderr)
        if result.returncode:raise RuntimeError('Android source reference tests failed')
    print(json.dumps({'jar':str(jar),'bytes':jar.stat().st_size,'sha256':hashlib.sha256(jar.read_bytes()).hexdigest(),'sourceFiles':len(sources)}))
    return jar

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--test',action='store_true');args=parser.parse_args();build(args.test)
