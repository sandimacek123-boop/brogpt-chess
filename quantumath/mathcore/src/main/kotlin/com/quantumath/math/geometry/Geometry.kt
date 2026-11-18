package com.quantumath.math.geometry

import com.quantumath.math.core.DomainError
import com.quantumath.math.core.MathError
import kotlin.math.*

data class Measure(val label: String, val value: Double, val formula: String)

object Shapes {
    private fun pos(vararg v: Double) { if (v.any { !(it > 0) || !it.isFinite() }) throw DomainError("Dimensions must be positive numbers") }

    fun circle(r: Double): List<Measure> { pos(r); return listOf(Measure("Area", PI * r * r, "A = πr²"), Measure("Circumference", 2 * PI * r, "C = 2πr"), Measure("Diameter", 2 * r, "d = 2r")) }
    fun rectangle(w: Double, h: Double): List<Measure> { pos(w, h); return listOf(Measure("Area", w * h, "A = w·h"), Measure("Perimeter", 2 * (w + h), "P = 2(w + h)"), Measure("Diagonal", hypot(w, h), "d = √(w² + h²)")) }
    /** Regular polygon with n sides of length s. */
    fun regularPolygon(n: Int, s: Double): List<Measure> {
        if (n < 3) throw DomainError("A polygon needs at least 3 sides"); pos(s)
        val apothem = s / (2 * tan(PI / n))
        return listOf(
            Measure("Area", n * s * apothem / 2, "A = ½·n·s·a"), Measure("Perimeter", n * s, "P = n·s"),
            Measure("Apothem", apothem, "a = s / (2·tan(π/n))"), Measure("Circumradius", s / (2 * sin(PI / n)), "R = s / (2·sin(π/n))"),
            Measure("Interior angle (°)", 180.0 * (n - 2) / n, "θ = 180°·(n − 2)/n"),
        )
    }
    fun prism(w: Double, d: Double, h: Double): List<Measure> { pos(w, d, h); return listOf(Measure("Volume", w * d * h, "V = w·d·h"), Measure("Surface area", 2 * (w * d + w * h + d * h), "S = 2(wd + wh + dh)"), Measure("Space diagonal", sqrt(w * w + d * d + h * h), "√(w² + d² + h²)")) }
    fun cylinder(r: Double, h: Double): List<Measure> { pos(r, h); return listOf(Measure("Volume", PI * r * r * h, "V = πr²h"), Measure("Lateral area", 2 * PI * r * h, "L = 2πrh"), Measure("Surface area", 2 * PI * r * (r + h), "S = 2πr(r + h)")) }
    fun cone(r: Double, h: Double): List<Measure> { pos(r, h); val l = hypot(r, h); return listOf(Measure("Volume", PI * r * r * h / 3, "V = ⅓πr²h"), Measure("Slant height", l, "l = √(r² + h²)"), Measure("Lateral area", PI * r * l, "L = πrl"), Measure("Surface area", PI * r * (r + l), "S = πr(r + l)")) }
    fun sphere(r: Double): List<Measure> { pos(r); return listOf(Measure("Volume", 4.0 / 3 * PI * r.pow(3), "V = 4/3·πr³"), Measure("Surface area", 4 * PI * r * r, "S = 4πr²")) }
}

data class Pt(val x: Double, val y: Double) {
    fun dist(o: Pt) = hypot(x - o.x, y - o.y)
}

object Coordinate {
    fun distance(a: Pt, b: Pt) = a.dist(b)
    fun midpoint(a: Pt, b: Pt) = Pt((a.x + b.x) / 2, (a.y + b.y) / 2)
    /** Shoelace formula; vertices in order. */
    fun polygonArea(p: List<Pt>): Double {
        if (p.size < 3) throw MathError("A polygon needs at least 3 vertices")
        var s = 0.0
        for (i in p.indices) { val a = p[i]; val b = p[(i + 1) % p.size]; s += a.x * b.y - b.x * a.y }
        return abs(s) / 2
    }
    fun perimeter(p: List<Pt>) = p.indices.sumOf { p[it].dist(p[(it + 1) % p.size]) }
    /** Interior angle at vertex b of the path a-b-c, in degrees. */
    fun angleDeg(a: Pt, b: Pt, c: Pt): Double {
        val v1x = a.x - b.x; val v1y = a.y - b.y; val v2x = c.x - b.x; val v2y = c.y - b.y
        val d = hypot(v1x, v1y) * hypot(v2x, v2y)
        if (d == 0.0) return Double.NaN
        return Math.toDegrees(acos(((v1x * v2x + v1y * v2y) / d).coerceIn(-1.0, 1.0)))
    }
}

/** Triangle with sides a, b, c opposite angles A, B, C (degrees). */
data class Triangle(val a: Double, val b: Double, val c: Double, val angleA: Double, val angleB: Double, val angleC: Double, val method: String) {
    val perimeter get() = a + b + c
    val area get() = 0.5 * a * b * sin(Math.toRadians(angleC))
    val circumradius get() = a / (2 * sin(Math.toRadians(angleA)))
    val inradius get() = area / (perimeter / 2)
    val kind: String get() {
        val sides = when { abs(a - b) < 1e-9 && abs(b - c) < 1e-9 -> "equilateral"; abs(a - b) < 1e-9 || abs(b - c) < 1e-9 || abs(a - c) < 1e-9 -> "isosceles"; else -> "scalene" }
        val maxAng = maxOf(angleA, angleB, angleC)
        val angles = when { abs(maxAng - 90) < 1e-9 -> "right"; maxAng > 90 -> "obtuse"; else -> "acute" }
        return "$angles $sides"
    }
}

