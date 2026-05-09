package atolla.native.android

import android.util.Base64
import android.util.Log
import com.tx3stn.atolla.AtollaCacheImageLoader
import com.tx3stn.atolla.AtollaWaveformRenderTempStore
import com.tx3stn.atolla.AtollaWaveformWorker
import com.snap.modules.atolla.WaveformNativeModule
import com.snap.modules.atolla.WaveformNativeModuleFactory
import com.snap.valdi.modules.RegisterValdiModule
import java.nio.ByteBuffer
import java.nio.ByteOrder

@RegisterValdiModule
class AtollaWaveformNativeModuleFactory : WaveformNativeModuleFactory() {
	override fun onLoadModule(): WaveformNativeModule {
		return object : WaveformNativeModule {
			override fun generateAtollaWaveformAmpsAsync(trackId: String, audioPath: String, onComplete: (String) -> Unit) {
				Thread {
					val result = try {
						val amps = AtollaWaveformWorker.extractAmps(audioPath)
						if (amps != null) {
							val bb = ByteBuffer.allocate(amps.size * 4).order(ByteOrder.LITTLE_ENDIAN)
							for (f in amps) bb.putFloat(f)
							Base64.encodeToString(bb.array(), Base64.NO_WRAP)
						} else ""
					} catch (e: Throwable) {
						Log.e("AtollaWaveformModule", "Amp extraction failed trackId=$trackId", e)
						""
					}
					onComplete(result)
				}.also { it.isDaemon = true }.start()
			}

			override fun renderAtollaWaveformFromAmpsAsync(ampsBase64: String, width: Double, height: Double, onComplete: (String) -> Unit) {
				Thread {
					val result = try {
						val bytes = Base64.decode(ampsBase64, Base64.NO_WRAP)
						val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
						val amps = FloatArray(bytes.size / 4) { bb.getFloat() }
						val pngBytes = AtollaWaveformWorker.renderPng(amps, width.toInt(), height.toInt())
						val cacheDir = AtollaCacheImageLoader.sharedInstance?.resolveAppCacheDir()
						if (pngBytes != null && pngBytes.isNotEmpty() && cacheDir != null) {
							AtollaWaveformRenderTempStore.save(cacheDir, pngBytes)
						} else ""
					} catch (e: Throwable) {
						Log.e("AtollaWaveformModule", "Waveform render from amps failed", e)
						""
					}
					onComplete(result)
				}.also { it.isDaemon = true }.start()
			}
		}
	}
}
