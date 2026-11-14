"""BUILD670 local web runner — start the real Python/Kotlin app, then open a browser.

Requires Python 3.12+ and Java 17+. The released ZIP includes the verified
Kotlin JAR so normal first launch does not download/build the engine.

Unlike opening index.html via file:// this starts the application's real API.
It binds only to 127.0.0.1; it never enables public access automatically.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
MIN_PYTHON = (3, 12)
MIN_JAVA = 17


def java_major(text: str) -> int | None:
    """Parse OpenJDK/Oracle `java -version` output, including legacy 1.8."""
    matched = re.search(r'(?:openjdk|java)\s+version\s+["\']?(\d+)(?:\.(\d+))?', text, re.I)
    if not matched:
        return None
    first = int(matched.group(1))
    return int(matched.group(2)) if first == 1 and matched.group(2) else first


def ensure_java() -> bool:
    try:
        result = subprocess.run(['java', '-version'], capture_output=True, text=True, timeout=10)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        print('HATA: Java 17 veya daha yenisi bulunamadı.', file=sys.stderr)
        return False
    major = java_major(result.stderr + '\n' + result.stdout)
    if result.returncode != 0 or major is None or major < MIN_JAVA:
        print(f'HATA: Java 17+ gerekli (tespit: {major or "bilinmiyor"}).', file=sys.stderr)
        return False
    return True


def choose_local_port(preferred: int) -> int:
    """Prefer 8000; fall back to an available ephemeral port when occupied."""
    if not 0 <= preferred <= 65535:
        raise ValueError('Port 0–65535 aralığında olmalı.')
    for port in (preferred, 0) if preferred else (0,):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind(('127.0.0.1', port))
                return int(probe.getsockname()[1])
            except OSError:
                if not port:
                    raise
    raise RuntimeError('Uygun yerel port bulunamadı.')


def wait_until_ready(proc: subprocess.Popen, url: str, timeout: float) -> bool:
    """Only browse after the launched server returns HTTP 200 from /ready."""
    deadline = time.monotonic() + timeout
    request = urllib.request.Request(url + 'ready', headers={'Cache-Control': 'no-cache'})
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(request, timeout=1.5) as response:
                if response.status == 200:
                    return True
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.3)
    return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='BUILD670 web uygulamasını tarayıcıda başlatır.')
    parser.add_argument('--no-browser', action='store_true', help='CI için otomatik tarayıcı açılışını kapat')
    parser.add_argument('--port', type=int, default=8000, help='Tercih edilen yerel port, varsayılan 8000')
    parser.add_argument('--startup-timeout', type=float, default=60, help='Hazır oluş süresi (saniye)')
    args = parser.parse_args(argv)

    if sys.version_info < MIN_PYTHON:
        print('HATA: Python 3.12 veya daha yeni sürüm gerekli.', file=sys.stderr)
        return 2
    if not ensure_java():
        return 2

    jar = ROOT / 'android-core' / 'build' / 'android-core.jar'
    if not jar.is_file():
        print('Kotlin JAR eksik. Kaynak derlemesi ve testler çalıştırılıyor...')
        result = subprocess.run([sys.executable, str(ROOT/'scripts'/'build_core.py'), '--test'], cwd=ROOT)
        if result.returncode != 0 or not jar.is_file():
            print('HATA: Kotlin çekirdeği derlenemedi; uygulama açılmadı.', file=sys.stderr)
            return result.returncode or 2

    try:
        port = choose_local_port(args.port)
    except (OSError, ValueError, RuntimeError) as error:
        print(f'HATA: {error}', file=sys.stderr)
        return 2

    url = f'http://127.0.0.1:{port}/'
    env = os.environ.copy()
    env.update({'HOST': '127.0.0.1', 'PORT': str(port)})
    # Inherit no public deployment flag when running locally.
    env.pop('BUILD670_PUBLIC_SERVER', None)
    env.pop('RAILWAY_ENVIRONMENT', None)
    proc = subprocess.Popen([sys.executable, '-u', str(ROOT/'server.py')], cwd=ROOT, env=env)
    try:
        if not wait_until_ready(proc, url, max(2, args.startup_timeout)):
            print('HATA: Uygulama /ready kontrolünü geçemedi. Yukarıdaki sunucu çıktısına bakın.', file=sys.stderr)
            return proc.poll() or 1
        print('BUILD670 hazır:', url, flush=True)
        if not args.no_browser:
            try:
                opened = webbrowser.open(url, new=2)
                if not opened:
                    print('Tarayıcı otomatik açılmadı; bu adresi kendiniz açın:', url)
            except OSError:
                print('Tarayıcı açılamadı; bu adresi kendiniz açın:', url)
        print('Sunucuyu kapatmak için bu pencerede CTRL+C kullanın.', flush=True)
        return proc.wait()
    except KeyboardInterrupt:
        print('\nBUILD670 sunucusu kapatılıyor...', flush=True)
        return 0
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()


if __name__ == '__main__':
    raise SystemExit(main())
