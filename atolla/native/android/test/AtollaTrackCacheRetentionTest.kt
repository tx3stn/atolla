package atolla.native.android

import atolla.native.android.AtollaTrackCacheRetention.Entry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AtollaTrackCacheRetentionTest {

	private fun entry(name: String, mtime: Long) = Entry(name, mtime)

	@Test
	fun `a file is retained when a key matches its name prefix`() {
		assertTrue(AtollaTrackCacheRetention.isRetained("track-7.mp3", setOf("track-7")))
	}

	@Test
	fun `a key does not match a differently-named file that only shares a prefix`() {
		assertFalse(AtollaTrackCacheRetention.isRetained("track-70.mp3", setOf("track-7")))
	}

	@Test
	fun `nothing is evicted when the cache is at or below max`() {
		val files = listOf(entry("a.mp3", 1), entry("b.mp3", 2))

		assertEquals(emptyList<String>(), AtollaTrackCacheRetention.selectPruneVictims(files, emptySet(), 2))
	}

	@Test
	fun `evicts the oldest non-retained files first`() {
		val files = listOf(
			entry("old.mp3", 1),
			entry("mid.mp3", 2),
			entry("new.mp3", 3),
		)

		assertEquals(
			listOf("old.mp3"),
			AtollaTrackCacheRetention.selectPruneVictims(files, emptySet(), 2),
		)
	}

	@Test
	fun `never evicts retained files even when they are the oldest`() {
		val files = listOf(
			entry("retained.mp3", 1),
			entry("mid.mp3", 2),
			entry("new.mp3", 3),
		)

		assertEquals(
			listOf("mid.mp3"),
			AtollaTrackCacheRetention.selectPruneVictims(files, setOf("retained"), 2),
		)
	}

	@Test
	fun `holds the cache above max when retained files alone exceed it`() {
		val files = listOf(
			entry("r1.mp3", 1),
			entry("r2.mp3", 2),
			entry("r3.mp3", 3),
		)

		assertEquals(
			emptyList<String>(),
			AtollaTrackCacheRetention.selectPruneVictims(files, setOf("r1", "r2", "r3"), 1),
		)
	}

	@Test
	fun `evicts only the overflow, oldest-first, among non-retained files`() {
		val files = listOf(
			entry("retained.mp3", 1),
			entry("old.mp3", 2),
			entry("mid.mp3", 3),
			entry("new.mp3", 4),
		)

		// max=2 with 4 files => overflow 2; retained is protected, so the two oldest
		// non-retained (old, mid) are evicted, new survives
		assertEquals(
			listOf("old.mp3", "mid.mp3"),
			AtollaTrackCacheRetention.selectPruneVictims(files, setOf("retained"), 2),
		)
	}

	@Test
	fun `breaks lastModified ties by name for a deterministic prune`() {
		val files = listOf(
			entry("b.mp3", 5),
			entry("a.mp3", 5),
			entry("c.mp3", 9),
		)

		assertEquals(
			listOf("a.mp3"),
			AtollaTrackCacheRetention.selectPruneVictims(files, emptySet(), 2),
		)
	}

	@Test
	fun `a non-positive max evicts nothing`() {
		val files = listOf(entry("a.mp3", 1), entry("b.mp3", 2))

		assertEquals(emptyList<String>(), AtollaTrackCacheRetention.selectPruneVictims(files, emptySet(), 0))
	}
}
