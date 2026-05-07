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

// Session-scoped store for on-demand rendered waveform PNGs. Files live in the
// app's cacheDir (Android clears them on low storage) and are not persisted
// across launches — the render cache re-renders from stored amplitude arrays.
object AtollaWaveformRenderTempStore {
	private const val tag = "AtollaWaveformRenderTmp"
	private const val renderFolder = "atolla-waveform-render"
	private val counter = AtomicLong(0)

	fun save(pngBytes: ByteArray): String {
		return try {
			val dir = resolveRenderDir() ?: return ""
			val file = File(dir, "waveform_${counter.incrementAndGet()}.png")
			file.writeBytes(pngBytes)
			"file://${file.absolutePath}"
		} catch (e: Throwable) {
			Log.e(tag, "Failed to save rendered waveform PNG", e)
			""
		}
	}

	private fun resolveRenderDir(): File? {
		return try {
			val activityThreadClass = Class.forName("android.app.ActivityThread")
			val currentApplication = activityThreadClass.getMethod("currentApplication").invoke(null)
			val app = currentApplication as? android.app.Application ?: return null
			val dir = File(app.cacheDir, renderFolder)
			if (!dir.exists()) dir.mkdirs()
			if (dir.isDirectory) dir else null
		} catch (e: Throwable) {
			Log.e(tag, "Unable to resolve render temp dir", e)
			null
		}
	}
}

class AtollaWaveformWorker {
	companion object {
		private const val tag = "AtollaWaveformWorker"
		private const val waveformControlPoints = 300

		fun extractAmps(audioPath: String): FloatArray? = decodeToAmplitudes(audioPath)

		fun renderPng(amps: FloatArray, width: Int, height: Int): ByteArray? =
			renderSmoothPng(amps, width, height)

		private fun renderSmoothPng(amps: FloatArray, width: Int, height: Int): ByteArray? {
			val n = amps.size
			if (n < 2) return null

			// 5-point centred moving average — removes RMS noise, curves handle visual smoothness
			val smoothed = amps.copyOf()
			val tmp = smoothed.copyOf()
			for (i in 0 until n) {
				val lo = maxOf(0, i - 2)
				val hi = minOf(n - 1, i + 2)
				var s = 0f
				for (j in lo..hi) s += tmp[j]
				smoothed[i] = s / (hi - lo + 1)
			}

			// Normalise: loudest column → 1.0; silence → flat 0.5
			val maxAmp = smoothed.max()!!
			if (maxAmp < 1e-6f) {
				smoothed.fill(0.5f)
			} else {
				for (i in 0 until n) smoothed[i] /= maxAmp
			}

			val cx = width / 2f
			val cy = height / 2f
			fun xAt(i: Int) = i.toFloat() * (width - 1) / (n - 1)
			fun yTop(i: Int) = cy - smoothed[i] * cy
			fun yBot(i: Int) = cy + smoothed[i] * cy

			// Catmull-Rom → cubic Bézier: cp1 = p1+(p2-p0)/6, cp2 = p2-(p3-p1)/6
			val path = Path()

			// Top edge: left → right
			path.moveTo(xAt(0), yTop(0))
			for (i in 0 until n - 1) {
				val p0i = maxOf(0, i - 1); val p3i = minOf(n - 1, i + 2)
				val cp1x = xAt(i) + (xAt(i + 1) - xAt(p0i)) / 6f
				val cp1y = yTop(i) + (yTop(i + 1) - yTop(p0i)) / 6f
				val cp2x = xAt(i + 1) - (xAt(p3i) - xAt(i)) / 6f
				val cp2y = yTop(i + 1) - (yTop(p3i) - yTop(i)) / 6f
				path.cubicTo(cp1x, cp1y, cp2x, cp2y, xAt(i + 1), yTop(i + 1))
			}

			// Bottom edge: right → left
			path.lineTo(xAt(n - 1), yBot(n - 1))
			for (i in n - 2 downTo 0) {
				val p0i = minOf(n - 1, i + 2); val p3i = maxOf(0, i - 1)
				val cp1x = xAt(i + 1) + (xAt(i) - xAt(p0i)) / 6f
				val cp1y = yBot(i + 1) + (yBot(i) - yBot(p0i)) / 6f
				val cp2x = xAt(i) - (xAt(p3i) - xAt(i + 1)) / 6f
				val cp2y = yBot(i) - (yBot(p3i) - yBot(i + 1)) / 6f
				path.cubicTo(cp1x, cp1y, cp2x, cp2y, xAt(i), yBot(i))
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
								// Presentation time of the first frame in this buffer (µs → frames).
								val bufferStartFrame = info.presentationTimeUs * sampleRate / 1_000_000L
								// Sample at most 4 frames per decoded buffer — accurate enough for
								// peak detection and avoids processing millions of frames.
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
