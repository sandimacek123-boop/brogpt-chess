package dev.universe.engine.core.math

import java.math.BigInteger
import kotlin.math.*

/** Numerical toolbox shared by the laboratories. */
object Num {
    const val PHI = 1.618033988749895
    const val EULER_GAMMA = 0.5772156649015329

    /** Central-difference derivative with a step scaled to the magnitude of x. */
    inline fun deriv(x: Double, h: Double = 1e-5 * max(1.0, abs(x)), f: (Double) -> Double): Double = (f(x + h) - f(x - h)) / (2 * h)

    inline fun deriv2(x: Double, h: Double = 1e-4 * max(1.0, abs(x)), f: (Double) -> Double): Double = (f(x + h) - 2 * f(x) + f(x - h)) / (h * h)

    /** Composite Simpson's rule; n is rounded up to an even number of intervals. */
    inline fun simpson(a: Double, b: Double, n: Int = 400, f: (Double) -> Double): Double {
        val m = if (n % 2 == 0) n else n + 1
        val h = (b - a) / m
        var s = f(a) + f(b)
        for (i in 1 until m) s += f(a + i * h) * (if (i % 2 == 1) 4 else 2)
        return s * h / 3
    }

    /** Bisection on a bracketing interval; returns the midpoint after [iters] halvings. */
    inline fun bisect(a0: Double, b0: Double, iters: Int = 60, f: (Double) -> Double): Double {
        var a = a0; var b = b0
        var fa = f(a)
        repeat(iters) {
            val m = (a + b) / 2
            val fm = f(m)
            if ((fa < 0) == (fm < 0)) { a = m; fa = fm } else b = m
        }
        return (a + b) / 2
    }

    /** Lanczos approximation (g = 7, n = 9), with reflection for x < 0.5. Accurate to ~1e-13. */
    fun gamma(x: Double): Double {
        if (x < 0.5) return PI / (sin(PI * x) * gamma(1 - x))
        val g = 7.0
        val c = doubleArrayOf(0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
            12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7)
        val z = x - 1
        var a = c[0]
        val t = z + g + 0.5
        for (i in 1 until 9) a += c[i] / (z + i)
        return sqrt(2 * PI) * t.pow(z + 0.5) * exp(-t) * a
    }

    /** Sieve of Eratosthenes: result[k] is true when k is prime, for k in 0..n. */
    fun sieve(n: Int): BooleanArray {
        val p = BooleanArray(n + 1) { it >= 2 }
        var i = 2
        while (i.toLong() * i <= n) {
            if (p[i]) { var j = i * i; while (j <= n) { p[j] = false; j += i } }
            i++
        }
        return p
    }

    fun isPrime(n: Long): Boolean {
        if (n < 2) return false
        if (n < 4) return true
        if (n % 2 == 0L || n % 3 == 0L) return false
        var i = 5L
        while (i * i <= n) { if (n % i == 0L || n % (i + 2) == 0L) return false; i += 6 }
        return true
    }

    fun factorize(n0: Long): List<Long> {
        var n = n0
        val out = ArrayList<Long>()
        var d = 2L
        while (d * d <= n) { while (n % d == 0L) { out += d; n /= d }; d += if (d == 2L) 1 else 2 }
        if (n > 1) out += n
        return out
    }

    /** π to [digits] decimal places using Machin's formula π = 16·arctan(1/5) − 4·arctan(1/239) in exact integer arithmetic. */
    fun piDigits(digits: Int): String {
        val guard = 12
        val scale = BigInteger.TEN.pow(digits + guard)
        fun arctanInv(x: Int): BigInteger {
            val x2 = BigInteger.valueOf(x.toLong() * x)
            var term = scale.divide(BigInteger.valueOf(x.toLong()))
            var sum = term
            var k = 1L
            var sign = -1
            while (term.signum() != 0) {
                term = term.divide(x2)
                val t = term.divide(BigInteger.valueOf(2 * k + 1))
                sum = if (sign < 0) sum.subtract(t) else sum.add(t)
                sign = -sign
                k++
            }
            return sum
        }
        val pi = arctanInv(5).multiply(BigInteger.valueOf(16)).subtract(arctanInv(239).multiply(BigInteger.valueOf(4)))
        val s = pi.divide(BigInteger.TEN.pow(guard)).toString()
        return s.substring(0, 1) + "." + s.substring(1)
    }

    /** Solves Kepler's equation E − e·sin E = M for the eccentric anomaly by Newton iteration. */
    fun kepler(M: Double, e: Double): Double {
        var m = M % (2 * PI)
        if (m > PI) m -= 2 * PI else if (m < -PI) m += 2 * PI
        var E = if (e < 0.8) m else PI * sign(m)
        repeat(30) {
            val d = (E - e * sin(E) - m) / (1 - e * cos(E))
            E -= d
            if (abs(d) < 1e-13) return E
        }
        return E
    }

    /** Complete elliptic integral of the first kind K(k) via the arithmetic–geometric mean. */
    fun ellipticK(k: Double): Double {
        var a = 1.0
        var b = sqrt(1 - k * k)
        repeat(40) { val t = (a + b) / 2; b = sqrt(a * b); a = t }
        return PI / (2 * a)
    }

    fun fib(n: Int): Long { var a = 0L; var b = 1L; repeat(n) { val t = a + b; a = b; b = t }; return a }

    /** Blackbody colour (sRGB, 0..1) for a temperature in kelvin; Tanner Helland's fit to the Planckian locus. */
    fun blackbody(kelvin: Double): FloatArray {
        val t = kelvin.coerceIn(1000.0, 40000.0) / 100.0
        val r = if (t <= 66) 255.0 else 329.698727446 * (t - 60).pow(-0.1332047592)
        val g = if (t <= 66) 99.4708025861 * ln(t) - 161.1195681661 else 288.1221695283 * (t - 60).pow(-0.0755148492)
        val b = if (t >= 66) 255.0 else if (t <= 19) 0.0 else 138.5177312231 * ln(t - 10) - 305.0447927307
        return floatArrayOf((r / 255).coerceIn(0.0, 1.0).toFloat(), (g / 255).coerceIn(0.0, 1.0).toFloat(), (b / 255).coerceIn(0.0, 1.0).toFloat())
    }
}
