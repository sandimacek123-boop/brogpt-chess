package dev.divide.game.game

import kotlin.math.sqrt

/** Exact integer number theory used by the game rules. All values are positive and small enough for Long. */
object NT {
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

    /** Number of prime factors counted with multiplicity, Ω(n). */
    fun omega(n: Long): Int = factorize(n).size

    /** The most balanced split n = a · b with a ≤ b (a is the largest divisor not above √n). */
    fun balancedSplit(n: Long): Pair<Long, Long> {
        var a = sqrt(n.toDouble()).toLong()
        while (a > 1 && n % a != 0L) a--
        if (a < 2) a = factorize(n).first()
        return a to n / a
    }

    private val SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹"
    fun sup(k: Int) = k.toString().map { SUP[it - '0'] }.joinToString("")

    /** "2³·3²·5" style factorisation. */
    fun factorString(n: Long): String = factorize(n).groupingBy { it }.eachCount().entries.joinToString("·") { (p, k) -> if (k > 1) "$p${sup(k)}" else "$p" }

    /** Plain "7 × 13" form for teaching banners. */
    fun productString(n: Long): String { val (a, b) = balancedSplit(n); return "$a × $b" }

    fun digits(n: Long): Int = n.toString().length

    /** Composites built from two primes ≥ 7: they look prime and catch people out. */
    val DECOYS = listOf(49L, 77L, 91L, 119L, 121L, 133L, 143L, 161L, 169L, 187L, 203L, 209L, 217L, 221L, 247L, 253L, 259L, 287L, 289L, 299L, 301L, 319L, 323L, 341L, 361L, 377L, 391L, 403L, 437L, 451L, 473L, 481L, 493L, 497L, 511L, 527L, 529L, 533L, 551L, 559L, 589L, 611L, 629L, 649L, 667L, 671L, 689L, 697L, 703L, 713L)
}
