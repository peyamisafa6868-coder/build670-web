import json,threading,unittest,urllib.request,urllib.error
from http.server import ThreadingHTTPServer
import server

class TradeEstimateTests(unittest.TestCase):
 def call(self,**overrides):
  body={'direction':'LONG','entry':100,'exit':110,'quantity':2,'commissionPerSide':1.5,'slippageBpsPerSide':10,**overrides}
  http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler);thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
  try:
   request=urllib.request.Request('http://127.0.0.1:'+str(http.server_port)+'/api/trade-estimate',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
   try:
    with urllib.request.urlopen(request,timeout=10) as r:return r.status,json.load(r)
   except urllib.error.HTTPError as r:return r.code,json.load(r)
  finally:http.shutdown();http.server_close();thread.join(timeout=2)
 def test_long_uses_cash_commission_and_notional_slippage(self):
  status,r=self.call();self.assertEqual(status,200);self.assertEqual(r['grossPnl'],20);self.assertAlmostEqual(r['totalCosts'],3.42);self.assertAlmostEqual(r['netPnl'],16.58);self.assertAlmostEqual(r['netReturnPct'],8.29)
 def test_short_direction_keeps_costs_and_entry_notional(self):
  status,r=self.call(direction='SHORT',entry=110,exit=100);self.assertEqual(status,200);self.assertEqual(r['grossPnl'],20);self.assertAlmostEqual(r['netPnl'],16.58);self.assertAlmostEqual(r['netReturnPct'],16.58/220*100)
 def test_fractional_quantity_is_not_rounded(self):
  status,r=self.call(quantity=.5,commissionPerSide=.2,slippageBpsPerSide=5);self.assertEqual(status,200);self.assertAlmostEqual(r['netPnl'],4.5475);self.assertAlmostEqual(r['netReturnPct'],9.095)
 def test_invalid_costs_fail_before_a_result_is_produced(self):
  for bad in [{'quantity':0},{'quantity':-.5},{'commissionPerSide':-1},{'entry':0},{'entry':True}]:
   status,r=self.call(**bad);self.assertEqual(status,400);self.assertIn('error',r);self.assertNotIn('netPnl',r)
