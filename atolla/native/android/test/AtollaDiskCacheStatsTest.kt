package atolla.native.android

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Test

class AtollaDiskCacheStatsTest {

	private val hashA = "a".repeat(64)
	private val hashB = "b".repeat(64)
	private val hashC = "c".repeat(64)

	private fun tempDirWithFiles(vararg files: Pair<String, Int>): File {
		val dir = Files.createTempDirectory("atolla-disk-cache-stats").toFile()
		for ((name, size) in files) {
			File(dir, name).writeBytes(ByteArray(size))
		}
		return dir
	}

	@Test
	fun `null directory yields an empty snapshot`() {
		val snapshot = AtollaDiskCacheStats.scan(null)
		assertEquals(0, snapshot.count)
		assertEquals(0L, snapshot.bytes)
		assertEquals(emptyMap<String, Int>(), snapshot.categoryCounts)
	}

	@Test
	fun `counts every file and sums their bytes in a single pass`() {
		val dir = tempDirWithFiles(
			"album_art_$hashA" to 10,
			"album_art_$hashB" to 20,
			"artist_image_$hashC" to 30,
		)
		val snapshot = AtollaDiskCacheStats.scan(dir)
		assertEquals(3, snapshot.count)
		assertEquals(60L, snapshot.bytes)
	}

	@Test
	fun `aggregates category counts by filename prefix`() {
		val dir = tempDirWithFiles(
			"album_art_$hashA" to 1,
			"album_art_$hashB" to 1,
			"artist_image_$hashC" to 1,
		)
		val snapshot = AtollaDiskCacheStats.scan(dir)
		assertEquals(mapOf("album_art" to 2, "artist_image" to 1), snapshot.categoryCounts)
	}

	@Test
	fun `malformed filenames count toward totals but not categories`() {
		val dir = tempDirWithFiles(
			"album_art_$hashA" to 5,
			"short" to 7,
		)
		val snapshot = AtollaDiskCacheStats.scan(dir)
		assertEquals(2, snapshot.count)
		assertEquals(12L, snapshot.bytes)
		assertEquals(mapOf("album_art" to 1), snapshot.categoryCounts)
	}
}
