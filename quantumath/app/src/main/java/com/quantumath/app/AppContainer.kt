package com.quantumath.app

import com.quantumath.app.data.*
import com.quantumath.math.learning.Achievements
import com.quantumath.math.learning.Lessons
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Manual dependency container (small app: no DI framework needed). Platform code supplies the database and settings store. */
class AppContainer(val db: AppDatabase, val settingsRepo: SettingsRepository) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val settings: StateFlow<AppSettings> = settingsRepo.settings.stateIn(scope, SharingStarted.Eagerly, AppSettings())
    val backup = BackupManager(db, settingsRepo)
    val history = HistoryRepository(db, settings)
    val progress = ProgressRepository(db)
    val favoriteKeys: StateFlow<Set<String>> = db.favorites().keys().map { it.toSet() }.stateIn(scope, SharingStarted.Eagerly, emptySet())

    /** One-shot UI messages (snackbars), e.g. achievement unlocks. */
    val messages = MutableSharedFlow<String>(extraBufferCapacity = 8)

    fun toggleFavorite(f: Favorite) = scope.launch {
        if (f.key in favoriteKeys.value) db.favorites().delete(f.key) else db.favorites().insert(f)
    }

    fun unlock(id: String) = scope.launch {
        if (progress.unlock(id)) Achievements.byId(id)?.let { messages.emit("🏆 Achievement unlocked: ${it.title}") }
    }

    fun saveNote(note: Note) = scope.launch {
        db.notebook().insert(note)
        messages.emit("Saved to notebook")
        if (db.notebook().count() >= 5) unlock("notebook")
    }
}

class HistoryRepository(private val db: AppDatabase, private val settings: StateFlow<AppSettings>) {
    val recent = db.history().recent()
    suspend fun add(kind: String, input: String, result: String) {
        if (!settings.value.keepHistory || input.isBlank()) return
        db.history().insert(HistoryEntry(kind = kind, input = input.take(4000), result = result.take(8000)))
        db.history().trim(settings.value.historyLimit)
    }
}

class ProgressRepository(private val db: AppDatabase) {
    val lessons = db.progress().lessons()
    val quizzes = db.progress().quizzes()
    val achievements = db.progress().achievements()

    suspend fun unlock(id: String): Boolean = db.progress().unlock(AchievementUnlock(id)) != -1L

    suspend fun completeLesson(id: String, solved: Int): List<String> {
        db.progress().upsertLesson(LessonProgress(id, completed = true, solvedExercises = solved))
        val done = db.progress().allLessons().count { it.completed }
        return buildList {
            add("first-lesson")
            if (done >= 5) add("five-lessons")
            if (done >= Lessons.all.size) add("all-lessons")
        }
    }

    suspend fun recordQuiz(r: QuizResult): List<String> {
        db.progress().insertQuiz(r)
        return buildList {
            if (r.score == r.total && r.total > 0) add("quiz-perfect")
            if (r.daily) {
                add("daily-1")
                val s = streak(db.progress().dailyResults().map { it.dayKey }.toSet(), today())
                if (s >= 3) add("streak-3"); if (s >= 7) add("streak-7")
            }
            if (db.progress().totalCorrect() >= 100) add("hundred")
        }
    }

    companion object {
        private val fmt = DateTimeFormatter.BASIC_ISO_DATE
        fun dayKey(d: LocalDate): Long = d.format(fmt).toLong()
        fun today(): LocalDate = LocalDate.now()
        /** Consecutive days with a completed daily challenge, ending today (or yesterday if today isn't done yet). */
        fun streak(days: Set<Long>, today: LocalDate): Int {
            var d = if (dayKey(today) in days) today else today.minusDays(1)
            var n = 0
            while (dayKey(d) in days) { n++; d = d.minusDays(1) }
            return n
        }
    }
}

