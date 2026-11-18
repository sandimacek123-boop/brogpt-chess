package com.quantumath.math.numbertheory

import com.quantumath.math.core.DomainError
import com.quantumath.math.core.MathError
import java.math.BigInteger

object NumberTheory {
    private val SMALL_PRIMES = intArrayOf(2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41)
    private val MR_DETERMINISTIC_LIMIT = BigInteger("3317044064679887385961981") // bases ≤ 41 are exact below this

    /** Miller–Rabin. Deterministic below 3.3·10²⁴; above that, 40 extra rounds (error < 4⁻⁴⁰). */
    fun isPrime(n: BigInteger): Boolean {
        if (n < BigInteger.TWO) return false
        for (p in SMALL_PRIMES) {
            val bp = BigInteger.valueOf(p.toLong())
            if (n == bp) return true
            if (n.mod(bp).signum() == 0) return false
        }
        val nm1 = n - BigInteger.ONE
        val s = nm1.lowestSetBit
        val d = nm1.shiftRight(s)
        fun witness(a: BigInteger): Boolean {
            var x = a.modPow(d, n)
            if (x == BigInteger.ONE || x == nm1) return false
            repeat(s - 1) {
                x = x.multiply(x).mod(n)
                if (x == nm1) return false
            }
            return true
        }
        for (p in SMALL_PRIMES) if (witness(BigInteger.valueOf(p.toLong()))) return false
        if (n < MR_DETERMINISTIC_LIMIT) return true
        return n.isProbablePrime(80)
    }

    fun isPrimeDeterministic(n: BigInteger) = n < MR_DETERMINISTIC_LIMIT

    /** Prime factorization as (prime, exponent) pairs, ascending. Trial division + Pollard's rho (Brent). */
    fun factorize(n0: BigInteger, timeLimitMs: Long = 5000): List<Pair<BigInteger, Int>> {
        if (n0.signum() == 0) throw DomainError("0 has no prime factorization")
        var n = n0.abs()
        val factors = sortedMapOf<BigInteger, Int>()
        val deadline = System.currentTimeMillis() + timeLimitMs
        var p = 2L
        while (p <= 10_000 && BigInteger.valueOf(p * p) <= n) {
            val bp = BigInteger.valueOf(p)
            while (n.mod(bp).signum() == 0) {
                factors[bp] = (factors[bp] ?: 0) + 1
                n /= bp
            }
            p += if (p == 2L) 1 else 2
        }
        fun split(m: BigInteger) {
            if (m == BigInteger.ONE) return
            if (isPrime(m)) { factors[m] = (factors[m] ?: 0) + 1; return }
            if (System.currentTimeMillis() > deadline) throw MathError("Factorization timed out (number too large for on-device factoring)")
            val d = pollardBrent(m, deadline)
            split(d)
            split(m / d)
        }
        split(n)
        return factors.entries.map { it.key to it.value }
    }

    private fun pollardBrent(n: BigInteger, deadline: Long): BigInteger {
        if (!n.testBit(0)) return BigInteger.TWO
        val rnd = java.util.Random(n.hashCode().toLong())
        while (true) {
            if (System.currentTimeMillis() > deadline) throw MathError("Factorization timed out")
            var y = BigInteger(n.bitLength(), rnd).mod(n)
            val c = BigInteger(n.bitLength(), rnd).mod(n - BigInteger.ONE) + BigInteger.ONE
            val m = 128
            var g = BigInteger.ONE
            var r = 1
            var q = BigInteger.ONE
            var x = y
            var ys = y
            while (g == BigInteger.ONE) {
                x = y
                repeat(r) { y = y.multiply(y).add(c).mod(n) }
                var k = 0
                while (k < r && g == BigInteger.ONE) {
                    ys = y
                    val lim = Math.min(m, r - k)
                    repeat(lim) {
                        y = y.multiply(y).add(c).mod(n)
                        q = q.multiply((x - y).abs()).mod(n)
                    }
                    g = q.gcd(n)
                    k += m
                }
                r *= 2
                if (r > 1 shl 22) break
            }
            if (g == n) {
                do {
                    ys = ys.multiply(ys).add(c).mod(n)
                    g = (x - ys).abs().gcd(n)
                } while (g == BigInteger.ONE)
            }
            if (g != n && g != BigInteger.ONE) return g
        }
    }

    data class EuclidStep(val a: BigInteger, val b: BigInteger, val q: BigInteger, val r: BigInteger)

