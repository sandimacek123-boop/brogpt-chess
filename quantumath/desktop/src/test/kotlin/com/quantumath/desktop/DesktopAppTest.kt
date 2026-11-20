package com.quantumath.desktop

import androidx.compose.ui.graphics.toAwtImage
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.quantumath.app.data.*
import com.quantumath.app.platform.imageFromArgb
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Before
import org.junit.After
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.Test
import java.io.File
import java.nio.file.Files
import javax.imageio.ImageIO

@OptIn(ExperimentalTestApi::class)
class DesktopAppTest {
    @get:Rule val rule = createComposeRule()
    private val dir: File = Files.createTempDirectory("quantumath-test").toFile()

    // In the app, UI events arrive on the Swing EDT (= Dispatchers.Main). The test harness injects input from the
    // test thread, so use a non-dispatching "main" (real-time delays) to satisfy lifecycle main-thread checks.
    @Before fun mainOnTestThread() = Dispatchers.setMain(Dispatchers.Unconfined)
    @After fun resetMain() = Dispatchers.resetMain()

    private fun start() { rule.setContent { QuantumathDesktopApp(createContainer(dir)) }; rule.waitForIdle() }

    private fun shot(name: String) {
        rule.waitForIdle()
        val img = rule.onRoot().captureToImage().toAwtImage()
        File("build/screens").mkdirs(); ImageIO.write(img, "png", File("build/screens/$name.png"))
    }
    private fun waitText(t: String, substring: Boolean = false, timeout: Long = 20_000) {
        // real-time polling with waitForIdle (which flushes state written by background coroutines)
        val end = System.currentTimeMillis() + timeout
        while (System.currentTimeMillis() < end) {
            rule.waitForIdle()
            if (rule.onAllNodesWithText(t, substring = substring, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()) return
            Thread.sleep(50)
        }
        runCatching { shot("FAIL-" + t.replace(Regex("[^A-Za-z0-9]+"), "_").take(30)) }
        throw AssertionError("Text not found: $t")
    }
    private fun nav(label: String) { rule.onNode(isSelectable() and hasText(label)).performClick(); rule.waitForIdle() }
    private fun key(desc: String) = rule.onNodeWithContentDescription(desc).performClick()
    private fun openLab(title: String) {
        nav("Laboratory")
        rule.onNode(hasScrollToNodeAction()).performScrollToNode(hasContentDescription(title, substring = true))
        rule.onNodeWithContentDescription(title, substring = true).performClick(); rule.waitForIdle()
    }

    @Test fun homeCalculatorAndKeyboard() {
        start()
        rule.onNodeWithText("Quantumath").assertExists()
        shot("d01-home")
        nav("Calculate")
        for (k in listOf("2", "plus", "3", "times", "4", "equals")) key(k)
        waitText("= 14")
        // physical keyboard input
        key("All clear")
        rule.onRoot().performKeyInput { pressKey(Key.One); pressKey(Key.Slash); pressKey(Key.Three); pressKey(Key.Enter) }
        waitText("= 1/3")
        shot("d02-calculator")
    }

    @Test fun solverGraphAndNavArgs() {
        start()
        openLab("Equation solver")
        rule.onAllNodes(hasSetTextAction())[0].performTextInput("x^2 - 5x + 6 = 0")
        rule.onNodeWithText("Solve").performClick()
        waitText("x = 2,  x = 3")
        shot("d03-solver")
        // "Open in Graph" passes both sides through a URL-encoded navigation argument
        rule.onNodeWithText("Open in Graph").performClick(); rule.waitForIdle()
        waitText("x² - 5x + 6", substring = true)
        Thread.sleep(1500)
        shot("d04-graph")
    }

    @Test fun everyToolOpens() {
        start()
        for ((i, t) in listOf("Calculus lab", "Algebra studio", "Geometry workshop", "Trigonometry explorer", "Linear algebra", "Statistics & probability",
            "Number theory", "Complex numbers", "Visualization studio", "Notebook", "Formula library", "Challenge mode").withIndex()) {
            openLab(t)
            Thread.sleep(800)
            if (t in setOf("Calculus lab", "Geometry workshop", "Visualization studio")) shot("d1$i-" + t.lowercase().replace(Regex("[^a-z]+"), "-"))
            rule.onNodeWithContentDescription("Back").performClick(); rule.waitForIdle()
        }
        nav("Learn"); waitText("Learning center"); shot("d20-learn")
    }

    @Test fun imageConversionKeepsColours() {
        val px = intArrayOf(0xFFFF0000.toInt(), 0xFF00FF00.toInt(), 0xFF0000FF.toInt(), 0xFF123456.toInt())
        val img = imageFromArgb(px, 2, 2).toAwtImage()
        assertEquals(0xFFFF0000.toInt(), img.getRGB(0, 0)); assertEquals(0xFF00FF00.toInt(), img.getRGB(1, 0))
        assertEquals(0xFF0000FF.toInt(), img.getRGB(0, 1)); assertEquals(0xFF123456.toInt(), img.getRGB(1, 1))
    }

    @Test fun jsonDatabasePersistsAcrossRestarts() = runBlocking {
        val c1 = createContainer(dir)
        val fid = c1.db.notebook().insertFolder(Folder(name = "Calc"))
        c1.db.notebook().insert(Note(folderId = fid, title = "t", kind = Kind.CALC, input = "1+1", result = "2"))
        c1.history.add(Kind.CALC, "2+2", "4")
        c1.db.progress().unlock(AchievementUnlock("first-calc"))
        assertEquals(-1L, c1.db.progress().unlock(AchievementUnlock("first-calc")))
        c1.settingsRepo.update { it.copy(theme = ThemeMode.LIGHT, precision = 30) }
        assertEquals(30, c1.settingsRepo.settings.first().precision)
        assertTrue(File(dir, "settings.preferences_pb").length() > 0)
        // a fresh database instance (as after an app restart) reads everything back from disk
        val dataFile = File(dir, "quantumath-data.json")
        fun reopen() = DesktopDatabase(dataFile)
        assertEquals("2", reopen().notebook().allNotes().single().result)
        assertEquals("Calc", reopen().notebook().allFolders().single().name)
        assertEquals("2+2", reopen().history().all().single().input)
        assertEquals(1, reopen().progress().allAchievements().size)
        // backup → wipe → restore on the desktop store
        val json = c1.backup.exportAll()
        c1.db.clearAllTables()
        assertTrue(reopen().notebook().allNotes().isEmpty())
        c1.backup.restoreAll(json)
        assertEquals("Calc", reopen().notebook().allFolders().single().name)
        assertEquals(30, c1.settingsRepo.settings.first().precision)
        // a rejected restore leaves data untouched
        assertTrue(runCatching { c1.backup.restoreAll("{\"format\":\"quantumath-backup\",\"version\":99}") }.isFailure)
        assertEquals(1, reopen().notebook().allNotes().size)
        // corrupt data file is preserved, not overwritten
        dataFile.writeText("{ not json")
        DesktopDatabase(dataFile)
        assertTrue(dir.listFiles()!!.any { it.name.startsWith("quantumath-data.json.corrupt-") })
    }

    @Test fun historyTrimMatchesRoomSemantics() = runBlocking {
        val db = DesktopDatabase(null)
        db.history().insert(HistoryEntry(kind = "calc", input = "fav", result = "", timestamp = 1, favorite = true))
        for (i in 2..20) db.history().insert(HistoryEntry(kind = "calc", input = "e$i", result = "", timestamp = i.toLong()))
        db.history().trim(5)
        val left = db.history().all().map { it.input }.toSet()
        assertEquals(setOf("fav", "e16", "e17", "e18", "e19", "e20"), left)
        assertEquals(listOf("e20", "e19"), db.history().recent(2).first().map { it.input })
        assertEquals(1, db.history().search("FAV").size) // LIKE is case-insensitive
    }
}
