package atolla.native.android

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.util.Log
import com.snap.modules.atolla.NetworkReachabilityNativeModule
import com.snap.modules.atolla.NetworkReachabilityNativeModuleFactory
import com.snap.valdi.modules.RegisterValdiModule

private const val TAG = "AtollaNetworkReachability"

// Real device reachability via ConnectivityManager. The default-network callback pushes changes
// (so parked downloads can resume) while getNetworkCapabilities backs the sync getter.
// NET_CAPABILITY_VALIDATED means the network actually reaches the internet, not just "connected".
@RegisterValdiModule
class AtollaNetworkReachabilityNativeModuleFactory : NetworkReachabilityNativeModuleFactory() {

	override fun onLoadModule(): NetworkReachabilityNativeModule {
		val connectivityManager =
			resolveApplicationContext()?.getSystemService(Context.CONNECTIVITY_SERVICE)
				as? ConnectivityManager

		return object : NetworkReachabilityNativeModule {
			private var observer: (() -> Unit)? = null
			private var callback: ConnectivityManager.NetworkCallback? = null

			override fun getAtollaNetworkStatus(): String {
				val capabilities =
					connectivityManager?.activeNetwork?.let {
						connectivityManager.getNetworkCapabilities(it)
					}
				return statusJson(capabilities)
			}

			override fun setAtollaNetworkStatusObserver(onChange: () -> Unit) {
				observer = onChange
				val manager = connectivityManager ?: return
				if (callback != null) return
				val networkCallback =
					object : ConnectivityManager.NetworkCallback() {
						override fun onAvailable(network: Network) {
							observer?.invoke()
						}

						override fun onLost(network: Network) {
							observer?.invoke()
						}

						override fun onUnavailable() {
							observer?.invoke()
						}

						override fun onCapabilitiesChanged(
							network: Network,
							networkCapabilities: NetworkCapabilities,
						) {
							observer?.invoke()
						}
					}
				callback = networkCallback
				try {
					manager.registerDefaultNetworkCallback(networkCallback)
				} catch (error: Throwable) {
					Log.e(TAG, "Unable to register network callback", error)
					callback = null
				}
			}

			override fun clearAtollaNetworkStatusObserver() {
				observer = null
				val manager = connectivityManager
				val registered = callback
				callback = null
				if (manager != null && registered != null) {
					try {
						manager.unregisterNetworkCallback(registered)
					} catch (_: Throwable) {}
				}
			}
		}
	}

	private fun statusJson(capabilities: NetworkCapabilities?): String {
		val reachable =
			capabilities != null &&
				capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
		val transport =
			when {
				capabilities == null || !reachable -> "none"
				capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
				capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
				capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "wifi"
				else -> "none"
			}
		return "{\"reachable\":$reachable,\"transport\":\"$transport\"}"
	}

	private fun resolveApplicationContext(): Context? {
		return try {
			val activityThreadClass = Class.forName("android.app.ActivityThread")
			val currentApplication =
				activityThreadClass.getMethod("currentApplication").invoke(null)
			val app = currentApplication as? android.app.Application ?: return null
			app.applicationContext
		} catch (error: Throwable) {
			Log.e(TAG, "Unable to resolve application context", error)
			null
		}
	}
}
