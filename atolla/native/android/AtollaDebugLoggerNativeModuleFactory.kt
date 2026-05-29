package atolla.native.android

import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.util.Log
import androidx.core.content.FileProvider
import com.snap.modules.atolla.DebugLoggerNativeModule
import com.snap.modules.atolla.DebugLoggerNativeModuleFactory
import com.snap.valdi.modules.RegisterValdiModule
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

private const val TAG = "AtollaDebugLogger"
private const val LOG_FILE_NAME = "atolla-debug.log"
private const val MAX_LOG_BYTES = 2 * 1024 * 1024L

@RegisterValdiModule
class AtollaDebugLoggerNativeModuleFactory : DebugLoggerNativeModuleFactory() {

    private var crashHandlerInstalled = false

    override fun onLoadModule(): DebugLoggerNativeModule {
        installCrashHandler()
        return object : DebugLoggerNativeModule {
            override fun getAtollaDebugLogFilePath(): String {
                return resolveLogFile()?.absolutePath ?: ""
            }

            override fun writeAtollaDebugLog(entry: String) {
                val file = resolveLogFile() ?: return
                try {
                    if (file.length() > MAX_LOG_BYTES) {
                        rotateLog(file)
                    }
                    file.appendText("$entry\n")
                } catch (e: Throwable) {
                    Log.e(TAG, "Failed to write debug log", e)
                }
            }

            override fun clearAtollaDebugLog() {
                try {
                    resolveLogFile()?.writeText("")
                } catch (e: Throwable) {
                    Log.e(TAG, "Failed to clear debug log", e)
                }
            }

            override fun exportAtollaDebugLog(): String {
                val src = resolveLogFile() ?: return ""
                if (!src.exists()) return ""
                return try {
                    val downloads = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS
                    )
                    downloads.mkdirs()
                    val dest = File(downloads, "atolla-debug.log")
                    src.copyTo(dest, overwrite = true)
                    dest.absolutePath
                } catch (e: Throwable) {
                    Log.e(TAG, "Failed to export debug log", e)
                    ""
                }
            }

            override fun shareAtollaDebugLog() {
                val src = resolveLogFile() ?: return
                if (!src.exists()) return
                try {
                    val activityThreadClass = Class.forName("android.app.ActivityThread")
                    val currentApplication = activityThreadClass.getMethod("currentApplication").invoke(null)
                    val app = currentApplication as? android.app.Application ?: return
                    val uri: Uri = FileProvider.getUriForFile(
                        app.applicationContext,
                        "${app.packageName}.fileprovider",
                        src
                    )
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    app.applicationContext.startActivity(Intent.createChooser(intent, "Share debug log").apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    })
                } catch (e: Throwable) {
                    Log.e(TAG, "Failed to share debug log", e)
                }
            }

            override fun exportAtollaTextFile(fileName: String, contents: String): String {
                return try {
                    val downloads = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS
                    )
                    downloads.mkdirs()
                    val dest = File(downloads, safeFileName(fileName))
                    dest.writeText(contents)
                    dest.absolutePath
                } catch (e: Throwable) {
                    Log.e(TAG, "Failed to export text file", e)
                    ""
                }
            }

            override fun shareAtollaTextFile(fileName: String, contents: String) {
                try {
                    val app = resolveApp() ?: return
                    val safeName = safeFileName(fileName)
                    val dir = File(app.applicationContext.cacheDir, "atolla-debug")
                    dir.mkdirs()
                    val file = File(dir, safeName)
                    file.writeText(contents)
                    val uri: Uri = FileProvider.getUriForFile(
                        app.applicationContext,
                        "${app.packageName}.fileprovider",
                        file
                    )
                    val mime = if (safeName.endsWith(".json")) "application/json" else "text/plain"
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = mime
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    app.applicationContext.startActivity(
                        Intent.createChooser(intent, "Share $safeName").apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                    )
                } catch (e: Throwable) {
                    Log.e(TAG, "Failed to share text file", e)
                }
            }
        }
    }

    // Records a managed (JVM) uncaught exception into the debug log before the
    // process dies, then chains to the previous handler so the OS still reports
    // it. A native SIGSEGV bypasses this entirely — that is surfaced by the JS
    // unclean-shutdown sentinel instead.
    private fun installCrashHandler() {
        if (crashHandlerInstalled) return
        crashHandlerInstalled = true
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }.format(Date())
                appendCrashLine(
                    "$timestamp [CRASH] uncaught on thread ${thread.name}\n" +
                        Log.getStackTraceString(throwable),
                )
            } catch (e: Throwable) {
                Log.e(TAG, "Failed to record crash", e)
            }
            previous?.uncaughtException(thread, throwable)
        }
    }

    private fun appendCrashLine(entry: String) {
        val file = resolveLogFile() ?: return
        try {
            if (file.length() > MAX_LOG_BYTES) {
                rotateLog(file)
            }
            file.appendText("$entry\n")
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to write crash entry", e)
        }
    }

    private fun resolveApp(): android.app.Application? {
        return try {
            val activityThreadClass = Class.forName("android.app.ActivityThread")
            val currentApplication = activityThreadClass.getMethod("currentApplication").invoke(null)
            currentApplication as? android.app.Application
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to resolve application", e)
            null
        }
    }

    private fun safeFileName(fileName: String): String {
        val name = File(fileName).name
        return if (name.isBlank()) "atolla-export.txt" else name
    }

    private fun resolveLogFile(): File? {
        return try {
            val activityThreadClass = Class.forName("android.app.ActivityThread")
            val currentApplication = activityThreadClass.getMethod("currentApplication").invoke(null)
            val app = currentApplication as? android.app.Application ?: return null
            val cacheDir = app.applicationContext.cacheDir
            val logDir = File(cacheDir, "atolla-debug")
            logDir.mkdirs()
            File(logDir, LOG_FILE_NAME)
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to resolve log file path", e)
            null
        }
    }

    private fun rotateLog(file: File) {
        val backup = File(file.parent, "$LOG_FILE_NAME.bak")
        backup.delete()
        file.renameTo(backup)
    }
}
