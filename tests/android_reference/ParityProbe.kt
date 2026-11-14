import tr.borsatakip.v5.model.Candle
import tr.borsatakip.v5.analysis.*
import java.io.File

fun num(v:Double?) = if(v==null || !v.isFinite()) "null" else v.toString()
fun series(name:String, values:List<Double?>) = "\"$name\":"+values.joinToString(prefix="[",postfix="]") { num(it) }
fun main(args:Array<String>) {
    val groups=File(args[0]).readLines().drop(1).filter { it.isNotBlank() }.map { it.split(',') }.groupBy { it[0] }
    val results=groups.map { (name,lines) ->
        val bars=lines.map { x -> Candle(x[1].toLong(),x[2].toDouble(),x[3].toDouble(),x[4].toDouble(),x[5].toDouble(),x[6].toDouble()) }
        val s=ChartIndicators.calculate(bars,name=="intraday")
        val e=ExtendedStockEvidence.indicators(bars,name=="intraday")
        val l=ExtendedStockEvidence.ladder(bars,bars.last().close)
        val readable=ReadableStockAnalysis.analyze(bars,if(name=="intraday") ChartTimeframe.FIVE_MIN else ChartTimeframe.ONE_DAY)
        val arrays=listOf(series("ema9",s.ema9),series("ema21",s.ema21),series("sma50",s.sma50),series("sma200",s.sma200),series("vwap",s.vwap),series("upper",s.upper),series("lower",s.lower),series("rsi",s.rsi),series("macd",s.macd),series("signal",s.signal),series("histogram",s.histogram),series("atr",s.atr),series("volume20",s.volume20))
        val extra="\"extended\":{\"stochastic14\":${num(e.stochastic14)},\"cci20\":${num(e.cci20)},\"adx14\":${num(e.adx14)},\"momentum10Pct\":${num(e.momentum10Pct)}}"
        val ladder="\"ladder\":{\"resistances\":${l.resistances},\"supports\":${l.supports}}"
        val read=if(readable==null) "null" else "{\"direction\":\"${readable.direction}\",\"examinedPrice\":${num(readable.examinedPrice)},\"support\":${num(readable.support)},\"resistance\":${num(readable.resistance)},\"rsi\":${num(readable.rsi)},\"volumeRatio\":${num(readable.volumeRatio)},\"atrPercent\":${num(readable.atrPercent)},\"sampleTime\":${readable.sampleTime}}"
        "\"$name\":{\"series\":{${arrays.joinToString(",")}},$extra,$ladder,\"readable\":$read}"
    }
    println(results.joinToString(prefix="{",postfix="}",separator=","))
}