    /** Euclidean algorithm with every division step a = q·b + r. */
    fun euclidSteps(a0: BigInteger, b0: BigInteger): List<EuclidStep> {
        var a = a0.abs(); var b = b0.abs()
        val out = ArrayList<EuclidStep>()
        while (b.signum() != 0) {
            val (q, r) = a.divideAndRemainder(b)
            out += EuclidStep(a, b, q, r)
            a = b; b = r
        }
        return out
    }

    fun gcd(a: BigInteger, b: BigInteger): BigInteger = a.gcd(b)
    fun lcm(a: BigInteger, b: BigInteger): BigInteger = if (a.signum() == 0 || b.signum() == 0) BigInteger.ZERO else (a / a.gcd(b) * b).abs()

    /** Extended Euclid: returns (g, x, y) with a·x + b·y = g = gcd(a, b). */
    fun extendedGcd(a: BigInteger, b: BigInteger): Triple<BigInteger, BigInteger, BigInteger> {
        var oldR = a; var r = b
        var oldS = BigInteger.ONE; var s = BigInteger.ZERO
        var oldT = BigInteger.ZERO; var t = BigInteger.ONE
        while (r.signum() != 0) {
            val q = oldR / r
            oldR = r.also { r = oldR - q * r }
            oldS = s.also { s = oldS - q * s }
            oldT = t.also { t = oldT - q * t }
        }
        return if (oldR.signum() < 0) Triple(oldR.negate(), oldS.negate(), oldT.negate()) else Triple(oldR, oldS, oldT)
    }

    fun modInverse(a: BigInteger, m: BigInteger): BigInteger {
        if (m.signum() <= 0) throw DomainError("Modulus must be positive")
        val (g, x, _) = extendedGcd(a.mod(m), m)
        if (g != BigInteger.ONE) throw DomainError("$a has no inverse modulo $m (gcd = $g)")
        return x.mod(m)
    }

    fun modPow(b: BigInteger, e: BigInteger, m: BigInteger): BigInteger {
        if (m.signum() <= 0) throw DomainError("Modulus must be positive")
        return if (e.signum() < 0) modInverse(b, m).modPow(e.negate(), m) else b.modPow(e, m)
    }

    /** Chinese remainder theorem for pairwise-coprime or compatible moduli. Returns (x, M) or null if inconsistent. */
    fun crt(residues: List<BigInteger>, moduli: List<BigInteger>): Pair<BigInteger, BigInteger>? {
        var x = BigInteger.ZERO
        var m = BigInteger.ONE
        for (i in residues.indices) {
            val a = residues[i]; val n = moduli[i]
            val (g, p, _) = extendedGcd(m, n)
            if ((a - x).mod(g).signum() != 0) return null
            val lcm = m / g * n
            x = (x + m * ((a - x) / g * p).mod(n / g)).mod(lcm)
            m = lcm
        }
        return x to m
    }

    /** F(n) by fast doubling (exact). */
    fun fibonacci(n: Int): BigInteger {
        if (n < 0) throw DomainError("n must be ≥ 0")
        if (n > 200_000) throw MathError("n is limited to 200000")
        fun fd(k: Int): Pair<BigInteger, BigInteger> {
            if (k == 0) return BigInteger.ZERO to BigInteger.ONE
            val (a, b) = fd(k / 2)
            val c = a * (b.shiftLeft(1) - a)
            val d = a * a + b * b
            return if (k % 2 == 0) c to d else d to (c + d)
        }
        return fd(n).first
    }

    fun eulerPhi(n: BigInteger): BigInteger {
        if (n.signum() <= 0) throw DomainError("φ(n) requires n ≥ 1")
        var r = n
        for ((p, _) in factorize(n)) r = r / p * (p - BigInteger.ONE)
        return r
    }

    fun divisors(n: BigInteger): List<BigInteger> {
        if (n.signum() == 0) throw DomainError("0 has infinitely many divisors")
        var ds = listOf(BigInteger.ONE)
        for ((p, e) in factorize(n)) {
            val next = ArrayList<BigInteger>()
            for (d in ds) {
                var pp = BigInteger.ONE
                for (i in 0..e) { next += d * pp; pp *= p }
            }
            ds = next
            if (ds.size > 100_000) throw MathError("Too many divisors to list")
        }
        return ds.sorted()
    }

    fun binomial(n: Int, k: Int): BigInteger {
        if (k < 0 || n < 0 || k > n) return BigInteger.ZERO
        val kk = Math.min(k, n - k)
        var r = BigInteger.ONE
        for (i in 1..kk) r = r * BigInteger.valueOf((n - kk + i).toLong()) / BigInteger.valueOf(i.toLong())
        return r
    }

