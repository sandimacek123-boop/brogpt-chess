package com.brightsteps.app

import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import java.util.Locale

class MainActivity : ComponentActivity() {
    private var tts: TextToSpeech? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        tts = TextToSpeech(this) { if (it == TextToSpeech.SUCCESS) tts?.language = Locale.US }
        val prefs = getSharedPreferences("progress", Context.MODE_PRIVATE)
        setContent {
            CalmTheme {
                App(
                    initialDone = prefs.getStringSet("done", null).orEmpty().toSet(),
                    save = { prefs.edit().putStringSet("done", it).apply() },
                    speak = { tts?.speak(it.replace("📦", "the box"), TextToSpeech.QUEUE_FLUSH, null, "say") },
                )
            }
        }
    }

    override fun onDestroy() {
        tts?.shutdown()
        super.onDestroy()
    }
}

// Soft, low-contrast-noise colors. "Try again" is warm amber, never alarm red.
private val Light = lightColorScheme(
    primary = Color(0xFF3F6FA8), onPrimary = Color.White,
    primaryContainer = Color(0xFFDCE8F7), onPrimaryContainer = Color(0xFF13304F),
    tertiaryContainer = Color(0xFFD9F0DF), onTertiaryContainer = Color(0xFF15402A),
    errorContainer = Color(0xFFFBEBCF), onErrorContainer = Color(0xFF4A3410),
    background = Color(0xFFF8F6F1), surface = Color.White,
    surfaceVariant = Color(0xFFEDEAE3), onSurfaceVariant = Color(0xFF45464F),
    surfaceContainerHighest = Color.White, // cards
    secondaryContainer = Color(0xFFE3EAF3), onSecondaryContainer = Color(0xFF1D2B3A), // number pad, progress track
)
private val Dark = darkColorScheme(
    primary = Color(0xFF9CC2EE), onPrimary = Color(0xFF0D2A47),
    primaryContainer = Color(0xFF26456A), onPrimaryContainer = Color(0xFFDCE8F7),
    tertiaryContainer = Color(0xFF24503A), onTertiaryContainer = Color(0xFFD9F0DF),
    errorContainer = Color(0xFF5A4520), onErrorContainer = Color(0xFFFBEBCF),
    background = Color(0xFF16191D), surface = Color(0xFF1F2329),
    surfaceVariant = Color(0xFF2A2F36), onSurfaceVariant = Color(0xFFC9C6C0),
    surfaceContainerHighest = Color(0xFF242930),
    secondaryContainer = Color(0xFF33404F), onSecondaryContainer = Color(0xFFDCE4EE),
)

@Composable
fun CalmTheme(content: @Composable () -> Unit) =
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)

@Composable
fun App(initialDone: Set<String>, save: (Set<String>) -> Unit, speak: (String) -> Unit) {
    var done by remember { mutableStateOf(initialDone) }
    var course by rememberSaveable { mutableIntStateOf(-1) }
    var lesson by rememberSaveable { mutableIntStateOf(-1) }
    var step by rememberSaveable { mutableIntStateOf(0) } // lives here so a break doesn't restart the lesson
    var resting by rememberSaveable { mutableStateOf(false) }

    BackHandler(enabled = resting || course >= 0) {
        when {
            resting -> resting = false
            lesson >= 0 -> lesson = -1
            else -> course = -1
        }
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.safeDrawingPadding().padding(16.dp)) {
            when {
                resting -> BreakScreen { resting = false }
                course < 0 -> HomeScreen(done, onCourse = { course = it }, onBreak = { resting = true })
                lesson < 0 -> CourseScreen(
                    COURSES[course], done,
                    onLesson = { lesson = it; step = 0 },
                    onBack = { course = -1 },
                )
                else -> key(course, lesson) {
                    val c = COURSES[course]
                    LessonScreen(
                        c.lessons[lesson], step, speak,
                        onStep = {
                            step = it
                            if (it == c.lessons[lesson].steps.size) {
                                done = done + c.lessonId(lesson)
                                save(done)
                            }
                        },
                        onExit = { lesson = -1 },
                        onBreak = { resting = true },
                    )
                }
            }
        }
    }
}

@Composable
fun BigButton(label: String, onClick: () -> Unit, enabled: Boolean = true) =
    Button(onClick, Modifier.fillMaxWidth().height(64.dp), enabled = enabled, shape = RoundedCornerShape(20.dp)) {
        Text(label, style = MaterialTheme.typography.titleLarge)
    }

