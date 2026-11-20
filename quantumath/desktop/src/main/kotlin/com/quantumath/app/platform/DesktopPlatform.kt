package com.quantumath.app.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toAwtImage
import androidx.compose.ui.graphics.toComposeImageBitmap
import com.quantumath.app.AppContainer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.jetbrains.skia.ColorAlphaType
import org.jetbrains.skia.ColorType
import org.jetbrains.skia.Image
import org.jetbrains.skia.ImageInfo
import java.awt.FileDialog
import java.awt.Frame
import java.awt.Toolkit
import java.awt.datatransfer.StringSelection
import java.io.File
import java.net.URLEncoder
import javax.imageio.ImageIO

/** The main window, used as the parent of native file dialogs. */
object DesktopWindow { @Volatile var frame: Frame? = null }

/**
 * Desktop implementation. There is no share sheet on Windows, so "share" copies text to the clipboard
 * and saves images/files through the native Save dialog.
 */
class DesktopPlatform(private val container: AppContainer) : PlatformActions {
    override val platformName: String = System.getProperty("os.name") ?: "Desktop"
    override val isDesktop = true

    override fun copy(label: String, text: String) {
        runCatching { Toolkit.getDefaultToolkit().systemClipboard.setContents(StringSelection(text), null) }
            .onSuccess { container.messages.tryEmit("Copied to clipboard") }
            .onFailure { container.messages.tryEmit("Clipboard unavailable") }
    }

    override fun shareText(text: String, subject: String) = copy(subject, text)

    override fun shareImage(image: ImageBitmap, name: String) {
        val f = chooseSaveFile("$name.png", "Save image") ?: return
        runCatching { ImageIO.write(image.toAwtImage(), "png", f) }
            .onSuccess { container.messages.tryEmit("Saved ${f.name}") }.onFailure { container.messages.tryEmit("Could not save: ${it.message}") }
    }

    override fun shareFile(text: String, name: String, mime: String) {
        val f = chooseSaveFile(name, "Save file") ?: return
        runCatching { f.writeText(text) }
            .onSuccess { container.messages.tryEmit("Saved ${f.name}") }.onFailure { container.messages.tryEmit("Could not save: ${it.message}") }
    }
}

internal fun chooseSaveFile(suggested: String, title: String): File? {
    val d = FileDialog(DesktopWindow.frame, title, FileDialog.SAVE)
    d.file = suggested
    d.isVisible = true
    val name = d.file ?: return null
    return File(d.directory, name)
}

internal fun chooseOpenFile(title: String): File? {
    val d = FileDialog(DesktopWindow.frame, title, FileDialog.LOAD)
    d.file = "*.json"
    d.isVisible = true
    val name = d.file ?: return null
    return File(d.directory, name)
}

fun imageFromArgb(pixels: IntArray, width: Int, height: Int): ImageBitmap {
    // ARGB ints → BGRA bytes (little-endian N32)
    val bytes = ByteArray(width * height * 4)
    var j = 0
    for (p in pixels) {
        bytes[j++] = (p and 0xFF).toByte(); bytes[j++] = (p shr 8 and 0xFF).toByte()
        bytes[j++] = (p shr 16 and 0xFF).toByte(); bytes[j++] = (p ushr 24).toByte()
    }
    return Image.makeRaster(ImageInfo(width, height, ColorType.BGRA_8888, ColorAlphaType.UNPREMUL), bytes, width * 4).toComposeImageBitmap()
}

fun encodeNavArg(s: String): String = URLEncoder.encode(s, Charsets.UTF_8).replace("+", "%20")

@Composable
fun rememberSaveTextFile(onResult: (Result<String>) -> Unit): (suggestedName: String, content: suspend () -> String) -> Unit {
    val scope = rememberCoroutineScope()
    return { name, content ->
        val f = chooseSaveFile(name, "Save")
        if (f != null) scope.launch {
            onResult(runCatching { val text = content(); withContext(Dispatchers.IO) { f.writeText(text) }; f.absolutePath })
        }
    }
}

@Composable
fun rememberOpenTextFile(onResult: (Result<String>) -> Unit): () -> Unit {
    val scope = rememberCoroutineScope()
    return {
        val f = chooseOpenFile("Open")
        if (f != null) scope.launch { onResult(runCatching { withContext(Dispatchers.IO) { f.readText() } }) }
    }
}
