package parity

import android.app.Instrumentation
import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.accessibility.AccessibilityNodeInfo
import android.view.View
import android.widget.TextView
import com.google.gson.Gson
import com.google.gson.JsonParser
import java.io.File

/** Test-only instrumentation of the installed, unmodified BUILD670 APK. No network prices are fabricated. */
class ReferenceRunner: Instrumentation() {
    private var calculationsOnly=false
    private var captureRoutes=emptySet<String>()
    private fun geometry(content:View):Map<String,Map<String,Any>> {
        val origin=IntArray(2);content.getLocationOnScreen(origin)
        val values=linkedMapOf<String,Map<String,Any>>()
        for(name in listOf("title","subtitle","status","bottomNav","detailTitle","detailContent","analysisTitle","analysisSearch","analysisExpiry","historyStatus","historyFilters","historyList","settingsSearchView","stockFavorite","stockMore","techTitle","indicatorContainer","forwardPanel","chart","chartFrame","navHome","navBist","navViop","navFav","navSettings")) {
            val id=targetContext.resources.getIdentifier(name,"id",targetContext.packageName)
            val view=content.findViewById<View>(id)?:continue
            val position=IntArray(2);view.getLocationOnScreen(position)
            val item=linkedMapOf<String,Any>("x" to position[0]-origin[0],"y" to position[1]-origin[1],"width" to view.width,"height" to view.height,"visible" to (view.visibility==View.VISIBLE))
            if(view is TextView){item["fontSizePx"]=view.textSize;item["textColor"]="%06x".format(view.currentTextColor and 0xffffff)}
            values[name]=item
        }
        return values
    }
    private fun onUi(action:()->Unit) {
        var failure:Throwable?=null
        runOnMainSync { try { action() } catch(e:Throwable){ failure=e } }
        failure?.let{throw it}
    }
    private fun launchPage(intent:Intent,targetClass:String=requireNotNull(intent.component).className):Activity {
        // startActivitySync waits for an idle UI queue, which can starve on a
        // software-only emulator even after the Activity has been created.
        val monitor=addMonitor(targetClass,null,false)
        return try {
            targetContext.startActivity(intent)
            requireNotNull(waitForMonitorWithTimeout(monitor,120000)){"Activity creation timed out: ${intent.component}"}
        } finally { removeMonitor(monitor) }
    }
    private fun dismissSystemUiAnr():Boolean {
        val root=uiAutomation.rootInActiveWindow ?: return false
        if(root.findAccessibilityNodeInfosByText("System UI isn't responding").isEmpty())return false
        for(node in root.findAccessibilityNodeInfosByText("Wait")) {
            var candidate:AccessibilityNodeInfo?=node
            repeat(4) {
                if(candidate?.isClickable==true) {
                    candidate?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    Thread.sleep(1200)
                    return true
                }
                candidate=candidate?.parent
            }
        }
        return false
    }
    override fun onCreate(arguments:Bundle?) { calculationsOnly=arguments?.getString("calculations_only")=="true";captureRoutes=arguments?.getString("capture_routes")?.split(',')?.filter{it.isNotBlank()}?.toSet()?:emptySet();super.onCreate(arguments);start() }
    override fun onStart() {
        val result=Bundle()
        try {
            java.util.Locale.setDefault(java.util.Locale("tr","TR"))
            java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Europe/Istanbul"))
            val loader=targetContext.classLoader
            val gson=Gson()
            val input=JsonParser.parseString(File(targetContext.filesDir,"parity-input.json").readText()).asJsonObject
            val candleClass=loader.loadClass("tr.borsatakip.v5.model.Candle")
            val bars=input.getAsJsonArray("candles").map {gson.fromJson(it,candleClass)}
            fun singleton(name:String)=loader.loadClass(name).getField("INSTANCE").get(null)
            val chartIndicators=singleton("tr.borsatakip.v5.analysis.ChartIndicators")
            val series=chartIndicators.javaClass.getMethod("calculate",List::class.java,Boolean::class.javaPrimitiveType).invoke(chartIndicators,bars,true)
            val trendAnalyzer=singleton("tr.borsatakip.v5.analysis.LinearTrendAnalyzer")
            val trend=trendAnalyzer.javaClass.getMethod("analyze",List::class.java).invoke(trendAnalyzer,bars)
            val supportAnalyzer=singleton("tr.borsatakip.v5.analysis.ChartSupportResistance")
            val levels=supportAnalyzer.javaClass.getMethod("fromConfirmed",List::class.java).invoke(supportAnalyzer,bars)
            val technicalAnalyzer=singleton("tr.borsatakip.v5.analysis.TechnicalAnalyzer")
            val technical=technicalAnalyzer.javaClass.getMethod("analyze",List::class.java).invoke(technicalAnalyzer,bars)
            File(targetContext.filesDir,"parity-android-output.json").writeText(gson.toJson(mapOf("series" to series,"trend" to trend,"levels" to levels,"technical" to technical)))
            val scenarioOutputs=linkedMapOf<String,Any>()
            input.getAsJsonObject("scenarios")?.entrySet()?.forEach { (name,value) ->
                val scenario=value.asJsonObject
                val scenarioBars=scenario.getAsJsonArray("candles").map { gson.fromJson(it,candleClass) }
                scenarioOutputs[name]=mapOf(
                    "series" to chartIndicators.javaClass.getMethod("calculate",List::class.java,Boolean::class.javaPrimitiveType).invoke(chartIndicators,scenarioBars,scenario.get("intraday").asBoolean),
                    "trend" to trendAnalyzer.javaClass.getMethod("analyze",List::class.java).invoke(trendAnalyzer,scenarioBars),
                    "levels" to supportAnalyzer.javaClass.getMethod("fromConfirmed",List::class.java).invoke(supportAnalyzer,scenarioBars),
                    "technical" to technicalAnalyzer.javaClass.getMethod("analyze",List::class.java).invoke(technicalAnalyzer,scenarioBars))
            }
            File(targetContext.filesDir,"parity-scenarios-output.json").writeText(gson.toJson(scenarioOutputs))
            val costOutputs=linkedMapOf<String,Any>()
            val tradeEngine=singleton("tr.borsatakip.v5.analysis.TradeForwardEngine")
            val costClass=loader.loadClass("tr.borsatakip.v5.analysis.TradeForwardEngine\$CostConfig")
            val constructor=costClass.getConstructor(Double::class.javaPrimitiveType,Double::class.javaPrimitiveType,Double::class.javaPrimitiveType,Double::class.javaPrimitiveType)
            val estimateMethod=tradeEngine.javaClass.methods.first { it.name.startsWith("estimateRoundTrip") && it.parameterCount==4 }
            input.getAsJsonObject("costScenarios")?.entrySet()?.forEach { (name,value) ->
                val row=value.asJsonObject
                val costs=constructor.newInstance(row.get("quantity").asDouble,1.0,row.get("commissionPerSide").asDouble,row.get("slippageBpsPerSide").asDouble)
                val estimate=requireNotNull(estimateMethod.invoke(tradeEngine,row.get("direction").asString,row.get("entry").asDouble,row.get("exit").asDouble,costs))
                check(estimate.javaClass.name.endsWith("\$Estimate")) { "Native estimate failed: $name" }
                costOutputs[name]=estimate
            }
            File(targetContext.filesDir,"parity-costs-output.json").writeText(gson.toJson(costOutputs))
            if(calculationsOnly){result.putString("result","PASS: original APK calculation checkpoints captured");finish(0,result);return}
            val opportunityClass=loader.loadClass("tr.borsatakip.v5.model.Opportunity")
            val opportunity=gson.fromJson(input.getAsJsonObject("opportunity"),opportunityClass)
            val session=singleton("tr.borsatakip.v5.ui.AppSession")
            session.javaClass.getMethod("setSelected",opportunityClass).invoke(session,opportunity)
            val intent=Intent().setClassName(targetContext.packageName,"tr.borsatakip.v5.ui.StockDetailActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val activity=launchPage(intent)
            Thread.sleep(5000)
            onUi {
                val chartId=targetContext.resources.getIdentifier("chart","id",targetContext.packageName)
                val chart=activity.findViewById<View>(chartId)
                chart.javaClass.getMethod("setCandles",List::class.java).invoke(chart,bars)
                chart.javaClass.getMethod("setIntraday",Boolean::class.javaPrimitiveType).invoke(chart,true)
                chart.javaClass.getMethod("setTimeframeLabel",String::class.java).invoke(chart,"5 DK")
                chart.javaClass.getMethod("setTrendAnalysis",trend.javaClass).invoke(chart,trend)
                chart.javaClass.getMethod("setSupportResistance",levels.javaClass).invoke(chart,levels)
                activity.findViewById<View>(targetContext.resources.getIdentifier("chartUnavailablePanel","id",targetContext.packageName))?.visibility=View.GONE
                chart.visibility=View.VISIBLE
                chart.invalidate()
                val bounds=intArrayOf(0,0);chart.getLocationOnScreen(bounds)
                activity.findViewById<android.widget.ScrollView>(targetContext.resources.getIdentifier("detailScrollView","id",targetContext.packageName)).scrollBy(0,bounds[1]-80)
                chart.getLocationOnScreen(bounds)
                File(targetContext.filesDir,"parity-chart-bounds.json").writeText(gson.toJson(mapOf("x" to bounds[0],"y" to bounds[1],"width" to chart.width,"height" to chart.height)))
            }
            Thread.sleep(1000)
            val dismissed=dismissSystemUiAnr()
            onUi {
                val chart=activity.findViewById<View>(targetContext.resources.getIdentifier("chart","id",targetContext.packageName))
                // An outstanding Activity provider response may clear the
                // fixture. Inject and draw atomically on the same UI turn.
                chart.javaClass.getMethod("setCandles",List::class.java).invoke(chart,bars)
                chart.javaClass.getMethod("setIntraday",Boolean::class.javaPrimitiveType).invoke(chart,true)
                chart.javaClass.getMethod("setTimeframeLabel",String::class.java).invoke(chart,"5 DK")
                chart.javaClass.getMethod("setTrendAnalysis",trend.javaClass).invoke(chart,trend)
                chart.javaClass.getMethod("setSupportResistance",levels.javaClass).invoke(chart,levels)
                chart.visibility=View.VISIBLE
                val actual=chart.javaClass.getMethod("getCandles").invoke(chart) as List<*>
                check(actual.size==bars.size){"Chart fixture was cleared before capture"}
                val bitmap=Bitmap.createBitmap(chart.width,chart.height,Bitmap.Config.ARGB_8888)
                chart.draw(Canvas(bitmap))
                File(targetContext.filesDir,"parity-chart-view.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) }
                File(targetContext.filesDir,"parity-chart-fixture.json").writeText(gson.toJson(mapOf("expectedBars" to bars.size,"actualBars" to actual.size,"width" to chart.width,"height" to chart.height,"contentDescription" to chart.contentDescription.toString(),"capture" to "Atomic UI-thread component draw; explicit fixture, not market data")))
            }
            uiAutomation.takeScreenshot().compress(Bitmap.CompressFormat.PNG,100,File(targetContext.filesDir,"parity-stock-chart.png").outputStream())
            val captures=mutableListOf<Map<String,Any>>()
            onUi { activity.finish() }
            session.javaClass.getMethod("setSelected",opportunityClass).invoke(session,null as Any?)
            targetContext.getSharedPreferences("settings",0).edit().putString("base_url","").putBoolean("experimental_providers_enabled",false).putBoolean("yahoo_fallback_enabled",false).putBoolean("auto_scan_enabled",false).commit()
            val captureFailures=mutableListOf<Map<String,String>>()
            fun checkpoint(inProgress:Boolean) {
                val inputHash=java.security.MessageDigest.getInstance("SHA-256").digest(File(targetContext.filesDir,"parity-input.json").readBytes()).joinToString(""){"%02x".format(it)}
                File(targetContext.filesDir,"parity-screen-metadata.json").writeText(gson.toJson(mapOf("captureInProgress" to inProgress,"inputSha256" to inputHash,"captures" to captures,"captureFailures" to captureFailures,"unmappedWebRoutes" to listOf("info_screen"),"initialSystemUiAnrDismissed" to dismissed,"visualParityAccepted" to false,"scenarioOutputs" to scenarioOutputs,"costOutputs" to costOutputs)))
                sendStatus(0,Bundle().apply{putString("stream","Captured ${captures.size}; failed ${captureFailures.size}; inProgress=$inProgress\n")})
            }
            val pages=listOf(
                Triple("main","MainActivity",""),Triple("stocks","StocksActivity",""),
                Triple("bist_scan","BistScanActivity",""),Triple("settings","SettingsActivity",""),
                Triple("settings_search","SettingsSearchActivity",""),Triple("favorites","FavoritesActivity",""),
                Triple("notifications","NotificationsActivity",""),Triple("opportunity","OpportunityActivity",""),
                Triple("scan_results","ScanResultsActivity",""),Triple("signal_history","SignalHistoryActivity",""),
                Triple("news","NewsActivity",""),Triple("viop","ViopActivity",""),
                Triple("viop_analysis","ViopAnalysisActivity",""),Triple("viop_contracts","ViopContractsActivity",""),
                Triple("stock_detail","StockDetailActivity",""),Triple("technical_analysis","TechnicalAnalysisActivity",""),
                Triple("viop_detail","ViopDetailActivity",""),Triple("market_instrument_detail","MarketInstrumentDetailActivity",""),
                Triple("settings_detail","SettingsDetailActivity","system_status"),
                Triple("cheap","CheapStockScanActivity",""),Triple("universe","FullUniverseScanActivity",""),
                Triple("delayed","DelayedObservationActivity",""),Triple("fullscreen","FullscreenChartActivity",""),
                Triple("settings_detail_appearance","SettingsDetailActivity","appearance"),
                Triple("settings_detail_locale","SettingsDetailActivity","locale"))
            for((route,name,mode) in pages.filter{captureRoutes.isEmpty()||it.first in captureRoutes}) {
              try {
                val selected=route=="stock_detail"||route=="technical_analysis"
                session.javaClass.getMethod("setSelected",opportunityClass).invoke(session,if(selected)opportunity else null)
                val pageIntent=Intent().setClassName(targetContext.packageName,"tr.borsatakip.v5.ui.$name").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if(mode.isNotBlank())pageIntent.putExtra("settings_detail_mode",mode)
                if(route=="market_instrument_detail")pageIntent.putExtra("market_instrument","XU100")
                if(route=="fullscreen")pageIntent.putExtra("symbol",input.getAsJsonObject("opportunity").get("symbol").asString).putExtra("timeframe","ONE_DAY")
                val page=launchPage(pageIntent,if(route=="delayed")"tr.borsatakip.v5.ui.FullUniverseScanActivity" else name.let{"tr.borsatakip.v5.ui.$it"})
                Thread.sleep(1500)
                val systemDismissed=dismissSystemUiAnr()
                onUi {
                    val content=page.findViewById<View>(android.R.id.content)
                    check(content.width>0&&content.height>0){"No visible content: $route"}
                    val bitmap=Bitmap.createBitmap(content.width,content.height,Bitmap.Config.ARGB_8888)
                    content.draw(Canvas(bitmap))
                    File(targetContext.filesDir,"screen-$route.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) }
                    captures.add(mapOf("route" to route,"capturedAt" to System.currentTimeMillis(),"width" to content.width,"height" to content.height,"geometry" to geometry(content),"method" to "APK content view draw; system window excluded","systemUiAnrDismissed" to systemDismissed,"webRoute" to if(mode=="appearance"||mode=="locale") "settings_detail" else route,"mode" to mode,"selection" to if(selected) "explicit-fixture" else "empty","density" to page.resources.displayMetrics.density,"fontScale" to page.resources.configuration.fontScale,"nightMode" to (page.resources.configuration.uiMode and 0x30),"timezone" to java.util.TimeZone.getDefault().id,"locale" to java.util.Locale.getDefault().toLanguageTag()))
                }
                uiAutomation.takeScreenshot().compress(Bitmap.CompressFormat.PNG,100,File(targetContext.filesDir,"device-$route.png").outputStream())
                onUi { page.finish() }
              } catch(e:Throwable) { captureFailures.add(mapOf("route" to route,"error" to e.toString())) }
              checkpoint(true)
            }
            checkpoint(false)
            result.putString("result","PASS: original APK calculations and chart fixture captured")
            finish(0,result)
        } catch(e:Throwable) {
            File(targetContext.filesDir,"parity-reference-error.txt").writeText(e.stackTraceToString())
            result.putString("error",e.stackTraceToString());finish(1,result)
        }
    }
}
