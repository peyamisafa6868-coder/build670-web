import io,json,tempfile,unittest
from datetime import datetime,timezone
from pathlib import Path
from unittest.mock import patch
from kap_directory import parse_directory,usable,Directory
from market_history import ProviderError

class KapDirectoryTests(unittest.TestCase):
 def html(self,mutate=None):
  rows=[{'stockCode':'T'+str(i).zfill(3),'title':'EXPLICIT "Company" {'+str(i)+'}'} for i in range(30)]
  objects=[{'code':'XUTUM','content':rows},{'code':'XU030','content':rows},{'code':'XUSIN','content':rows[:2]}]
  if mutate:mutate(objects)
  return '<script>self.__next_f.push('+json.dumps([1,json.dumps(objects)])+')</script>'
 def test_original_hydration_contract_and_optional_sectors(self):
  d=parse_directory(self.html());self.assertEqual(len(d['bist30']),30);self.assertEqual(d['memberships']['XUSIN'],['T000','T001']);self.assertNotIn('XUBNK',d['memberships']);self.assertTrue(usable(d))
 def test_incomplete_and_duplicate_membership_is_rejected(self):
  for mutate in [lambda o:o[1]['content'].pop(),lambda o:o[1]['content'].append(o[1]['content'][0])]:
   with self.assertRaises(ValueError):parse_directory(self.html(mutate))
 def test_conflicting_repeated_hydration_objects_are_rejected(self):
  def conflict(o):o.append({'code':'XU030','content':[{'stockCode':'OTHER','title':'EXPLICIT'}]})
  with self.assertRaises(ValueError):parse_directory(self.html(conflict))
 def test_one_hour_and_istanbul_day_boundaries(self):
  now=int(datetime(2026,11,8,20,59,tzinfo=timezone.utc).timestamp()*1000);d=parse_directory(self.html(),now)
  self.assertTrue(usable(d,now+59000));self.assertFalse(usable(d,now+120000));self.assertFalse(usable(d,now-1));self.assertFalse(usable(d,now+3600001))
 def test_corrupt_and_oversized_pages_do_not_create_members(self):
  for html in ['', '<html>unavailable</html>','x'*4000001]:
   with self.assertRaises(ValueError):parse_directory(html)
 def test_provider_failure_uses_only_still_usable_cache(self):
  with tempfile.TemporaryDirectory() as root:
   d=Directory(Path(root)/'kap.json')
   with patch('kap_directory.urllib.request.urlopen',return_value=io.BytesIO(self.html().encode())):value=d.get()
   with patch('kap_directory.urllib.request.urlopen',side_effect=OSError('EXPLICIT FAILURE')):
    self.assertTrue(d.get(refresh=True)['cached']);d.data['fetchedAt']-=3600001
    with self.assertRaises(ProviderError):d.get(refresh=True)
