package atolla.native.android

import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import com.snap.valdi.ValdiRuntime
import com.snap.valdi.callable.ValdiFunction
import com.snap.valdi.utils.ValdiMarshaller

object AtollaHapticsBootstrap {
    private const val tag = "AtollaHapticsBootstrap"

    @JvmStatic
    fun setupForAllRuntimes() {
        val runtimes = getAllRuntimes()
        for (runtime in runtimes) {
            try {
                if (runtime !is ValdiRuntime) continue
                val deviceModule = runtime.nativeModules?.deviceModule ?: continue
                if (deviceModule.performHapticFeedbackFunction != null) continue
                val context = deviceModule.context
                deviceModule.performHapticFeedbackFunction = object : ValdiFunction {
                    override fun perform(marshaller: ValdiMarshaller): Boolean {
                        val type = if (marshaller.isString(0)) marshaller.getString(0) else "selection"
                        performHapticForType(context, type)
                        return false
                    }
                }
                Log.i(tag, "Haptic feedback configured")
            } catch (e: Throwable) {
                Log.e(tag, "Failed to configure haptics", e)
            }
        }
    }

    private fun performHapticForType(context: android.content.Context, type: String) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibrator = (context.getSystemService(android.content.Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)
                    ?.defaultVibrator ?: return
                vibrator.vibrate(VibrationEffect.createPredefined(hapticEffectId(type)))
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                @Suppress("DEPRECATION")
                val vibrator = context.getSystemService(android.content.Context.VIBRATOR_SERVICE) as? Vibrator ?: return
                vibrator.vibrate(VibrationEffect.createPredefined(hapticEffectId(type)))
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                @Suppress("DEPRECATION")
                val vibrator = context.getSystemService(android.content.Context.VIBRATOR_SERVICE) as? Vibrator ?: return
                @Suppress("DEPRECATION")
                vibrator.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE))
            }
        } catch (e: Throwable) {
            Log.e(tag, "Vibrator.vibrate failed", e)
        }
    }

    private fun hapticEffectId(type: String): Int = when (type) {
        "action_sheet" -> VibrationEffect.EFFECT_CLICK
        "vibration" -> VibrationEffect.EFFECT_DOUBLE_CLICK
        else -> VibrationEffect.EFFECT_TICK
    }

    private fun getAllRuntimes(): List<Any> {
        return try {
            val clazz = Class.forName("com.snap.valdi.ValdiRuntimeManager")
            val method = clazz.methods.firstOrNull {
                it.name == "allRuntimes" && it.parameterTypes.isEmpty()
            } ?: return emptyList()
            val result = method.invoke(null)
            when (result) {
                is List<*> -> result.filterNotNull()
                is Array<*> -> result.filterNotNull()
                else -> emptyList()
            }
        } catch (_: Throwable) {
            emptyList()
        }
    }
}
