package atolla.native.android

import android.util.Log

object AtollaImageLoaderRegistration {
	private const val tag = "AtollaImageLoaderReg"

	@JvmStatic
	fun registerAtollaImageLoaders(manager: Any): AtollaCacheImageLoader {
		val loader = AtollaCacheImageLoader()
		Log.i(tag, "Registering loader on manager=${manager::class.java.name}")
		invokeSingleArgMethod(manager, listOf("registerAssetLoader", "registerImageLoader"), loader)
		Log.i(tag, "Registered AtollaCacheImageLoader")
		return loader
	}

	@JvmStatic
	fun unregisterAtollaImageLoaders(
		manager: Any,
		loader: AtollaCacheImageLoader,
	) {
		Log.i(tag, "Unregistering loader on manager=${manager::class.java.name}")
		invokeSingleArgMethod(manager, listOf("unregisterAssetLoader", "unregisterImageLoader"), loader)
		Log.i(tag, "Unregistered AtollaCacheImageLoader")
	}

	private fun invokeSingleArgMethod(target: Any, methodNames: List<String>, arg: Any) {
		val methods = target::class.java.methods
		val method = methodNames.firstNotNullOfOrNull { preferredName ->
			methods.firstOrNull {
				it.name == preferredName && it.parameterTypes.size == 1
			}
		} ?: throw IllegalStateException(
			"Missing method ${methodNames.joinToString("/")}(arg) on ${target::class.java.name}",
		)

		Log.i(tag, "Invoking ${method.name} on ${target::class.java.name}")

		method.invoke(target, arg)
	}
}