    fun permutations(n: Int, k: Int): BigInteger {
        if (k < 0 || n < 0 || k > n) return BigInteger.ZERO
        var r = BigInteger.ONE
        for (i in 0 until k) r *= BigInteger.valueOf((n - i).toLong())
        return r
    }

    fun primesUpTo(n: Int): List<Int> {
        if (n < 2) return emptyList()
        if (n > 10_000_000) throw MathError("Sieve limit is 10,000,000")
        val composite = java.util.BitSet(n + 1)
        var i = 2
        while (i.toLong() * i <= n) {
            if (!composite[i]) { var j = i * i; while (j <= n) { composite.set(j); j += i } }
            i++
        }
        return (2..n).filter { !composite[it] }
    }

    fun nextPrime(n: BigInteger): BigInteger {
        var c = if (n < BigInteger.TWO) BigInteger.TWO else n + BigInteger.ONE
        while (!isPrime(c)) c += BigInteger.ONE
        return c
    }

    /** Divisibility rules explained for small divisors. */
    fun divisibilityExplanation(n: BigInteger, d: Int): String {
        val s = n.abs().toString()
        val digitSum = s.sumOf { it - '0' }
        val divisible = n.mod(BigInteger.valueOf(d.toLong())).signum() == 0
        val reason = when (d) {
            2 -> "last digit ${s.last()} is ${if ((s.last() - '0') % 2 == 0) "even" else "odd"}"
            3 -> "digit sum $digitSum is ${if (digitSum % 3 == 0) "" else "not "}divisible by 3"
            4 -> "last two digits ${s.takeLast(2)} form a number ${if (s.takeLast(2).toInt() % 4 == 0) "" else "not "}divisible by 4"
            5 -> "last digit is ${s.last()}"
            6 -> "divisible by 6 iff divisible by both 2 and 3"
            8 -> "last three digits ${s.takeLast(3)} ${if (s.takeLast(3).toInt() % 8 == 0) "are" else "are not"} divisible by 8"
            9 -> "digit sum $digitSum is ${if (digitSum % 9 == 0) "" else "not "}divisible by 9"
            10 -> "last digit is ${s.last()}"
            11 -> {
                val alt = s.reversed().mapIndexed { i, c -> if (i % 2 == 0) c - '0' else -(c - '0') }.sum()
                "alternating digit sum $alt is ${if (alt % 11 == 0) "" else "not "}divisible by 11"
            }
            else -> "remainder is ${n.mod(BigInteger.valueOf(d.toLong()))}"
        }
        return "$n is ${if (divisible) "" else "not "}divisible by $d: $reason."
    }

    /** Integer sequences for the explorer. */
    fun sequence(name: String, count: Int): List<BigInteger> {
        val n = count.coerceIn(1, 500)
        return when (name) {
            "fibonacci" -> (0 until n).map { fibonacci(it) }
            "lucas" -> { val l = ArrayList<BigInteger>(); var a = BigInteger.TWO; var b = BigInteger.ONE; repeat(n) { l += a; val c = a + b; a = b; b = c }; l }
            "primes" -> { val l = ArrayList<BigInteger>(); var p = BigInteger.ONE; repeat(n) { p = nextPrime(p); l += p }; l }
            "squares" -> (1..n).map { BigInteger.valueOf(it.toLong()).pow(2) }
            "cubes" -> (1..n).map { BigInteger.valueOf(it.toLong()).pow(3) }
            "triangular" -> (1..n).map { BigInteger.valueOf(it.toLong() * (it + 1) / 2) }
            "factorials" -> (0 until n).map { com.quantumath.math.eval.BigMath.factorial(it) }
            "catalan" -> (0 until n).map { binomial(2 * it, it) / BigInteger.valueOf((it + 1).toLong()) }
            "powers2" -> (0 until n).map { BigInteger.TWO.pow(it) }
            "collatz" -> { val l = ArrayList<BigInteger>(); var c = BigInteger.valueOf(27); l += c; while (c != BigInteger.ONE && l.size < n) { c = if (c.testBit(0)) c * BigInteger.valueOf(3) + BigInteger.ONE else c.shiftRight(1); l += c }; l }
            "perfect" -> listOf(6L, 28L, 496L, 8128L, 33550336L, 8589869056L, 137438691328L).map { BigInteger.valueOf(it) }.take(n)
            else -> throw MathError("Unknown sequence '$name'")
        }
    }
}
