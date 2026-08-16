package com.tx3stn.atolla

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.media.MediaCodec
import android.media.MediaCodecList
import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log
import atolla.native.android.AtollaWaveformCodecSelector
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
		private const val waveformSamplePoints = 150
		private const val windowSamplesPerPoint = 4096

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

		private fun decodeToAmplitudes(audioPath: String): FloatArray? {
			val enterNs = System.nanoTime()
			val path = if (audioPath.startsWith("file://")) audioPath.substring(7) else audioPath
			if (!File(path).exists()) return null
			val extractor = MediaExtractor()
			return try {
				extractor.setDataSource(path)
				val trackIndex = findAudioTrack(extractor) ?: return null
				extractor.selectTrack(trackIndex)

				val format = extractor.getTrackFormat(trackIndex)
				val mime = format.getString(MediaFormat.KEY_MIME) ?: return null
				val sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
				val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION))
					format.getLong(MediaFormat.KEY_DURATION) else 0L
				if (durationUs <= 0L) return null

				val samples = FloatArray(waveformSamplePoints)
				val codec = createSoftwareDecoder(mime)
				try {
					codec.configure(format, null, null, 0)
					codec.start()
					val decodeStartNs = System.nanoTime()
					val info = MediaCodec.BufferInfo()

					var populated = 0
					for (p in 0 until waveformSamplePoints) {
						val seekUs = durationUs * p / waveformSamplePoints
						extractor.seekTo(seekUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
						codec.flush()

						var sumSq = 0f
						var count = 0
						var attempts = 0
						var reachedEos = false
						while (count < windowSamplesPerPoint && attempts < 64 && !reachedEos) {
							attempts++
							val inputIndex = codec.dequeueInputBuffer(2_000)
							if (inputIndex >= 0) {
								val inputBuffer = codec.getInputBuffer(inputIndex)
								val sampleSize = if (inputBuffer != null) extractor.readSampleData(inputBuffer, 0) else -1
								if (sampleSize < 0) {
									codec.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
									reachedEos = true
								} else {
									codec.queueInputBuffer(inputIndex, 0, sampleSize, extractor.sampleTime, 0)
									extractor.advance()
								}
							}

							val outputIndex = codec.dequeueOutputBuffer(info, 2_000)
							if (outputIndex >= 0) {
								val outputBuffer = codec.getOutputBuffer(outputIndex)
								if (outputBuffer != null && info.size > 0) {
									outputBuffer.position(info.offset)
									outputBuffer.limit(info.offset + info.size)
									val shortBuffer = outputBuffer.slice().order(ByteOrder.nativeOrder()).asShortBuffer()
									while (shortBuffer.hasRemaining()) {
										val s = shortBuffer.get().toFloat() / 32768f
										sumSq += s * s
										count++
									}
								}
								codec.releaseOutputBuffer(outputIndex, false)
							}
						}

						if (count > 0) {
							samples[p] = kotlin.math.sqrt(sumSq / count)
							populated++
						}
					}

					codec.stop()
					Log.i(tag, "waveform decode: setupMs=" + ((decodeStartNs - enterNs) / 1000000) + " decodeMs=" + ((System.nanoTime() - decodeStartNs) / 1000000) + " codec=" + codec.name + " rate=" + sampleRate + " points=" + populated + "/" + waveformSamplePoints)
					if (populated == 0) null else interpolateToColumns(samples)
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

		private fun interpolateToColumns(samples: FloatArray): FloatArray {
			val amps = FloatArray(waveformControlPoints)
			if (samples.size < 2) {
				amps.fill(samples.firstOrNull() ?: 0f)
				return amps
			}
			for (c in 0 until waveformControlPoints) {
				val fp = c.toFloat() * (samples.size - 1) / (waveformControlPoints - 1)
				val lo = fp.toInt()
				val hi = minOf(lo + 1, samples.size - 1)
				val frac = fp - lo
				amps[c] = samples[lo] * (1f - frac) + samples[hi] * frac
			}
			return amps
		}

		private fun findAudioTrack(extractor: MediaExtractor): Int? {
			for (i in 0 until extractor.trackCount) {
				val mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME) ?: continue
				if (mime.startsWith("audio/")) return i
			}
			return null
		}

		private fun createSoftwareDecoder(mime: String): MediaCodec {
			val name = softwareDecoderNameFor(mime)
			if (name != null) {
				try {
					return MediaCodec.createByCodecName(name)
				} catch (e: Throwable) {
					Log.w(tag, "software decoder $name unavailable, falling back to default", e)
				}
			}
			return MediaCodec.createDecoderByType(mime)
		}

		private fun softwareDecoderNameFor(mime: String): String? {
			return try {
				val candidates = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.map { info ->
					AtollaWaveformCodecSelector.DecoderCandidate(
						name = info.name,
						isEncoder = info.isEncoder,
						isSoftwareOnly = info.isSoftwareOnly,
						supportedTypes = info.supportedTypes.toList(),
					)
				}
				AtollaWaveformCodecSelector.selectSoftwareDecoderName(candidates, mime)
			} catch (e: Throwable) {
				null
			}
		}
	}
}
