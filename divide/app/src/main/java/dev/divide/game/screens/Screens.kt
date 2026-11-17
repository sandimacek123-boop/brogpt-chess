package dev.divide.game.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.divide.game.AppState
import dev.divide.game.data.*
import dev.divide.game.game.*
import dev.divide.game.ui.*
import kotlin.math.min
import kotlin.math.sin

@Composable
private fun Page(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().background(DV.Ink).windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 18.dp, vertical = 14.dp), content = content)
}

// ======================================================================== Numberdex
@Composable
fun CodexScreen(app: AppState, onBack: () -> Unit) {
    val save = app.save
    val found = CODEX.count { it.n.toString() in save.codex }
    val bossValues = remember { BOSSES.map { it.value }.toSet() }
    Page {
        Header("NUMBERDEX", "$found of ${CODEX.size} special numbers discovered", DV.Gold, onBack)
        Spacer(Modifier.height(12.dp))
        Canvas(Modifier.fillMaxWidth().height(6.dp)) {
            drawRect(DV.Faint)
            drawRect(DV.Gold, size = Size(size.width * found / CODEX.size, size.height))
        }
        Spacer(Modifier.height(12.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            items(CODEX, key = { it.n }) { en ->
                val known = en.n.toString() in save.codex
                val prime = NT.isPrime(en.n)
                Row(Modifier.fillMaxWidth().cutPanel(if (known) (if (prime) DV.Gold else DV.Cyan) else DV.Faint).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.width(92.dp), contentAlignment = Alignment.CenterStart) {
                        val digits = en.n.toString().length
                        Txt(if (known) en.n.toString() else "?".repeat(min(digits, 4)), size = if (digits > 4) 17.sp else 24.sp, font = DV.Display, color = if (known) (if (prime) DV.Gold else DV.White) else DV.Faint, maxLines = 1)
                    }
                    Column(Modifier.weight(1f)) {
                        if (known) {
                            Txt(en.title.uppercase(), size = 13.sp, bold = true, spacing = 1.sp)
                            Txt(if (prime) "PRIME" else "= ${NT.factorString(en.n)}", size = 14.sp, font = DV.Math, color = if (prime) DV.Gold else DV.Cyan)
                            Spacer(Modifier.height(3.dp))
                            Txt(en.fact, size = 12.sp, color = DV.Dim, lineHeight = 16.sp)
                        } else {
                            Txt("UNDISCOVERED", size = 13.sp, bold = true, color = DV.Faint, spacing = 1.sp)
                            Txt(
                                when {
                                    en.n in bossValues -> "Carried by a boss. Break it."
                                    prime -> "A ${en.n.toString().length}-digit prime. Catch it."
                                    else -> "A ${en.n.toString().length}-digit composite. Divide it."
                                }, size = 12.sp, color = DV.Dim,
                            )
                        }
                    }
                }
            }
        }
    }
}

