package web

import com.google.gson.*
import kotlinx.coroutines.runBlocking
import tr.borsatakip.v5.analysis.*
import tr.borsatakip.v5.analysis.v531.*
import tr.borsatakip.v5.data.*
import tr.borsatakip.v5.model.*
import tr.borsatakip.v5.scan.*

private val gson=GsonBuilder().serializeNulls().disableHtmlEscaping().create()
private val statisticsGson=GsonBuilder().serializeNulls().serializeSpecialFloatingPointValues().create()
private fun finiteStatistics(value:Any):JsonElement {
    fun clean(x:JsonElement):JsonElement = when {
        x.isJsonObject -> JsonObject().apply { x.asJsonObject.entrySet().forEach { (k,v) -> add(k,clean(v)) } }
        x.isJsonArray -> JsonArray().apply { x.asJsonArray.forEach { add(clean(it)) } }
        x.isJsonPrimitive && x.asJsonPrimitive.isNumber && !x.asDouble.isFinite() ->
            if(x.asDouble == Double.POSITIVE_INFINITY) JsonPrimitive("POSITIVE_INFINITY") else JsonNull.INSTANCE
        else -> x
    }
    return clean(statisticsGson.toJsonTree(value))
}
private fun presented(x:Opportunity):JsonObject = gson.toJsonTree(x).asJsonObject.apply {
    add("presentation",gson.toJsonTree(Opportunity2Presentation.from(x)))
    add("discovery",gson.toJsonTree(OpportunityDiscoveryPresentation.from(x)))
    val display=OpportunityTrendPresentation.from(x)
    val ui=gson.toJsonTree(display).asJsonObject
    ui.getAsJsonObject("trend").apply {
        addProperty("strengthLevel",display.trend.strengthLevel);addProperty("rowFillAlpha",display.trend.rowFillAlpha)
        addProperty("borderAlpha",display.trend.borderAlpha);addProperty("borderWidthDp",display.trend.borderWidthDp)
        addProperty("sparklineFillAlpha",display.trend.sparklineFillAlpha)
    }
    add("trendDisplay",ui)
    add("displayQuote",gson.toJsonTree(mapOf("price" to StockQuotePolicy.price(x),"changePct" to StockQuotePolicy.change(x))))
}
private fun JsonObject.text(key:String, default:String="") = get(key)?.takeUnless{it.isJsonNull}?.asString ?: default
private fun JsonObject.long(key:String, default:Long=0L) = get(key)?.takeUnless{it.isJsonNull}?.asLong ?: default
private fun JsonObject.bool(key:String, default:Boolean=false) = get(key)?.takeUnless{it.isJsonNull}?.asBoolean ?: default
private fun JsonObject.number(key:String):Double? = get(key)?.takeUnless{it.isJsonNull}?.asDouble?.also{require(it.isFinite()){"NON_FINITE_$key"}}
private fun candles(raw:JsonArray):List<Candle> = raw.map { element ->
    val x=element.asJsonObject
    Candle(x.long("timestamp",x.long("time")),requireNotNull(x.number("open")),requireNotNull(x.number("high")),
        requireNotNull(x.number("low")),requireNotNull(x.number("close")),requireNotNull(x.number("volume")))
}
private fun stock(x:JsonObject):Stock {
    val symbol=x.text("symbol").uppercase()
    require(Regex("[A-Z0-9]{3,10}").matches(symbol)){"INVALID_SYMBOL"}
    val rows=candles(x.getAsJsonArray("candles")?:JsonArray())
    require(rows.size<=10000){"BAR_LIMIT"}
    return Stock(symbol,x.text("companyName").ifBlank{null},rows,x.text("source","KULLANICI DOSYASI"),
        x.long("dataTimestamp",rows.lastOrNull()?.timestamp?:0L),x.bool("isRealtime"),
        x.get("delaySeconds")?.takeUnless{it.isJsonNull}?.asInt,x.bool("currentSessionIncluded"),
        x.long("receivedAt",System.currentTimeMillis()),x.long("receivedElapsedRealtime",android.os.SystemClock.elapsedRealtime()),
        x.number("quotePrice"),x.text("currency","TRY"),x.text("market","BIST"),x.text("historySymbol",symbol),
        x.text("interval","1d"),x.text("exchangeTimezone","Europe/Istanbul"),x.text("sessionId").ifBlank{null},
        x.long("lastBarTime",rows.lastOrNull()?.timestamp?:0L),x.get("lastBarClosed")?.takeUnless{it.isJsonNull}?.asBoolean,
        x.number("previousClose"),x.number("bid"),x.number("ask"))
}

