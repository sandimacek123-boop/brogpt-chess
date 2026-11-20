package com.quantumath.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.CompositionLocalProvider
import com.quantumath.app.platform.AndroidPlatform
import com.quantumath.app.platform.LocalAppContainer
import com.quantumath.app.platform.LocalPlatform
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.quantumath.app.ui.nav.AppRoot
import com.quantumath.app.ui.theme.LocalLab
import com.quantumath.app.ui.theme.QuantumathTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val c = container
        setContent {
            val settings by c.settings.collectAsStateWithLifecycle()
            QuantumathTheme(settings) {
                val dark = LocalLab.current.dark
                val bg = MaterialTheme.colorScheme.background.toArgb()
                DisposableEffect(dark) {
                    val style = if (dark) SystemBarStyle.dark(bg) else SystemBarStyle.light(bg, android.graphics.Color.BLACK)
                    enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
                    onDispose {}
                }
                val platform = remember { AndroidPlatform(this@MainActivity) }
                CompositionLocalProvider(LocalAppContainer provides c, LocalPlatform provides platform) {
                    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) { AppRoot() }
                }
            }
        }
    }
}
