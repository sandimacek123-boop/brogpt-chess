package dev.universe.engine

import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Landscape tablet layout: the instrument panel docks beside the canvas. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w960dp-h600dp-land-mdpi")
class WideScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun wide() {
        val nav = Nav()
        rule.mainClock.autoAdvance = false
        rule.setContent { UniverseApp(AppState(), nav) }
        rule.mainClock.advanceTimeBy(1500)
        rule.onRoot().captureRoboImage("build/shots/wide_home.png")
        for (id in listOf("solar", "waves")) {
            rule.runOnUiThread { nav.go(Route.Lab(id)); Snapshot.sendApplyNotifications() }
            repeat(4) { rule.mainClock.advanceTimeBy(450); Thread.sleep(100) }
            rule.onRoot().captureRoboImage("build/shots/wide_$id.png")
            rule.runOnUiThread { nav.back(); Snapshot.sendApplyNotifications() }
            rule.mainClock.advanceTimeBy(700)
        }
    }
}
