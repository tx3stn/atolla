package atolla.native.android

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.view.View
import android.view.ViewTreeObserver

class AtollaApplication : Application() {

	companion object {
		val firstDrawGate = AtollaFirstDrawGate()
	}

	override fun onCreate() {
		super.onCreate()
		registerActivityLifecycleCallbacks(HoldFirstDrawUntilReleased())
	}

	private class HoldFirstDrawUntilReleased : ActivityLifecycleCallbacks {
		override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

		override fun onActivityDestroyed(activity: Activity) {}

		override fun onActivityPaused(activity: Activity) {}

		override fun onActivityPostCreated(activity: Activity, savedInstanceState: Bundle?) {
			firstDrawGate.hold()
			val content = activity.findViewById<View>(android.R.id.content)
			content.viewTreeObserver.addOnPreDrawListener(
				object : ViewTreeObserver.OnPreDrawListener {
					override fun onPreDraw(): Boolean {
						if (!firstDrawGate.isReleased) {
							return false
						}
						content.viewTreeObserver.removeOnPreDrawListener(this)
						return true
					}
				},
			)
		}

		override fun onActivityResumed(activity: Activity) {}

		override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

		override fun onActivityStarted(activity: Activity) {}

		override fun onActivityStopped(activity: Activity) {}
	}
}
