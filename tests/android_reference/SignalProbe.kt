import tr.borsatakip.v5.analysis.v531.SignalDecisionEngine
import java.io.File
fun main(args:Array<String>){
 val rows=File(args[0]).readLines().drop(1).filter{it.isNotBlank()}.map{it.split(',')}
 val result=rows.map{x->
  val r=SignalDecisionEngine.evaluate(x[0].toInt(),x[1].toInt(),x[2].toInt(),x[3].toInt(),x[4].takeIf{it!="null"}?.toInt())
  val reasons=r.reasonCodes.joinToString(prefix="[",postfix="]"){"\"$it\""}
  "{\"longScore\":${r.longScore},\"shortScore\":${r.shortScore},\"rawScore\":${r.rawScore},\"finalScore\":${r.finalScore},\"dominantDirection\":\"${r.dominantDirection}\",\"decision\":\"${r.decision}\",\"conflictPenalty\":${r.conflictPenalty},\"reasonCodes\":$reasons}"
 }
 println(result.joinToString(prefix="[",postfix="]"))
}
