package dev.divide.game

import android.content.Context
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import dev.divide.game.audio.Sound
import dev.divide.game.data.Save
import dev.divide.game.data.Store
import dev.divide.game.game.Mode
import dev.divide.game.game.Renderer
import dev.divide.game.screens.*
import dev.divide.game.ui.DV
import dev.divide.game.ui.LocalUiFx
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.time.LocalDate

enum class Screen { Warn, Menu, Game, Codex, Blades, Settings }

/** App-wide services and persisted state. */
class AppState(val context: Context, private val scope: CoroutineScope) {
    val store = Store(context)
    val sound = Sound(context)
    val renderer by lazy { Renderer(context) }
    var save by mutableStateOf(Save())
        private set
    var loaded by mutableStateOf(false)
    /** Set when the boot title slam has played this launch. */
    var booted = false
    /** Bumped when the app is backgrounded so a running game can pause itself. */
    var pauseSignal by mutableIntStateOf(0)

    fun apply(s: Save) {
        save = s
        sound.sfxVolume = s.sfx; sound.musicVolume = s.music; sound.hapticsOn = s.haptics
    }

    fun update(f: (Save) -> Save) {
        val s = f(save)
        apply(s)
        scope.launch { runCatching { store.save(s) } }
    }

    fun today(): String = LocalDate.now().toString()

    companion object { val isTest = Build.FINGERPRINT == "robolectric" }
}

@Composable
fun DivideApp(initial: Screen? = null, initialMode: Mode = Mode.Arcade, preset: Save? = null) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val app = remember { AppState(context.applicationContext, scope) }
    var screen by remember { mutableStateOf(initial ?: Screen.Menu) }
    var mode by remember { mutableStateOf(initialMode) }
    var gameKey by remember { mutableIntStateOf(0) }
    val wipe = remember { Animatable(0f) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        if (preset != null) { app.apply(preset); app.loaded = true; app.booted = initial != null; return@LaunchedEffect }
        app.apply(app.store.load())
        app.loaded = true
        if (initial == null && !app.save.flashAsked) screen = Screen.Warn
        if (!AppState.isTest) app.sound.prepare(scope)
    }
    DisposableEffect(Unit) { onDispose { app.sound.release() } }
    LifecycleEventEffect(Lifecycle.Event.ON_PAUSE) { app.sound.pause(); app.pauseSignal++ }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { app.sound.resume() }

    LaunchedEffect(screen) {
        app.sound.music(when (screen) { Screen.Game -> if (mode == Mode.Zen) Sound.Music.Menu else Sound.Music.Battle; else -> Sound.Music.Menu })
    }

    fun go(to: Screen) {
        if (busy) return
        busy = true
        scope.launch {
            app.sound.play("slice_lo", 0.55f)
            wipe.snapTo(0f)
            wipe.animateTo(0.5f, tween(170, easing = FastOutSlowInEasing))
            screen = to
            wipe.animateTo(1f, tween(230, easing = FastOutSlowInEasing))
            wipe.snapTo(0f)
            busy = false
        }
    }

    CompositionLocalProvider(LocalUiFx provides { app.sound.play("tick", 0.7f); app.sound.buzz(0) }) {
        Box(Modifier.fillMaxSize().background(DV.Ink)) {
            if (app.loaded) when (screen) {
                Screen.Warn -> WarnScreen(app) { app.update { it.copy(flashAsked = true) }; go(Screen.Menu) }
                Screen.Menu -> MenuScreen(app, onPlay = { m -> mode = m; gameKey++; go(Screen.Game) }, onOpen = { go(it) })
                Screen.Game -> key(gameKey) {
                    GameScreen(app, mode, onRetry = { gameKey++ }, onExit = { go(Screen.Menu) }, onPlay = { m -> mode = m; gameKey++ })
                }
                Screen.Codex -> CodexScreen(app) { go(Screen.Menu) }
                Screen.Blades -> BladesScreen(app) { go(Screen.Menu) }
                Screen.Settings -> SettingsScreen(app) { go(Screen.Menu) }
            }
            if (screen != Screen.Menu && screen != Screen.Game && screen != Screen.Warn) BackHandler { go(Screen.Menu) }
            SlashWipe(wipe.value)
        }
    }
}

/** Screen transition: a black blade sweeps diagonally across, edged in red and white. */
@Composable
private fun SlashWipe(p: Float) {
    if (p <= 0f || p >= 1f) return
    Canvas(Modifier.fillMaxSize()) {
        val w = size.width; val h = size.height
        val slant = w * 0.45f
        // leading edge travels across in the first half, trailing edge follows in the second
        val lead = if (p < 0.5f) p / 0.5f else 1f
        val trail = if (p < 0.5f) 0f else (p - 0.5f) / 0.5f
        val x1 = -slant + (w + slant * 2) * lead
        val x0 = -slant + (w + slant * 2) * trail - slant
        val path = Path().apply { moveTo(x0, 0f); lineTo(x1 + slant * 0.5f, 0f); lineTo(x1 - slant * 0.5f, h); lineTo(x0 - slant, h); close() }
        drawPath(path, DV.Ink)
        drawLine(DV.Red, Offset(x1 + slant * 0.5f, 0f), Offset(x1 - slant * 0.5f, h), 10.dpPx(density))
        drawLine(DV.White, Offset(x1 + slant * 0.5f + 14f, 0f), Offset(x1 - slant * 0.5f + 14f, h), 2.dpPx(density))
    }
}

private fun Int.dpPx(d: Float) = this * d
