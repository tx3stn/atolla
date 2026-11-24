package atolla.native.android

import android.util.Log
import com.tx3stn.atolla.AtollaCacheImageLoader
import com.tx3stn.atolla.AtollaWaveformRenderTempStore
import com.tx3stn.atolla.AtollaWaveformStore
import com.tx3stn.atolla.AtollaWaveformWorker
import com.snap.modules.atolla_app.WaveformNativeModule
import com.snap.modules.atolla_app.WaveformNativeModuleFactory
import com.snap.valdi.modules.RegisterValdiModule
import java.nio.ByteBuffer
import java.nio.ByteOrder

@RegisterValdiModule
class AtollaWaveformNativeModuleFactory : WaveformNativeModuleFactory() {
	override fun onLoadModule(): WaveformNativeModule {
		return object : WaveformNativeModule {
			override fun clearAtollaWaveforms() {
				AtollaWaveformStore.clear()
			}

			override fun generateAtollaWaveformAsync(trackId: String, audioPath: String, onComplete: (Boolean) -> Unit) {
				Thread {
					val ok = try {
						val amps = AtollaWaveformWorker.extractAmps(audioPath)
						if (amps != null) {
							val bb = ByteBuffer.allocate(amps.size * 4).order(ByteOrder.LITTLE_ENDIAN)
							for (f in amps) bb.putFloat(f)
							AtollaWaveformStore.write(trackId, bb.array())
						} else false
					} catch (e: Throwable) {
						Log.e("AtollaWaveformModule", "Waveform generation failed trackId=$trackId", e)
						false
					}
					onComplete(ok)
				}.also { it.isDaemon = true }.start()
			}

			override fun getAtollaWaveformCountAsync(onComplete: (Double) -> Unit) {
				Thread {
					onComplete(AtollaWaveformStore.count().toDouble())
				}.also { it.isDaemon = true }.start()
			}

			override fun hasAtollaWaveform(trackId: String): Boolean {
				return AtollaWaveformStore.has(trackId)
			}

			// TODO(waveform-migration): remove once it's been long enough that all uses of old waveform cache have been replaced
			override fun migrateAtollaWaveformsAsync(recordsJson: String, onComplete: (Double) -> Unit) {
				Thread {
					onComplete(AtollaWaveformStore.migrate(recordsJson).toDouble())
				}.also { it.isDaemon = true }.start()
			}

			override fun renderAtollaWaveformAsync(trackId: String, width: Double, height: Double, onComplete: (String) -> Unit) {
				Thread {
					val result = try {
						val bytes = AtollaWaveformStore.read(trackId)
						val cacheDir = AtollaCacheImageLoader.sharedInstance?.resolveAppCacheDir()
						if (bytes != null && cacheDir != null) {
							val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
							val amps = FloatArray(bytes.size / 4) { bb.getFloat() }
							val pngBytes = AtollaWaveformWorker.renderPng(amps, width.toInt(), height.toInt())
							if (pngBytes != null && pngBytes.isNotEmpty()) {
								AtollaWaveformRenderTempStore.save(cacheDir, pngBytes)
							} else ""
						} else ""
					} catch (e: Throwable) {
						Log.e("AtollaWaveformModule", "Waveform render failed trackId=$trackId", e)
						""
					}
					onComplete(result)
				}.also { it.isDaemon = true }.start()
			}
		}
	}
}
