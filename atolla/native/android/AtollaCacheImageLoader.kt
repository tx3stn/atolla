package atolla.native.android

import android.net.Uri
import android.util.Log
import com.snap.valdi.exceptions.ValdiException
import com.snap.valdi.utils.Disposable
import com.snap.valdi.utils.ValdiAssetLoadOutputType
import com.snap.valdi.utils.ValdiImage
import com.snap.valdi.utils.ValdiImageContent
import com.snap.valdi.utils.ValdiImageFactory
import com.snap.valdi.utils.ValdiImageLoadCompletion
import com.snap.valdi.utils.ValdiImageLoadOptions
import com.snap.valdi.utils.ValdiImageLoader
import com.snap.valdi.utils.ValdiImageWithContent
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

data class AtollaCacheRequestPayload(
	val category: String,
	val sourceUrl: String,
)

class AtollaCacheImageLoader : ValdiImageLoader {
	private val tag = "AtollaCacheLoader"
	private val memory = ConcurrentHashMap<String, ByteArray>()

	override fun getSupportedURLSchemes(): List<String> {
		Log.d(tag, "getSupportedURLSchemes")
		return listOf("atolla-cache")
	}

	override fun getSupportedOutputTypes(): Int {
		return ValdiAssetLoadOutputType.BITMAP.value or ValdiAssetLoadOutputType.RAW_CONTENT.value
	}

	@Throws(ValdiException::class)
	override fun getRequestPayload(url: Uri): Any {
		Log.d(tag, "getRequestPayload url=$url")
		val category = url.getQueryParameter("c")
		val source = url.getQueryParameter("u")
		if (url.scheme != "atolla-cache" || url.host != "image" || category.isNullOrBlank() || source.isNullOrBlank()) {
			throw ValdiException("Invalid atolla-cache image URL")
		}
		return AtollaCacheRequestPayload(category = category, sourceUrl = source)
	}

	override fun loadImage(
		requetPayload: Any,
		options: ValdiImageLoadOptions,
		completion: ValdiImageLoadCompletion,
	): Disposable? {
		val payload = requetPayload as AtollaCacheRequestPayload
		val key = "${payload.category}:${payload.sourceUrl}"
		Log.d(tag, "loadImage key=$key outputType=${options.outputType}")

		memory[key]?.let { bytes ->
			Log.d(tag, "cache hit key=$key bytes=${bytes.size}")
			completeFromBytes(bytes, options, completion)
			return null
		}

		val worker = thread(start = true) {
			try {
				val bytes = URL(payload.sourceUrl).readBytes()
				Log.d(tag, "network fetch success key=$key bytes=${bytes.size}")
				memory[key] = bytes
				completeFromBytes(bytes, options, completion)
			} catch (error: Throwable) {
				Log.e(tag, "network fetch failed key=$key", error)
				completion.onImageLoadComplete(0, 0, null, error)
			}
		}

		return object : Disposable {
			override fun dispose() {
				worker.interrupt()
			}
		}
	}

	private fun completeFromBytes(
		bytes: ByteArray,
		options: ValdiImageLoadOptions,
		completion: ValdiImageLoadCompletion,
	) {
		val image: ValdiImage = when (options.outputType) {
			ValdiAssetLoadOutputType.BITMAP -> ValdiImageFactory.fromByteArray(bytes)
			ValdiAssetLoadOutputType.RAW_CONTENT -> ValdiImageWithContent(ValdiImageContent.Bytes(bytes))
			else -> {
				completion.onImageLoadComplete(
					0,
					0,
					null,
					ValdiException("Unsupported output type: ${options.outputType}"),
				)
				return
			}
		}

		completion.onImageLoadComplete(0, 0, image, null)
	}
}
