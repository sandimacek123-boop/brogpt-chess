package dev.universe.engine

import dev.universe.engine.astro.PLANETS
import dev.universe.engine.astro.heliocentric
import dev.universe.engine.astro.msLifeYears
import dev.universe.engine.chem.radial
import dev.universe.engine.chem.wavelengthColor
import dev.universe.engine.core.math.Expr
import dev.universe.engine.core.math.Num
import dev.universe.engine.data.Elements
import dev.universe.engine.data.Secrets
import dev.universe.engine.physics.BlockTrack
import dev.universe.engine.physics.FluidSim
import dev.universe.engine.physics.NBodySim
import dev.universe.engine.physics.tracePhoton
import dev.universe.engine.physics.flight
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import kotlin.math.*

/** Checks the numerical cores of the laboratories against known results. */
class NumericsTest {
    private fun close(exp: Double, act: Double, tol: Double, msg: String = "") = assertTrue("$msg expected $exp got $act", abs(exp - act) <= tol)

    @Test fun expressionParser() {
        close(7.0, Expr.parse("1 + 2*3").eval(0.0), 1e-12)
        close(-8.0, Expr.parse("-2^3").eval(0.0), 1e-12, "unary minus vs power")
        close(512.0, Expr.parse("2^3^2").eval(0.0), 1e-12, "right-associative power")
        close(6.0, Expr.parse("2x").eval(3.0), 1e-12, "implicit multiplication")
        close(sin(2.0) * 2, Expr.parse("x sin(x)").eval(2.0), 1e-12)
        close(-1.0, Expr.parse("(x+1)(x-1)").eval(0.0), 1e-12, "implicit product of brackets")
        close(120.0, Expr.parse("5!").eval(0.0), 1e-9, "factorial via gamma")
        close(PI, Expr.parse("pi").eval(0.0), 1e-15); close(PI, Expr.parse("π").eval(0.0), 1e-15)
        close(2.0, Expr.parse("|x|").eval(-2.0), 1e-15)
        close(1.0, Expr.parse("a sin(b x + c)").eval(PI / 2, a = 1.0, b = 1.0, c = 0.0), 1e-12)
        assertTrue(Expr.parse("x").uses("x")); assertFalse(Expr.parse("42").uses("x")); assertTrue(Expr.parse("42").isConstant)
        assertNotNull(Expr.tryParse("sin(").second); assertNotNull(Expr.tryParse("2 +").second); assertNotNull(Expr.tryParse("foo(x)").second)
    }

    @Test fun specialFunctions() {
        close(24.0, Num.gamma(5.0), 1e-9); close(sqrt(PI), Num.gamma(0.5), 1e-12)
        close(PI / 2, Num.ellipticK(0.0), 1e-12); close(1.8540746773013719, Num.ellipticK(sin(PI / 4)), 1e-10)
        close(2.0, Num.simpson(0.0, PI) { sin(it) }, 1e-9)
        close(cos(1.0), Num.deriv(1.0) { sin(it) }, 1e-8)
        val E = Num.kepler(1.0, 0.5); close(1.0, E - 0.5 * sin(E), 1e-12, "Kepler")
        assertEquals(12586269025L, Num.fib(50))
    }

    @Test fun primesAndPi() {
        val s = Num.sieve(1_000_000)
        assertEquals(78498, s.count { it })
        assertTrue(Num.isPrime(1_000_000_007L)); assertFalse(Num.isPrime(1_000_000_008L))
        assertEquals(listOf(2L, 2L, 3L, 5L, 7L), Num.factorize(420))
        assertEquals("3.14159265358979323846264338327950288419716939937510", Num.piDigits(50))
    }

