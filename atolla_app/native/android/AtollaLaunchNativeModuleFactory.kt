package atolla.native.android

import android.os.Handler
import android.os.Looper
import com.snap.modules.atolla_app.LaunchNativeModule
import com.snap.modules.atolla_app.LaunchNativeModuleFactory
import com.snap.valdi.modules.RegisterValdiModule

@RegisterValdiModule
class AtollaLaunchNativeModuleFactory : LaunchNativeModuleFactory() {

	private val mainHandler = Handler(Looper.getMainLooper())

	override fun onLoadModule(): LaunchNativeModule {
		return object : LaunchNativeModule {
			override fun reportAtollaFullyDrawn() {
				mainHandler.post {
					AtollaApplication.firstDrawGate.release()
					resolveForegroundActivity()?.reportFullyDrawn()
				}
			}
		}
	}
}
