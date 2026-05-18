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

private const val TAG = "AtollaDebugLogger"
private const val LOG_FILE_NAME = "atolla-debug.log"
private const val MAX_LOG_BYTES = 2 * 1024 * 1024L

@RegisterValdiModule
class AtollaDebugLoggerNativeModuleFactory : DebugLoggerNativeModuleFactory() {

    override fun onLoadModule(): DebugLoggerNativeModule {
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
        }
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
