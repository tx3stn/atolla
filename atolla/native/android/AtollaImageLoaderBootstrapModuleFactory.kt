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

			override fun getAtollaImageLoaderCacheEntryCount(): Double {
				return AtollaImageLoaderAutoBootstrap.getCacheEntryCount().toDouble()
			}

			override fun getAtollaImageLoaderCacheByteSize(): Double {
				return AtollaImageLoaderAutoBootstrap.getCacheByteSize().toDouble()
			}

			override fun clearAtollaNativeCacheCategories(categories: List<String>) {
				AtollaImageLoaderAutoBootstrap.clearNativeCacheCategories(categories)
			}

			override fun extractAtollaPaletteFromCache(url: String, category: String): String {
				return AtollaImageLoaderAutoBootstrap.extractPaletteFromCache(url, category) ?: ""
			}

			override fun preloadAtollaImages(urls: List<String>, category: String) {
				val loader = AtollaCacheImageLoader.sharedInstance ?: return
				for (url in urls) {
					loader.preload(url, category)
				}
			}

			override fun setAtollaImageCachedObserver(callback: (String, String) -> Unit) {
				AtollaCacheImageLoader.imageCachedObserver = callback
			}
		}
	}
}
