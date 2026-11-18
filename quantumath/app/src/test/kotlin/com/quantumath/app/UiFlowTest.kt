package com.quantumath.app

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * End-to-end UI flows on a simulated device (Robolectric, Android 14, phone-sized screen).
 * Each flow drives the real Compose UI and checks results computed by the math engine.
 * Screenshots are written to app/build/screens/ for visual review.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xhdpi")
class UiFlowTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    private fun shot(name: String) {
        rule.waitForIdle()
        var captured: Bitmap? = null
        rule.activityRule.scenario.onActivity { a ->
            val v = a.window.decorView
            captured = Bitmap.createBitmap(v.width, v.height, Bitmap.Config.ARGB_8888).also { v.draw(android.graphics.Canvas(it)) }
        }
        val bmp = captured!!
        val dir = File("build/screens").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun waitText(text: String, substring: Boolean = false, timeout: Long = 20_000) {
        try {
            rule.waitUntil(timeout) { rule.onAllNodesWithText(text, substring = substring, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        } catch (e: Throwable) {
            runCatching { shot("FAIL-" + text.replace(Regex("[^A-Za-z0-9]+"), "_").take(40)) }
            throw AssertionError("Text not found: '$text'", e)
        }
    }

    private fun key(desc: String) = rule.onNodeWithContentDescription(desc).performClick()

    private fun tab(label: String) = rule.onAllNodesWithText(label).filterToOne(hasClickAction() or hasAnyAncestor(hasClickAction())).let {
        rule.onNode(hasText(label) and hasAnyAncestor(isSelectable() or hasClickAction()), useUnmergedTree = true).performClick()
    }

    private fun bottom(label: String) { rule.onNode(isSelectable() and hasText(label)).performClick(); rule.waitForIdle() }

    private fun openLab(title: String) {
        bottom("Laboratory")
        rule.onNode(hasScrollToNodeAction()).performScrollToNode(hasContentDescription(title, substring = true))
        rule.onNodeWithContentDescription(title, substring = true).performClick()
        rule.waitForIdle()
    }

    private fun back() { rule.activityRule.scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }; rule.waitForIdle() }

    private fun typeInto(index: Int, text: String) {
        val n = rule.onAllNodes(hasSetTextAction())[index]
        n.performTextClearance(); n.performTextInput(text)
    }

    @Test fun homeAndNavigation() {
        rule.onNodeWithText("Quantumath").assertExists()
        rule.onNodeWithText("DAILY CHALLENGE").assertExists()
        shot("01-home")
        bottom("Laboratory"); rule.onNodeWithText("All instruments").assertExists(); shot("02-laboratory")
        bottom("Learn"); waitText("Learning center"); shot("03-learn")
        bottom("Graph"); waitText("Graph"); rule.mainClock.advanceTimeBy(1500); shot("04-graph")
        bottom("Home"); rule.onNodeWithText("DAILY CHALLENGE").assertExists()
    }

    @Test fun calculatorExactAndPrecise() {
        bottom("Calculate")
        for (k in listOf("2", "plus", "3", "times", "4")) key(k)
        key("equals")
        waitText("= 14")
        // 1/3 + 1/6 shows the exact fraction 1/2
        key("All clear")
        for (k in listOf("1", "divided by", "3", "plus", "1", "divided by", "6")) key(k)
        key("equals")
        waitText("= 0.5"); waitText("= 1/2")
        // √2 to 16 significant digits, with the exact form
        key("All clear"); key("square root"); key("2"); key("equals")
        waitText("= 1.414213562373095")
        shot("05-calculator")
        // memory: store, clear, recall
        key("Store in memory"); key("All clear"); key("Memory recall"); key("times"); key("Memory recall"); key("equals")
        waitText("= 2", substring = false)
        // error is reported, not crashed
        key("All clear"); key("1"); key("divided by"); key("0"); key("equals")
        waitText("Division by zero", substring = true)
    }

    @Test fun calculatorSurvivesRotation() {
        bottom("Calculate")
        for (k in listOf("7", "times", "6")) key(k)
        key("equals"); waitText("= 42")
        rule.activityRule.scenario.recreate()
        rule.waitForIdle()
        waitText("= 42")
    }

    @Test fun solverQuadraticRadicalAndSystem() {
        openLab("Equation solver")
        typeInto(0, "x^2 - 5x + 6 = 0")
        rule.onNodeWithText("Solve").performClick()
        waitText("x = 2,  x = 3")
        rule.onNodeWithText("Steps", substring = true).assertExists()
        shot("06-solver")
        typeInto(0, "sqrt(x+7) = x - 5")
        rule.onNodeWithText("Solve").performClick()
        waitText("x = 9")
        waitText("Rejected", substring = true)
        typeInto(0, "x + y = 5\nx - y = 1")
        rule.onNodeWithText("Solve").performClick()
        waitText("x = 3,  y = 2")
    }

    @Test fun calculusAlgebraAndGraph() {
        openLab("Calculus lab")
        typeInto(0, "x^2 sin(x)")
        rule.onNodeWithText("Compute derivative").performClick()
        waitText("2x", substring = true)
        shot("07-calculus-derivative")
        rule.onNodeWithText("Integral").performClick()
        typeInto(0, "x e^x")
        rule.onNodeWithText("Compute integral").performClick()
        waitText("Verified by differentiation", substring = true)
        shot("08-calculus-integral")
        back()
        openLab("Algebra studio")
        typeInto(0, "x^4 - 16")
        rule.onNodeWithText("Factor").performClick()
        rule.onAllNodesWithText("Factor")[0].performClick()
        waitText("(x² + 4)", substring = true)
        shot("09-algebra")
        back()
        bottom("Graph")
        typeInto(0, "1/(x-1)")
        rule.onNodeWithContentDescription("Add function").performClick()
        rule.waitForIdle(); rule.mainClock.advanceTimeBy(2000)
        rule.onNodeWithText("y = 1/(x-1)", substring = true, useUnmergedTree = true).assertExists()
        shot("10-graph-two-functions")
        // screenshot sharing renders the graph into a PNG and fires a share intent
        rule.onNodeWithContentDescription("Share screenshot of graph").performClick()
        rule.waitForIdle()
        val started = org.robolectric.Shadows.shadowOf(rule.activity).nextStartedActivity
        org.junit.Assert.assertNotNull("share intent", started)
        val png = File(rule.activity.cacheDir, "shared/quantumath-graph.png")
        org.junit.Assert.assertTrue("graph PNG written", png.exists() && png.length() > 5_000)
    }

    @Test fun everyToolOpens() {
        val tools = listOf("Geometry workshop", "Trigonometry explorer", "Linear algebra", "Statistics & probability", "Number theory", "Complex numbers", "Visualization studio", "Notebook", "Formula library", "Challenge mode")
        tools.forEachIndexed { i, t ->
            openLab(t)
            rule.mainClock.advanceTimeBy(1200)
            shot("2${i}-" + t.lowercase().replace(Regex("[^a-z]+"), "-"))
            back()
        }
    }

    @Test fun linearAlgebraAndNumberTheory() {
        openLab("Linear algebra")
        rule.onNodeWithText("det A").performClick()
        waitText("det A")
        rule.waitUntil(15_000) { rule.onAllNodesWithContentDescription("det A: -1", substring = true).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Systems Ax = b").performClick()
        rule.onNodeWithText("Solve by Gauss–Jordan").performClick()
        waitText("x₁ = 2, x₂ = 3, x₃ = -1")
        shot("11-linear-system")
        back()
        openLab("Number theory")
        rule.onNodeWithText("Compute").performClick()
        waitText("2^3 · 3^2 · 5")
        shot("12-number-theory")
    }

    @Test fun lessonAndQuiz() {
        bottom("Learn")
        rule.onNode(hasScrollToNodeAction()).performScrollToNode(hasText("Order of operations"))
        rule.onNodeWithText("Order of operations").performClick()
        waitText("Exercise")
        typeInto(0, "37")
        rule.onAllNodesWithText("Check")[0].performClick()
        waitText("✓ Correct!")
        shot("13-lesson")
        back()
        rule.onNodeWithText("Start 10 questions").performClick()
        waitText("Question 1 of 10", substring = true)
        typeInto(0, "0")
        rule.onNodeWithText("Submit").performClick()
        waitText("orrect", substring = true)
        shot("14-quiz")
    }

    @Test fun saveToNotebookAndSettingsTheme() {
        bottom("Calculate")
        for (k in listOf("9", "times", "9")) key(k); key("equals"); waitText("= 81")
        rule.onNodeWithContentDescription("Save to notebook").performClick()
        rule.waitForIdle()
        bottom("Home")
        openLab("Notebook")
        waitText("9*9")
        shot("15-notebook")
        back(); bottom("Home")
        rule.onNodeWithContentDescription("Settings").performClick()
        rule.onNodeWithText("Light").performClick()
        rule.waitForIdle()
        shot("16-settings-light")
        back()
        shot("17-home-light")
    }
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w891dp-h411dp-land-xhdpi")
class LandscapeTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    private fun shot(name: String) {
        rule.waitForIdle()
        var captured: Bitmap? = null
        rule.activityRule.scenario.onActivity { a -> val v = a.window.decorView; captured = Bitmap.createBitmap(v.width, v.height, Bitmap.Config.ARGB_8888).also { v.draw(android.graphics.Canvas(it)) } }
        File("build/screens").mkdirs(); File("build/screens/$name.png").outputStream().use { captured!!.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test fun landscapeLayouts() {
        rule.onNode(isSelectable() and hasText("Calculate")).performClick()
        for (k in listOf("1", "2", "times", "1", "2")) rule.onNodeWithContentDescription(k).performClick()
        rule.onNodeWithContentDescription("equals").performClick()
        rule.waitUntil(15_000) { rule.onAllNodesWithText("= 144", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        shot("30-landscape-calculator")
        rule.onNode(isSelectable() and hasText("Graph")).performClick()
        rule.mainClock.advanceTimeBy(1500)
        shot("31-landscape-graph")
    }
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xhdpi")
class FractalRenderTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun mandelbrotFinishesRendering() {
        rule.onNode(isSelectable() and hasText("Laboratory")).performClick()
        rule.onNode(hasScrollToNodeAction()).performScrollToNode(hasContentDescription("Visualization studio", substring = true))
        rule.onNodeWithContentDescription("Visualization studio", substring = true).performClick()
        // the "Into the abyss" achievement is unlocked only after the final full-resolution pass
        rule.waitUntil(60_000) { rule.onAllNodesWithText("Into the abyss", substring = true, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        rule.waitForIdle()
        var captured: Bitmap? = null
        rule.activityRule.scenario.onActivity { a -> val v = a.window.decorView; captured = Bitmap.createBitmap(v.width, v.height, Bitmap.Config.ARGB_8888).also { v.draw(android.graphics.Canvas(it)) } }
        val bmp = captured!!
        File("build/screens").mkdirs(); File("build/screens/32-mandelbrot.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        // the fractal area must contain many distinct colours (not a blank panel)
        val colours = HashSet<Int>()
        for (y in 300 until 900 step 7) for (x in 40 until bmp.width - 40 step 7) colours += bmp.getPixel(x, y)
        org.junit.Assert.assertTrue("fractal has ${colours.size} colours", colours.size > 200)
    }
}
