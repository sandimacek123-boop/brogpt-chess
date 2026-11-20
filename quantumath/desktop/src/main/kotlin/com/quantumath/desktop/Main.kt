package com.quantumath.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.res.loadImageBitmap
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.quantumath.app.AppContainer
import com.quantumath.app.data.DesktopDatabase
import com.quantumath.app.data.SettingsRepository
import com.quantumath.app.platform.DesktopPlatform
import com.quantumath.app.platform.DesktopWindow
import com.quantumath.app.platform.LocalAppContainer
import com.quantumath.app.platform.LocalPlatform
import com.quantumath.app.ui.nav.AppRoot
import com.quantumath.app.ui.theme.QuantumathTheme
import java.awt.Dimension
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import java.io.File

/** Per-user data folder: %APPDATA%\Quantumath on Windows, ~/.local/share/quantumath elsewhere (override: -Dquantumath.dataDir=...). */
fun dataDir(): File {
    System.getProperty("quantumath.dataDir")?.let { return File(it).apply { mkdirs() } }
    val appData = System.getenv("APPDATA")
    val dir = if (appData != null) File(appData, "Quantumath") else File(System.getProperty("user.home"), ".local/share/quantumath")
    return dir.apply { mkdirs() }
}

fun createContainer(dir: File?): AppContainer {
    val db = DesktopDatabase(dir?.let { File(it, "quantumath-data.json") })
    val prefsFile = dir?.let { File(it, "settings.preferences_pb") } ?: File.createTempFile("quantumath", ".preferences_pb").also { it.delete() }
    return AppContainer(db, SettingsRepository(PreferenceDataStoreFactory.create { prefsFile }))
}

/** The whole app with its platform providers; also used by the desktop UI tests. */
@Composable
fun QuantumathDesktopApp(container: AppContainer) {
    val settings by container.settings.collectAsState()
    val platform = remember(container) { DesktopPlatform(container) }
    val owners = remember { DesktopOwners() }
    QuantumathTheme(settings) {
        CompositionLocalProvider(
            LocalAppContainer provides container, LocalPlatform provides platform,
            LocalLifecycleOwner provides owners, LocalViewModelStoreOwner provides owners,
        ) {
            Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) { AppRoot() }
        }
    }
}

/** App-wide lifecycle (always resumed while the window exists) and ViewModel store for the navigation host. */
private class DesktopOwners : LifecycleOwner, ViewModelStoreOwner {
    private val registry = LifecycleRegistry.createUnsafe(this).apply { currentState = Lifecycle.State.RESUMED }
    override val lifecycle: Lifecycle get() = registry
    override val viewModelStore = ViewModelStore()
}

fun main() {
    // Prefer GPU rendering; fall back to software automatically (skiko), or force it with QUANTUMATH_SOFTWARE_RENDER=1
    if (System.getenv("QUANTUMATH_SOFTWARE_RENDER") == "1") System.setProperty("skiko.renderApi", "SOFTWARE")
    val container = createContainer(dataDir())
    application {
        val state = rememberWindowState(size = DpSize(1280.dp, 840.dp))
        val icon = remember { runCatching { BitmapPainter(Thread.currentThread().contextClassLoader.getResourceAsStream("icon.png")!!.use { loadImageBitmap(it) }) }.getOrNull() }
        Window(onCloseRequest = ::exitApplication, state = state, title = "Quantumath — Advanced Mathematics Laboratory", icon = icon) {
            LaunchedEffect(Unit) { window.minimumSize = Dimension(760, 560); DesktopWindow.frame = window }
            QuantumathDesktopApp(container)
        }
    }
}
