package com.quantumath.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavHostController
import com.quantumath.app.AppContainer
import com.quantumath.app.ProgressRepository
import com.quantumath.app.container
import com.quantumath.app.data.Favorite
import com.quantumath.app.data.Kind
import com.quantumath.app.data.Note
import com.quantumath.app.data.QuizResult
import com.quantumath.app.ui.components.*
import com.quantumath.app.ui.nav.appViewModel
import com.quantumath.app.ui.theme.LocalLab
import com.quantumath.app.ui.theme.MonoFamily
import com.quantumath.math.learning.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

// =============================== Learning hub ===============================

class LearnViewModel(c: AppContainer) : ViewModel() {
    val lessons = c.progress.lessons.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    var topic by mutableStateOf(QuizTopic.ARITHMETIC)
    var difficulty by mutableStateOf(Difficulty.EASY)
}

@Composable
fun LearnScreen(nav: NavHostController) {
    val vm = appViewModel { LearnViewModel(it) }
    val progress by vm.lessons.collectAsStateWithLifecycle()
    val done = progress.filter { it.completed }.map { it.lessonId }.toSet()
    val lab = LocalLab.current
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Learning center", subtitle = "${done.size} of ${Lessons.all.size} lessons complete", actions = {
            IconButton(onClick = { nav.navigate("achievements") }) { Icon(Icons.Outlined.EmojiEvents, "Achievements") }
        })
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ToolTile(Icons.Outlined.MenuBook, "Formula library", "${FormulaLibrary.all.size} formulas", lab.accent2, { nav.navigate("formulas") }, Modifier.weight(1f))
                    ToolTile(Icons.Outlined.EmojiEvents, "Challenges", "Daily & timed", lab.curves[2], { nav.navigate("challenge") }, Modifier.weight(1f))
                }
            }
            item {
                Panel(title = "Practice quiz", icon = Icons.Outlined.Quiz) {
                    Text("Questions are generated from a seed and every answer is computed by the math engine.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    ChipRow(QuizTopic.entries, vm.topic, { vm.topic = it }, { it.label })
                    Spacer(Modifier.height(6.dp))
                    ChipRow(Difficulty.entries, vm.difficulty, { vm.difficulty = it }, { it.label })
                    Spacer(Modifier.height(10.dp))
                    PrimaryButton("Start 10 questions", { nav.navigate("quiz/${vm.topic.name}/${vm.difficulty.name}/practice") }, Modifier.fillMaxWidth())
                }
            }
            val grouped = Lessons.all.groupBy { it.topic }
            for ((topic, ls) in grouped) {
                item(key = "h$topic") { SectionTitle(topic) }
                items(ls, key = { it.id }) { l ->
                    val complete = l.id in done
                    Surface(onClick = { nav.navigate("lesson/${l.id}") }, shape = RoundedCornerShape(16.dp), color = lab.panel, border = BorderStroke(1.dp, if (complete) lab.success.copy(alpha = 0.5f) else lab.panelBorder)) {
                        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(if (complete) Icons.Filled.CheckCircle else Icons.Outlined.Circle, if (complete) "Completed" else "Not completed", tint = if (complete) lab.success else MaterialTheme.colorScheme.outline)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(l.title, style = MaterialTheme.typography.titleSmall)
                                Text(l.summary, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(l.level.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                Text("${l.minutes} min", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

// =============================== Lesson ===============================

class LessonViewModel(private val c: AppContainer, val lesson: Lesson?) : ViewModel() {
    val answers = mutableStateMapOf<Int, String>()
    val results = mutableStateMapOf<Int, Boolean>()
    val hints = mutableStateMapOf<Int, Boolean>()
    var completed by mutableStateOf(false)
    val exercises = lesson?.blocks?.withIndex()?.filter { it.value is Block.Exercise }?.map { it.index } ?: emptyList()

    init { viewModelScope.launch { completed = lesson?.let { c.db.progress().lesson(it.id)?.completed } == true } }

    fun check(i: Int, ex: Block.Exercise) {
        results[i] = AnswerChecker.check(answers[i].orEmpty(), ex.answers)
        if (exercises.isNotEmpty() && exercises.all { results[it] == true } && !completed) complete()
    }

    fun complete() {
        val l = lesson ?: return
        completed = true
        viewModelScope.launch {
            c.progress.completeLesson(l.id, results.count { it.value }).forEach { c.unlock(it) }
            c.messages.emit("Lesson complete: ${l.title}")
        }
    }
}

@Composable
fun LessonScreen(nav: NavHostController, id: String) {
    val lesson = Lessons.byId(id)
    val vm = appViewModel { LessonViewModel(it, lesson) }
    val ctx = LocalContext.current
    val favs by ctx.container.favoriteKeys.collectAsStateWithLifecycle()
    val lab = LocalLab.current
    if (lesson == null) { Column { LabTopBar("Lesson", onBack = { nav.popBackStack() }); ErrorPanel("Lesson not found", Modifier.padding(16.dp)) }; return }
    val key = "lesson:${lesson.id}"
    Column(Modifier.fillMaxSize()) {
        LabTopBar(lesson.title, onBack = { nav.popBackStack() }, subtitle = "${lesson.topic} · ${lesson.level.label} · ${lesson.minutes} min", actions = {
            IconButton(onClick = { ctx.container.toggleFavorite(Favorite(key, Kind.LESSON, lesson.title, lesson.summary)) }) {
                Icon(if (key in favs) Icons.Filled.Star else Icons.Outlined.StarOutline, if (key in favs) "Remove from favorites" else "Add to favorites", tint = if (key in favs) lab.warning else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        })
        ScreenColumn {
            Text(lesson.summary, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            lesson.blocks.forEachIndexed { i, b ->
                when (b) {
                    is Block.Text -> Text(b.text, style = MaterialTheme.typography.bodyLarge)
                    is Block.Formula -> Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f), modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) {
                            Text(b.formula, style = MaterialTheme.typography.titleMedium.copy(fontFamily = MonoFamily))
                            if (b.caption.isNotEmpty()) Text(b.caption, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    is Block.Example -> Panel(title = "Example", icon = Icons.Outlined.Lightbulb) {
                        Text(b.problem, style = MaterialTheme.typography.titleSmall)
                        b.steps.forEachIndexed { k, s -> Text("${k + 1}. $s", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp)) }
                        Text("Answer: ${b.answer}", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = MaterialTheme.colorScheme.secondary, modifier = Modifier.padding(top = 6.dp))
                    }
                    is Block.Exercise -> ExerciseCard(i, b, vm)
                }
            }
            if (vm.completed) InfoPanel("Lesson completed ✓", icon = Icons.Filled.CheckCircle)
            else OutlinedButton(onClick = vm::complete, modifier = Modifier.fillMaxWidth()) { Text("Mark lesson as complete") }
            val next = Lessons.all.getOrNull(Lessons.all.indexOf(lesson) + 1)
            if (next != null) Button(onClick = { nav.navigate("lesson/${next.id}") { popUpTo("lesson/{id}") { inclusive = true } } }, modifier = Modifier.fillMaxWidth()) { Text("Next: ${next.title}") }
        }
    }
}

@Composable
private fun ExerciseCard(i: Int, ex: Block.Exercise, vm: LessonViewModel) {
    val lab = LocalLab.current
    val res = vm.results[i]
    Panel(title = "Exercise", icon = Icons.Outlined.Edit) {
        Text(ex.prompt, style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(vm.answers[i].orEmpty(), { vm.answers[i] = it; vm.results.remove(i) }, Modifier.weight(1f), singleLine = true, label = { Text("Your answer") },
                textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = MonoFamily), isError = res == false,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, autoCorrectEnabled = false, imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { vm.check(i, ex) }))
            Spacer(Modifier.width(8.dp))
            Button(onClick = { vm.check(i, ex) }) { Text("Check") }
        }
        if (res != null) Text(if (res) "✓ Correct!" else "✗ Not quite — try again or open the hint.", color = if (res) lab.success else MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 6.dp).semantics { liveRegion = LiveRegionMode.Polite })
        Row {
            TextButton(onClick = { vm.hints[i] = !(vm.hints[i] ?: false) }) { Text(if (vm.hints[i] == true) "Hide hint" else "Hint") }
            if (res != null) TextButton(onClick = { vm.hints[i + 10_000] = true }) { Text("Show solution") }
        }
        AnimatedVisibility(vm.hints[i] == true) { Text("💡 ${ex.hint}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        AnimatedVisibility(vm.hints[i + 10_000] == true) { Text("Answer: ${ex.answers.joinToString(", ")}. ${ex.explanation}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary) }
        Text("Exact forms and decimals are both accepted (e.g. 1/2 or 0.5, sqrt(3)/2 or 0.866).", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
    }
}

// =============================== Quiz ===============================

class QuizViewModel(private val c: AppContainer, val topicArg: String, val difficultyArg: String, val mode: String) : ViewModel() {
    val daily = mode == "daily"
    val timed = mode == "timed" || daily
    val difficulty = runCatching { Difficulty.valueOf(difficultyArg) }.getOrDefault(Difficulty.MEDIUM)
    val dayKey = ProgressRepository.dayKey(ProgressRepository.today())
    val questions: List<Question> = when {
        daily -> DailyChallenge.questions(dayKey)
        topicArg == "MIXED" -> QuizGenerator.mixed(difficulty, System.currentTimeMillis())
        else -> QuizGenerator.generate(runCatching { QuizTopic.valueOf(topicArg) }.getOrDefault(QuizTopic.ARITHMETIC), difficulty, System.currentTimeMillis(), 10)
    }
    val totalSeconds = if (daily) 300 else questions.size * difficulty.seconds / 2
    var index by mutableStateOf(0)
    var answer by mutableStateOf("")
    var feedback by mutableStateOf<Boolean?>(null)
    var showHint by mutableStateOf(false)
    val correct = mutableStateListOf<Boolean>()
    val given = mutableStateListOf<String>()
    var remaining by mutableStateOf(totalSeconds)
    var finished by mutableStateOf(false)
    var alreadyDone by mutableStateOf(false)
    private val started = System.currentTimeMillis()

    init {
        if (daily) viewModelScope.launch { alreadyDone = c.db.progress().dailyResults().any { it.dayKey == dayKey } }
        if (timed) viewModelScope.launch {
            while (!finished && remaining > 0) { delay(1000); if (!finished) remaining-- }
            if (!finished) { while (correct.size < questions.size) { correct += false; given += "(time up)" }; finish() }
        }
    }

    fun submit() {
        if (feedback != null || finished) return
        val ok = AnswerChecker.check(answer, questions[index].answers)
        feedback = ok; correct += ok; given += answer
    }

    fun next() {
        if (index + 1 >= questions.size) { finish(); return }
        index++; answer = ""; feedback = null; showHint = false
    }

    private fun finish() {
        if (finished) return
        finished = true
        val score = correct.count { it }
        val secs = ((System.currentTimeMillis() - started) / 1000).toInt()
        if (daily && alreadyDone) return // replay: do not record twice
        viewModelScope.launch {
            val ach = c.progress.recordQuiz(QuizResult(topic = if (daily) "DAILY" else topicArg, difficulty = difficulty.name, score = score, total = questions.size, seconds = secs, timed = timed, daily = daily, dayKey = if (daily) dayKey else 0))
            ach.forEach { c.unlock(it) }
            if (timed && remaining * 2 >= totalSeconds && score == questions.size) c.unlock("speed")
        }
    }

    fun saveMistakes() {
        val wrong = questions.indices.filter { correct.getOrNull(it) == false }
        if (wrong.isEmpty()) return
        c.saveNote(Note(title = "Quiz review (${wrong.size} to revisit)", kind = Kind.NOTE, input = "Quiz", result = "", body = wrong.joinToString("\n\n") { i -> "${questions[i].prompt}\nYour answer: ${given.getOrNull(i)}\nCorrect: ${questions[i].answers.joinToString()}\n${questions[i].explanation}" }))
    }
}

@Composable
fun QuizScreen(nav: NavHostController, topic: String, difficulty: String, mode: String) {
    val vm = appViewModel { QuizViewModel(it, topic, difficulty, mode) }
    val lab = LocalLab.current
    val title = if (vm.daily) "Daily challenge" else if (topic == "MIXED") "Mixed quiz" else runCatching { QuizTopic.valueOf(topic).label }.getOrDefault("Quiz")
    Column(Modifier.fillMaxSize()) {
        LabTopBar(title, onBack = { nav.popBackStack() }, subtitle = "${vm.difficulty.label}${if (vm.timed) " · timed" else ""}${if (vm.daily && vm.alreadyDone) " · replay (not scored)" else ""}", actions = {
            if (vm.timed && !vm.finished) Text("%d:%02d".format(vm.remaining / 60, vm.remaining % 60), style = MaterialTheme.typography.titleMedium.copy(fontFamily = MonoFamily), color = if (vm.remaining < 20) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary, modifier = Modifier.padding(end = 16.dp))
        })
        if (vm.finished) QuizSummary(vm, nav) else ScreenColumn {
            val q = vm.questions[vm.index]
            LinearProgressIndicator(progress = { (vm.index + (if (vm.feedback != null) 1 else 0)) / vm.questions.size.toFloat() }, Modifier.fillMaxWidth().clip(CircleShape))
            Text("Question ${vm.index + 1} of ${vm.questions.size} · ${q.topic.label} · ${q.difficulty.label}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Panel {
                Text(q.prompt, style = MaterialTheme.typography.titleLarge)
            }
            OutlinedTextField(vm.answer, { if (vm.feedback == null) vm.answer = it }, Modifier.fillMaxWidth(), label = { Text("Answer") }, singleLine = true,
                textStyle = MaterialTheme.typography.headlineSmall.copy(fontFamily = MonoFamily), enabled = vm.feedback == null,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, autoCorrectEnabled = false, imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { if (vm.feedback == null) vm.submit() else vm.next() }),
                supportingText = { Text(if (q.answers.size > 1) "Give all ${q.answers.size} values separated by commas" else "Fractions, decimals and expressions like sqrt(2)/2 are accepted") })
            ExampleChips(listOf("/", "sqrt()", "pi", "-", ","), { vm.answer += it })
            when (val f = vm.feedback) {
                null -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { vm.showHint = true }, Modifier.weight(1f)) { Text("Hint") }
                    Button(onClick = vm::submit, Modifier.weight(1f)) { Text("Submit") }
                }
                else -> {
                    Surface(shape = RoundedCornerShape(16.dp), color = (if (f) lab.success else MaterialTheme.colorScheme.error).copy(alpha = 0.15f), modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Assertive }) {
                        Column(Modifier.padding(14.dp)) {
                            Text(if (f) "✓ Correct" else "✗ Incorrect — answer: ${q.answers.joinToString(", ")}", style = MaterialTheme.typography.titleMedium, color = if (f) lab.success else MaterialTheme.colorScheme.error)
                            Text(q.explanation, style = MaterialTheme.typography.bodyMedium, fontFamily = MonoFamily, modifier = Modifier.padding(top = 6.dp))
                        }
                    }
                    Button(onClick = vm::next, Modifier.fillMaxWidth()) { Text(if (vm.index + 1 >= vm.questions.size) "See results" else "Next question") }
                }
            }
            if (vm.showHint) InfoPanel(q.hint, icon = Icons.Outlined.Lightbulb)
        }
    }
}

@Composable
private fun QuizSummary(vm: QuizViewModel, nav: NavHostController) {
    val lab = LocalLab.current
    val score = vm.correct.count { it }
    ScreenColumn {
        Panel {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(if (score == vm.questions.size) "Perfect! 🏆" else if (score * 2 >= vm.questions.size) "Well done" else "Keep practising", style = MaterialTheme.typography.headlineSmall)
                Text("$score / ${vm.questions.size}", style = MaterialTheme.typography.displaySmall.copy(fontFamily = MonoFamily), color = MaterialTheme.colorScheme.primary)
                if (vm.timed) Text("Time left: %d:%02d".format(vm.remaining / 60, vm.remaining % 60), color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (vm.daily && vm.alreadyDone) Text("You had already completed today's challenge — this replay was not recorded.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = { nav.popBackStack() }, Modifier.weight(1f)) { Text("Done") }
            if (score < vm.questions.size) Button(onClick = vm::saveMistakes, Modifier.weight(1f)) { Text("Save mistakes to notebook") }
        }
        SectionTitle("Review")
        vm.questions.forEachIndexed { i, q ->
            val ok = vm.correct.getOrNull(i) == true
            Panel {
                Row(verticalAlignment = Alignment.Top) {
                    Icon(if (ok) Icons.Filled.CheckCircle else Icons.Filled.Cancel, null, tint = if (ok) lab.success else MaterialTheme.colorScheme.error)
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text(q.prompt, style = MaterialTheme.typography.titleSmall)
                        Text("Your answer: ${vm.given.getOrNull(i).orEmpty().ifBlank { "—" }}", style = MaterialTheme.typography.bodySmall, fontFamily = MonoFamily)
                        if (!ok) Text("Correct: ${q.answers.joinToString(", ")}", style = MaterialTheme.typography.bodySmall, fontFamily = MonoFamily, color = lab.success)
                        Text(q.explanation, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontFamily = MonoFamily)
                    }
                }
            }
        }
    }
}

// =============================== Formula library ===============================

@Composable
fun FormulaScreen(nav: NavHostController, initial: String) {
    var query by rememberSaveable { mutableStateOf(initial) }
    var category by rememberSaveable { mutableStateOf("All") }
    var expanded by rememberSaveable { mutableStateOf(initial) }
    val ctx = LocalContext.current
    val favs by ctx.container.favoriteKeys.collectAsStateWithLifecycle()
    val lab = LocalLab.current
    val list = FormulaLibrary.search(query).filter { category == "All" || it.category == category }
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Formula library", onBack = { nav.popBackStack() }, subtitle = "${list.size} of ${FormulaLibrary.all.size}")
        OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), placeholder = { Text("Search formulas") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, shape = RoundedCornerShape(16.dp))
        ChipRow(listOf("All", "★ Starred") + FormulaLibrary.categories, category, { category = it }, { it }, Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        val shown = if (category == "★ Starred") FormulaLibrary.search(query).filter { "formula:${it.name}" in favs } else list
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (shown.isEmpty()) item { EmptyState(Icons.Outlined.SearchOff, "No formulas found", "Try another word or category.") }
            items(shown, key = { it.category + it.name }) { f ->
                val key = "formula:${f.name}"
                val open = expanded == f.name
                Surface(onClick = { expanded = if (open) "" else f.name }, shape = RoundedCornerShape(16.dp), color = lab.panel, border = BorderStroke(1.dp, lab.panelBorder)) {
                    Column(Modifier.fillMaxWidth().padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(f.name, style = MaterialTheme.typography.titleSmall)
                                Text(f.category, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                            }
                            IconButton(onClick = { ctx.container.toggleFavorite(Favorite(key, Kind.FORMULA, f.name, f.formula)) }) {
                                Icon(if (key in favs) Icons.Filled.Star else Icons.Outlined.StarOutline, if (key in favs) "Unstar" else "Star", tint = if (key in favs) lab.warning else MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Text(f.formula, style = MaterialTheme.typography.bodyLarge.copy(fontFamily = MonoFamily), modifier = Modifier.padding(top = 4.dp))
                        AnimatedVisibility(open) {
                            Column(Modifier.padding(top = 8.dp)) {
                                f.variables.forEach { (k, v) -> KeyValue(k, v, mono = false) }
                                Text("Example: ${f.example}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary, modifier = Modifier.padding(top = 6.dp))
                                TextButton(onClick = { ctx.container.saveNote(Note(title = f.name, kind = Kind.FORMULA, input = f.name, result = f.formula, body = f.example)) }) { Icon(Icons.Outlined.BookmarkAdd, null); Spacer(Modifier.width(6.dp)); Text("Save to notebook") }
                            }
                        }
                    }
                }
            }
        }
    }
}
