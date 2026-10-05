package atolla.native.android

import org.junit.Assert.assertEquals
import org.junit.Test

class AtollaDownloadGuardsTest {

	@Test
	fun `a rejected token is reported back to js`() {
		assertEquals("atolla:unauthorized", AtollaDownloadGuards.failureResultForStatus(401, carriedAuth = true))
	}

	@Test
	fun `a 401 from a request that did not carry the token is not a rejected token`() {
		assertEquals("", AtollaDownloadGuards.failureResultForStatus(401, carriedAuth = false))
	}

	@Test
	fun `a forbidden response is not a rejected token`() {
		assertEquals("", AtollaDownloadGuards.failureResultForStatus(403, carriedAuth = true))
	}

	@Test
	fun `a missing track is not a rejected token`() {
		assertEquals("", AtollaDownloadGuards.failureResultForStatus(404, carriedAuth = true))
	}

	@Test
	fun `a server error is not a rejected token`() {
		assertEquals("", AtollaDownloadGuards.failureResultForStatus(500, carriedAuth = true))
	}
}
