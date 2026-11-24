package atolla.native.android

import java.io.File

object AtollaDownloadsFolder {
	fun moveLegacy(legacy: File, target: File): Boolean {
		if (!legacy.exists()) {
			return true
		}
		if (target.exists()) {
			return false
		}
		target.parentFile?.mkdirs()
		return legacy.renameTo(target)
	}
}
