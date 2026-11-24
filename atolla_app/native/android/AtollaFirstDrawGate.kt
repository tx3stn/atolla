package atolla.native.android

class AtollaFirstDrawGate {
	var isReleased = true
		private set

	fun hold() {
		isReleased = false
	}

	fun release() {
		isReleased = true
	}
}
