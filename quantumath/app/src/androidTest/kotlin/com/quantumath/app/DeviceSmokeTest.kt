package com.quantumath.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Instrumented smoke test for a real device/emulator: ./gradlew connectedDebugAndroidTest */
@RunWith(AndroidJUnit4::class)
class DeviceSmokeTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun calculatorAndSolver() {
        rule.onNode(isSelectable() and hasText("Calculate")).performClick()
        for (k in listOf("2", "plus", "3", "times", "4", "equals")) rule.onNodeWithContentDescription(k).performClick()
        rule.waitUntil(10_000) { rule.onAllNodesWithText("= 14", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithContentDescription("Open equation solver").performClick()
        rule.onAllNodes(hasSetTextAction())[0].performTextInput("x^2 - 5x + 6 = 0")
        rule.onNodeWithText("Solve").performClick()
        rule.waitUntil(10_000) { rule.onAllNodesWithText("x = 2,  x = 3", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test fun rotationKeepsState() {
        rule.onNode(isSelectable() and hasText("Calculate")).performClick()
        for (k in listOf("7", "times", "6", "equals")) rule.onNodeWithContentDescription(k).performClick()
        rule.waitUntil(10_000) { rule.onAllNodesWithText("= 42", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        rule.activityRule.scenario.recreate()
        rule.waitUntil(10_000) { rule.onAllNodesWithText("= 42", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
    }
}
