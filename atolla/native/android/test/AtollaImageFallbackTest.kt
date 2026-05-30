package atolla.native.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AtollaImageFallbackTest {

	// --- thumbFallbackCategory ---

	@Test
	fun `album art falls back to its thumb`() {
		assertEquals("album_art_thumb", AtollaImageFallback.thumbFallbackCategory("album_art"))
	}

	@Test
	fun `artist image falls back to its thumb`() {
		assertEquals("artist_image_thumb", AtollaImageFallback.thumbFallbackCategory("artist_image"))
	}

	@Test
	fun `playlist image falls back to its thumb`() {
		assertEquals(
			"playlist_image_thumb",
			AtollaImageFallback.thumbFallbackCategory("playlist_image"),
		)
	}

	@Test
	fun `thumb categories have no further fallback`() {
		assertNull(AtollaImageFallback.thumbFallbackCategory("album_art_thumb"))
		assertNull(AtollaImageFallback.thumbFallbackCategory("artist_image_thumb"))
		assertNull(AtollaImageFallback.thumbFallbackCategory("playlist_image_thumb"))
	}

	@Test
	fun `logo genre and blurred categories have no fallback`() {
		assertNull(AtollaImageFallback.thumbFallbackCategory("artist_logo"))
		assertNull(AtollaImageFallback.thumbFallbackCategory("genre_art"))
		assertNull(AtollaImageFallback.thumbFallbackCategory("album_art_blurred"))
	}

	@Test
	fun `unknown category has no fallback`() {
		assertNull(AtollaImageFallback.thumbFallbackCategory("not_a_category"))
		assertNull(AtollaImageFallback.thumbFallbackCategory(""))
	}

	// --- blurSourceKeys ---

	@Test
	fun `blur source prefers the thumb then the full original`() {
		val url = "https://media.example.com/Items/1/Images/Primary?tag=abc"
		assertEquals(
			listOf("album_art_thumb:$url", "album_art:$url"),
			AtollaImageFallback.blurSourceKeys(url),
		)
	}
}
