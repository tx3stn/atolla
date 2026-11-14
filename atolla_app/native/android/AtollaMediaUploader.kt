package com.tx3stn.atolla

import android.util.Log
import atolla.native.android.AtollaDownloadedTrackNativeCache
import atolla.native.android.AtollaMediaUploadWindow
import atolla.native.android.AtollaTrackPlaybackNativeCache
import java.net.Inet4Address
import java.net.InetAddress
import java.net.UnknownHostException
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

class AtollaMediaUploader {
	private external fun nativeInit()

	private external fun nativeRun()

	private external fun nativeSetTarget(host: String, port: Int, token: String): Boolean

	private external fun nativeSetWindow(json: String): Boolean

	companion object {
		private const val TAG = "AtollaMediaUploader"

		private val bridge = AtollaMediaUploader()
		private val executor = Executors.newSingleThreadExecutor()

		init {
			bridge.nativeInit()
			Thread({ bridge.nativeRun() }, "atolla-media-uploader").apply { isDaemon = true }.start()
		}

		fun setTarget(host: String, port: Int, token: String) {
			executor.execute {
				if (host.isEmpty()) {
					bridge.nativeSetTarget("", 0, "")
					return@execute
				}

				val address = resolve(host)
				if (address == null) {
					Log.w(TAG, "could not resolve the source's host, so nothing is uploaded host=$host")
					bridge.nativeSetTarget("", 0, "")
					return@execute
				}

				if (!bridge.nativeSetTarget(address, port, token)) {
					Log.e(TAG, "the uploader refused its target")
				}
			}
		}

		fun setWindow(idsJson: String, sendFiles: Boolean) {
			executor.execute {
				val tracks = AtollaMediaUploadWindow.tracks(
					ids(idsJson),
					sendFiles,
					{ AtollaDownloadedTrackNativeCache.getCachedTrackFile(it)?.absolutePath },
					{ AtollaTrackPlaybackNativeCache.getCachedTrackFile(it)?.absolutePath },
				)
				val window = JSONObject()
					.put("sendFiles", sendFiles)
					.put(
						"tracks",
						JSONArray(tracks.map { JSONObject().put("id", it.id).put("path", it.path ?: JSONObject.NULL) }),
					)

				if (!bridge.nativeSetWindow(window.toString())) {
					Log.e(TAG, "the uploader refused its window")
				}
			}
		}

		private fun ids(idsJson: String): List<String> {
			val array = JSONArray(idsJson)

			return List(array.length()) { array.getString(it) }
		}

		private fun resolve(host: String): String? = try {
			InetAddress.getAllByName(host).firstOrNull { it is Inet4Address }?.hostAddress
		} catch (_: UnknownHostException) {
			null
		}
	}
}
