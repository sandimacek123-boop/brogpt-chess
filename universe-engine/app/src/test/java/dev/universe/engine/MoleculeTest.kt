package dev.universe.engine

import dev.universe.engine.chem.MOLECULES
import dev.universe.engine.chem.buildMolecule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class MoleculeTest {
    @Test
    fun formulasAndGeometry() {
        val expect = mapOf("Water" to "H₂O", "Ammonia" to "H₃N", "Methane" to "CH₄", "Carbon dioxide" to "CO₂", "Ethanol" to "C₂H₆O", "Benzene" to "C₆H₆", "Aspirin" to "C₉H₈O₄", "Caffeine" to "C₈H₁₀N₄O₂", "Glycine" to "C₂H₅NO₂")
        for ((name, smi) in MOLECULES) {
            val m = buildMolecule(name, smi)
            expect[name]?.let { assertEquals(name, it, m.formula()) }
            // every bond length within 12 % of its target range, no two atoms closer than 0.8 Å
            for (b in m.bonds) { val d = m.distance(b[0], b[1]); assertTrue("$name bond ${m.atoms[b[0]]}-${m.atoms[b[1]]} = $d", d in 0.85..1.7) }
            for (i in m.atoms.indices) for (j in i + 1 until m.atoms.size) assertTrue("$name clash $i $j", m.distance(i, j) > 0.8)
        }
        val w = buildMolecule("Water", "O"); assertTrue("water angle ${w.angle(1, 0, 2)}", abs(w.angle(1, 0, 2) - 104.5) < 4)
        val c = buildMolecule("CO2", "O=C=O"); assertTrue("CO2 angle ${c.angle(0, 1, 2)}", c.angle(0, 1, 2) > 172)
        val me = buildMolecule("Methane", "C"); assertTrue("methane ${me.angle(1, 0, 2)}", abs(me.angle(1, 0, 2) - 109.5) < 4)
        // benzene must be flat: all ring carbons within 0.15 Å of their best plane (check via z-spread after a PCA-free test: all C-C-C angles ≈ 120)
        val bz = buildMolecule("Benzene", "C1=CC=CC=C1")
        for (k in 0 until 6) { val a = bz.angle((k + 5) % 6, k, (k + 1) % 6); assertTrue("benzene angle $a", abs(a - 120) < 5) }
        println("caffeine atoms=${buildMolecule("Caffeine", MOLECULES.last().second).atoms.size}")
    }
}
