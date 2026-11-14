package androidx.core.util

import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** JVM storage boundary for original Android strategy history; no outcome data is synthesized. */
class AtomicFile(private val base:File) {
    private val staged=File(base.path+".new")
    fun startWrite():FileOutputStream { base.parentFile?.mkdirs();return FileOutputStream(staged) }
    fun finishWrite(stream:FileOutputStream) { stream.fd.sync();stream.close();Files.move(staged.toPath(),base.toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE) }
    fun failWrite(stream:FileOutputStream) { stream.close();staged.delete() }
}
