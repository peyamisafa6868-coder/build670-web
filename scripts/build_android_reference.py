#!/usr/bin/env python3
"""Build local Android instrumentation. Optional test signing never changes the supplied APK."""
import argparse,hashlib,json,os,subprocess,zipfile,shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--sdk',default=os.getenv('ANDROID_SDK_ROOT',str(ROOT.parent/'android-sdk')))
    parser.add_argument('--test-sign-copy',type=Path,help='Create a separate co-signed test copy of this owned reference APK')
    args=parser.parse_args();sdk=Path(args.sdk).resolve();out=ROOT/'test-results/android-harness';out.mkdir(parents=True,exist_ok=True)
    lock=json.loads((ROOT/'android-core/dependencies.lock.json').read_text());cache=ROOT/'.cache/core-deps'
    compiler=os.pathsep.join(str(cache/x['name']) for x in lock if x['kind'] in {'compiler','runtime'})
    runtime=[cache/x['name'] for x in lock if x['kind']=='runtime'];android=sdk/'platforms/android-30/android.jar'
    if not all((cache/x['name']).is_file() for x in lock):raise RuntimeError('Run scripts/build_core.py first to prepare pinned dependencies.')
    classes=out/'classes';shutil.rmtree(classes,ignore_errors=True);classes.mkdir(exist_ok=True)
    subprocess.run(['java','-Xmx512m','-cp',compiler,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-jvm-target','1.8','-classpath',os.pathsep.join(map(str,[android,*runtime])),'-d',str(classes),str(ROOT/'tests/android-reference/ReferenceRunner.kt'),str(ROOT/'tests/android-reference/FontProbe.kt')],check=True)
    jar=out/'classes.jar'
    with zipfile.ZipFile(jar,'w') as z:
        for p in classes.rglob('*.class'):z.write(p,p.relative_to(classes))
    bt=sdk/'build-tools/35.0.0';dex=out/'dex';dex.mkdir(exist_ok=True)
    needed=[p for p in runtime if 'kotlin-stdlib-' in p.name or 'gson-' in p.name]
    subprocess.run(['java','-Xmx512m','-cp',str(bt/'lib/d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib',str(android),'--output',str(dex),str(jar),*map(str,needed)],check=True)
    unsigned=out/'reference-unsigned.apk'
    subprocess.run([str(bt/'aapt2'),'link','-o',str(unsigned),'--manifest',str(ROOT/'tests/android-reference/AndroidManifest.xml'),'-I',str(android)],check=True)
    with zipfile.ZipFile(unsigned,'a',compression=zipfile.ZIP_DEFLATED) as z:z.write(dex/'classes.dex','classes.dex')
    key=out/'test.keystore'
    if not key.exists():subprocess.run(['keytool','-genkeypair','-keystore',str(key),'-storepass','android','-keypass','android','-alias','test','-dname','CN=BUILD670 Reference Tests','-keyalg','RSA','-validity','3650'],check=True)
    def sign(source,target):subprocess.run([str(bt/'apksigner'),'sign','--ks',str(key),'--ks-pass','pass:android','--out',str(target),str(source)],check=True)
    sign(unsigned,out/'reference.apk')
    if args.test_sign_copy:
        original=args.test_sign_copy.resolve();signed=out/'reference-target-test-signed.apk'
        if original==signed.resolve():raise RuntimeError('The original APK and test-copy paths must differ.')
        sign(original,signed)
        count=0
        with zipfile.ZipFile(original) as a,zipfile.ZipFile(signed) as b:
            for name in a.namelist():
                if name.startswith('META-INF/'):continue
                if a.read(name)!=b.read(name):raise RuntimeError('Test signing changed APK content: '+name)
                count+=1
        proof={'originalApkSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'testSignedApkSha256':hashlib.sha256(signed.read_bytes()).hexdigest(),'unchangedNonSignatureEntries':count,'purpose':'Local emulator instrumentation only; classes/resources unchanged. Not a production APK.'}
        (out/'test-signature-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps({'instrumentation':str(out/'reference.apk'),'testOnly':True}))
if __name__=='__main__':main()
