package android.util

/** Android logging adapter. Keep stdout exclusively for the JSON protocol. */
object Log {
    @JvmStatic fun i(tag:String, message:String):Int = 0
    @JvmStatic fun w(tag:String, message:String, cause:Throwable?=null):Int = 0
    @JvmStatic fun e(tag:String, message:String, cause:Throwable?=null):Int = 0
}
