package atolla.native.android

import android.util.Log
import com.snap.valdi.modules.RegisterValdiModule
import com.tx3stn.atolla.AtollaCacheImageLoader
import com.snap.modules.atolla.ImageLoaderBootstrapModule
import com.snap.modules.atolla.ImageLoaderBootstrapModuleFactory
import java.util.concurrent.Executors

@RegisterValdiModule
class AtollaImageLoaderBootstrapModuleFactory : ImageLoaderBootstrapModuleFactory() {
	companion object {
		private const val tag = "AtollaImageLoaderBootstrap"
		private val diskStatsExecutor = Executors.newSingleThreadExecutor()
	}

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

			override fun getAtollaImageLoaderDiskCacheEntryCount(): Double {
				return AtollaImageLoaderAutoBootstrap.getDiskCacheEntryCount().toDouble()
			}

			override fun getAtollaImageLoaderDiskCacheByteSize(): Double {
				return AtollaImageLoaderAutoBootstrap.getDiskCacheByteSize().toDouble()
			}

			override fun setAtollaImageLoaderDiskCacheMaxBytes(bytes: Double) {
				AtollaImageLoaderAutoBootstrap.setDiskCacheMaxBytes(bytes.toLong())
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

			override fun getAtollaImageLoaderDiskCacheCategoryCountsJson(): String {
				return AtollaImageLoaderAutoBootstrap.getDiskCategoryCountsJson()
			}

			override fun requestAtollaImageLoaderDiskCacheStats(callback: (Double, Double, String) -> Unit) {
				diskStatsExecutor.execute {
					try {
						val snapshot = AtollaImageLoaderAutoBootstrap.getDiskStatsSnapshot()
						val json = org.json.JSONObject()
						snapshot.categoryCounts.forEach { (key, value) -> json.put(key, value) }
						callback(snapshot.count.toDouble(), snapshot.bytes.toDouble(), json.toString())
					} catch (error: Throwable) {
						Log.e(tag, "Failed to compute disk cache stats", error)
					}
				}
			}

			override fun setAtollaImageCachedObserver(callback: (String, String) -> Unit) {
				AtollaCacheImageLoader.imageCachedObserver = callback
			}

			override fun setAtollaImageLoaderAuthToken(token: String) {
				AtollaCacheImageLoader.authToken = token.ifBlank { null }
			}
		}
	}
}
