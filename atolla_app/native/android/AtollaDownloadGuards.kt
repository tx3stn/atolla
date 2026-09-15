package atolla.native.android

object AtollaDownloadGuards {
	const val unauthorizedResult = "atolla:unauthorized"

	fun failureResultForStatus(status: Int): String {
		return if (status == 401) unauthorizedResult else ""
	}
}