@Composable
fun HomeScreen(done: Set<String>, onCourse: (Int) -> Unit, onBreak: () -> Unit) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Bright Steps", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                    Text("Pick something to learn. Go at your own speed.", style = MaterialTheme.typography.bodyLarge)
                }
                Text(
                    "⭐ ${done.size}",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.semantics { contentDescription = "${done.size} stars" },
                )
            }
        }
        item {
            Card(
                onClick = onBreak,
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
            ) {
                Text("🌿  Need a break? Breathe with me", Modifier.padding(20.dp), style = MaterialTheme.typography.titleMedium)
            }
        }
        itemsIndexed(COURSES) { i, c ->
            val finished = c.lessons.indices.count { c.lessonId(it) in done }
            Card(onClick = { onCourse(i) }, Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(c.emoji, fontSize = 40.sp)
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text(c.title, style = MaterialTheme.typography.titleLarge)
                        Text(c.subtitle, style = MaterialTheme.typography.bodyMedium)
                        LinearProgressIndicator(
                            progress = { finished / c.lessons.size.toFloat() },
                            Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        )
                        Text("$finished of ${c.lessons.size} lessons done", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

@Composable
fun CourseScreen(c: Course, done: Set<String>, onLesson: (Int) -> Unit, onBack: () -> Unit) {
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onBack) { Text("← All topics", style = MaterialTheme.typography.titleMedium) }
        Text("${c.emoji} ${c.title}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text(c.subtitle, style = MaterialTheme.typography.bodyLarge)
        c.lessons.forEachIndexed { i, l ->
            val isDone = c.lessonId(i) in done
            Card(
                onClick = { onLesson(i) },
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = if (isDone) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.surface,
                ),
            ) {
                Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(40.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("${i + 1}", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                    Spacer(Modifier.width(16.dp))
                    Text(l.title, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                    Text(if (isDone) "✅ Done" else "${l.steps.size} steps", style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

@Composable
fun LessonScreen(
    lesson: Lesson,
    step: Int,
    speak: (String) -> Unit,
    onStep: (Int) -> Unit,
    onExit: () -> Unit,
    onBreak: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onExit) { Text("✕ Stop") }
            LinearProgressIndicator(
                progress = { step / lesson.steps.size.toFloat() },
                Modifier.weight(1f).height(10.dp),
            )
            TextButton(onBreak) { Text("🌿 Break") }
        }
        if (step >= lesson.steps.size) {
            Column(
                Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            ) {
                Text("🌟", fontSize = 96.sp)
                Text("You finished the lesson!", style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
                Text("You earned a star. Great job!", style = MaterialTheme.typography.bodyLarge)
                BigButton("Back to lessons", onExit)
            }
        } else {
            key(step) { StepView(lesson.steps[step], speak) { onStep(step + 1) } }
        }
    }
}

private val PRAISE = listOf("Yes! You got it!", "Great thinking!", "That's right!", "Awesome work!", "Nice job!")

@Composable
fun StepView(s: Step, speak: (String) -> Unit, onNext: () -> Unit) {
    var picked by rememberSaveable { mutableStateOf("") }
    var result by rememberSaveable { mutableStateOf<Boolean?>(null) }
    var wrong by rememberSaveable { mutableIntStateOf(0) }
    val praise = remember { PRAISE.random() }
    val solved = result == true
    val pick = { v: String -> picked = v; result = null }

    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (s.visual.isNotEmpty()) {
                Text(s.visual, fontSize = 34.sp, lineHeight = 46.sp, textAlign = TextAlign.Center)
            }
            Text(s.text, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
            TextButton({ speak(s.text) }) { Text("🔊 Read it to me") }
            when (s) {
                is Choice -> s.options.forEach { o ->
                    Surface(
                        selected = picked == o,
                        onClick = { pick(o) },
                        enabled = !solved,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp),
                        shape = RoundedCornerShape(20.dp),
                        color = if (picked == o) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                        border = BorderStroke(
                            if (picked == o) 3.dp else 1.dp,
                            if (picked == o) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                        ),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(o, Modifier.padding(16.dp), fontSize = 24.sp, textAlign = TextAlign.Center)
                        }
                    }
                }
                is NumberInput -> NumberPad(picked, enabled = !solved) { pick(it) }
                is Learn -> Unit
            }
            val note = when {
                solved -> "🌟 $praise"
                wrong >= 3 -> "💙 That's okay! The answer is ${s.answerText}. Pick it to keep going."
                result == false -> "💙 Not quite. That's okay, try again!\n💡 ${s.hint}"
                wrong > 0 -> "💡 ${s.hint}"
                else -> null
            }
            if (note != null) {
                Surface(
                    color = when {
                        solved -> MaterialTheme.colorScheme.tertiaryContainer
                        result == false -> MaterialTheme.colorScheme.errorContainer
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    },
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
                ) {
                    Text(note, Modifier.padding(16.dp), style = MaterialTheme.typography.titleMedium)
                }
            }
        }
        BigButton(
            label = when {
                s is Learn -> "Got it →"
                solved -> "Next →"
                else -> "Check"
            },
            enabled = s is Learn || picked.isNotEmpty(),
            onClick = {
                when {
                    s is Learn || solved -> onNext()
                    s.isCorrect(picked) -> result = true
                    else -> { result = false; wrong++ }
                }
            },
        )
    }
}

@Composable
fun NumberPad(value: String, enabled: Boolean, onChange: (String) -> Unit) {
    Text(
        value.ifEmpty { "?" },
        fontSize = 48.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.semantics { contentDescription = "Your answer: ${value.ifEmpty { "empty" }}" },
    )
    listOf("123", "456", "789", "⌫0").forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            row.forEach { k ->
                FilledTonalButton(
                    onClick = { onChange(if (k == '⌫') value.dropLast(1) else (value + k).take(4)) },
                    enabled = enabled,
                    modifier = Modifier.size(84.dp, 64.dp).semantics { if (k == '⌫') contentDescription = "Delete" },
                    shape = RoundedCornerShape(16.dp),
                ) { Text("$k", fontSize = 28.sp) }
            }
        }
    }
}

@Composable
fun BreakScreen(onDone: () -> Unit) {
    var inhale by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        while (true) {
            inhale = !inhale
            delay(4000)
        }
    }
    val scale by animateFloatAsState(if (inhale) 1f else 0.5f, tween(4000, easing = LinearEasing), label = "breath")
    Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceEvenly,
    ) {
        Text("Break time 🌿", style = MaterialTheme.typography.headlineMedium)
        Box(Modifier.size(260.dp), contentAlignment = Alignment.Center) {
            Box(
                Modifier.fillMaxSize()
                    .graphicsLayer { scaleX = scale; scaleY = scale }
                    .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
            )
            Text(if (inhale) "Breathe in…" else "Breathe out…", style = MaterialTheme.typography.titleLarge)
        }
        Text(
            "Watch the circle. Breathe in while it grows. Breathe out while it shrinks.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        BigButton("I'm ready", onDone)
    }
}
