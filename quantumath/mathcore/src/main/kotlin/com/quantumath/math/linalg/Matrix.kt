package com.quantumath.math.linalg

import com.quantumath.math.core.MathError
import com.quantumath.math.core.Rational

/** Exact matrix over ℚ. All elimination steps can be recorded for display. */
class Matrix(val rows: Int, val cols: Int, private val a: Array<Array<Rational>>) {
    init {
        require(rows in 1..12 && cols in 1..12) { "Matrices are limited to 12×12" }
    }

    companion object {
        fun of(data: List<List<Rational>>): Matrix {
            if (data.isEmpty() || data[0].isEmpty()) throw MathError("Matrix is empty")
            val c = data[0].size
            if (data.any { it.size != c }) throw MathError("All rows must have the same number of entries")
            return Matrix(data.size, c, Array(data.size) { i -> Array(c) { j -> data[i][j] } })
        }
        fun identity(n: Int) = Matrix(n, n, Array(n) { i -> Array(n) { j -> if (i == j) Rational.ONE else Rational.ZERO } })
        fun zeros(r: Int, c: Int) = Matrix(r, c, Array(r) { Array(c) { Rational.ZERO } })

        /** Parse rows separated by newlines or ';', entries by spaces or commas. Entries may be fractions. */
        fun parse(text: String): Matrix {
            val rows = text.trim().split('\n', ';').map { it.trim() }.filter { it.isNotEmpty() }
            return of(rows.map { r -> r.split(Regex("[\\s,]+")).filter { it.isNotEmpty() }.map { tok ->
                try { Rational.parse(tok) } catch (_: Exception) { throw MathError("'$tok' is not a number") }
            } })
        }
    }

    operator fun get(i: Int, j: Int) = a[i][j]
    fun toList(): List<List<Rational>> = a.map { it.toList() }
    fun copyData() = Array(rows) { a[it].copyOf() }
    val isSquare get() = rows == cols

    operator fun plus(o: Matrix): Matrix { sameShape(o, "add"); return Matrix(rows, cols, Array(rows) { i -> Array(cols) { j -> a[i][j] + o.a[i][j] } }) }
    operator fun minus(o: Matrix): Matrix { sameShape(o, "subtract"); return Matrix(rows, cols, Array(rows) { i -> Array(cols) { j -> a[i][j] - o.a[i][j] } }) }
    operator fun times(o: Matrix): Matrix {
        if (cols != o.rows) throw MathError("Cannot multiply ${rows}×$cols by ${o.rows}×${o.cols}: inner dimensions differ")
        return Matrix(rows, o.cols, Array(rows) { i -> Array(o.cols) { j -> var s = Rational.ZERO; for (k in 0 until cols) s += a[i][k] * o.a[k][j]; s } })
    }
    fun scale(k: Rational) = Matrix(rows, cols, Array(rows) { i -> Array(cols) { j -> a[i][j] * k } })
    fun transpose() = Matrix(cols, rows, Array(cols) { i -> Array(rows) { j -> a[j][i] } })
    fun pow(n: Int): Matrix {
        if (!isSquare) throw MathError("Only square matrices have powers")
        if (n < 0) return inverse().matrix.pow(-n)
        var r = identity(rows); var b = this; var k = n
        while (k > 0) { if (k and 1 == 1) r *= b; b *= b; k = k shr 1 }
        return r
    }
    fun trace(): Rational { square("trace"); var s = Rational.ZERO; for (i in 0 until rows) s += a[i][i]; return s }

    private fun sameShape(o: Matrix, op: String) { if (rows != o.rows || cols != o.cols) throw MathError("Cannot $op ${rows}×$cols and ${o.rows}×${o.cols} matrices") }
    private fun square(op: String) { if (!isSquare) throw MathError("$op requires a square matrix") }

    data class Step(val description: String, val matrix: Matrix)
    data class Rref(val matrix: Matrix, val pivots: List<Int>, val steps: List<Step>, val rank: Int)

