package com.quantumath.app.platform

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.ImageBitmap
import com.quantumath.app.AppContainer

/**
 * Everything the shared UI needs from the host platform (Android or desktop).
 * Each platform module also provides these top-level functions with identical signatures:
 *  - fun imageFromArgb(pixels: IntArray, width: Int, height: Int): ImageBitmap
 *  - fun encodeNavArg(s: String): String
 *  - @Composable fun rememberSaveTextFile(onResult: (Result<String>) -> Unit): (suggestedName: String, content: suspend () -> String) -> Unit
 *  - @Composable fun rememberOpenTextFile(onResult: (Result<String>) -> Unit): () -> Unit
 */
interface PlatformActions {
    /** "Android" or "Windows"/"Linux"/"macOS". */
    val platformName: String
    /** True on desktop: "share" actions save files / copy to clipboard instead of opening a share sheet. */
    val isDesktop: Boolean
    fun copy(label: String, text: String)
    fun shareText(text: String, subject: String = "Quantumath")
    fun shareImage(image: ImageBitmap, name: String)
    fun shareFile(text: String, name: String, mime: String = "application/json")
}

val LocalPlatform = staticCompositionLocalOf<PlatformActions> { error("No PlatformActions provided") }
val LocalAppContainer = staticCompositionLocalOf<AppContainer> { error("No AppContainer provided") }

object AppInfo {
    const val VERSION_NAME = "1.0.0"
    const val VERSION_CODE = 1
}