object TriangleSolver {
    private fun rad(d: Double) = Math.toRadians(d)
    private fun deg(r: Double) = Math.toDegrees(r)

    /**
     * Solve from any valid combination of 3 known values (at least one side). Null = unknown.
     * Returns 0, 1 or 2 triangles (2 for the ambiguous SSA case).
     */
    fun solve(a: Double?, b: Double?, c: Double?, A: Double?, B: Double?, C: Double?): List<Triangle> {
        val sides = listOf(a, b, c); val angles = listOf(A, B, C)
        if (sides.any { it != null && !(it > 0) }) throw DomainError("Sides must be positive")
        if (angles.any { it != null && !(it > 0 && it < 180) }) throw DomainError("Angles must be between 0° and 180°")
        val known = sides.count { it != null } + angles.count { it != null }
        if (known != 3) throw MathError("Enter exactly three values (got $known)")
        if (sides.all { it == null }) throw MathError("At least one side is required (AAA only fixes the shape, not the size)")
        if (angles.filterNotNull().sum() >= 180) throw DomainError("Angles must sum to less than 180°")
        return when {
            a != null && b != null && c != null -> listOfNotNull(sss(a, b, c))
            sides.count { it != null } == 2 -> {
                // SAS if the known angle is between the two sides, else SSA
                when {
                    a != null && b != null && C != null -> listOf(sas(a, b, C, 0))
                    b != null && c != null && A != null -> listOf(sas(b, c, A, 1))
                    a != null && c != null && B != null -> listOf(sas(a, c, B, 2))
                    else -> ssa(a, b, c, A, B, C)
                }
            }
            else -> listOf(asa(a, b, c, A, B, C))
        }
    }

    private fun sss(a: Double, b: Double, c: Double): Triangle? {
        if (a + b <= c || a + c <= b || b + c <= a) throw DomainError("These sides violate the triangle inequality")
        val A = deg(acos(((b * b + c * c - a * a) / (2 * b * c)).coerceIn(-1.0, 1.0)))
        val B = deg(acos(((a * a + c * c - b * b) / (2 * a * c)).coerceIn(-1.0, 1.0)))
        return Triangle(a, b, c, A, B, 180 - A - B, "SSS: law of cosines for two angles, angle sum for the third")
    }

    /** two sides x, y with included angle g; `which` = index of the opposite (unknown) side */
    private fun sas(x: Double, y: Double, g: Double, which: Int): Triangle {
        val z = sqrt(x * x + y * y - 2 * x * y * cos(rad(g)))
        val t = when (which) { 0 -> sss(x, y, z); 1 -> sss(z, x, y); else -> sss(x, z, y) }!!
        return t.copy(method = "SAS: law of cosines for the third side, then angles")
    }

    private fun asa(a: Double?, b: Double?, c: Double?, A: Double?, B: Double?, C: Double?): Triangle {
        val angs = arrayOf(A, B, C)
        val missing = angs.indexOfFirst { it == null }
        val known = angs.filterNotNull().sum()
        angs[missing] = 180 - known
        val ratio = when { a != null -> a / sin(rad(angs[0]!!)); b != null -> b / sin(rad(angs[1]!!)); else -> c!! / sin(rad(angs[2]!!)) }
        return Triangle(ratio * sin(rad(angs[0]!!)), ratio * sin(rad(angs[1]!!)), ratio * sin(rad(angs[2]!!)), angs[0]!!, angs[1]!!, angs[2]!!, "ASA/AAS: angle sum, then law of sines")
    }

    private fun ssa(a: Double?, b: Double?, c: Double?, A: Double?, B: Double?, C: Double?): List<Triangle> {
        // rotate so the known angle is "A" with known opposite side "a" and another known side "b"
        val s = doubleArrayOf(a ?: -1.0, b ?: -1.0, c ?: -1.0)
        val g = doubleArrayOf(A ?: -1.0, B ?: -1.0, C ?: -1.0)
        val ia = (0..2).first { g[it] > 0 }
        if (s[ia] < 0) throw MathError("Unsupported combination")
        val ib = (0..2).first { it != ia && s[it] > 0 }
        val ic = 3 - ia - ib
        val sinB = s[ib] * sin(rad(g[ia])) / s[ia]
        if (sinB > 1 + 1e-12) return emptyList()
        val b1 = deg(asin(sinB.coerceAtMost(1.0)))
        val candidates = listOf(b1, 180 - b1).distinct().filter { g[ia] + it < 180 - 1e-9 }
        return candidates.map { bAng ->
            val cAng = 180 - g[ia] - bAng
            val cSide = s[ia] * sin(rad(cAng)) / sin(rad(g[ia]))
            val ss = DoubleArray(3); val aa = DoubleArray(3)
            ss[ia] = s[ia]; ss[ib] = s[ib]; ss[ic] = cSide
            aa[ia] = g[ia]; aa[ib] = bAng; aa[ic] = cAng
            Triangle(ss[0], ss[1], ss[2], aa[0], aa[1], aa[2], if (candidates.size == 2) "SSA (ambiguous case): two triangles satisfy the data" else "SSA: law of sines")
        }
    }
}
