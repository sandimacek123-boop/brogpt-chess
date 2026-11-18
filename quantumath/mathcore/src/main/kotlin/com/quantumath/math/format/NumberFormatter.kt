package com.quantumath.math.format

import com.quantumath.math.core.Rational
import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import java.text.DecimalFormatSymbols
import java.util.Locale

enum class NumberStyle { AUTO, SCIENTIFIC, ENGINEERING, PLAIN }

/** Formats results for display. Never changes the underlying value, only its presentation. */
data class NumberFormatter(
    val significant: Int = 15,
    val style: NumberStyle = NumberStyle.AUTO,
    val grouping: Boolean = false,
    val unicode: Boolean = true,
) {
    fun format(v: BigDecimal): String {
        if (v.signum() == 0) return "0"
        val r = v.round(MathContext(significant, RoundingMode.HALF_EVEN)).stripTrailingZeros()
        val exp = r.precision() - r.scale() - 1 // decimal exponent of the leading digit
        val useSci = when (style) {
            NumberStyle.SCIENTIFIC, NumberStyle.ENGINEERING -> true
            NumberStyle.PLAIN -> false
            NumberStyle.AUTO -> exp >= significant.coerceAtMost(21) || exp < -6
        }
        if (!useSci) return group(plain(r))
        var e = exp
        if (style == NumberStyle.ENGINEERING) e = Math.floorDiv(exp, 3) * 3
        val mant = r.movePointLeft(e).stripTrailingZeros()
        val m = plain(mant)
        return if (unicode) "$m × 10${sup(e)}" else "${m}E$e"
    }

    fun format(d: Double): String = when {
        d.isNaN() -> "undefined"
        d == Double.POSITIVE_INFINITY -> "∞"
        d == Double.NEGATIVE_INFINITY -> "-∞"
        else -> format(BigDecimal(d).round(MathContext(Math.min(significant, 15), RoundingMode.HALF_EVEN)))
    }

    fun format(r: Rational): String = r.toString()

    private fun plain(v: BigDecimal): String = v.stripTrailingZeros().let { if (it.scale() < 0) it.setScale(0) else it }.toPlainString()

    private fun group(s: String): String {
        if (!grouping) return s
        val neg = s.startsWith("-")
        val body = if (neg) s.substring(1) else s
        val dot = body.indexOf('.')
        val intPart = if (dot >= 0) body.substring(0, dot) else body
        val frac = if (dot >= 0) body.substring(dot) else ""
        val sep = DecimalFormatSymbols.getInstance(Locale.US).groupingSeparator
        val grouped = intPart.reversed().chunked(3).joinToString(sep.toString()).reversed()
        return (if (neg) "-" else "") + grouped + frac
    }

    companion object {
        private const val SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹"
        fun sup(n: Int): String = n.toString().map { if (it == '-') '⁻' else SUP[it - '0'] }.joinToString("")
    }
}
