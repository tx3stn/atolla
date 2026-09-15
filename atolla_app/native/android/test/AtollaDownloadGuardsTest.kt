package atolla.native.android

import org.junit.Assert.assertEquals
import org.junit.Test

class AtollaDownloadGuardsTest {

	@Test
	fun `a rejected token is reported back to js`() {
		assertEquals("atolla:unauthorized", AtollaDownloadGuards.failureResultForStatus(401))
	}

	@Test
	fun `a forbidden response is not a rejected token`() {
		assertEquals("", AtollaDownloadGuards.failureResultForStatus(403))
	}

	@Test
	fun `a missing track is not a rejected token`() {
		assertEquals("", AtollaDownloadGuards.failureResultForStatus(404))
	}

	@Test
	fun `a server error is not a rejected token`() {
		assertEquals("", AtollaDownloadGuards.failureResultForStatus(500))
	}
}
