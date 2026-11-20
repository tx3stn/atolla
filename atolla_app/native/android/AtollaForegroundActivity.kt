package atolla.native.android

import android.app.Activity

internal fun resolveForegroundActivity(): Activity? {
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
			if (activity != null && !activity.isFinishing && !activity.isDestroyed) return activity
		}
		null
	} catch (_: Throwable) {
		null
	}
}
