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
		val identity = "album-1:abc"
		assertEquals(
			listOf("album_art_thumb:album-1:abc", "album_art:album-1:abc"),
			AtollaImageFallback.blurSourceKeys(identity),
		)
	}

	// --- imageCacheIdentity ---

	@Test
	fun `derives entity id and tag from a Jellyfin image url`() {
		assertEquals(
			"album-1:abc",
			AtollaImageFallback.imageCacheIdentity(
				"https://media.example.com/Items/album-1/Images/Primary?tag=abc",
			),
		)
	}

	@Test
	fun `derives artist id from a logo url`() {
		assertEquals(
			"artist-9:def",
			AtollaImageFallback.imageCacheIdentity(
				"https://media.example.com/Items/artist-9/Images/Logo?tag=def",
			),
		)
	}

	@Test
	fun `omits the tag segment when there is no tag`() {
		assertEquals(
			"genre-3",
			AtollaImageFallback.imageCacheIdentity(
				"https://media.example.com/Items/genre-3/Images/Primary",
			),
		)
	}

	@Test
	fun `ignores thumbnail sizing params so full and thumb share the identity`() {
		assertEquals(
			"album-1:abc",
			AtollaImageFallback.imageCacheIdentity(
				"https://media.example.com/Items/album-1/Images/Primary?tag=abc&maxWidth=384&quality=85",
			),
		)
	}

	@Test
	fun `falls back to the api_key-stripped url for a non-Jellyfin url`() {
		assertEquals(
			"https://cdn.example.com/cover.jpg?x=1",
			AtollaImageFallback.imageCacheIdentity(
				"https://cdn.example.com/cover.jpg?api_key=SECRET&x=1",
			),
		)
	}

	@Test
	fun `falls back to the url unchanged when it has no query`() {
		assertEquals(
			"https://cdn.example.com/cover.jpg",
			AtollaImageFallback.imageCacheIdentity("https://cdn.example.com/cover.jpg"),
		)
	}
}
