import unittest
from engine_bridge import CORE

def bars(step):
    return [{'timestamp':1700000000000+i*60000,'open':100+i*step,'high':102+i*step,'low':99+i*step,'close':101+i*step,'volume':100} for i in range(40)]

class TechnicalViewTests(unittest.TestCase):
    def test_independent_frame_regressions_do_not_clone_daily_history(self):
        result=CORE.request({'op':'technicalView','frames':[{'label':label,'candles':bars(step)} for label,step in zip(['3 DK','5 DK','1 SA','1 GÜN'],[1,-1,0,1])],'price':120,'technical':{}})
        self.assertEqual([x['result']['direction'] for x in result['frames']],['UP','DOWN','SIDEWAYS','UP']);self.assertFalse(result['canPublishSignals']);self.assertFalse(result['signalAttestationVerified'])
    def test_missing_frame_retains_its_own_sample_count(self):
        result=CORE.request({'op':'technicalView','frames':[{'label':label,'candles':bars(1) if label=='1 GÜN' else []} for label in ['3 DK','5 DK','1 SA','1 GÜN']],'price':120,'technical':{}})
        self.assertEqual([x['result']['sampleCount'] for x in result['frames']],[0,0,0,40]);self.assertEqual(result['summary']['alignmentLabel'],'YETERSİZ VERİ')
