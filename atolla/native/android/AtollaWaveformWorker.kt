package com.tx3stn.atolla

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicLong

// session-scoped store for on-demand rendered waveform PNGs. files live in the app's
// cacheDir (Android clears them on low storage) and aren't persisted across launches; the
// render cache re-renders from stored amplitude arrays
object AtollaWaveformRenderTempStore {
	private const val tag = "AtollaWaveformRenderTmp"
	private const val renderFolder = "atolla-waveform-render"
	private val counter = AtomicLong(0)

	fun save(cacheDir: File, pngBytes: ByteArray): String {
		return try {
			val dir = File(cacheDir, renderFolder).also { if (!it.exists()) it.mkdirs() }
			if (!dir.isDirectory) return ""
			val file = File(dir, "waveform_${counter.incrementAndGet()}.png")
			file.writeBytes(pngBytes)
			"file://${file.absolutePath}"
		} catch (e: Throwable) {
			Log.e(tag, "Failed to save rendered waveform PNG", e)
			""
		}
	}
}

class AtollaWaveformWorker {
	// bridged to shared Zig (waveform_generator.zig) via JNI (waveform_jni.cpp). declared as a
	// class instance method so the generated JNI symbol matches the other native bridges:
	// Java_com_tx3stn_atolla_AtollaWaveformWorker_nativeBuildWaveformPath
	private external fun nativeBuildWaveformPath(amps: FloatArray, width: Int, height: Int): FloatArray?

	companion object {
		private const val tag = "AtollaWaveformWorker"
		private const val waveformControlPoints = 300

		// reused instance solely to reach the JNI bridge from the (static) render path
		private val bridge = AtollaWaveformWorker()

		fun extractAmps(audioPath: String): FloatArray? = decodeToAmplitudes(audioPath)

		fun renderPng(amps: FloatArray, width: Int, height: Int): ByteArray? =
			renderSmoothPng(amps, width, height)

		private fun renderSmoothPng(amps: FloatArray, width: Int, height: Int): ByteArray? {
			val n = amps.size
			if (n < 2) return null

			// Smoothing, normalisation and Catmull-Rom → cubic-Bézier control points are
			// computed once in shared Zig (waveform_generator.zig); we replay the returned
			// outline into a Path and let Canvas anti-alias the fill.
			val pts = bridge.nativeBuildWaveformPath(amps, width, height) ?: return null
			if (pts.size < 8 || (pts.size - 2) % 6 != 0) return null

			val path = Path()
			path.moveTo(pts[0], pts[1])
			var i = 2
			while (i + 6 <= pts.size) {
				path.cubicTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5])
				i += 6
			}
			path.close()

			val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
			val canvas = Canvas(bitmap)
			val paint = Paint().apply {
				isAntiAlias = true
				color = Color.WHITE
				style = Paint.Style.FILL
			}
			canvas.drawPath(path, paint)

			val out = ByteArrayOutputStream()
			bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
			bitmap.recycle()
			return out.toByteArray()
		}

		// streams audio through MediaCodec, accumulating peak amplitudes per waveform column
		// directly (no full sample buffer). uses the track duration to map each decoded frame
		// to the correct column, so the waveform spans the full track regardless of length
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
				// duration in microseconds; convert to total frames for column mapping
				val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION))
					format.getLong(MediaFormat.KEY_DURATION) else 0L
				val totalFrames = if (durationUs > 0)
					(durationUs * sampleRate / 1_000_000L) else 0L

				val sumSq = FloatArray(waveformControlPoints)
				val counts = IntArray(waveformControlPoints)
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
								// presentation time of the first frame in this buffer (µs → frames)
								val bufferStartFrame = info.presentationTimeUs * sampleRate / 1_000_000L
								// sample at most 4 frames per decoded buffer, accurate enough for
								// peak detection and avoids processing millions of frames
								val stride = maxOf(1, bufferFrames / 4)

								var frameOffset = 0
								while (frameOffset < bufferFrames) {
									val frameIndex = bufferStartFrame + frameOffset
									val col = if (totalFrames > 0) {
										((frameIndex * waveformControlPoints) / totalFrames).toInt()
									} else {
										((decodedFrames + frameOffset) % waveformControlPoints).toInt()
									}.coerceIn(0, waveformControlPoints - 1)

									for (ch in 0 until channelCount) {
										val s = shortBuffer.get().toFloat() / 32768f
										sumSq[col] += s * s
										counts[col]++
									}

									frameOffset += stride
									val skipSamples = (stride - 1) * channelCount
									if (skipSamples > 0) {
										val newPos = shortBuffer.position() + skipSamples
										shortBuffer.position(minOf(newPos, shortBuffer.limit()))
									}
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
					if (decodedFrames == 0L) null else FloatArray(waveformControlPoints) { i ->
						if (counts[i] > 0) kotlin.math.sqrt(sumSq[i] / counts[i]) else 0f
					}
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
