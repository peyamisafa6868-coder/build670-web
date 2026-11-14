package tr.borsatakip.v5.worker

/** Reference JVM has no Android WorkManager; web monitoring is explicit and foreground only. */
object ViopPositionMonitorWorker {
    fun enqueueNow(context:android.content.Context) {}
}
