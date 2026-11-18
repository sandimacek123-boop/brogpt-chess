package com.quantumath.app

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.test.core.app.ApplicationProvider
import com.quantumath.app.data.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.time.LocalDate

@RunWith(RobolectricTestRunner::class)
class PersistenceTest {
    private lateinit var db: AppDatabase
    private lateinit var settings: SettingsRepository
    private lateinit var ctx: Context

    @Before fun setUp() {
        ctx = ApplicationProvider.getApplicationContext()
        db = AppDatabase.build(ctx, inMemory = true)
        val f = File(ctx.cacheDir, "test-${System.nanoTime()}.preferences_pb")
        settings = SettingsRepository(PreferenceDataStoreFactory.create { f })
    }
    @After fun tearDown() = db.close()

    @Test fun historyTrimKeepsNewestAndFavorites() = runBlocking {
        val repo = HistoryRepository(db, MutableStateFlow(AppSettings(historyLimit = 5)))
        db.history().insert(HistoryEntry(kind = Kind.CALC, input = "fav", result = "1", timestamp = 1, favorite = true))
        for (i in 1..12) repo.add(Kind.CALC, "e$i", "$i")
        val all = db.history().all()
        assertTrue(all.any { it.input == "fav" })
        assertEquals(6, all.size) // 5 newest + favorite
        assertTrue(all.any { it.input == "e12" }); assertFalse(all.any { it.input == "e1" })
        // history disabled → nothing stored
        HistoryRepository(db, MutableStateFlow(AppSettings(keepHistory = false))).add(Kind.CALC, "x", "y")
        assertFalse(db.history().all().any { it.input == "x" })
    }

    @Test fun deletingFolderKeepsNotes() = runBlocking {
        val fid = db.notebook().insertFolder(Folder(name = "Calculus"))
        db.notebook().insert(Note(folderId = fid, title = "d/dx", kind = Kind.CALCULUS, input = "x^2", result = "2x"))
        db.notebook().deleteFolder(fid)
        val notes = db.notebook().allNotes()
        assertEquals(1, notes.size); assertNull(notes[0].folderId)
        assertTrue(db.notebook().allFolders().isEmpty())
    }

    @Test fun backupRoundTripRestoresEverything() = runBlocking {
        val bm = BackupManager(db, settings)
        settings.update { it.copy(theme = ThemeMode.LIGHT, precision = 40, degrees = true) }
        val fid = db.notebook().insertFolder(Folder(name = "Algebra"))
        db.notebook().insert(Note(folderId = fid, title = "factor", kind = Kind.ALGEBRA, input = "x^2-1", result = "(x-1)(x+1)", favorite = true))
        db.history().insert(HistoryEntry(kind = Kind.CALC, input = "2+2", result = "4"))
        db.favorites().insert(Favorite("formula:Quadratic formula", Kind.FORMULA, "Quadratic formula"))
        db.progress().upsertLesson(LessonProgress("limits", completed = true, solvedExercises = 1))
        db.progress().insertQuiz(QuizResult(topic = "DAILY", difficulty = "MEDIUM", score = 4, total = 5, seconds = 120, timed = true, daily = true, dayKey = 20261118))
        db.progress().unlock(AchievementUnlock("daily-1"))
        db.graphs().upsert(GraphProject(name = "waves", functionsJson = "[]", xMin = -1.0, xMax = 1.0, yMin = -1.0, yMax = 1.0))
        val json = bm.exportAll()
        assertTrue(json.contains("quantumath-backup"))

        // wipe and change settings, then restore
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { db.clearAllTables() }; settings.update { AppSettings() }
        val summary = bm.restoreAll(json)
        assertEquals(1, summary.notes); assertEquals(1, summary.history)
        val note = db.notebook().allNotes().single()
        assertEquals("(x-1)(x+1)", note.result); assertTrue(note.favorite)
        assertEquals("Algebra", db.notebook().allFolders().single { it.id == note.folderId }.name)
        assertEquals(1, db.favorites().list().size); assertTrue(db.progress().allLessons().single().completed)
        assertEquals(4, db.progress().allQuizzes().single().score); assertEquals("daily-1", db.progress().allAchievements().single().id)
        assertEquals("waves", db.graphs().all().single().name)
        val s = settings.settings.first()
        assertEquals(ThemeMode.LIGHT, s.theme); assertEquals(40, s.precision); assertTrue(s.degrees)
    }

    @Test fun invalidBackupIsRejectedWithoutDataLoss() = runBlocking {
        val bm = BackupManager(db, settings)
        db.history().insert(HistoryEntry(kind = Kind.CALC, input = "keep", result = "me"))
        for (bad in listOf("not json", "{\"format\":\"something-else\"}", "{\"format\":\"quantumath-backup\",\"version\":99}")) {
            try { bm.restoreAll(bad); fail("accepted $bad") } catch (e: IllegalArgumentException) { assertTrue(e.message!!.isNotBlank()) }
        }
        assertEquals("keep", db.history().all().single().input)
    }

    @Test fun notebookImportMergesFoldersByName() = runBlocking {
        val bm = BackupManager(db, settings)
        val fid = db.notebook().insertFolder(Folder(name = "Trig"))
        db.notebook().insert(Note(folderId = fid, title = "a", kind = Kind.NOTE, input = "", result = ""))
        val export = bm.exportNotebook()
        val n = bm.importNotebook(export) // import into the same notebook: duplicates notes, reuses folder
        assertEquals(1, n)
        assertEquals(1, db.notebook().allFolders().size)
        assertEquals(2, db.notebook().allNotes().count { it.folderId == fid })
    }

    @Test fun settingsPersistAndClamp() = runBlocking {
        settings.update { it.copy(precision = 500, fontScale = 3f, accent = Accent.EMERALD) }
        val s = settings.settings.first()
        assertEquals(100, s.precision); assertEquals(Accent.EMERALD, s.accent)
        assertTrue(s.fontScale <= 1.4f)
    }

    @Test fun streaksAndAchievements() = runBlocking {
        val today = LocalDate.of(2026, 11, 18)
        val k = { d: LocalDate -> ProgressRepository.dayKey(d) }
        assertEquals(20261118L, k(today))
        assertEquals(3, ProgressRepository.streak(setOf(k(today), k(today.minusDays(1)), k(today.minusDays(2)), k(today.minusDays(4))), today))
        assertEquals(2, ProgressRepository.streak(setOf(k(today.minusDays(1)), k(today.minusDays(2))), today)) // today not done yet
        assertEquals(0, ProgressRepository.streak(setOf(k(today.minusDays(3))), today))
        val repo = ProgressRepository(db)
        val ach = repo.recordQuiz(QuizResult(topic = "ARITHMETIC", difficulty = "EASY", score = 10, total = 10, seconds = 50, timed = false, daily = false))
        assertTrue("quiz-perfect" in ach)
        assertTrue(repo.unlock("quiz-perfect")); assertFalse(repo.unlock("quiz-perfect")) // only once
        val l = repo.completeLesson("order-ops", 2)
        assertTrue("first-lesson" in l)
    }
}
