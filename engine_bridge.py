"""Bounded JSON-lines adapter to the unchanged Android Kotlin calculation core."""
import atexit
import json
from pathlib import Path
import queue
import subprocess
import threading
import time

ROOT = Path(__file__).resolve().parent


class CoreError(RuntimeError):
    pass


class AndroidCore:
    def __init__(self, jar=None):
        self.jar = Path(jar) if jar else ROOT/'android-core/build/android-core.jar'
        self._lock = threading.Lock()
        self._process = None
        self._reader = None
        self._responses = queue.Queue()
        atexit.register(self.close)

    def close(self):
        process, self._process = self._process, None
        self._reader = None
        self._responses = queue.Queue()
        if process:
            process.kill()
            process.communicate(timeout=3)

    def request(self, payload, timeout=25):
        raw = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()+b'\n'
        if len(raw)>32*1024*1024:
            raise CoreError('Hesaplama girdisi boyut sınırını aştı.')
        deadline=time.monotonic()+timeout
        if not self._lock.acquire(timeout=timeout):
            raise CoreError('Android hesaplama çekirdeği meşgul; hazır oluş zaman sınırı aşıldı.')
        try:
            if not self.jar.is_file():
                raise CoreError('Android çekirdeği derlenmemiş; build_core.py çalıştırılmalı.')
            if self._process is None or self._process.poll() is not None:
                self._process = subprocess.Popen(['java', '-Xms32m', '-Xmx256m', '-jar', str(self.jar)],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)
                self._responses = queue.Queue(maxsize=2)
                responses = self._responses
                process = self._process
                def read_responses():
                    try:
                        while True:
                            line = process.stdout.readline(48 * 1024 * 1024 + 1)
                            if not line:
                                responses.put(None)
                                return
                            responses.put(line)
                    except (OSError, ValueError):
                        responses.put(None)
                self._reader = threading.Thread(target=read_responses, daemon=True)
                self._reader.start()
            try:
                self._process.stdin.write(raw)
                self._process.stdin.flush()
                # Unbuffered pipes avoid BufferedReader read-ahead across line requests.
                try:
                    output = self._responses.get(timeout=max(0, deadline-time.monotonic()))
                except queue.Empty:
                    raise CoreError('Android hesaplama çekirdeği zaman aşımı.')
                if output is None:
                    raise CoreError('Android hesaplama çekirdeği durdu.')
                if len(output) > 48 * 1024 * 1024 or not output.endswith(b'\n'):
                    raise CoreError('Çekirdek yanıtı boyut sınırını aştı veya eksik.')
                envelope=json.loads(output)
                if not envelope.get('ok'):raise CoreError(envelope.get('error','Hesaplama başarısız.'))
                return envelope['data']
            except (OSError, ValueError, CoreError) as error:
                self.close()
                if isinstance(error, CoreError):raise
                raise CoreError('Android çekirdeği yanıtı okunamadı.') from error
        except OSError as error:
            self.close()
            raise CoreError('Android hesaplama çekirdeği başlatılamadı.') from error
        finally:
            self._lock.release()


CORE = AndroidCore()
