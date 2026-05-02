package com.tx3stn.atolla

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log
import java.io.File
import java.nio.ByteOrder

object AtollaWaveformNativeCache {
	private const val tag = "AtollaWaveformCache"
	private const val cacheFolder = "atolla-waveform-cache"

	@Synchronized
	fun getCachedWaveformUrl(trackId: String): String {
		val dir = resolveCacheDir() ?: return ""
		val file = File(dir, "${safeKey(trackId)}.png")
		return if (file.exists() && file.isFile && file.length() > 0) "file://${file.absolutePath}" else ""
	}

	@Synchronized
	fun saveWaveformPng(trackId: String, pngBytes: ByteArray): String {
		if (pngBytes.isEmpty()) return ""
		val dir = resolveCacheDir() ?: return ""
		val file = File(dir, "${safeKey(trackId)}.png")
		return try {
			file.writeBytes(pngBytes)
			"file://${file.absolutePath}"
		} catch (e: Throwable) {
			Log.e(tag, "Failed to save waveform PNG trackId=$trackId", e)
			""
		}
	}

	@Synchronized
	fun clearCache() {
		resolveCacheDir()?.listFiles()?.forEach { it.delete() }
	}

	private fun safeKey(trackId: String): String {
		val trimmed = trackId.trim()
		return if (trimmed.isEmpty()) "track" else trimmed.replace(Regex("[^a-zA-Z0-9._-]"), "_")
	}

	private fun resolveCacheDir(): File? {
		return try {
			val activityThreadClass = Class.forName("android.app.ActivityThread")
			val currentApplication = activityThreadClass.getMethod("currentApplication").invoke(null)
			val app = currentApplication as? android.app.Application ?: return null
			val dir = File(app.cacheDir, cacheFolder)
			if (!dir.exists()) dir.mkdirs()
			if (dir.isDirectory) dir else null
		} catch (e: Throwable) {
			Log.e(tag, "Unable to resolve waveform cache dir", e)
			null
		}
	}
}

class AtollaWaveformWorker {
	companion object {
		private const val tag = "AtollaWaveformWorker"
		private const val waveformWidth = 256
		private const val waveformHeight = 128

		@JvmStatic
		private external fun nativeGenerateWaveform(
			samples: FloatArray,
			channelCount: Int,
			width: Int,
			height: Int,
		): ByteArray?

		@JvmStatic
		private external fun nativeRenderWaveformFromAmps(
			amps: FloatArray,
			width: Int,
			height: Int,
		): ByteArray?

		fun generateWaveformPng(audioPath: String): ByteArray? {
			val amps = decodeToAmplitudes(audioPath) ?: return null
			return try {
				nativeRenderWaveformFromAmps(amps, waveformWidth, waveformHeight)
			} catch (e: Throwable) {
				Log.e(tag, "JNI waveform generation failed", e)
				null
			}
		}

		// Streams audio through MediaCodec, accumulating peak amplitudes per waveform
		// column directly — no full sample buffer. Uses the track duration to map each
		// decoded frame to the correct column, so the waveform spans the full track
		// regardless of length.
		private fun decodeToAmplitudes(audioPath: String): FloatArray? {
			val path = if (audioPath.startsWith("file://")) audioPath.substring(7) else audioPath
			val extractor = MediaExtractor()
			return try {
				extractor.setDataSource(path)
				val trackIndex = findAudioTrack(extractor) ?: return null
				extractor.selectTrack(trackIndex)

				val format = extractor.getTrackFormat(trackIndex)
				val mime = format.getString(MediaFormat.KEY_MIME) ?: return null
				val channelCount = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
				val sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
				// Duration in microseconds; convert to total frames for column mapping.
				val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION))
					format.getLong(MediaFormat.KEY_DURATION) else 0L
				val totalFrames = if (durationUs > 0)
					(durationUs * sampleRate / 1_000_000L) else 0L

				val amps = FloatArray(waveformWidth)
				var decodedFrames = 0L

				val codec = MediaCodec.createDecoderByType(mime)
				try {
					codec.configure(format, null, null, 0)
					codec.start()

					val info = MediaCodec.BufferInfo()
					var inputDone = false
					var outputDone = false

					while (!outputDone) {
						if (!inputDone) {
							val inputIndex = codec.dequeueInputBuffer(10_000)
							if (inputIndex >= 0) {
								val inputBuffer = codec.getInputBuffer(inputIndex)
								if (inputBuffer != null) {
									val sampleSize = extractor.readSampleData(inputBuffer, 0)
									if (sampleSize < 0) {
										codec.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
										inputDone = true
									} else {
										codec.queueInputBuffer(inputIndex, 0, sampleSize, extractor.sampleTime, 0)
										extractor.advance()
									}
								}
							}
						}

						val outputIndex = codec.dequeueOutputBuffer(info, 10_000)
						if (outputIndex >= 0) {
							val outputBuffer = codec.getOutputBuffer(outputIndex)
							if (outputBuffer != null && info.size > 0) {
								outputBuffer.position(info.offset)
								outputBuffer.limit(info.offset + info.size)
								val shortBuffer = outputBuffer.slice().order(ByteOrder.nativeOrder()).asShortBuffer()
								val bufferFrames = shortBuffer.remaining() / channelCount
								// Presentation time of the first frame in this buffer (µs → frames).
								val bufferStartFrame = info.presentationTimeUs * sampleRate / 1_000_000L

								for (frameOffset in 0 until bufferFrames) {
									val frameIndex = bufferStartFrame + frameOffset
									val col = if (totalFrames > 0) {
										((frameIndex * waveformWidth) / totalFrames).toInt()
									} else {
										// No duration metadata: distribute frames seen so far evenly.
										// Columns fill left-to-right; may not span the full bar.
										((decodedFrames + frameOffset) % waveformWidth).toInt()
									}.coerceIn(0, waveformWidth - 1)

									var peak = 0f
									for (ch in 0 until channelCount) {
										val s = (shortBuffer.get().toFloat() / 32768f).let { if (it < 0) -it else it }
										if (s > peak) peak = s
									}
									if (peak > amps[col]) amps[col] = peak
								}
								decodedFrames += bufferFrames
							}
							codec.releaseOutputBuffer(outputIndex, false)
							if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
								outputDone = true
							}
						}
					}

					codec.stop()
					if (decodedFrames == 0L) null else amps
				} finally {
					codec.release()
				}
			} catch (e: Throwable) {
				Log.e(tag, "Audio decode failed: $audioPath", e)
				null
			} finally {
				extractor.release()
			}
		}

		private fun findAudioTrack(extractor: MediaExtractor): Int? {
			for (i in 0 until extractor.trackCount) {
				val mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME) ?: continue
				if (mime.startsWith("audio/")) return i
			}
			return null
		}
	}
}
