#!/usr/bin/env python3
"""Run test-only BUILD670 instrumentation on a local emulator over direct ADB.

Optional developer dependency: adb-shell==0.4.4. This avoids requiring the adb
host server to write outside the workspace. Never uninstalls an existing app.
"""
import argparse
import base64
from pathlib import Path
import re
import socket
ROOT=Path(__file__).resolve().parents[1]
PACKAGE='tr.borsatakip.v5.diagnostic.v668.delayed'

if __name__=='__main__':
    from adb_shell.adb_device import AdbDeviceTcp
    parser=argparse.ArgumentParser();parser.add_argument('--phase',choices=['math','screens'],required=True)
    parser.add_argument('--host',default='127.0.0.1');parser.add_argument('--port',type=int,default=5555)
    parser.add_argument('--install-test-target',action='store_true')
    parser.add_argument('--routes',default='',help='Comma-separated capture routes; math inputs remain unchanged')
    parser.add_argument('--night-mode',choices=['yes','no','unchanged'],default='yes')
    args=parser.parse_args();out=ROOT/'test-results/android-harness'
    device=AdbDeviceTcp(args.host,args.port,default_transport_timeout_s=1800);device.connect(auth_timeout_s=60)
    device._io_manager._transport._connection.setsockopt(socket.IPPROTO_TCP,socket.TCP_NODELAY,1)
    def shell(command,timeout=120):return device.shell(command,timeout_s=timeout,read_timeout_s=timeout)
    if shell('getprop ro.kernel.qemu').strip()!='1':raise RuntimeError('This tool operates only on a local test emulator')
    if args.night_mode!='unchanged':print(shell('cmd uimode night '+args.night_mode),flush=True)
    print(shell('am force-stop '+PACKAGE),flush=True)
    apks=[('reference.apk','/data/local/tmp/build670-reference-test.apk')]
    if args.install_test_target:apks.insert(0,('reference-target-test-signed.apk','/data/local/tmp/build670-reference-target.apk'))
    for name,remote in apks:
        print('Installing test-only',name,flush=True);device.push(str(out/name),remote,transport_timeout_s=120,read_timeout_s=120)
        response=shell('pm install -r -t '+remote,240);print(response,flush=True)
        if 'Success' not in response:raise RuntimeError('Test APK installation failed; existing installation was not removed')
    device.push(str(out/'parity-input.json'),'/data/local/tmp/build670-parity-input.json',transport_timeout_s=120,read_timeout_s=120)
    print(shell('run-as '+PACKAGE+' mkdir -p files; run-as '+PACKAGE+' cp /data/local/tmp/build670-parity-input.json files/parity-input.json'),flush=True)
    flag='-e calculations_only true ' if args.phase=='math' else ''
    if args.routes:
        if not re.fullmatch(r'[a-z_,]+',args.routes):raise ValueError('Invalid route list')
        flag+='-e capture_routes '+args.routes+' '
    result=shell('am instrument -w '+flag+'parity.build670.reference/parity.ReferenceRunner',1800)
    (out/('instrumentation-'+args.phase+'.txt')).write_text(result);print(result,flush=True)
    names=shell('run-as '+PACKAGE+' ls files').split()
    captured={}
    for name in names:
        if not re.fullmatch(r'(parity-|screen-|device-)[A-Za-z0-9_.-]+',name):continue
        if name=='parity-reference-error.txt' and 'INSTRUMENTATION_RESULT: result=PASS:' in result:continue
        if args.phase=='math' and name not in {'parity-input.json','parity-android-output.json','parity-scenarios-output.json','parity-costs-output.json','parity-reference-error.txt'}:continue
        raw=base64.b64decode(shell('run-as '+PACKAGE+' base64 files/'+name,180));captured[name]=raw
        print('Captured',name,len(raw),flush=True)
    # Publish the metadata only after its complete set of images is present.
    for name in sorted(captured,key=lambda n:n=='parity-screen-metadata.json'):
        staged=out/(name+'.tmp');staged.write_bytes(captured[name]);staged.replace(out/name)
    if (out/'parity-android-output.json').exists():(out/'android-output.json').write_bytes((out/'parity-android-output.json').read_bytes())
    if 'INSTRUMENTATION_RESULT: result=PASS:' not in result or 'shortMsg=' in result:raise RuntimeError('Instrumentation did not finish successfully; inspect captured errors')
