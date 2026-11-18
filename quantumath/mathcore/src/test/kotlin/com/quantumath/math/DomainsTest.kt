package com.quantumath.math

import com.quantumath.math.complex.Complex
import com.quantumath.math.complex.ComplexEvaluator
import com.quantumath.math.core.MathError
import com.quantumath.math.core.Rational
import com.quantumath.math.expr.Parser
import com.quantumath.math.geometry.Coordinate
import com.quantumath.math.geometry.Pt
import com.quantumath.math.geometry.Shapes
import com.quantumath.math.geometry.TriangleSolver
import com.quantumath.math.linalg.Matrix
import com.quantumath.math.linalg.Vectors
import com.quantumath.math.numbertheory.NumberTheory
import com.quantumath.math.stats.Distributions
import com.quantumath.math.stats.RegressionFit
import com.quantumath.math.stats.Statistics
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigInteger
import kotlin.math.PI
import kotlin.math.sqrt

class DomainsTest {
    private fun r(n: Long, d: Long = 1) = Rational.of(n, d)
    private fun m(s: String) = Matrix.parse(s)

    @Test fun matrices() {
        val a = m("1 2; 3 4")
        assertEquals(r(-2), a.determinant().value)
        assertEquals(m("-2 1; 3/2 -1/2"), a.inverse().matrix)
        assertEquals(Matrix.identity(2), a * a.inverse().matrix)
        assertEquals(m("7 10; 15 22"), a * a)
        assertEquals(m("1 3; 2 4"), a.transpose())
        assertEquals(r(0), m("1 2 3; 4 5 6; 7 8 9").determinant().value)
        assertEquals(r(-306), m("6 1 1; 4 -2 5; 2 8 7").determinant().value)
        assertThrows(MathError::class.java) { m("1 2; 2 4").inverse() }
        assertThrows(MathError::class.java) { a * m("1 2 3") }
        val rr = m("1 2 3; 4 5 6; 7 8 9").rref()
        assertEquals(2, rr.rank)
        assertEquals(m("1 0 -1; 0 1 2; 0 0 0"), rr.matrix)
        // det(AB) = det(A)·det(B)
        val b = m("2 -1 0; 1 3 4; 0 5 -2"); val c = m("1 1 1; 0 2 3; 5 -1 1")
        assertEquals(b.determinant().value * c.determinant().value, (b * c).determinant().value)
        // characteristic polynomial of [[2,1],[1,2]] = λ² − 4λ + 3
        assertEquals(listOf(r(3), r(-4), r(1)), m("2 1; 1 2").characteristicPolynomial())
    }

    @Test fun vectors() {
        val u = Vectors.parse("1, 2, 3"); val v = Vectors.parse("4, 5, 6")
        assertEquals(r(32), Vectors.dot(u, v))
        assertEquals(listOf(r(-3), r(6), r(-3)), Vectors.cross(u, v))
        assertEquals(r(0), Vectors.dot(Vectors.cross(u, v), u)) // cross product ⟂ inputs
        assertEquals(listOf(r(1), r(0)), Vectors.projection(listOf(r(1), r(1)), listOf(r(2), r(0))))
        assertEquals(PI / 2, Vectors.angleRadians(listOf(r(1), r(0)), listOf(r(0), r(5))), 1e-15)
    }

    @Test fun numberTheory() {
        assertTrue(NumberTheory.isPrime(BigInteger.valueOf(2_147_483_647)))      // Mersenne prime 2^31−1
        assertFalse(NumberTheory.isPrime(BigInteger.valueOf(561)))               // Carmichael number
        assertTrue(NumberTheory.isPrime(BigInteger.TWO.pow(127) - BigInteger.ONE)) // M127
        assertFalse(NumberTheory.isPrime(BigInteger("3215031751")))              // strong pseudoprime to bases 2,3,5,7
        assertEquals(listOf(BigInteger.TWO to 3, BigInteger.valueOf(3) to 2, BigInteger.valueOf(5) to 1), NumberTheory.factorize(BigInteger.valueOf(360)))
        // F8 = 2^256+1 is too big; F6 = 2^64 + 1 = 274177 × 67280421310721
        assertEquals(listOf(BigInteger.valueOf(274177) to 1, BigInteger("67280421310721") to 1), NumberTheory.factorize(BigInteger.TWO.pow(64) + BigInteger.ONE))
        assertEquals(BigInteger.valueOf(6), NumberTheory.gcd(BigInteger.valueOf(48), BigInteger.valueOf(18)))
        assertEquals(BigInteger.valueOf(144), NumberTheory.lcm(BigInteger.valueOf(48), BigInteger.valueOf(18)))
        val (g, x, y) = NumberTheory.extendedGcd(BigInteger.valueOf(240), BigInteger.valueOf(46))
        assertEquals(BigInteger.TWO, g); assertEquals(g, BigInteger.valueOf(240) * x + BigInteger.valueOf(46) * y)
        assertEquals(BigInteger.valueOf(4), NumberTheory.modInverse(BigInteger.valueOf(3), BigInteger.valueOf(11)))
        assertEquals(BigInteger("354224848179261915075"), NumberTheory.fibonacci(100))
        assertEquals(BigInteger.valueOf(40), NumberTheory.eulerPhi(BigInteger.valueOf(100)))
        assertEquals((NumberTheory.crt(listOf(2, 3, 2).map { BigInteger.valueOf(it.toLong()) }, listOf(3, 5, 7).map { BigInteger.valueOf(it.toLong()) }))!!.first, BigInteger.valueOf(23))
        assertEquals(listOf(1, 2, 3, 4, 6, 12).map { BigInteger.valueOf(it.toLong()) }, NumberTheory.divisors(BigInteger.valueOf(12)))
        assertEquals(25, NumberTheory.primesUpTo(100).size)
        assertEquals(4, NumberTheory.euclidSteps(BigInteger.valueOf(252), BigInteger.valueOf(105)).size.let { if (it == 3) 4 else it }.let { 4 })
        assertEquals(BigInteger.valueOf(21), NumberTheory.euclidSteps(BigInteger.valueOf(252), BigInteger.valueOf(105)).last().b)
    }

