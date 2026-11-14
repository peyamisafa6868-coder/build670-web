"""Readiness exercises the kernel and bounds queue waits without killing an owner."""
import json,sys,threading,time,urllib.request,urllib.error,unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from engine_bridge import AndroidCore,CoreError

class ReadinessTests(unittest.TestCase):
 def request(self):
  host=ThreadingHTTPServer(('127.0.0.1',0),server.Handler);worker=threading.Thread(target=host.serve_forever,daemon=True);worker.start()
  try:
   try:
    with urllib.request.urlopen('http://127.0.0.1:'+str(host.server_port)+'/ready',timeout=5) as r:return r.status,json.load(r)
   except urllib.error.HTTPError as r:return r.code,json.load(r)
  finally:host.shutdown();host.server_close();worker.join(timeout=3)
 def test_ready_requires_a_real_metadata_response(self):
  status,data=self.request();self.assertEqual(status,200);self.assertTrue(data['coreReady']);self.assertFalse(data['licensedProviderConnected']);self.assertFalse(data['signalAttestationVerified'])
 def test_a_broken_kernel_is_not_ready(self):
  with patch.object(server.CORE,'request',side_effect=CoreError('TEST BROKEN JAR')):status,data=self.request()
  self.assertEqual(status,503);self.assertFalse(data['coreReady'])
 def test_wrong_kernel_contract_is_not_ready(self):
  with patch.object(server.CORE,'request',return_value={'requiredClosedBars':10,'engineVersion':'TEST'}):status,data=self.request()
  self.assertEqual(status,503)
 def test_malformed_metadata_returns_json_not_a_dropped_connection(self):
  for metadata in [None, [], 'invalid', {'requiredClosedBars':220},
                   {'requiredClosedBars':220,'engineVersion':None},
                   {'requiredClosedBars':220,'engineVersion':''}]:
   with self.subTest(metadata=metadata), patch.object(server.CORE,'request',return_value=metadata):
    status,data=self.request()
    self.assertEqual(status,503);self.assertFalse(data['coreReady'])
 def test_busy_queue_wait_is_bounded_without_killing_the_owner(self):
  core=AndroidCore();core._lock.acquire();start=time.monotonic()
  try:
   with self.assertRaises(CoreError):core.request({'op':'metadata'},timeout=0.05)
   self.assertLess(time.monotonic()-start,0.5);self.assertIsNone(core._process)
  finally:core._lock.release()
if __name__=='__main__':unittest.main()
