package atolla.native.android

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AtollaFirstDrawGateTest {

	@Test
	fun `a gate that was never held lets drawing through`() {
		assertTrue(AtollaFirstDrawGate().isReleased)
	}

	@Test
	fun `holding blocks drawing`() {
		val gate = AtollaFirstDrawGate()

		gate.hold()

		assertFalse(gate.isReleased)
	}

	@Test
	fun `releasing a held gate lets drawing through`() {
		val gate = AtollaFirstDrawGate()
		gate.hold()

		gate.release()

		assertTrue(gate.isReleased)
	}

	@Test
	fun `holding again after a release blocks drawing for the new activity`() {
		val gate = AtollaFirstDrawGate()
		gate.hold()
		gate.release()

		gate.hold()

		assertFalse(gate.isReleased)
	}
}
