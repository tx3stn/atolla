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
	fun blurSourceKeys(sourceUrl: String): List<String> =
		listOf("album_art_thumb:$sourceUrl", "album_art:$sourceUrl")
}
