package atolla.native.android

// pure, framework-free fallback logic shared by the image loader. extracted so it can be unit
// tested on the JVM without the Android framework (Bitmap/LruCache/disk), mirroring
// AtollaPlaybackGuards
object AtollaImageFallback {
	// when a full-size variant isn't cached we serve its smaller thumbnail so something displays
	// (the full variant keeps downloading and swaps in on the next render). the thumb sibling of
	// an eligible full variant is the category + "_thumb"; categories without a smaller variant
	// (thumbs themselves, logos, genre art, blurred) have no fallback
	fun thumbFallbackCategory(category: String): String? =
		when (category) {
			"album_art" -> "album_art_thumb"
			"artist_image" -> "artist_image_thumb"
			"playlist_image" -> "playlist_image_thumb"
			else -> null
		}

	// cache keys to try, in order, when generating the blurred backdrop. the blur is downsampled
	// to 200x200 before storing, so the 384px thumb is plenty and is preferred over the full
	// original; this lets the backdrop render offline whenever the thumb is downloaded, even if
	// the full album_art is still missing. only when neither is cached should the caller fetch
	fun blurSourceKeys(identity: String): List<String> =
		listOf("album_art_thumb:$identity", "album_art:$identity")

	// stable, token-free cache identity for a Jellyfin image URL. every image URL carries the
	// entity id in its path (/Items/{id}/Images/{type}) — albumId for album_art, artistId for
	// artist images, etc. — so the cache keys on "<id>:<tag>" (the tag busts the cache when the
	// art is replaced on the server) rather than the whole URL. non-Jellyfin URLs fall back to the
	// URL with api_key stripped so a token can never reach a cache key.
	private val itemImageIdRegex = Regex("/Items/([^/]+)/Images/")

	fun imageCacheIdentity(url: String): String {
		val id = itemImageIdRegex.find(url)?.groupValues?.get(1)
		if (id.isNullOrBlank()) {
			return stripQueryParam(url, "api_key")
		}
		val tag = queryParam(url, "tag")
		return if (tag.isNullOrBlank()) id else "$id:$tag"
	}

	private fun queryParam(url: String, name: String): String? {
		val query = url.substringAfter('?', "")
		if (query.isEmpty()) return null
		for (pair in query.split('&')) {
			val eq = pair.indexOf('=')
			val key = if (eq < 0) pair else pair.substring(0, eq)
			if (key == name) return if (eq < 0) "" else pair.substring(eq + 1)
		}
		return null
	}

	private fun stripQueryParam(url: String, name: String): String {
		val queryIndex = url.indexOf('?')
		if (queryIndex < 0) return url
		val base = url.substring(0, queryIndex)
		val kept = url.substring(queryIndex + 1)
			.split('&')
			.filter { it.isNotEmpty() && it.substringBefore('=') != name }
		return if (kept.isEmpty()) base else "$base?${kept.joinToString("&")}"
	}
}
