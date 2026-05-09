package atolla.native.android

import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowInsetsController
import com.snap.modules.atolla.StatusBarNativeModule
import com.snap.modules.atolla.StatusBarNativeModuleFactory
import com.snap.valdi.modules.RegisterValdiModule

private const val TAG = "AtollaStatusBar"

@RegisterValdiModule
class AtollaStatusBarNativeModuleFactory : StatusBarNativeModuleFactory() {

	private val mainHandler = Handler(Looper.getMainLooper())

	override fun onLoadModule(): StatusBarNativeModule {
		return object : StatusBarNativeModule {
			override fun setAtollaStatusBarColor(colorHex: String) {
				mainHandler.post {
					applyStatusBarColor(colorHex)
				}
			}
		}
	}

	private fun applyStatusBarColor(colorHex: String) {
		val activity = resolveForegroundActivity() ?: return
		val window = activity.window ?: return
		try {
			val color = Color.parseColor(colorHex)
			window.statusBarColor = color

			val luminance = computeLuminance(color)
			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
				val controller = window.insetsController ?: return
				controller.setSystemBarsAppearance(
					if (luminance < 0.5) 0 else WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
					WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
				)
			} else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
				@Suppress("DEPRECATION")
				val flags = window.decorView.systemUiVisibility
				@Suppress("DEPRECATION")
				window.decorView.systemUiVisibility =
					if (luminance < 0.5) flags and android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
					else flags or android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
			}
		} catch (e: Throwable) {
			Log.e(TAG, "Failed to set status bar color: $colorHex", e)
		}
	}

	private fun resolveForegroundActivity(): Activity? {
		return try {
			val activityThreadClass = Class.forName("android.app.ActivityThread")
			val activityThread = activityThreadClass.getMethod("currentActivityThread").invoke(null)
				?: return null
			val activitiesField = activityThreadClass.getDeclaredField("mActivities")
			activitiesField.isAccessible = true
			val activities = activitiesField.get(activityThread) as? Map<*, *> ?: return null
			for (record in activities.values) {
				record ?: continue
				val cls = record.javaClass
				val pausedField = cls.getDeclaredField("paused")
				pausedField.isAccessible = true
				if (pausedField.getBoolean(record)) continue
				val activityField = cls.getDeclaredField("activity")
				activityField.isAccessible = true
				val activity = activityField.get(record) as? Activity
				if (activity != null) return activity
			}
			null
		} catch (_: Throwable) {
			null
		}
	}

	private fun computeLuminance(color: Int): Double {
		val r = Color.red(color) / 255.0
		val g = Color.green(color) / 255.0
		val b = Color.blue(color) / 255.0
		return r * 0.299 + g * 0.587 + b * 0.114
	}
}
