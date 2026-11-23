package com.brightsteps.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ContentTest {
    @Test
    fun everyQuestionCanBeAnswered() {
        assertEquals("course ids must be unique", COURSES.size, COURSES.map { it.id }.toSet().size)
        for (c in COURSES) for (l in c.lessons) {
            assertTrue("${c.title} / ${l.title} has no steps", l.steps.isNotEmpty())
            for (s in l.steps) {
                if (s is Choice) assertTrue("answer missing from options: $s", s.answer in s.options)
                if (s is NumberInput) assertTrue("number pad only fits 0..9999: $s", s.answer in 0..9999)
                assertTrue("own answer rejected: $s", s.isCorrect(s.answerText))
            }
        }
    }

    @Test
    fun checksAnswers() {
        val q = NumberInput("x + 3 = 7", 4)
        assertTrue(q.isCorrect("4"))
        assertTrue(q.isCorrect("04"))
        assertFalse(q.isCorrect("5"))
        assertFalse(q.isCorrect(""))
        assertFalse(Choice("?", listOf("a", "b"), "a").isCorrect("b"))
    }
}