    /** Gauss–Jordan elimination to reduced row echelon form, recording each row operation. */
    fun rref(augmentedCols: Int = 0): Rref {
        val m = copyData()
        val steps = ArrayList<Step>()
        val pivots = ArrayList<Int>()
        var r = 0
        val limit = cols - augmentedCols
        for (c in 0 until limit) {
            if (r >= rows) break
            val p = (r until rows).firstOrNull { !m[it][c].isZero } ?: continue
            if (p != r) { val t = m[p]; m[p] = m[r]; m[r] = t; steps += Step("Swap R${r + 1} ↔ R${p + 1}", Matrix(rows, cols, Array(rows) { m[it].copyOf() })) }
            val pv = m[r][c]
            if (pv != Rational.ONE) {
                for (j in 0 until cols) m[r][j] = m[r][j] / pv
                steps += Step("R${r + 1} ← R${r + 1} ÷ ${fmt(pv)}", Matrix(rows, cols, Array(rows) { m[it].copyOf() }))
            }
            for (i in 0 until rows) if (i != r && !m[i][c].isZero) {
                val f = m[i][c]
                for (j in 0 until cols) m[i][j] = m[i][j] - f * m[r][j]
                steps += Step("R${i + 1} ← R${i + 1} − ${fmt(f)}·R${r + 1}", Matrix(rows, cols, Array(rows) { m[it].copyOf() }))
            }
            pivots += c
            r++
        }
        return Rref(Matrix(rows, cols, m), pivots, steps, pivots.size)
    }

    private fun fmt(r: Rational) = if (r.isInteger || r.signum >= 0) r.toString() else "($r)"

    data class Determinant(val value: Rational, val steps: List<String>)

    /** Determinant by exact elimination (product of pivots, sign flipped per swap). */
    fun determinant(): Determinant {
        square("Determinant")
        val m = copyData()
        var det = Rational.ONE
        val steps = ArrayList<String>()
        for (c in 0 until rows) {
            val p = (c until rows).firstOrNull { !m[it][c].isZero }
            if (p == null) { steps += "Column ${c + 1} has no pivot → det = 0"; return Determinant(Rational.ZERO, steps) }
            if (p != c) { val t = m[p]; m[p] = m[c]; m[c] = t; det = -det; steps += "Swap R${c + 1} ↔ R${p + 1} (sign changes)" }
            det *= m[c][c]
            steps += "Pivot ${c + 1}: ${m[c][c]}"
            for (i in c + 1 until rows) {
                val f = m[i][c] / m[c][c]
                if (!f.isZero) for (j in c until rows) m[i][j] = m[i][j] - f * m[c][j]
            }
        }
        steps += "det = product of pivots${if (det.signum < 0) " (with sign changes)" else ""} = $det"
        return Determinant(det, steps)
    }

    data class Inverse(val matrix: Matrix, val steps: List<Step>)

    fun inverse(): Inverse {
        square("Inverse")
        val aug = Matrix(rows, 2 * cols, Array(rows) { i -> Array(2 * cols) { j -> if (j < cols) a[i][j] else if (j - cols == i) Rational.ONE else Rational.ZERO } })
        val res = aug.rref(augmentedCols = cols)
        if (res.rank < rows) throw MathError("Matrix is singular (determinant 0) — no inverse exists")
        val inv = Matrix(rows, cols, Array(rows) { i -> Array(cols) { j -> res.matrix[i, j + cols] } })
        return Inverse(inv, res.steps)
    }

    sealed class SystemSolution {
        data class Unique(val x: List<Rational>) : SystemSolution()
        data class Infinite(val particular: List<Rational>, val freeVariables: List<Int>, val basis: List<List<Rational>>) : SystemSolution()
        object None : SystemSolution()
    }

