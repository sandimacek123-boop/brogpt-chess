package com.quantumath.app

import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import com.quantumath.app.ui.screens.CalculatorViewModel
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class CalculatorViewModelTest {
    private val app = ApplicationProvider.getApplicationContext<QuantumathApp>()
    private fun settle(vm: CalculatorViewModel, until: () -> Boolean = { !vm.ui.value.busy }) {
        repeat(200) { shadowOf(Looper.getMainLooper()).idle(); if (until()) return; Thread.sleep(25) }
    }
    private fun eval(vm: CalculatorViewModel, s: String): String {
        vm.clear(); vm.insert(s); vm.evaluate(); settle(vm) { vm.ui.value.result != null || vm.ui.value.error != null }
        return vm.ui.value.result?.decimal ?: ("ERR " + vm.ui.value.error)
    }

    @Test fun evaluatesWithPrecisionAndExactForms() {
        val vm = CalculatorViewModel(app.container)
        assertEquals("14", eval(vm, "2+3*4"))
        assertEquals("0.5", eval(vm, "1/3+1/6")); assertEquals("1/2", vm.ui.value.result?.fraction)
        assertEquals("1.414213562373095", eval(vm, "sqrt(2)")); assertEquals("√2", vm.ui.value.result?.exact)
        assertEquals("0", eval(vm, "sin(pi)"))
        assertEquals("120", eval(vm, "5!"))
        assertTrue(eval(vm, "1/0").startsWith("ERR"))
        assertTrue(eval(vm, "ln(-1)").let { it.startsWith("ERR") || vm.ui.value.result?.note?.contains("Complex") == true })
        assertEquals("2i", eval(vm, "sqrt(-4)")); assertEquals("Complex result (no real value)", vm.ui.value.result?.note)
    }

    @Test fun ansMemoryAndEditing() {
        val vm = CalculatorViewModel(app.container)
        eval(vm, "6*7")
        vm.insert("+"); assertEquals("ans+", vm.ui.value.expr) // operator after "=" continues from ans
        vm.insert("8"); vm.evaluate(); settle(vm) { vm.ui.value.result?.input == "ans+8" }
        assertEquals("50", vm.ui.value.result?.decimal)
        vm.memory("MS"); vm.clear(); vm.memory("MR"); vm.insert("*2"); vm.evaluate(); settle(vm) { vm.ui.value.result?.input == "M*2" }
        assertEquals("100", vm.ui.value.result?.decimal)
        vm.clear(); vm.insert("sin()"); assertEquals(4, vm.ui.value.cursor) // cursor inside the parentheses
        vm.backspace(); assertEquals(")", vm.ui.value.expr) // "sin(" removed as one token
        vm.clear(); vm.insert("12"); vm.move(-1); vm.insert("5"); assertEquals("152", vm.ui.value.expr)
    }
}
