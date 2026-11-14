"""Contract tests exercise the actual unchanged Android history store."""
import copy
import threading
import unittest
from types import SimpleNamespace
from history_service import view,record_job,day_bound,update

def record(i=1,**values):
    return {'id':str(i),'symbol':'ASELS','direction':'LONG','signalGeneratedAt':day_bound('09.11.2026')+36000000,
        'signalPrice':100,'finalSignalScore':90,'technicalScore':80,'riskScore':20,'scanStatus':'COMPLETE',
        'decisionState':'VERIFIED_OPPORTUNITY','strategyIds':['TREND'],'dataMode':'REALTIME','source':'ISOLATED ORIGINAL-STORE TEST',
        'outcomes':{'15m':{'verification':'VERIFIED_HISTORICAL','directionalReturnPct':2}},**values}

class HistoryViewTests(unittest.TestCase):
    def test_strategy_and_scan_interval_filter_before_display_limit(self):
        rows=[record(202,symbol='THYAO',interval='15m',strategyIds=['MOMENTUM'])]
        rows.extend(record(i,interval='5m',strategyIds=['TREND']) for i in range(201))
        r=view({'records':rows,'filter':{'strategy':'MOMENTUM','interval':'15m'}})
        self.assertEqual(len(r['lines']),1);self.assertIn('THYAO',r['lines'][0])
        self.assertEqual(r['overview']['totalRecords'],202)
        self.assertEqual(len(r['records']),202);self.assertEqual(r['forward']['totalVerified'],202)
        self.assertEqual(view({'records':rows,'filter':{'strategy':'TREND','interval':'15m'}})['lines'],[])
    def test_legacy_interval_is_explicitly_unknown(self):
        rows=[record(),record(2,interval='5m')]
        self.assertEqual(len(view({'records':rows,'filter':{'interval':'UNKNOWN'}})['lines']),1)
        self.assertEqual(len(view({'records':rows,'filter':{'interval':'5m'}})['lines']),1)
    def test_wrong_numeric_types_fail_at_validation_without_fetching(self):
        from unittest.mock import Mock
        for bad in ['100',None,True,{},[]]:
            fetcher=Mock()
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                update({'records':[record(signalPrice=bad)]},fetcher)
            fetcher.assert_not_called()
    def test_direction_score_symbol_and_inclusive_istanbul_dates(self):
        rows=[record(),record(2,symbol='THYAO',direction='SHORT',finalSignalScore=80),record(3,finalSignalScore=74)]
        f={'direction':'LONG','minScore':85,'symbol':'asel','fromDate':'09.11.2026','toDate':'09.11.2026'}
        result=view({'records':rows,'filter':f})
        self.assertEqual(result['overview']['totalRecords'],3);self.assertEqual(len(result['lines']),1);self.assertIn('ASELS LONG',result['lines'][0]);self.assertIn('09.11.2026 10:00:00',result['lines'][0])
        self.assertFalse(result['canPublishSignals']);self.assertFalse(result['signalAttestationVerified'])
    def test_invalid_and_reversed_dates_fail_before_empty_state(self):
        for f in [{'fromDate':'31.02.2026'},{'toDate':'29.02.2025'},{'fromDate':'2026-11-09'},{'fromDate':'10.11.2026','toDate':'09.11.2026'}]:
            with self.assertRaises(ValueError):view({'records':[],'filter':f})
    def test_end_of_day_and_leap_day_boundaries(self):
        self.assertEqual(day_bound('29.02.2024',True)-day_bound('29.02.2024'),86399999)
        rows=[record(signalGeneratedAt=day_bound('09.11.2026',True)),record(2,signalGeneratedAt=day_bound('10.11.2026'))]
        self.assertEqual(len(view({'records':rows,'filter':{'toDate':'09.11.2026'}})['lines']),1)
    def test_forward_uses_only_verified_selected_horizon_and_source_order(self):
        rows=[record(),record(2,outcomes={'15m':{'verification':'VERIFIED_HISTORICAL','directionalReturnPct':-1}}),record(3,outcomes={'15m':{'verification':'PENDING','directionalReturnPct':99}})]
        s=view({'records':rows})['forward']
        self.assertEqual(s['curve'],[2,1]);self.assertEqual(s['totalVerified'],2);self.assertEqual(s['successRatePct'],50);self.assertEqual(s['medianReturnPct'],.5);self.assertEqual(s['profitFactor'],2)
        self.assertEqual(view({'records':rows,'horizon':'1h'})['forward']['totalVerified'],0)
    def test_zero_return_is_in_denominator_but_not_positive(self):
        s=view({'records':[record(outcomes={'15m':{'verification':'VERIFIED_HISTORICAL','directionalReturnPct':0}})]})['forward']
        self.assertEqual(s['totalVerified'],1);self.assertEqual(s['positive'],0);self.assertEqual(s['negative'],0);self.assertEqual(s['successRatePct'],0);self.assertIsNone(s['profitFactor'])
    def test_no_loss_infinity_has_explicit_valid_json_transport(self):
        result=view({'records':[record()]});self.assertEqual(result['forward']['profitFactor'],'POSITIVE_INFINITY');self.assertEqual(result['strategies'][0]['profitFactor'],'POSITIVE_INFINITY')
    def test_strategy_requires_verified_decision_and_twenty_samples(self):
        rows=[record(i) for i in range(20)]+[record(21,decisionState='WATCH',outcomes={'15m':{'verification':'VERIFIED_HISTORICAL','directionalReturnPct':99}})]
        s=view({'records':rows})['strategies'][0];self.assertEqual(s['totalVerified'],20);self.assertEqual(s['averageReturnPct'],2);self.assertTrue(s['sampleSufficient'])
        self.assertFalse(view({'records':rows[:19]})['strategies'][0]['sampleSufficient'])
    def test_display_limit_is_200_overview_keeps_all_and_partial_state(self):
        rows=[record(i) for i in range(201)];rows[-1]['scanStatus']='PARTIAL';r=view({'records':rows});self.assertEqual(len(r['lines']),200);self.assertEqual(r['overview']['totalRecords'],201);self.assertEqual(r['overview']['state'],'PARTIAL_HISTORY')
    def test_viop_uses_one_hour_and_last_hundred_accepted_samples(self):
        rows=[{'id':str(i),'symbol':'F_TEST','direction':'LONG','strategyIds':['TREND'],'outcome1h':{'verification':'VERIFIED_HISTORICAL','directionalReturnPct':1}} for i in range(110)]
        s=view({'records':[],'viopRecords':rows,'horizon':'1d'})['viopStrategies'][0];self.assertEqual(s['totalVerified'],100);self.assertEqual(s['averageReturnPct'],1)
    def test_structural_corruption_is_not_an_empty_history(self):
        for p in [{'records':{}},{'records':[None]},{'records':[record(signalGeneratedAt=True)]},{'records':[record(signalPrice=float('nan'))]},{'records':[record()]*3001},{'horizon':'5m'},{'filter':{'minScore':True}}]:
            with self.assertRaises(ValueError):view(p)
    def test_job_record_endpoint_does_not_accept_client_opportunities(self):
        with self.assertRaises(ValueError):record_job({'records':[],'opportunities':[record()]},None)
    def test_scan_interval_metadata_does_not_guess_legacy_periods(self):
        from unittest.mock import patch
        key='b'*32
        scans=SimpleNamespace(lock=threading.RLock(),jobs={key:{'status':'COMPLETE','createdAt':1,'completedAt':2,'results':[],'errors':0,'interval':'7m'}})
        rows=[record(scanRunId=key),record(2,scanRunId='legacy')]
        with patch('history_service.CORE.request',return_value={'records':rows}):result=record_job({'jobId':key},scans)
        self.assertEqual(result['records'][0]['interval'],'7m');self.assertNotIn('interval',result['records'][1])
    def test_delayed_completed_scan_does_not_create_a_signal(self):
        key='a'*32;scans=SimpleNamespace(lock=threading.RLock(),jobs={key:{'status':'COMPLETE','createdAt':1,'completedAt':2,'results':[],'errors':0}})
        r=record_job({'records':[],'jobId':key},scans);self.assertEqual(r['added'],0);self.assertEqual(r['overview']['state'],'NO_HISTORY')
    def test_due_outcome_uses_first_closed_historical_bar_after_target(self):
        generated=day_bound('06.11.2026')+36000000
        def provider(symbol,interval,range_):
            self.assertEqual((symbol,interval,range_),('ASELS','1m','7d'))
            return {'candles':[{'time':generated+minutes*60000,'open':price,'high':price+1,'low':price-1,'close':price,'volume':100,'closed':closed} for minutes,price,closed in [(14,500,True),(15,900,False),(16,110,True),(17,120,True)]]}
        r=update({'records':[record(signalGeneratedAt=generated,outcomes={})]},provider)
        outcome=r['records'][0]['outcomes']['15m'];self.assertAlmostEqual(outcome['directionalReturnPct'],10);self.assertEqual(outcome['matchedMarketTime'],generated+16*60000);self.assertEqual(outcome['verification'],'VERIFIED_HISTORICAL');self.assertNotIn('1h',r['records'][0]['outcomes'])
        self.assertFalse(r['canPublishSignals'])
    def test_failed_history_fetch_keeps_pending_outcome_without_using_current_quote(self):
        def provider(*args):raise TimeoutError('EXPLICIT PROVIDER FAILURE')
        r=update({'records':[record(signalGeneratedAt=day_bound('06.11.2026')+36000000,outcomes={})]},provider)
        self.assertEqual(r['records'][0]['outcomes'],{});self.assertIn('ASELS',r['updateErrors']);self.assertEqual(r['forward']['totalVerified'],0)
