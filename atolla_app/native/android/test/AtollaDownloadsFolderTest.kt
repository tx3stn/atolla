package atolla.native.android

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AtollaDownloadsFolderTest {

	private val root = Files.createTempDirectory("atolla-downloads-folder").toFile()
	private val legacy = File(root, "atolla-downloaded-track-cache")
	private val target = File(root, "atolla/downloads")

	private fun writeFile(dir: File, name: String, text: String) {
		dir.mkdirs()
		File(dir, name).writeText(text)
	}

	@Test
	fun `moves the legacy folder and its files into place`() {
		writeFile(legacy, "track-1.flac", "audio")

		assertTrue(AtollaDownloadsFolder.moveLegacy(legacy, target))

		assertFalse(legacy.exists())
		assertEquals("audio", File(target, "track-1.flac").readText())
	}

	@Test
	fun `does nothing when there is no legacy folder`() {
		assertTrue(AtollaDownloadsFolder.moveLegacy(legacy, target))

		assertFalse(target.exists())
	}

	@Test
	fun `keeps both folders and reports the legacy one when the new folder exists`() {
		writeFile(legacy, "track-1.flac", "old")
		writeFile(target, "track-2.flac", "new")

		assertFalse(AtollaDownloadsFolder.moveLegacy(legacy, target))

		assertEquals("old", File(legacy, "track-1.flac").readText())
		assertEquals(listOf("track-2.flac"), target.list()?.toList())
	}
}
