package android.os

/** JVM platform adapter only; business algorithms retain their original source. */
object SystemClock {
    private val started = System.nanoTime()
    @JvmStatic fun elapsedRealtime(): Long = (System.nanoTime() - started) / 1_000_000L + 1L
}
