package atolla.native.android

// Pure, framework-free fallback logic shared by the image loader. Extracted so it can be unit
// tested on the JVM without the Android framework (Bitmap/LruCache/disk), mirroring
// AtollaPlaybackGuards.
object AtollaImageFallback {
	// When a full-size variant isn't cached we serve its smaller thumbnail so something displays
	// (the full variant keeps downloading in the background and swaps in on the next render). The
	// thumb sibling of an eligible full variant is simply the category + "_thumb"; categories
	// without a smaller variant (thumbs themselves, logos, genre art, blurred) have no fallback.
	fun thumbFallbackCategory(category: String): String? =
		when (category) {
			"album_art" -> "album_art_thumb"
			"artist_image" -> "artist_image_thumb"
			"playlist_image" -> "playlist_image_thumb"
			else -> null
		}

	// Cache keys to try, in order, when generating the blurred backdrop. The blur is downsampled to
	// 200x200 before it is stored, so the 384px thumb is more than enough and is preferred over the
	// full original — this lets the backdrop render offline whenever the thumb is downloaded, even
	// if the full album_art is still missing. Only when neither is cached should the caller fetch.
	fun blurSourceKeys(sourceUrl: String): List<String> =
		listOf("album_art_thumb:$sourceUrl", "album_art:$sourceUrl")
}