    @Test fun gravityConservesEnergy() {
        val sim = NBodySim(); sim.softening = 0.1
        sim.bodies += dev.universe.engine.physics.Body(0.0, 0.0, 0.0, 0.0, 1000.0, androidx.compose.ui.graphics.Color.White)
        sim.bodies += dev.universe.engine.physics.Body(100.0, 0.0, 0.0, sqrt(1000.0 / 100.0), 1.0, androidx.compose.ui.graphics.Color.White)
        val e0 = sim.energy(); val l0 = sim.angularMomentum()
        sim.advance(2 * PI * sqrt(100.0.pow(3) / 1001.0) * 3, 1_000_000)
        assertTrue("energy drift", abs((sim.energy() - e0) / e0) < 1e-4)
        assertTrue("angular momentum drift", abs((sim.angularMomentum() - l0) / l0) < 1e-9)
    }

    @Test fun blocksCountPi() {
        for ((exp, expected) in listOf(0 to 3, 1 to 31, 2 to 314, 3 to 3141)) {
            val t = BlockTrack(1.0, 100.0.pow(exp)); t.reset()
            t.advance(1e6, 10_000_000)
            assertEquals("mass ratio 100^$exp", expected, t.count)
        }
    }

    @Test fun lightBendsAndCaptures() {
        assertTrue("b = 2.55 must be captured", tracePhoton(-16.0, 2.55, 1.0, 0.0).captured)
        assertFalse("b = 2.65 must escape", tracePhoton(-16.0, 2.65, 1.0, 0.0).captured)
        // weak field: deflection ≈ 2 r_s / b (with r_s = 1) for large b
        val d = abs(tracePhoton(-60.0, 20.0, 1.0, 0.0, maxR = 80.0).deflection)
        close(2.0 / 20.0, d, 0.02, "weak-field deflection")
    }

    @Test fun projectileMatchesTheory() {
        val f = flight(20.0, 45.0, 0.0, 9.81, 0.0, 0.0005).last()
        close(20.0 * 20.0 / 9.81, f[0], 0.02, "vacuum range")
        val drag = flight(20.0, 45.0, 0.0, 9.81, 0.01).last()
        assertTrue(drag[0] < f[0])
    }

    @Test fun fluidStaysFinite() {
        val s = FluidSim(300, 50f, 80f)
        repeat(600) { s.step() }
        assertFalse(s.x.any { it.isNaN() || it.isInfinite() } || s.y.any { it.isNaN() })
        assertTrue(s.maxSpeed() < 2.01f)
    }

    @Test fun planetsAreWhereTheyShouldBe() {
        val p = DoubleArray(3)
        // J2000.0: Earth ~0.983 AU from the Sun in early January (perihelion is on ~3 Jan)
        heliocentric(PLANETS[2], 0.0, p); close(0.983, sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]), 0.003, "Earth at J2000")
        // Earth's ecliptic longitude at J2000 ≈ 100.4°
        close(100.4, (atan2(p[1], p[0]) * 180 / PI + 360) % 360, 0.5, "Earth longitude")
        heliocentric(PLANETS[4], 0.0, p); close(5.0, sqrt(p[0] * p[0] + p[1] * p[1]), 0.3, "Jupiter distance")
    }

    @Test fun chemistryData() {
        val els = Elements.load(File("src/main/assets/elements.json").readText())
        assertEquals(118, els.size)
        assertEquals((1..118).toList(), els.map { it.z })
        val fe = els[25]; assertEquals("Fe", fe.symbol); close(55.845, fe.mass, 0.01); assertEquals("solid", fe.stateAt(298.0))
        assertEquals("liquid", els[79].stateAt(298.0)) // mercury
        assertEquals("gas", els[7].stateAt(298.0))     // oxygen
        for (e in els) assertEquals(e.symbol, e.z, e.shells.sum())
        // layout: every element gets a unique cell
        assertEquals(118, els.map { it.col to it.row }.toSet().size)
        // hydrogen 2p radial function has no radial node; 3s has two
        var signChanges = 0; var last = radial(3, 0, 0.01)
        for (i in 1..400) { val v = radial(3, 0, i * 0.1); if (v * last < 0) signChanges++; last = v }
        assertEquals(2, signChanges)
        assertNotNull(wavelengthColor(656.3)); assertNull(wavelengthColor(121.6))
        close(1e10, msLifeYears(1.0), 1.0)
        assertEquals(Secrets.all.size, Secrets.all.map { it.id }.toSet().size)
    }
}
