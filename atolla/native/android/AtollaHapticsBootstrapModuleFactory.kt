package atolla.native.android

import com.snap.modules.atolla.HapticsBootstrapModule
import com.snap.modules.atolla.HapticsBootstrapModuleFactory
import com.snap.valdi.modules.RegisterValdiModule

@RegisterValdiModule
class AtollaHapticsBootstrapModuleFactory : HapticsBootstrapModuleFactory() {
	override fun onLoadModule(): HapticsBootstrapModule {
		return object : HapticsBootstrapModule {
			override fun ensureAtollaHapticsBootstrap() {
				AtollaHapticsBootstrap.setupForAllRuntimes()
			}
		}
	}
}
