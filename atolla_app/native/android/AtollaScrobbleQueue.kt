package com.tx3stn.atolla

import android.util.Log
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

// Durable, kill-safe pending-scrobble queue. The audio engine appends one line the instant the
// shared Zig accrual machine (or a natural track end) decides a track has been played; the entry
// survives backgrounding and process death because it lives in the app files dir (unlike the
// in-memory playback event queue). JS reads the pending list, delivers each to Jellyfin, and acks
// it. Line format: "<trackId>\t<epochMs>"; trackIds are Jellyfin item ids (hex, no tabs).
object AtollaScrobbleQueue {
	private const val tag = "AtollaScrobbleQueue"
	private const val fileName = "pending_scrobbles.log"
	private val lock = Any()

	fun append(trackId: String, playedAtMs: Long) {
		if (trackId.isBlank()) return
		synchronized(lock) {
			val file = resolveFile() ?: return
			try {
				file.appendText("$trackId\t$playedAtMs\n")
			} catch (error: Throwable) {
				Log.e(tag, "Failed to append pending scrobble", error)
			}
		}
	}

	// JSON array [{"trackId":"...","playedAtMs":123}], oldest first (append order)
	fun readPendingJson(): String {
		synchronized(lock) {
			val array = JSONArray()
			for ((trackId, playedAtMs) in readEntries()) {
				array.put(JSONObject().put("trackId", trackId).put("playedAtMs", playedAtMs))
			}
			return array.toString()
		}
	}

	fun ack(trackId: String, playedAtMs: Long) {
		synchronized(lock) {
			val file = resolveFile() ?: return
			val remaining = readEntries().filterNot { it.first == trackId && it.second == playedAtMs }
			try {
				if (remaining.isEmpty()) {
					file.delete()
				} else {
					file.writeText(remaining.joinToString("") { "${it.first}\t${it.second}\n" })
				}
			} catch (error: Throwable) {
				Log.e(tag, "Failed to ack pending scrobble", error)
			}
		}
	}

	private fun readEntries(): List<Pair<String, Long>> {
		val file = resolveFile() ?: return emptyList()
		if (!file.exists()) return emptyList()
		return try {
			file.readLines().mapNotNull { line ->
				val tab = line.indexOf('\t')
				if (tab <= 0) return@mapNotNull null
				val playedAtMs = line.substring(tab + 1).toLongOrNull() ?: return@mapNotNull null
				line.substring(0, tab) to playedAtMs
			}
		} catch (error: Throwable) {
			Log.e(tag, "Failed to read pending scrobbles", error)
			emptyList()
		}
	}

	private fun resolveFile(): File? {
		val dir = resolveAppFilesDir() ?: return null
		return File(dir, fileName)
	}

	private fun resolveAppFilesDir(): File? {
		return try {
			val activityThreadClass = Class.forName("android.app.ActivityThread")
			val currentApplication = activityThreadClass.getMethod("currentApplication").invoke(null)
			val app = currentApplication as? android.app.Application ?: return null
			app.filesDir
		} catch (error: Throwable) {
			Log.e(tag, "Unable to resolve application files directory", error)
			null
		}
	}
}
