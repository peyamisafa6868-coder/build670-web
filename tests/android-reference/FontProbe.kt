@file:JvmName("FontProbe")
import android.graphics.Paint
import android.graphics.Typeface
fun main(args:Array<String>) {
 for(style in intArrayOf(0,1)) for(size in intArrayOf(10,11,12,13,14,15,16,18,20,23,24,25,28)) {
  val paint=Paint();paint.typeface=Typeface.create("sans-serif",style);paint.textSize=size.toFloat();val f=paint.fontMetrics;val i=paint.fontMetricsInt
  System.out.println("{\"size\":"+size+",\"style\":"+style+",\"top\":"+f.top+",\"ascent\":"+f.ascent+",\"descent\":"+f.descent+",\"bottom\":"+f.bottom+",\"topInt\":"+i.top+",\"ascentInt\":"+i.ascent+",\"descentInt\":"+i.descent+",\"bottomInt\":"+i.bottom+"}")
 }
}
