package dev.divide.game

import dev.divide.game.game.*
import org.junit.Assert.*
import org.junit.Test

class RulesTest {
    @Test fun numberTheory() {
        assertTrue(NT.isPrime(2)); assertTrue(NT.isPrime(97)); assertFalse(NT.isPrime(91)); assertFalse(NT.isPrime(1))
        assertEquals(3L to 4L, NT.balancedSplit(12)); assertEquals(32L to 32L, NT.balancedSplit(1024)); assertEquals(7L to 13L, NT.balancedSplit(91))
        assertEquals("2³·3²·5", NT.factorString(360)); assertEquals(7, NT.omega(8128))
        for (d in NT.DECOYS) assertFalse("$d must be composite", NT.isPrime(d))
        for (b in BOSSES) assertTrue(NT.omega(b.value) >= 3)
    }

    private fun drop(e: Engine, v: Long, x: Float = 500f, y: Float = 500f): Ent {
        val kind = if (NT.isPrime(v)) Kind.Prime else Kind.Composite
        return Ent(999, kind, v, x, y, 0f, 0f, Engine.radiusFor(v)).also { e.ents += it }
    }

    @Test fun slicingAndCatching() {
        val e = Engine(Mode.Zen, 1, 2000f)
        val twelve = drop(e, 12)
        e.swipe(300f, 500f, 700f, 500f, 1, 2000f)
        assertFalse(twelve.alive)
        val kids = e.ents.filter { it.alive }.map { it.value }.sorted()
        assertEquals(listOf(3L, 4L), kids)
        assertTrue("3 is harvested automatically", e.ents.first { it.value == 3L }.harvest)
        // slow swipes do not cut
        val nine = drop(e, 9, 500f, 1200f); e.swipe(300f, 1200f, 700f, 1200f, 2, 100f); assertTrue(nine.alive)
        // tapping a prime catches it
        val seven = drop(e, 7, 200f, 900f); assertTrue(e.tap(205f, 905f)); assertTrue(seven.dying > 0f); assertEquals(1, e.caught)
        assertTrue(e.overdrive > 0f)
    }

    @Test fun clangCostsAShield() {
        val e = Engine(Mode.Arcade, 2, 2000f)
        val s = e.shields
        drop(e, 13)
        e.swipe(300f, 500f, 700f, 500f, 1, 2000f)
        assertEquals(s - 1, e.shields); assertEquals(1, e.clangs); assertTrue(e.fx.frames.isNotEmpty())
    }

    @Test fun multiCutTriggersImpact() {
        val e = Engine(Mode.Zen, 3, 2000f)
        for ((i, v) in listOf(4L, 6L, 8L, 9L, 10L).withIndex()) drop(e, v, 100f + i * 200f, 600f)
        e.swipe(0f, 600f, 1000f, 600f, 7, 3000f)
        assertEquals(5, e.maxMulti)
        assertTrue(e.fx.frames.contains(2))   // ink frames for a 5-chain
        assertTrue(e.fx.hitStop > 0f)
    }

    @Test fun bossNeedsOneCutPerPrimeFactor() {
        val e = Engine(Mode.BossRush, 4, 2000f); e.begin()
        repeat(200) { e.step(1 / 60f) }
        val b = e.boss!!
        assertEquals(360L, b.value)
        var cuts = 0
        while (e.boss != null && cuts < 20) {
            b.invuln = 0f
            e.swipe(b.x - 300f, b.y, b.x + 300f, b.y, 100 + cuts, 3000f); cuts++
        }
        assertEquals(NT.omega(360), cuts)
        assertEquals(listOf(360L), e.bossesDefeated)
    }

    @Test fun arcadeRunsWithoutCrashing() {
        val e = Engine(Mode.Arcade, 5, 2100f); e.begin()
        var frames = 0
        while (!e.over && frames < 60 * 600) {
            // a mediocre player: slices composites that get low, taps primes now and then
            for (x in e.ents.filter { it.alive && it.kind == Kind.Composite && !it.harvest && it.y > 1200f }.take(1)) e.swipe(x.x - 200f, x.y, x.x + 200f, x.y, frames, 3000f)
            if (frames % 40 == 0) e.ents.firstOrNull { it.kind == Kind.Prime && !it.harvest && it.alive }?.let { e.tap(it.x, it.y) }
            e.step(1 / 60f); frames++
        }
        assertTrue("reached wave ${e.wave}", e.wave >= 3)
        assertTrue(e.score > 0)
    }

    @Test fun trainingCanBeCompleted() {
        val e = Engine(Mode.Tutorial, 3, 2100f); e.begin()
        var frames = 0; var id = 1
        fun cut(x: Ent) { e.swipe(x.x - x.r - 150f, x.y + 40f, x.x + x.r + 150f, x.y - 40f, id++, 3000f) }
        val seen = HashSet<Int>()
        while (!e.tutDone && frames < 60 * 180) {
            seen += e.tutStep
            val active = e.ents.filter { it.alive && !it.harvest && it.dying == 0f && it.y > 150f }
            val comps = active.filter { it.kind == Kind.Composite }
            when (e.tutStep) {
                1 -> active.firstOrNull { it.kind == Kind.Prime }?.let { e.tap(it.x, it.y) }
                2 -> active.firstOrNull { it.kind == Kind.Prime && it.invuln == 0f }?.let { cut(it) }
                4 -> if (comps.size >= 4) { val y = comps.map { it.y }.average().toFloat(); e.swipe(0f, y, 1000f, y, id++, 3000f) } else comps.firstOrNull()?.let { cut(it) }
                5 -> { e.activateOverdrive(); comps.firstOrNull()?.let { cut(it) } }
                else -> comps.firstOrNull()?.let { cut(it) }
            }
            e.step(1 / 60f); frames++
        }
        assertTrue("training stalled at step ${e.tutStep} after ${frames / 60}s", e.tutDone)
        assertEquals((0..6).toSet(), seen)
        assertTrue(e.clangs >= 1); assertTrue(e.maxMulti >= 3); assertEquals(3, e.shields)
    }
}
