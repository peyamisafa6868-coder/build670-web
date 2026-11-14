package android.content

/** In-memory reference adapter. No Android background execution is emulated. */
class Context {
    companion object { const val MODE_PRIVATE = 0 }
    val applicationContext: Context get() = this
    val filesDir: java.io.File by lazy { java.nio.file.Files.createTempDirectory("bist-reference-").toFile() }
    private val stores=mutableMapOf<String,SharedPreferences>()
    fun getSharedPreferences(name:String,mode:Int):SharedPreferences = stores.getOrPut(name){SharedPreferences()}
}
class SharedPreferences {
    private val values=mutableMapOf<String,String?>()
    fun getString(key:String,default:String?):String? = values.getOrDefault(key,default)
    fun edit():Editor = Editor()
    inner class Editor {
        private val staged=mutableMapOf<String,String?>()
        fun putString(key:String,value:String?):Editor { staged[key]=value;return this }
        fun commit():Boolean { values.putAll(staged);return true }
        fun apply() { commit() }
    }
}
