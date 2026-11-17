package dev.universe.engine

import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import dev.universe.engine.core.ui.Domain
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Renders every screen of the app off-device (Robolectric native graphics) and writes PNGs to
 * app/build/shots. Doubles as a smoke test: any crash while composing or drawing fails the build.
 * Filter with -Pshots=<regex> to render a subset.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-420dpi")
class ScreenshotTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun screens() {
        val regex = (System.getProperty("shot") ?: ".*").toRegex()
        val jobs = buildList<Pair<String, Route?>> {
            add("home" to null)
            Domain.entries.forEach { add("field_${it.name.lowercase()}" to Route.Field(it)) }
            add("journal" to Route.Journal)
            add("settings" to Route.Settings)
            Labs.all.forEach { add("lab_${it.id}" to Route.Lab(it.id)) }
        }
        val nav = Nav()
        val app = AppState()
        rule.mainClock.autoAdvance = false
        rule.setContent { UniverseApp(app, nav) }
        rule.mainClock.advanceTimeBy(1200)
        var count = 0
        for ((name, route) in jobs) {
            if (!regex.containsMatchIn(name)) continue
            if (route != null) rule.runOnUiThread { nav.go(route); Snapshot.sendApplyNotifications() }
            // let transitions finish and background renders (fractals, digit computation) land
            repeat(4) { rule.mainClock.advanceTimeBy(450); Thread.sleep(120) }
            if (route is Route.Lab) {
                val title = Labs.byId.getValue(route.id).title
                check(rule.onAllNodesWithText(title).fetchSemanticsNodes().isNotEmpty()) { "lab '$title' did not appear" }
            }
            rule.onRoot().captureRoboImage("build/shots/$name.png")
            if (route != null) rule.runOnUiThread { nav.back(); Snapshot.sendApplyNotifications() }
            rule.mainClock.advanceTimeBy(700)
            count++
        }
        check(count > 0) { "no screen matched '$regex'" }
    }
}
