package dev.universe.engine

import android.app.Application
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.universe.engine.core.ui.UE
import dev.universe.engine.data.SettingsStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val store = SettingsStore(application)
    val nav = Nav()
    val app = AppState { p -> viewModelScope.launch { store.save(p) } }
    var ready by mutableStateOf(false)
        private set

    init {
        viewModelScope.launch {
            app.load(runCatching { store.prefs.first() }.getOrDefault(app.prefs))
            ready = true
        }
    }
}

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        setContent {
            if (vm.ready) UniverseApp(vm.app, vm.nav) else Box(Modifier.fillMaxSize().background(UE.Void))
        }
    }
}
