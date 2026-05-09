package atolla.native.android

import android.util.Log
import com.tx3stn.atolla.AtollaCacheImageLoader
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

class AtollaImageLoaderBootstrapHandle internal constructor(
	private val executor: ScheduledExecutorService,
	private val task: ScheduledFuture<*>,
) {
	fun stop() {
		task.cancel(false)
		executor.shutdownNow()
	}
}

object AtollaImageLoaderAutoBootstrap {
	private const val tag = "AtollaLoaderBootstrap"
	private val registeredLoaders = Collections.synchronizedMap(WeakHashMap<Any, AtollaCacheImageLoader>())

	@JvmStatic
	fun registerForAllRuntimes(): Int {
		val runtimes = getAllRuntimes()
		var registered = 0
		for (runtime in runtimes) {
			val manager = runtimeToManager(runtime) ?: continue
			if (registeredLoaders.containsKey(manager)) {
				continue
			}
			val loader = AtollaImageLoaderRegistration.registerAtollaImageLoaders(manager)
			registeredLoaders[manager] = loader
			registered += 1
		}
		if (registered > 0) {
			Log.i(tag, "Registered loader on $registered runtime manager(s)")
		}
		return registered
	}

	@JvmStatic
	fun getCacheEntryCount(): Int {
		registerForAllRuntimes()
		return synchronized(registeredLoaders) {
			registeredLoaders.values.sumOf { it.getEntryCount() }
		}
	}

	@JvmStatic
	fun getCacheByteSize(): Long {
		registerForAllRuntimes()
		return synchronized(registeredLoaders) {
			registeredLoaders.values.sumOf { it.getTotalBytes() }
		}
	}

	@JvmStatic
	fun getDiskCacheEntryCount(): Int {
		registerForAllRuntimes()
		return synchronized(registeredLoaders) {
			registeredLoaders.values.sumOf { it.getDiskEntryCount() }
		}
	}

	@JvmStatic
	fun getDiskCacheByteSize(): Long {
		registerForAllRuntimes()
		return synchronized(registeredLoaders) {
			registeredLoaders.values.sumOf { it.getDiskByteSize() }
		}
	}

	@JvmStatic
	fun setDiskCacheMaxBytes(bytes: Long) {
		synchronized(registeredLoaders) {
			registeredLoaders.values.forEach { it.setDiskCacheMaxBytes(bytes) }
		}
	}

	@JvmStatic
	fun clearNativeCacheCategories(categories: List<String>) {
		registerForAllRuntimes()
		synchronized(registeredLoaders) {
			registeredLoaders.values.forEach { it.clearCategories(categories) }
		}
	}

	@JvmStatic
	fun getDiskCategoryCountsJson(): String {
		registerForAllRuntimes()
		return synchronized(registeredLoaders) {
			val merged = mutableMapOf<String, Int>()
			for (loader in registeredLoaders.values) {
				val json = loader.getDiskCategoryCountsJson()
				parseCategoryCountsJson(json).forEach { (k, v) ->
					merged[k] = (merged[k] ?: 0) + v
				}
			}
			val obj = org.json.JSONObject()
			merged.forEach { (k, v) -> obj.put(k, v) }
			obj.toString()
		}
	}

	private fun parseCategoryCountsJson(json: String): Map<String, Int> {
		val result = mutableMapOf<String, Int>()
		val inner = json.trim().removePrefix("{").removeSuffix("}")
		if (inner.isBlank()) return result
		for (pair in inner.split(",")) {
			val kv = pair.split(":")
			if (kv.size != 2) continue
			val key = kv[0].trim().removeSurrounding("\"")
			val value = kv[1].trim().toIntOrNull() ?: continue
			result[key] = value
		}
		return result
	}

	@JvmStatic
	fun extractPaletteFromCache(sourceUrl: String, category: String): String? {
		registerForAllRuntimes()
		return synchronized(registeredLoaders) {
			registeredLoaders.values.firstNotNullOfOrNull { loader ->
				loader.extractPalette(category, sourceUrl)
			}
		}
	}

	@JvmStatic
	fun startPolling(intervalMs: Long = 500): AtollaImageLoaderBootstrapHandle {
		val executor = Executors.newSingleThreadScheduledExecutor()
		val task = executor.scheduleWithFixedDelay(
			{
				try {
					registerForAllRuntimes()
				} catch (error: Throwable) {
					Log.e(tag, "Polling registration failed", error)
				}
			},
			0,
			intervalMs,
			TimeUnit.MILLISECONDS,
		)
		return AtollaImageLoaderBootstrapHandle(executor, task)
	}

	private fun getAllRuntimes(): List<Any> {
		return try {
			val clazz = Class.forName("com.snap.valdi.ValdiRuntimeManager")
			val method = clazz.methods.firstOrNull {
				it.name == "allRuntimes" && it.parameterTypes.isEmpty()
			} ?: return emptyList()

			val result = method.invoke(null)
			when (result) {
				is List<*> -> result.filterNotNull()
				is Array<*> -> result.filterNotNull()
				else -> emptyList()
			}
		} catch (_: Throwable) {
			emptyList()
		}
	}

	private fun runtimeToManager(runtime: Any): Any? {
		return try {
			val getter = runtime::class.java.methods.firstOrNull {
				it.name == "getManager" && it.parameterTypes.isEmpty()
			}
			getter?.invoke(runtime)
		} catch (_: Throwable) {
			null
		}
	}
}
