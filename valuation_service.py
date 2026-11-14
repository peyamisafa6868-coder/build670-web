"""Strict transport validation; original Kotlin model evaluates all financial/risk gates."""
import math
import re
from engine_bridge import CORE

STRINGS={'symbol','sector','businessType','accountingBasis','financialCurrency','disclosureUrl','companyName','priorAccountingBasis'}
DATES={'financialPeriodEndMs','disclosurePublishedAtMs','marketObservedAtMs','priorFinancialPeriodEndMs','priorDisclosurePublishedAtMs'}
NUMBERS={'marketCapTry','priceTry','sharesOutstanding','netIncomeTtmTry','equityTry','ebitdaTtmTry','netDebtTry','freeCashFlowTtmTry','priorNetIncomeTtmTry'}
REQUIRED={'symbol','sector','businessType','accountingBasis','financialCurrency','financialPeriodEndMs','disclosurePublishedAtMs','marketObservedAtMs','marketCapTry','priceTry','sharesOutstanding','disclosureUrl'}


def valuation(payload,core=CORE):
    if set(payload)-{'financials','strategy'}:raise ValueError('Bilinmeyen finansal alan.')
    records=payload.get('financials')
    if not isinstance(records,list) or not 1<=len(records)<=700:raise ValueError('1–700 finansal kayıt gerekli.')
    for row in records:
        if not isinstance(row,dict) or not REQUIRED<=set(row) or set(row)-(STRINGS|DATES|NUMBERS):raise ValueError('Finansal kayıt şeması eksik/geçersiz.')
        for key,value in row.items():
            if value is None and key not in REQUIRED:continue
            if key in STRINGS and (not isinstance(value,str) or len(value)>(2000 if key=='disclosureUrl' else 180)):raise ValueError('Geçersiz finansal metin: '+key)
            if key in DATES and (isinstance(value,bool) or not isinstance(value,int)):raise ValueError('Geçersiz finansal zaman: '+key)
            if key in NUMBERS and value is not None and (isinstance(value,bool) or not isinstance(value,(float,int)) or not math.isfinite(value)):raise ValueError('Geçersiz finansal sayı: '+key)
        if not re.fullmatch(r'[A-Z0-9]{3,10}',row['symbol']) or row['businessType'] not in {'NON_FINANCIAL','BANK','FINANCIAL'}:raise ValueError('Geçersiz sembol veya iş türü.')
    if len({x['symbol'] for x in records})!=len(records):raise ValueError('Yinelenen finansal sembol.')
    strategy=payload.get('strategy','BALANCED')
    if strategy not in {'BALANCED','QUALITY','DISCOUNT'}:raise ValueError('Geçersiz değerleme stratejisi.')
    results=core.request({'op':'valuation','financials':records,'strategy':strategy})
    return {'results':results,'engine':'Android FundamentalValuationEngine + ValueOpportunityScoreEngine',
        'contentVerified':False,'publicationGate':'KAP_CONTENT_UNVERIFIED','signalAttestationVerified':False,
        'note':'KAP bağlantı biçimi, bildirimin içeriğini doğrulamaz. Sonuçlar yüklenen kayıtların referans hesabıdır.'}