// ======================================================================== Blades
@Composable
fun BladesScreen(app: AppState, onBack: () -> Unit) {
    val save = app.save
    var frame by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) { while (true) withFrameNanos { frame++ } }
    val t0 = remember { System.nanoTime() }
    Page {
        Header("BLADES", "${save.blades.size} of ${BLADES.size} unlocked · cosmetic only", DV.Cyan, onBack)
        Spacer(Modifier.height(14.dp))
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (row in BLADES.chunked(2)) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for (b in row) {
                    val unlocked = bladeUnlocked(b.id, save) || b.id in save.blades
                    val equipped = save.blade == b.id
                    val col = Color(b.color)
                    Column(
                        Modifier.weight(1f).press(unlocked) { app.update { it.copy(blade = b.id) }; app.sound.play("slice_hi", 0.8f) }
                            .cutPanel(if (equipped) col else if (unlocked) DV.Faint else DV.Faint.copy(alpha = 0.5f), glow = equipped).padding(12.dp),
                    ) {
                        BladePreview(app, b.id, Modifier.fillMaxWidth().height(96.dp).graphicsLayer { alpha = if (unlocked) 1f else 0.25f }, frame, t0)
                        Spacer(Modifier.height(8.dp))
                        Txt(b.name, size = 15.sp, font = DV.Display, color = if (unlocked) DV.White else DV.Dim, maxLines = 1)
                        Txt(
                            when { equipped -> "EQUIPPED"; unlocked -> "TAP TO EQUIP"; else -> "🔒 " + b.unlock },
                            size = 11.sp, color = if (equipped) col else DV.Dim, bold = equipped, lineHeight = 14.sp,
                        )
                        if (!unlocked) {
                            val (v, max) = when (b.id) {
                                "sieve" -> save.primesCaught.toFloat() to 100f
                                "golden" -> save.bestWave.toFloat() to 6f
                                "fourier" -> save.bestCombo.toFloat() to 40f
                                else -> 0f to 1f
                            }
                            if (max > 1f) {
                                Spacer(Modifier.height(6.dp))
                                Canvas(Modifier.fillMaxWidth().height(4.dp)) { drawRect(DV.Faint); drawRect(col, size = Size(size.width * min(1f, v / max), size.height)) }
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(20.dp))
        }
    }
}

@Composable
private fun BladePreview(app: AppState, id: String, modifier: Modifier, frame: Int, t0: Long) {
    val look = remember { Look() }
    val trail = remember { Trail(0) }
    Canvas(modifier) {
        frame
        val t = (System.nanoTime() - t0) / 1e9f + id.hashCode() % 7
        drawRect(Color(0xFF07060D))
        look.scale = size.width / 400f
        look.blade = id
        look.time = t
        trail.n = 0; trail.cutting = true
        val h = size.height / look.scale
        for (k in 15 downTo 0) {
            val tt = t - k * 0.0085f
            trail.add(200f + 165f * sin(tt * 6.9f), h / 2 + h * 0.36f * sin(tt * 11.1f + 0.6f), tt)
        }
        drawIntoCanvas { app.renderer.preview(it.nativeCanvas, trail, look) }
    }
}

// ======================================================================== Settings
@Composable
fun SettingsScreen(app: AppState, onBack: () -> Unit) {
    val s = app.save
    Page {
        Header("SETTINGS", "tune the feel", DV.Dim, onBack)
        Spacer(Modifier.height(14.dp))
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Section("SOUND", DV.Cyan) {
                Slider("Effects", s.sfx) { v -> app.update { it.copy(sfx = v) } }
                Slider("Music", s.music) { v -> app.update { it.copy(music = v) } }
            }
            Section("FEEL", DV.Red) {
                Toggle("Haptics", s.haptics, DV.Red) { v -> app.update { it.copy(haptics = v) }; if (v) app.sound.buzz(2) }
                Toggle("Reduce flashing", s.reduceFlash, DV.Red) { v -> app.update { it.copy(reduceFlash = v) } }
                Txt("Replaces impact frames with a soft dim, lowers flashes and halves screen shake.", size = 11.sp, color = DV.Dim)
                Toggle("Factor hints in every mode", s.hints, DV.Red) { v -> app.update { it.copy(hints = v) } }
                Txt("Shows how each composite will split, like in Zen and Training.", size = 11.sp, color = DV.Dim)
            }
            Section("HOW TO PLAY", DV.Gold) {
                for (line in listOf(
                    "Swipe fast through a composite number to divide it. It splits into its two most balanced factors.",
                    "Prime pieces fly home as points. Composite pieces keep falling — divide them again.",
                    "Gold numbers are prime. Tap them to catch them. Slicing one is a CLANG and costs a shield.",
                    "A composite that reaches the red line is a BREACH and costs a shield.",
                    "One swipe through several numbers is a chain: 3+ cuts trigger impacts and bonus points.",
                    "Catching primes fills Σ OVERDRIVE. Tap the meter: for six seconds every cut shatters numbers into all their primes, and slicing primes catches them.",
                    "Every third wave a boss arrives. Each cut strips one prime factor. Read the orbiting beads.",
                    "The ring around a composite is broken into one arc per prime factor. Count them.",
                )) Txt("•  $line", size = 13.sp, lineHeight = 18.sp)
            }
            Section("RECORDS", DV.Violet) {
                val rows = listOf(
                    "Games" to "${s.games}", "Numbers divided" to "%,d".format(s.totalSliced), "Primes caught" to "%,d".format(s.primesCaught),
                    "Best combo" to "×${s.bestCombo}", "Best wave" to "${s.bestWave}", "Clangs (ouch)" to "%,d".format(s.clangs),
                    "Bosses broken" to "${s.bosses.size}/7",
                ) + Mode.entries.filter { it != Mode.Tutorial && it != Mode.Daily }.map { "Best · ${it.label.lowercase()}" to "%,d".format(s.best[it.name] ?: 0L) }
                for ((k, v) in rows) Row(Modifier.fillMaxWidth()) { Txt(k, Modifier.weight(1f), size = 13.sp, color = DV.Dim); Txt(v, size = 13.sp, bold = true) }
            }
            Section("ABOUT", DV.Dim) {
                Txt("DIVIDE 1.0", size = 15.sp, font = DV.Display)
                Txt("Every sound and every music loop is synthesised on your phone the first time the game starts. No ads, no accounts, no internet, no tracking.", size = 12.sp, color = DV.Dim, lineHeight = 17.sp)
                Txt("Type: Bungee, Chakra Petch, STIX Two Math (SIL Open Font License).", size = 11.sp, color = DV.Faint)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun Section(title: String, accent: Color, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().cutPanel(accent.copy(alpha = 0.6f)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Txt(title, size = 11.sp, color = accent, bold = true, spacing = 2.sp)
        content()
    }
}
