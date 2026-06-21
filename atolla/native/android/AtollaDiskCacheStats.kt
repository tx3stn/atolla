package atolla.native.android

import java.io.File

data class AtollaDiskStatsSnapshot(
	val count: Int,
	val bytes: Long,
	val categoryCounts: Map<String, Int>,
)

// pure disk-cache scanning logic, free of Android/Valdi deps so it can run on the host JVM
// under unit test (mirrors AtollaImageFallback / AtollaPlaybackGuards)
object AtollaDiskCacheStats {
	// filename format: {category}_{sha256_64_hex}. SHA-256 is always 64 hex chars, so a
	// well-formed entry's trailing 65 chars are the underscore plus the hash; the rest is the category
	private const val HASH_SUFFIX_LENGTH = 65

	fun scan(dir: File?): AtollaDiskStatsSnapshot {
		val files = try {
			dir?.listFiles()
		} catch (_: Throwable) {
			null
		} ?: return AtollaDiskStatsSnapshot(0, 0L, emptyMap())

		var count = 0
		var bytes = 0L
		val categoryCounts = mutableMapOf<String, Int>()
		for (file in files) {
			if (!file.isFile) continue
			count += 1
			bytes += file.length()
			val name = file.name
			if (name.length <= HASH_SUFFIX_LENGTH) continue
			val category = name.dropLast(HASH_SUFFIX_LENGTH)
			if (category.isNotEmpty()) {
				categoryCounts[category] = (categoryCounts[category] ?: 0) + 1
			}
		}
		return AtollaDiskStatsSnapshot(count, bytes, categoryCounts)
	}
}
