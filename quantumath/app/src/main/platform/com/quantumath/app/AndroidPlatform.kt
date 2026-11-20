package com.quantumath.app.platform

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** Android implementation: share sheet via Intents + FileProvider, clipboard, Storage Access Framework. */
class AndroidPlatform(private val context: Context) : PlatformActions {
    override val platformName = "Android ${Build.VERSION.RELEASE}"
    override val isDesktop = false

    override fun copy(label: String, text: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText(label, text))
        // Android 13+ shows its own confirmation
        if (Build.VERSION.SDK_INT < 33) Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
    }

    override fun shareText(text: String, subject: String) {
        val i = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text); putExtra(Intent.EXTRA_SUBJECT, subject) }
        context.startActivity(Intent.createChooser(i, "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun sharedDir() = File(context.cacheDir, "shared").apply { mkdirs() }

    override fun shareImage(image: ImageBitmap, name: String) {
        val f = File(sharedDir(), "$name.png")
        f.outputStream().use { image.asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it) }
        send(f, "image/png", "Share image")
    }

    override fun shareFile(text: String, name: String, mime: String) {
        val f = File(sharedDir(), name)
        f.writeText(text)
        send(f, mime, "Share file")
    }

    private fun send(f: File, mime: String, title: String) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", f)
        val i = Intent(Intent.ACTION_SEND).apply { type = mime; putExtra(Intent.EXTRA_STREAM, uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
        context.startActivity(Intent.createChooser(i, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

fun imageFromArgb(pixels: IntArray, width: Int, height: Int): ImageBitmap =
    Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888).asImageBitmap()

fun encodeNavArg(s: String): String = Uri.encode(s)

/** Save text through the system "create document" picker (no storage permission needed). Result = file name. */
@Composable
fun rememberSaveTextFile(onResult: (Result<String>) -> Unit): (suggestedName: String, content: suspend () -> String) -> Unit {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val pending = remember { arrayOfNulls<suspend () -> String>(1) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val content = pending[0]; pending[0] = null
        if (uri != null && content != null) scope.launch {
            onResult(runCatching {
                val text = content()
                withContext(Dispatchers.IO) { ctx.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(text.toByteArray()) } }
                uri.lastPathSegment ?: "file"
            })
        }
    }
    return { name, content -> pending[0] = content; launcher.launch(name) }
}

/** Read a text file through the system "open document" picker. */
@Composable
fun rememberOpenTextFile(onResult: (Result<String>) -> Unit): () -> Unit {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            onResult(runCatching { withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes().decodeToString() } } })
        }
    }
    return { launcher.launch(arrayOf("application/json", "text/plain", "*/*")) }
}
