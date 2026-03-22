package atolla.native.android

import com.snap.valdi.modules.RegisterValdiModule
import com.snap.modules.atolla.ImageLoaderBootstrapModule
import com.snap.modules.atolla.ImageLoaderBootstrapModuleFactory

@RegisterValdiModule
class AtollaImageLoaderBootstrapModuleFactory : ImageLoaderBootstrapModuleFactory() {
	override fun onLoadModule(): ImageLoaderBootstrapModule {
		return object : ImageLoaderBootstrapModule {
			override fun ensureAtollaImageLoaderBootstrap() {
				AtollaImageLoaderAutoBootstrap.registerForAllRuntimes()
			}
		}
	}
}
