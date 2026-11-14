package atolla.native.android

object AtollaMediaUploadWindow {
	data class Track(val id: String, val path: String?)

	fun tracks(
		ids: List<String>,
		sendFiles: Boolean,
		downloadedPath: (String) -> String?,
		cachedPath: (String) -> String?,
	): List<Track> = ids.map { id ->
		Track(id, if (sendFiles) downloadedPath(id) ?: cachedPath(id) else null)
	}
}
