package atolla.native.android

// pure selection logic for the streaming track cache's sliding-window prune, extracted so it
// can be unit-tested without the filesystem or an Android context (mirrors AtollaPlaybackGuards)
object AtollaTrackCacheRetention {
	// a cache file reduced to what pruning needs: its filename and last-modified time
	data class Entry(val name: String, val lastModifiedMs: Long)

	// a file belongs to a retained track when its name is "$key.$ext"; matches how the cache
	// names files and how resolveExistingTrackFile locates them
	fun isRetained(fileName: String, retainedKeys: Set<String>): Boolean =
		retainedKeys.any { fileName.startsWith("$it.") }

	// selects filenames to evict: oldest-first among non-retained files only, capped at the
	// overflow beyond maxTracks. retained files are never returned even when that leaves the
	// cache above max (transient; the JS window is bounded by maxTracks so it converges)
	fun selectPruneVictims(
		files: List<Entry>,
		retainedKeys: Set<String>,
		maxTracks: Int,
	): List<String> {
		if (maxTracks <= 0) {
			return emptyList()
		}

		val overflow = files.size - maxTracks
		if (overflow <= 0) {
			return emptyList()
		}

		val evictable = files.filter { !isRetained(it.name, retainedKeys) }
		val byLru = evictable.sortedWith(
			compareBy<Entry> { it.lastModifiedMs }
				.thenBy { it.name },
		)

		return byLru.take(minOf(overflow, evictable.size)).map { it.name }
	}
}
