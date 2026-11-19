package atolla.native.android

import java.net.URI
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AtollaImageAuthTest {

	private val auth = AtollaImageAuth.from("MediaBrowser Token=\"tok\"", "https://jellyfin.example.com:8096")!!

	@Test
	fun `an image on the server carries the token`() {
		assertTrue(auth.appliesTo(URI("https://jellyfin.example.com:8096/Items/1/Images/Primary")))
	}

	@Test
	fun `an image on another host does not carry the token`() {
		assertFalse(auth.appliesTo(URI("https://coverartarchive.org/release-group/1/front")))
	}

	@Test
	fun `an image on another port of the same host does not carry the token`() {
		assertFalse(auth.appliesTo(URI("https://jellyfin.example.com:8686/MediaCover/1/cover.jpg")))
	}

	@Test
	fun `an image over http from an https server does not carry the token`() {
		assertFalse(auth.appliesTo(URI("http://jellyfin.example.com:8096/Items/1/Images/Primary")))
	}

	@Test
	fun `a default port matches the same port written out`() {
		val defaultPort = AtollaImageAuth.from("MediaBrowser Token=\"tok\"", "https://jellyfin.example.com")!!

		assertTrue(defaultPort.appliesTo(URI("https://jellyfin.example.com:443/Items/1/Images/Primary")))
	}

	@Test
	fun `a host that differs only in case carries the token`() {
		assertTrue(auth.appliesTo(URI("https://Jellyfin.Example.com:8096/Items/1/Images/Primary")))
	}

	@Test
	fun `no token means no auth`() {
		assertNull(AtollaImageAuth.from("", "https://jellyfin.example.com"))
	}

	@Test
	fun `a server address without a host means no auth`() {
		assertNull(AtollaImageAuth.from("MediaBrowser Token=\"tok\"", "jellyfin"))
	}
}