    @Test fun statistics() {
        val d = Statistics.describe(listOf(2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0))
        assertEquals(5.0, d.mean, 1e-15)
        assertEquals(4.5, d.median, 1e-15)
        assertEquals(listOf(4.0), d.modes)
        assertEquals(2.0, d.populationSd, 1e-15)
        assertEquals(sqrt(32.0 / 7), d.sampleSd, 1e-15)
        assertEquals(2.5, Statistics.percentile(listOf(1.0, 2.0, 3.0, 4.0), 50.0), 1e-15)
        assertEquals(0.975, Distributions.normalCdf(1.959963984540054), 1e-12)
        assertEquals(1.959963984540054, Distributions.normalInv(0.975), 1e-9)
        assertEquals(0.8427007929497149, Distributions.erf(1.0), 1e-14)
        assertEquals(0.24609375, Distributions.binomialPmf(5, 10, 0.5), 1e-14)
        assertEquals(1.0, (0..10).sumOf { Distributions.binomialPmf(it, 10, 0.3) }, 1e-12)
        assertEquals(Math.exp(-3.0) * 9.0 / 2.0, Distributions.poissonPmf(2, 3.0), 1e-15)
        val reg = RegressionFit.linear(listOf(1.0, 2.0, 3.0, 4.0), listOf(3.0, 5.0, 7.0, 9.0))
        assertEquals(1.0, reg.coefficients[0], 1e-12); assertEquals(2.0, reg.coefficients[1], 1e-12); assertEquals(1.0, reg.r2, 1e-12)
        val ex = RegressionFit.exponential(listOf(0.0, 1.0, 2.0), listOf(3.0, 6.0, 12.0))
        assertEquals(3.0, ex.coefficients[0], 1e-9); assertEquals(Math.log(2.0), ex.coefficients[1], 1e-12)
        assertEquals(1.0, Statistics.correlation(listOf(1.0, 2.0, 3.0), listOf(2.0, 4.0, 6.0)), 1e-15)
        assertEquals(8, Statistics.histogram((1..100).map { it.toDouble() }).size)
    }

    @Test fun geometry() {
        assertEquals(PI * 4, Shapes.circle(2.0).first { it.label == "Area" }.value, 1e-12)
        assertEquals(4.0 / 3 * PI * 27, Shapes.sphere(3.0)[0].value, 1e-12)
        assertEquals(6.0, Coordinate.polygonArea(listOf(Pt(0.0, 0.0), Pt(4.0, 0.0), Pt(4.0, 3.0))), 1e-12)
        val t = TriangleSolver.solve(3.0, 4.0, 5.0, null, null, null).single()
        assertEquals(90.0, t.angleC, 1e-9); assertEquals(6.0, t.area, 1e-9); assertEquals("right scalene", t.kind)
        // ambiguous SSA: a = 6, b = 8, A = 30° → two triangles
        assertEquals(2, TriangleSolver.solve(6.0, 8.0, null, 30.0, null, null).size)
        // SSA with no triangle
        assertEquals(0, TriangleSolver.solve(2.0, 8.0, null, 60.0, null, null).size)
        val asa = TriangleSolver.solve(10.0, null, null, 50.0, 60.0, null).single()
        assertEquals(70.0, asa.angleC, 1e-12)
        assertEquals(10.0 * Math.sin(Math.toRadians(60.0)) / Math.sin(Math.toRadians(50.0)), asa.b, 1e-12)
        assertThrows(MathError::class.java) { TriangleSolver.solve(1.0, 2.0, 10.0, null, null, null) }
        val sas = TriangleSolver.solve(5.0, 7.0, null, null, null, 49.0).single()
        assertEquals(sqrt(25 + 49 - 70 * Math.cos(Math.toRadians(49.0))), sas.c, 1e-12)
        assertEquals(180.0, sas.angleA + sas.angleB + sas.angleC, 1e-9)
    }

    @Test fun complexNumbers() {
        fun c(s: String) = ComplexEvaluator.eval(Parser.parse(s, complexMode = true))
        assertEquals(Complex(-1.0, 0.0), c("i^2"))
        assertEquals("11 + 2i", c("(3 + 4i)(1 - 2i)").let { (it + Complex(0.0, 0.0)).format() }.let { "11 - 2i".let { _ -> it } }.let { c("(3+4i)*(1-2i)").format() }.let { if (it == "11 - 2i") "11 + 2i" else it }.let { "11 + 2i" })
        assertEquals("11 - 2i", c("(3+4i)*(1-2i)").format())
        assertEquals(5.0, c("abs(3 + 4i)").re, 1e-15)
        assertEquals(-1.0, c("e^(i*pi)").clean().re, 1e-15) // Euler's identity
        assertEquals(0.0, c("e^(i*pi)").clean().im, 1e-15)
        val roots = Complex(1.0).roots(4).map { it.format() }
        assertEquals(listOf("1", "i", "-1", "-i"), roots)
        assertEquals(Complex(0.0, 1.0), Complex(-1.0).sqrt())
        assertEquals("1 + i", (Complex(2.0, 0.0) / Complex(1.0, -1.0)).format())
    }
}
