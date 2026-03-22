# Native image loader wiring

This directory contains native scaffolding for the `atolla-cache://` image pipeline.

## Source contract

TypeScript builds image sources using:

`atolla-cache://image?c=<category>&u=<encoded-url>`

Where:

- `c` is one of `album_art`, `artist_image`, `artist_logo`, `playlist_image`
- `u` is the percent-encoded remote URL

Key derivation for cache storage is shared across platforms:

`<category>:<url>`

## iOS

Use `native/ios/AtollaCacheImageLoader.swift` as the scaffold for `SCValdiImageLoader` integration.

At app startup, register the loader in the host Valdi runtime configuration.

## Android

Use `native/android/AtollaCacheImageLoader.kt` as the `ValdiImageLoader` implementation.

Android wiring is now done through a Valdi exported module:

- `src/ImageLoaderBootstrap.d.ts`
- `native/android/AtollaImageLoaderBootstrapModuleFactory.kt`

TypeScript calls `ensureAtollaImageLoaderBootstrap()` from `src/App.tsx` on startup.

Example:

```kotlin
import atolla.native.android.AtollaImageLoaderRegistration
import atolla.native.android.AtollaCacheImageLoader
import com.snap.valdi.ValdiViewLoaderManager

class HostApp {
    private var atollaLoader: AtollaCacheImageLoader? = null

    fun onValdiManagerReady(manager: ValdiViewLoaderManager) {
        atollaLoader = AtollaImageLoaderRegistration.registerAtollaImageLoaders(manager)
    }

    fun onShutdown(manager: ValdiViewLoaderManager) {
        atollaLoader?.let {
            AtollaImageLoaderRegistration.unregisterAtollaImageLoaders(manager, it)
        }
    }
}
```

Manual bootstrap example (optional):

```kotlin
import atolla.native.android.AtollaImageLoaderAutoBootstrap
import atolla.native.android.AtollaImageLoaderBootstrapHandle

class HostApp {
    private var loaderBootstrap: AtollaImageLoaderBootstrapHandle? = null

    fun onAppStart() {
        loaderBootstrap = AtollaImageLoaderAutoBootstrap.startPolling(500)
    }

    fun onAppStop() {
        loaderBootstrap?.stop()
        loaderBootstrap = null
    }
}
```

## Required behavior

1. Parse `c` and `u` from the source URI.
2. Check persistent cache first.
3. Download and store on miss.
4. Return image bytes/bitmap.
5. Support cancellation for in-flight requests.
