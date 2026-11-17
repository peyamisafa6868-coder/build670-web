/* BIST-VIOP: optional same-origin Yahoo chart hydration. No indicator/scoring changes.
   Provider is unofficial and delayed; never label its values live. */
(() => {
  'use strict';
  if (window.__BIST_YAHOO_AUTO_READY) return;
  window.__BIST_YAHOO_AUTO_READY = true;
  if (typeof request !== 'function' || typeof offlineRequest !== 'function' ||
      typeof offlineBuildDatasets !== 'function' || typeof offlineMergeForImport !== 'function') return;

  const fromYahoo = x => !!x && typeof offlineSourceFamily==='function' && offlineSourceFamily(x)==='YAHOO';
  const requests = new Map();
  const checkedAt = new Map();
  const symbolValid = /^[A-Z0-9]{3,10}$/;
  const timeframes = new Set(['1m','3m','5m','10m','15m','30m','60m','240m','1d','1w','1mo','all']);
  const retryAfterMs = 5 * 60 * 1000;
  const originalRequest = request;
  const originalEmptyChart = emptyChart;
  let pendingChartError = '';
  emptyChart = function(message) {
    originalEmptyChart(pendingChartError || message);
    if (pendingChartError) {
      const source = document.getElementById('chartSource');
      if (source) source.textContent = pendingChartError;
    }
    pendingChartError = '';
  };
  const status = text => {
    const el = document.getElementById('homeChartGuide');
    if (el) el.textContent = text;
  };
  const feedback = (symbol, interval, text) => {
    status(`${symbol} · ${interval}: ${text}`);
    const source = document.getElementById('chartSource');
    if (source) source.textContent = `${symbol} · ${interval} · ${text}`;
  };
  const isUserSource = x => !!x && !fromYahoo(x) && !offlineIsTestSource(x.source);
  const key = (symbol, interval) => `${symbol}|${interval}`;

  async function loadYahoo(symbol, interval, force = false) {
    if (!symbolValid.test(symbol) || !timeframes.has(interval)) throw Error('Geçersiz sembol veya zaman dilimi');
    const id = key(symbol, interval), dbKey = OFFLINE_KEY('BIST', symbol, interval);
    const existing = OFFLINE_DB.get(dbKey);
    if (isUserSource(existing) && !force) return existing; // do not overwrite a user's CSV/JSON
    if (!force && fromYahoo(existing) && Date.now() - (checkedAt.get(id) || 0) < retryAfterMs) return existing;
    if (requests.has(id)) return requests.get(id);
    const task = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const range = interval==='all'?'max':['1m','3m'].includes(interval)?'7d':['1d','1w','1mo'].includes(interval)?'2y':'1mo';
        const params = new URLSearchParams({symbol, interval, range});
        const res = await fetch('/history?' + params.toString(), {
          signal: controller.signal, cache: 'no-store', credentials: 'omit'
        });
        let payload;
        try { payload = await res.json(); }
        catch { throw Error('Yahoo veri yanıtı okunamadı (HTTP ' + res.status + ')'); }
        if (!res.ok) throw Error(payload?.error || 'Yahoo HTTP ' + res.status);
        if (payload?.provider !== 'Yahoo Finance (unofficial)' ||
            payload.symbol !== symbol + '.IS' || payload.interval !== interval ||
            !Array.isArray(payload.candles) || !payload.candles.length) {
          throw Error('Yahoo fiyat veri sözleşmesi geçersiz');
        }
        const latest = payload.candles.at(-1)?.time;
        const dailyClosed = typeof payload.candles.at(-1)?.closed==='boolean'?payload.candles.at(-1).closed:
          interval === '1d' && Number.isFinite(latest) && typeof window.BistYahooDailyClosed === 'function' && window.BistYahooDailyClosed(latest);
        const opts = {market:'BIST', symbol, interval, lastBarClosed:!!dailyClosed};
        const sets = offlineBuildDatasets({datasets:[{
          market:'BIST', symbol, interval, lastBarClosed:!!dailyClosed, candles:payload.candles
        }]}, 'Yahoo Finance ' + symbol + '.IS', opts);
        if (sets.length !== 1 || sets[0].symbol !== symbol || sets[0].interval !== interval)
          throw Error('Yahoo veri seti doğrulanamadı');
        const incoming = sets[0];
        incoming.source = offlineYahooSource(payload);
        incoming.sources = [incoming.source];
        const current = OFFLINE_DB.get(dbKey);
        if (isUserSource(current) && !force) return current;
        const merged = offlineMergeForImport(current, incoming);
        const previousBars = current?.candles?.length || 0;
        if (!current && OFFLINE_DB.size >= OFFLINE_SETS_MAX) throw Error('Yerel veri seti sınırı aşıldı');
        let totalBars = 0;
        for (const [k, value] of OFFLINE_DB) if (k !== dbKey) totalBars += value.candles.length;
        if (totalBars + merged.candles.length > OFFLINE_BARS_TOTAL_MAX)
          throw Error('Yerel toplam mum sınırı aşıldı');
        OFFLINE_DB.set(dbKey, merged);
        OFFLINE_DATA_VERSION++;
        state.quotes.clear();
        if (typeof offlinePersist === 'function') offlinePersist();
        if (typeof offlineRenderSets === 'function') offlineRenderSets();
        if (typeof updateHealthUi === 'function') updateHealthUi();
        if (typeof loadWatchlist === 'function') loadWatchlist();
        checkedAt.set(id, Date.now());
        if (typeof homeChartRefresh === 'function') homeChartRefresh();
        status(`${symbol} · ${interval}: Yahoo gecikmeli fiyatları yüklendi (${merged.candles.length} mum; önce ${previousBars}). Anlık borsa yayını değildir.`);
        return merged;
      } finally { clearTimeout(timeout); }
    })();
    requests.set(id, task);
    try { return await task; } finally { requests.delete(id); }
  }

  // Existing chart and interval controls use request('/api/history'); hydrate its
  // missing or demo-only dataset on demand while preserving the original contract.
  request = async function(path) {
    const u = new URL(path, location.origin);
    if (u.pathname !== '/api/history' || u.searchParams.get('market') !== 'BIST')
      return originalRequest(path);
    const symbol = (u.searchParams.get('symbol') || '').toUpperCase();
    const interval = u.searchParams.get('interval') || '';
    if (!symbolValid.test(symbol) || !timeframes.has(interval)) return originalRequest(path);
    const local = await originalRequest(path);
    const current = OFFLINE_DB.get(OFFLINE_KEY('BIST', symbol, interval));
    if (local.ok && isUserSource(current)) return local;
    try {
      await loadYahoo(symbol, interval);
    } catch (e) {
      const message = 'Yahoo bağlantısı: ' + String(e?.message || e);
      feedback(symbol, interval, message);
      pendingChartError = message;
      // Never silently plot synthetic candles as a real fallback.
      if (current && fromYahoo(current)) return originalRequest(path);
      return {ok:false, status:502, data:{error:message}};
    }
    return originalRequest(path);
  };

  // Home shortcut previously imported data and navigated away to scanner,
  // preventing users from viewing the requested 15m graph.
  const button = document.getElementById('homeYahooFetch');
  if (button) button.addEventListener('click', async event => {
    event.stopImmediatePropagation();
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    try {
      status('ASELS ve THYAO için Yahoo 15 dakikalık geçmiş verileri alınıyor…');
      const result = await Promise.allSettled(['ASELS', 'THYAO'].map(s => loadYahoo(s, '15m', true)));
      const successes = result.map((x,i)=>x.status==='fulfilled' ? ['ASELS','THYAO'][i] : null).filter(Boolean);
      if (!successes.length) throw Error(result.map(x=>x.reason?.message||'').join(' | '));
      state.market='BIST';state.symbol=successes[0];state.interval='15m';state.demo=false;
      document.getElementById('marketSelect').value='BIST';
      document.getElementById('symbolInput').value=successes[0];
      document.querySelectorAll('[data-interval]').forEach(x=>x.classList.toggle('selected',x.dataset.interval==='15m'));
      navigate('dashboard');
      await loadHistory();
      if (result.some(x=>x.status==='rejected'))
        status('Bazı semboller yüklenemedi: '+result.filter(x=>x.status==='rejected').map(x=>x.reason.message).join(' | '));
    } catch (e) {
      const message='Yahoo verisi alınamadı: '+(e?.message||e);
      feedback('ASELS/THYAO','15m',message);
      if(!state.candlePayload&&!state.demo)emptyChart(message);
    }
    finally {button.disabled=false;}
  }, {capture:true});
  window.BistYahooAuto = Object.freeze({fetch:loadYahoo});
})();