private class InputProvider(private val request:JsonObject,private val rows:List<Stock>):MarketDataProvider,ScanDiagnosticsSource {
    override val id="web_reference_"+request.text("interval","1d")
    override val displayName="Web source adapter"
    override suspend fun listSymbols():List<String> = request.getAsJsonArray("universe")?.map{it.asString}?:rows.map{it.symbol}
    override suspend fun scan(onProgress:(Int,Int)->Unit):List<Stock> {
        rows.forEachIndexed { i,_->onProgress(i+1,rows.size) };return rows
    }
    override suspend fun fetchOne(symbol:String):Stock? = rows.find{it.symbol==symbol}
    private fun history(symbol:String,tf:String):List<Candle> {
        val key=symbol.removeSuffix(".IS")
        val data=request.getAsJsonObject("histories")?.getAsJsonObject(key)?.getAsJsonArray(tf)
        return data?.let{candles(it)}?:rows.find{it.symbol==key&&it.interval==tf}?.candles?:emptyList()
    }
    override suspend fun fetchHistory(symbol:String,fromTime:Long,toTime:Long,intervalMinutes:Int):List<Candle> = history(symbol,"${intervalMinutes}m")
    override suspend fun fetchDailyHistory(symbol:String,maximumRange:Boolean):List<Candle> = history(symbol,"1d")
    override fun scanDiagnostics():ProviderScanDiagnostics = ProviderScanDiagnostics(
        request.getAsJsonArray("noDataSymbols")?.map{it.asString}?:emptyList(),request.getAsJsonArray("errorSymbols")?.map{it.asString}?:emptyList())
}
private class Recorder:HistoryRecorder {
    var state:ScanState?=null
    override suspend fun record(state:ScanState):HistoryRecordResult { this.state=state;return HistoryRecordResult() }
}

