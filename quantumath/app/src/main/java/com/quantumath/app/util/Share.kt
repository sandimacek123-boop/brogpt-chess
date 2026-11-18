package com.quantumath.app.util

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

object Share {
    fun copy(context: Context, label: String, text: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText(label, text))
        // Android 13+ shows its own confirmation
        if (Build.VERSION.SDK_INT < 33) Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
    }

    fun text(context: Context, text: String, subject: String = "Quantumath") {
        val i = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text); putExtra(Intent.EXTRA_SUBJECT, subject) }
        context.startActivity(Intent.createChooser(i, "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun sharedDir(context: Context) = File(context.cacheDir, "shared").apply { mkdirs() }

    fun image(context: Context, bmp: Bitmap, name: String) {
        val f = File(sharedDir(context), "$name.png")
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", f)
        val i = Intent(Intent.ACTION_SEND).apply { type = "image/png"; putExtra(Intent.EXTRA_STREAM, uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
        context.startActivity(Intent.createChooser(i, "Share image").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun file(context: Context, text: String, name: String, mime: String = "application/json") {
        val f = File(sharedDir(context), name)
        f.writeText(text)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", f)
        val i = Intent(Intent.ACTION_SEND).apply { type = mime; putExtra(Intent.EXTRA_STREAM, uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
        context.startActivity(Intent.createChooser(i, "Share file").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
