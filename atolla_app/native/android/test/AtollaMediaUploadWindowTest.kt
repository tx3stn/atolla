package atolla.native.android

import atolla.native.android.AtollaMediaUploadWindow.Track
import org.junit.Assert.assertEquals
import org.junit.Test

class AtollaMediaUploadWindowTest {

	private val downloaded = mapOf("a" to "/downloads/a.flac")
	private val cached = mapOf("a" to "/cache/a.flac", "b" to "/cache/b.flac")

	private fun tracks(ids: List<String>, sendFiles: Boolean) =
		AtollaMediaUploadWindow.tracks(ids, sendFiles, { downloaded[it] }, { cached[it] })

	@Test
	fun `offline, a downloaded track is sent from its download rather than the cache`() {
		assertEquals(listOf(Track("a", "/downloads/a.flac")), tracks(listOf("a"), true))
	}

	@Test
	fun `offline, a track that isn't downloaded is sent from the cache`() {
		assertEquals(listOf(Track("b", "/cache/b.flac")), tracks(listOf("b"), true))
	}

	@Test
	fun `offline, a track the phone has no file for goes without a path`() {
		assertEquals(listOf(Track("c", null)), tracks(listOf("c"), true))
	}

	@Test
	fun `online, no track gets a path`() {
		assertEquals(listOf(Track("a", null), Track("b", null)), tracks(listOf("a", "b"), false))
	}
}