private fun run(request:JsonObject):Any = runBlocking {
    when(request.text("op","scan")) {
        "metadata" -> mapOf("engineVersion" to ScoringConfig.ENGINE_VERSION,"flowVersion" to V540FinalDecisionFlow.FLOW_VERSION,
            "requiredClosedBars" to CandleReadinessPolicy.requiredClosedBars(),"filters" to OpportunityFilter.entries.map{it.name},
            "timeframes" to ScanTimeframe.quick().map{mapOf("minutes" to it.storedMinutes,"label" to it.label,"interval" to it.apiInterval)},
            "signalAttestationVerified" to false)
        "tradeEstimate" -> TradeForwardEngine.estimateRoundTrip(request.text("direction"),
            requireNotNull(request.number("entry")),requireNotNull(request.number("exit")),
            TradeForwardEngine.CostConfig(requireNotNull(request.number("quantity")),1.0,
                requireNotNull(request.number("commissionPerSide")),requireNotNull(request.number("slippageBpsPerSide")))).getOrThrow()
        "technical" -> { val s=stock(request.getAsJsonObject("stock"));mapOf("readiness" to CandleReadinessPolicy.evaluate(s),"technical" to TechnicalAnalyzer.analyze(CandleReadinessPolicy.closedCandles(s)),"opportunity" to OpportunityEngine.score(s)) }
        "mtf" -> { val frames=request.getAsJsonArray("frames").map{val x=it.asJsonObject;MtfConsensusEngine.Input(x.text("label"),candles(x.getAsJsonArray("candles")),x.number("weight")?:0.0)};MtfConsensusEngine.evaluate(frames) }
        "technicalView" -> {
            val frames=request.getAsJsonArray("frames").map { x ->
                val tf=x.asJsonObject
                MultiTimeframeSignalAnalyzer.TimeframeTrend(tf.text("label"), MultiTimeframeSignalAnalyzer.trend(candles(tf.getAsJsonArray("candles"))))
            }
            val technical=gson.fromJson(request.getAsJsonObject("technical"),TechnicalSnapshot::class.java)
            val oldLocale=java.util.Locale.getDefault()
            try {
                java.util.Locale.setDefault(java.util.Locale.forLanguageTag("tr-TR"))
                mapOf("frames" to frames,"summary" to MultiTimeframeSignalAnalyzer.summarize(frames,requireNotNull(request.number("price")),technical),
                    "canPublishSignals" to false,"signalAttestationVerified" to false)
            } finally { java.util.Locale.setDefault(oldLocale) }
        }
        "historyView" -> {
            val context=android.content.Context()
            val zone=java.util.TimeZone.getDefault();val locale=java.util.Locale.getDefault()
            try {
                java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Europe/Istanbul"))
                java.util.Locale.setDefault(java.util.Locale.forLanguageTag("tr-TR"))
                val records=request.getAsJsonArray("records")?:JsonArray()
                require(records.size()<=3000){"HISTORY_LIMIT"}
                val file=java.io.File(context.filesDir,"signal_history_v1.json")
                file.writeText(JsonObject().apply{add("records",records)}.toString())
                val viopRecords=request.getAsJsonArray("viopRecords")?:JsonArray()
                require(viopRecords.size()<=1500){"VIOP_HISTORY_LIMIT"}
                java.io.File(context.filesDir,"viop_strategy_history_v1.json").writeText(JsonObject().apply{add("records",viopRecords)}.toString())
                val store=SignalHistoryStore(context)
                if(request.text("action")=="update") {
                    val costs=request.getAsJsonObject("costs")?:JsonObject()
                    context.getSharedPreferences("web_history_costs",0).edit()
                        .putString("quantity",(costs.number("quantity")?:0.0).toString())
                        .putString("commission",(costs.number("commissionPerSide")?:0.0).toString())
                        .putString("slippage",(costs.number("slippageBpsPerSide")?:0.0).toString()).commit()
                    store.updateDueOutcomes(InputProvider(request,emptyList()),maxSignals=20)
                }
                val added=if(request.text("action")=="record")store.recordScan(gson.fromJson(request.getAsJsonObject("run"),ScanRun::class.java),
                    request.getAsJsonArray("opportunities").map{gson.fromJson(it,Opportunity::class.java)}) else 0
                val filter=request.getAsJsonObject("filter")?:JsonObject()
                val horizon=request.text("horizon","15m")
                require(horizon in ForwardOutcomeMatcher.horizons){"INVALID_HORIZON"}
                val forward=store.forwardStats(horizon)
                val displayFilter=SignalHistoryFilter(
                    direction=filter.text("direction").ifBlank{null},minScore=filter.number("minScore")?.toInt(),
                    symbol=filter.text("symbol").ifBlank{null},fromTime=filter.number("fromTime")?.toLong(),toTime=filter.number("toTime")?.toLong())
                // Filter the display before Android's 200-row limit, retaining
                // its exact row formatter and the full journal/statistics.
                val displayContext=android.content.Context()
                val lines=try {
                    java.io.File(displayContext.filesDir,"signal_history_v1.json").writeText(JsonObject().apply {
                        add("records",request.getAsJsonArray("displayRecords")?:JsonParser.parseString(file.readText()).asJsonObject.getAsJsonArray("records"))
                    }.toString())
                    SignalHistoryStore(displayContext).summaryLines(filter=displayFilter)
                } finally { displayContext.filesDir.deleteRecursively() }
                mapOf("overview" to store.overview(),"lines" to lines,
                    "forward" to finiteStatistics(forward),"strategies" to finiteStatistics(store.strategyPerformance(horizon)),
                    "viopStrategies" to finiteStatistics(ViopStrategyHistoryStore(context).performance(limit=100)),
                    "records" to JsonParser.parseString(file.readText()).asJsonObject.getAsJsonArray("records"),"added" to added,
                    "sourceScope" to "LOCAL_RECORDS","signalAttestationVerified" to false,"canPublishSignals" to false)
            } finally { java.util.TimeZone.setDefault(zone);java.util.Locale.setDefault(locale);context.filesDir.deleteRecursively() }
        }
        "resample" -> OhlcvResampler.aggregate(candles(request.getAsJsonArray("candles")),request.long("sourceMinutes",1).toInt(),request.long("targetMinutes").toInt())
        "chart" -> {
            val bars=OhlcvResampler.sanitize(candles(request.getAsJsonArray("candles")))
            require(bars.size<=10000){"BAR_LIMIT"}
            val confirmed=if(request.bool("excludeNewestForTrend",true))bars.dropLast(1) else bars
            mapOf("series" to ChartIndicators.calculate(bars,request.bool("intraday",true)),
                "trend" to LinearTrendAnalyzer.analyze(confirmed),"levels" to ChartSupportResistance.fromConfirmed(confirmed),
                "extended" to ExtendedStockEvidence.indicators(confirmed,request.bool("intraday",true)),
                "technical" to TechnicalAnalyzer.analyze(bars))
        }
        "viopReference" -> {
            require(request.bool("referenceOnly")){"REFERENCE_MODE_REQUIRED"}
            val context=android.content.Context()
            try {
                val backend=BackendProvider(request)
                val rows=request.getAsJsonArray("stocks")?.map{stock(it.asJsonObject)}?:emptyList()
                val decision=ViopStrategyDecisionService(context,backend)
                val result=ViopScanner(backend,InputProvider(request,rows),decision).scan(request.text("symbol").ifBlank{null})
                mapOf("result" to result,"referenceOnly" to true,"canPublishSignals" to false,
                    "signalAttestationVerified" to false,"licensedProviderConnected" to false)
            } finally {context.filesDir.deleteRecursively()}
        }
        "viopCatalog" -> {
            val now=request.long("now",System.currentTimeMillis())
            val all=ViopBuiltinContractCatalog.current(now)
            val category=ViopContractCategory.valueOf(request.text("category","ALL"))
            val source=ViopContractCategoryPolicy.filter(all,category)
            val query=request.text("query")
            if(query.isBlank())ViopContractSearch.browse(source,2000,now) else ViopContractSearch.search(source,query,2000,now)
        }
        "viopSize" -> ViopV6Policy.size(request.number("entry")?:0.0,request.number("stop")?:0.0,
            request.number("multiplier"),request.number("costPerContract"),request.number("marginPerContract"),
            request.number("openRiskTry")?:0.0,request.number("dailyLossTry")?:0.0,request.long("activePositions").toInt(),
            request.number("usedMarginTry")?:0.0,request.text("direction","LONG"))
        "ledger" -> {
            val context=android.content.Context()
            context.getSharedPreferences("v6_manual_positions_v1",0).edit().putString("positions",(request.getAsJsonArray("positions")?:JsonArray()).toString()).commit()
            val store=ViopManualPositionStore(context)
            val now=request.long("now",System.currentTimeMillis())
            val action=request.text("action","state")
            val result=when(action) {
                "record" -> store.record(request.text("symbol"),request.text("side"),request.long("quantity").toInt(),
                    request.number("entry")?:0.0,request.number("stop")?:0.0,request.number("target")?:0.0,
                    request.number("multiplier")?:0.0,request.number("cost")?:0.0,request.number("margin")?:0.0,now,request.text("brokerExecutionId"))
                "exit" -> store.closePartial(request.text("id"),request.long("quantity").toInt(),request.number("price")?:0.0,now,request.number("fee")?:0.0)
                else -> null
            }
            val stored=context.getSharedPreferences("v6_manual_positions_v1",0).getString("positions","[]")
            mapOf("result" to result,"positions" to JsonParser.parseString(stored),"state" to store.state(now),
                "math" to store.positions().map{mapOf("id" to it.id,"remainingQuantity" to it.remainingQuantity,
                    "openRiskTry" to it.openRiskTry,"openMarginTry" to it.openMarginTry,"realizedPnlTry" to it.realizedPnlTry)})
        }
        "filter" -> {
            val rows=request.getAsJsonArray("results").map{gson.fromJson(it,Opportunity::class.java)}
            require(rows.size<=2000){"RESULT_LIMIT"}
            val filtered=OpportunityFilterPolicy.apply(rows,OpportunityFilter.valueOf(request.text("filter","ALL")))
            filtered.map{presented(it)}
        }
        "valuation" -> {
            val records=request.getAsJsonArray("financials")?.map{gson.fromJson(it,FundamentalValuationEngine.Snapshot::class.java)}?:emptyList()
            val symbols=request.getAsJsonArray("universe")?.map{it.asString}?:records.map{it.symbol}
            val assessments=FundamentalValuationEngine.scan(symbols,records,request.long("now",System.currentTimeMillis()))
            val strategy=ValueOpportunityScoreEngine.Strategy.valueOf(request.text("strategy","BALANCED"))
            ValueOpportunityScoreEngine.rank(assessments,strategy).map{mapOf("assessment" to it.assessment,"score" to it.score,"contentVerified" to false)}
        }
        else -> {
            val rows=request.getAsJsonArray("stocks")?.map{stock(it.asJsonObject)}?:emptyList()
            require(rows.size<=2000&&rows.map{it.symbol}.distinct().size==rows.size){"INVALID_UNIVERSE"}
            val mode=BistScanMode.valueOf(request.text("mode","DELAYED_ANALYSIS"))
            val recorder=Recorder();val scanner=BistScanner(InputProvider(request,rows),recorder,mode,"WEB_REFERENCE_CORE")
            val result=scanner.scan{}
            val filter=OpportunityFilter.valueOf(request.text("filter","ALL"))
            val filtered=OpportunityFilterPolicy.apply(result.results,filter)
            val json=gson.toJsonTree(result).asJsonObject
            json.add("results",gson.toJsonTree(filtered.map{presented(it).apply{
                add("strategies",gson.toJsonTree(StrategyProfileEngine.evaluate(it)))
                if(!request.bool("includeCandles"))add("candles",JsonArray())
            }}))
            json.addProperty("engineVersion",ScoringConfig.ENGINE_VERSION)
            json.addProperty("signalAttestationVerified",false)
            json
        }
    }
}

fun main() {
    System.`in`.bufferedReader().lineSequence().forEach { line ->
        try {
            require(line.length<=32*1024*1024){"REQUEST_TOO_LARGE"}
            val request=JsonParser.parseString(line).asJsonObject
            println(gson.toJson(mapOf("ok" to true,"data" to run(request))))
        } catch(e:Throwable) {
            println(gson.toJson(mapOf("ok" to false,"error" to (e.message?.take(400)?:e.javaClass.simpleName))))
        }
        System.out.flush()
    }
}
