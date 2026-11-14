package tr.borsatakip.v5.data

import com.google.gson.Gson
import com.google.gson.JsonObject
import tr.borsatakip.v5.model.Candle
import tr.borsatakip.v5.model.ViopContract
import tr.borsatakip.v5.model.ViopQuote
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

/** Explicit reference-input boundary, never a configured/licensed network provider or attestation. */
class BackendProvider(private val input:JsonObject) {
    private val gson=Gson()
    private val quoteCalls=ConcurrentHashMap<String,Int>()
    private val source="WEB_REFERENCE_INPUT|"+MessageDigest.getInstance("SHA-256").digest(input.toString().toByteArray()).joinToString(""){"%02x".format(it)}
    fun mtfCacheSourceKey():String=source
    suspend fun loadViop():Result<List<ViopContract>> = runCatching {
        val records=input.getAsJsonArray("contracts")?:error("NO_REFERENCE_CONTRACTS")
        require(records.size()<=100){"CONTRACT_LIMIT"}
        records.map { gson.fromJson(it,ViopContract::class.java) }
    }
    suspend fun loadViopQuote(symbol:String,observationOnly:Boolean=false):Result<ViopQuote> = runCatching {
        val count=quoteCalls.merge(symbol,1,Int::plus)?:1
        val name=if(count>1&&input.has("finalQuotes"))"finalQuotes" else "quotes"
        val raw=input.getAsJsonObject(name)?.getAsJsonObject(symbol)?:error("NO_REFERENCE_QUOTE")
        val q=gson.fromJson(raw,ViopQuote::class.java);val now=System.currentTimeMillis()
        require(q.price.isFinite()&&q.price>0){"QUOTE_ERROR: Geçerli son fiyat yok."}
        require(q.exchangeTimestamp>=1_000_000_000_000L){"STALE_DATA: Piyasa veri zamanı eksik."}
        if(!observationOnly)require(q.realtime&&q.currentSessionIncluded){"STALE_DATA: Gerçek zamanlı/seans verisi doğrulanmadı."}
        if(!observationOnly)require(q.delaySeconds!=null&&q.delaySeconds in 0..RealTimeIntegrityPolicy.MAX_DECLARED_DELAY_SECONDS){"STALE_DATA: Gecikme eşiği aşıldı veya bildirilmedi."}
        require(q.exchangeTimestamp<=now+RealTimeIntegrityPolicy.MAX_FUTURE_CLOCK_SKEW_MS){"STALE_DATA: Piyasa zamanı gelecekte."}
        if(!observationOnly)require(now-q.exchangeTimestamp<=RealTimeIntegrityPolicy.MAX_DATA_AGE_MS){"STALE_DATA: Quote güncel değil."}
        require(q.symbol==symbol.trim().uppercase()){"QUOTE_ERROR: Sembol kimliği uyuşmuyor."}
        require(q.openInterestChangePct==null||(q.openInterestAsOfTimestamp!=null&&q.openInterestAsOfTimestamp>0&&q.openInterestAsOfTimestamp<=q.exchangeTimestamp)){"QUOTE_ERROR: OI değişimi için point-in-time zamanı gerekli."}
        q.copy(receivedAt=now)
    }
    suspend fun loadViopHistory(symbol:String):Result<List<Candle>> = loadViopHistoryFlexible(symbol,"1y","1d",220)
    suspend fun loadViopHistoryFlexible(symbol:String,range:String,interval:String,minimumBars:Int=0,forDisplay:Boolean=false):Result<List<Candle>> = runCatching {
        val response=input.getAsJsonObject("histories")?.getAsJsonObject(symbol)?.getAsJsonObject(interval)?:error("NO_REFERENCE_HISTORY")
        val records=response.getAsJsonArray("candles")?:error("HISTORY_ERROR: candles alanı yok.")
        val closed=response.get("lastBarClosed")?.asBoolean?:false
        val exchange=response.get("exchangeTimestamp")?.asLong?:0L
        ViopHistoryIntegrityPolicy.validateMetadata(symbol,interval,response.get("symbol")?.asString?:"",response.get("interval")?.asString?:"",closed,exchange,true)?.let{error("HISTORY_ERROR: $it")}
        if(!forDisplay)ViopHistoryIntegrityPolicy.validateExchangeFreshness(exchange,System.currentTimeMillis(),interval)?.let{error("HISTORY_ERROR: $it")}
        require(records.size()<=10000){"HISTORY_LIMIT"}
        val bars=records.map {gson.fromJson(it,Candle::class.java)}
        ViopHistoryIntegrityPolicy.validateCandles(bars)?.let{error("HISTORY_ERROR: $it")}
        RealTimeIntegrityPolicy.validateCandles(bars)?.let{error("HISTORY_ERROR: $it")}
        val usable=if(forDisplay||closed)bars else bars.dropLast(1)
        if(!forDisplay)ViopHistoryIntegrityPolicy.validateLastBarClosed(usable,System.currentTimeMillis(),interval,response.get("sessionClosedAt")?.asLong?.takeIf{closed&&it>0})?.let{error("HISTORY_ERROR: $it")}
        require(usable.size>=minimumBars){"INSUFFICIENT_HISTORY"};usable
    }
}
