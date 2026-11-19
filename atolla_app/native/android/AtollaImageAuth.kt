package atolla.native.android

import java.net.URI
import java.net.URISyntaxException

class AtollaImageAuth private constructor(val header: String, private val server: URI) {
	fun appliesTo(image: URI): Boolean {
		return image.scheme.equals(server.scheme, ignoreCase = true) &&
			image.host.equals(server.host, ignoreCase = true) &&
			effectivePort(image) == effectivePort(server)
	}

	private fun effectivePort(uri: URI): Int {
		return when {
			uri.port != -1 -> uri.port
			uri.scheme.equals("https", ignoreCase = true) -> 443
			uri.scheme.equals("http", ignoreCase = true) -> 80
			else -> -1
		}
	}

	companion object {
		fun from(header: String, serverUrl: String): AtollaImageAuth? {
			if (header.isBlank()) return null
			val server = try {
				URI(serverUrl)
			} catch (_: URISyntaxException) {
				return null
			}
			if (server.host == null) return null
			return AtollaImageAuth(header, server)
		}
	}
}