    /** Solve A·x = b exactly. */
    fun solve(b: List<Rational>): Pair<SystemSolution, Rref> {
        if (b.size != rows) throw MathError("Right-hand side needs $rows entries")
        val aug = Matrix(rows, cols + 1, Array(rows) { i -> Array(cols + 1) { j -> if (j < cols) a[i][j] else b[i] } })
        val r = aug.rref(augmentedCols = 1)
        val m = r.matrix
        // inconsistent row: 0 … 0 | nonzero
        for (i in 0 until rows) if ((0 until cols).all { m[i, it].isZero } && !m[i, cols].isZero) return SystemSolution.None to r
        val pivotCols = r.pivots
        val free = (0 until cols).filter { it !in pivotCols }
        val particular = MutableList(cols) { Rational.ZERO }
        pivotCols.forEachIndexed { row, c -> particular[c] = m[row, cols] }
        if (free.isEmpty()) return SystemSolution.Unique(particular) to r
        val basis = free.map { f ->
            val v = MutableList(cols) { Rational.ZERO }
            v[f] = Rational.ONE
            pivotCols.forEachIndexed { row, c -> v[c] = -m[row, f] }
            v
        }
        return SystemSolution.Infinite(particular, free, basis) to r
    }

    /** Characteristic polynomial det(λI − A) by Faddeev–LeVerrier (exact). coeffs ascending. */
    fun characteristicPolynomial(): List<Rational> {
        square("Characteristic polynomial")
        val n = rows
        val c = MutableList(n + 1) { Rational.ZERO }
        c[n] = Rational.ONE
        var mk = zeros(n, n)
        for (k in 1..n) {
            mk = this * mk + identity(n).scale(c[n - k + 1])
            c[n - k] = -(this * mk).trace() / Rational.of(k.toLong())
        }
        return c
    }

    fun toDoubleArray(): Array<DoubleArray> = Array(rows) { i -> DoubleArray(cols) { j -> a[i][j].toDouble() } }
    override fun toString() = a.joinToString("\n") { r -> r.joinToString("  ") }
    override fun equals(other: Any?) = other is Matrix && rows == other.rows && cols == other.cols && (0 until rows).all { i -> a[i].contentEquals(other.a[i]) }
    override fun hashCode() = a.contentDeepHashCode()
}

object Vectors {
    fun dot(u: List<Rational>, v: List<Rational>): Rational { same(u, v); return u.indices.fold(Rational.ZERO) { s, i -> s + u[i] * v[i] } }
    fun cross(u: List<Rational>, v: List<Rational>): List<Rational> {
        if (u.size != 3 || v.size != 3) throw MathError("Cross product is defined for 3-dimensional vectors")
        return listOf(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    }
    fun norm(u: List<Rational>): Double = Math.sqrt(dot(u, u).toDouble())
    fun normSquared(u: List<Rational>) = dot(u, u)
    /** proj_v(u) = (u·v / v·v) v */
    fun projection(u: List<Rational>, v: List<Rational>): List<Rational> {
        val vv = dot(v, v)
        if (vv.isZero) throw MathError("Cannot project onto the zero vector")
        val k = dot(u, v) / vv
        return v.map { it * k }
    }
    fun angleRadians(u: List<Rational>, v: List<Rational>): Double {
        val d = norm(u) * norm(v)
        if (d == 0.0) throw MathError("Angle with the zero vector is undefined")
        return Math.acos((dot(u, v).toDouble() / d).coerceIn(-1.0, 1.0))
    }
    private fun same(u: List<Rational>, v: List<Rational>) { if (u.size != v.size) throw MathError("Vectors must have the same dimension") }
    fun parse(text: String): List<Rational> = text.trim().trim('(', ')', '[', ']', '<', '>').split(Regex("[\\s,;]+")).filter { it.isNotEmpty() }.map {
        try { Rational.parse(it) } catch (_: Exception) { throw MathError("'$it' is not a number") }
    }.also { if (it.isEmpty()) throw MathError("Vector is empty") }
}
