"""Prepare official, checksum-pinned Android tools for local APK verification."""
import concurrent.futures,hashlib,json,shutil,urllib.request,zipfile
from pathlib import Path

SDK=Path(__file__).resolve().parents[1]/'.cache/android-sdk'
PACKAGES=[
 ('platforms/android-30','platform-30_r03.zip','e7c6280901dcfa511af098d67dd88c4dfcbc6ea2'),
 ('build-tools/35.0.0','build-tools_r35_linux.zip','2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc'),
 ('platform-tools','platform-tools_r37.0.1-linux.zip','477254aa5f903c15cf51001717bdf347fb6b53e0'),
 ('emulator','emulator-linux_x64-16740729.zip','f41f9e31eb5ca64926603c03265c50bbc0ff4172'),
 ('system-images/android-30/default/x86_64','sys-img/android/x86_64-30_r11.zip','5e4de3946d46f88856c35efcc4d797b381456347')]

def prepare(item):
 target,name,checksum=item;destination=SDK/target;archive=SDK/'downloads'/Path(name).name;archive.parent.mkdir(parents=True,exist_ok=True)
 if destination.exists():return
 if not archive.exists():
  with urllib.request.urlopen('https://dl.google.com/android/repository/'+name,timeout=60) as response,archive.open('wb') as out:shutil.copyfileobj(response,out)
 if hashlib.sha1(archive.read_bytes()).hexdigest()!=checksum:raise RuntimeError('SDK checksum mismatch: '+name)
 temporary=SDK/'downloads'/('extract-'+Path(name).stem);temporary.mkdir(exist_ok=True)
 with zipfile.ZipFile(archive) as z:
  z.extractall(temporary)
  for member in z.infolist():
   mode=member.external_attr>>16
   if mode:(temporary/member.filename).chmod(mode)
 paths=list(temporary.iterdir());source=paths[0] if len(paths)==1 and paths[0].is_dir() else temporary
 destination.parent.mkdir(parents=True,exist_ok=True);shutil.move(source,destination)
 print(target+' verified and prepared',flush=True)

if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(prepare,PACKAGES))
 (SDK/'provenance.json').write_text(json.dumps(PACKAGES,indent=2)+'\n');print(SDK)
