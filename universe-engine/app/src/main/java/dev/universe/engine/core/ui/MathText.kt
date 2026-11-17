package dev.universe.engine.core.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import kotlin.math.max
import kotlin.math.roundToInt

/*
 * A compact mathematical typesetter. It understands a practical subset of TeX —
 * fractions, roots, scripts, big operators with limits, accents, Greek and operators —
 * and lays the result out with real math glyphs (STIX Two Math), including the
 * Unicode mathematical-italic alphabet for variables.
 */

private const val ORD = 0
private const val BIN = 1
private const val REL = 2
private const val PUNCT = 3
private const val OPEN = 4

private sealed class MNode
private class MSym(val text: String, val kind: Int = ORD) : MNode()
private class MSeq(val items: List<MNode>) : MNode()
private class MFrac(val num: MNode, val den: MNode) : MNode()
private class MSqrt(val body: MNode) : MNode()
private class MScript(val base: MNode, val sup: MNode?, val sub: MNode?) : MNode()
private class MBig(val sym: String, val limits: Boolean) : MNode()
private class MAccent(val body: MNode, val kind: String) : MNode()
private class MSpace(val em: Float) : MNode()
private class MText(val text: String, val op: Boolean) : MNode()

private fun cp(code: Int): String = String(Character.toChars(code))

private fun italic(c: Char): String = when {
    c == 'h' -> "ℎ"
    c in 'a'..'z' -> cp(0x1D44E + (c - 'a'))
    c in 'A'..'Z' -> cp(0x1D434 + (c - 'A'))
    else -> c.toString()
}

private fun greekItalic(base: Char): String = cp(0x1D6FC + (base.code - 0x3B1))

private val GREEK_LOWER = mapOf(
    "alpha" to 'α', "beta" to 'β', "gamma" to 'γ', "delta" to 'δ', "varepsilon" to 'ε', "zeta" to 'ζ', "eta" to 'η', "theta" to 'θ',
    "iota" to 'ι', "kappa" to 'κ', "lambda" to 'λ', "mu" to 'μ', "nu" to 'ν', "xi" to 'ξ', "pi" to 'π', "rho" to 'ρ', "sigma" to 'σ',
    "tau" to 'τ', "upsilon" to 'υ', "varphi" to 'φ', "chi" to 'χ', "psi" to 'ψ', "omega" to 'ω',
)

private val SYMBOLS: Map<String, MSym> = buildMap {
    for ((k, v) in GREEK_LOWER) put(k, MSym(greekItalic(v)))
    put("epsilon", MSym(cp(0x1D716))); put("phi", MSym(cp(0x1D719))); put("vartheta", MSym(cp(0x1D717)))
    for ((k, v) in listOf("Gamma" to "Γ", "Delta" to "Δ", "Theta" to "Θ", "Lambda" to "Λ", "Xi" to "Ξ", "Pi" to "Π", "Sigma" to "Σ", "Phi" to "Φ", "Psi" to "Ψ", "Omega" to "Ω")) put(k, MSym(v))
    for ((k, v) in listOf("infty" to "∞", "partial" to "𝜕", "nabla" to "∇", "hbar" to "ℏ", "ell" to "ℓ", "degree" to "°", "circ" to "∘", "dots" to "…", "cdots" to "⋯", "ldots" to "…",
        "prime" to "′", "angle" to "∠", "forall" to "∀", "exists" to "∃", "emptyset" to "∅", "Re" to "ℜ", "Im" to "ℑ", "aleph" to "ℵ", "odot" to "⊙", "oplus" to "⊕",
        "uparrow" to "↑", "downarrow" to "↓", "bullet" to "•", "star" to "⋆", "perp" to "⊥", "triangle" to "△", "square" to "□")) put(k, MSym(v))
    for ((k, v) in listOf("cdot" to "⋅", "times" to "×", "pm" to "±", "mp" to "∓", "div" to "÷", "ast" to "∗", "wedge" to "∧", "vee" to "∨", "cap" to "∩", "cup" to "∪", "setminus" to "∖")) put(k, MSym(v, BIN))
    for ((k, v) in listOf("to" to "→", "rightarrow" to "→", "leftarrow" to "←", "leftrightarrow" to "↔", "Rightarrow" to "⇒", "Leftrightarrow" to "⇔", "mapsto" to "↦", "approx" to "≈",
        "neq" to "≠", "ne" to "≠", "leq" to "≤", "le" to "≤", "geq" to "≥", "ge" to "≥", "ll" to "≪", "gg" to "≫", "propto" to "∝", "equiv" to "≡", "sim" to "∼", "simeq" to "≃",
        "in" to "∈", "notin" to "∉", "subset" to "⊂", "rightleftharpoons" to "⇌", "longrightarrow" to "⟶", "parallel" to "∥", "mid" to "∣")) put(k, MSym(v, REL))
    put("langle", MSym("⟨", OPEN)); put("rangle", MSym("⟩")); put("lvert", MSym("|", OPEN)); put("rvert", MSym("|"))
    put("lfloor", MSym("⌊", OPEN)); put("rfloor", MSym("⌋")); put("lceil", MSym("⌈", OPEN)); put("rceil", MSym("⌉"))
}

private val OPERATOR_NAMES = setOf(
    "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "ln", "log", "exp", "lim", "max", "min",
    "det", "gcd", "mod", "arg", "deg", "dim", "ker", "sup", "inf", "sgn", "erf",
)
private val BIG_OPS = mapOf("int" to ("∫" to false), "oint" to ("∮" to false), "iint" to ("∬" to false), "sum" to ("∑" to true), "prod" to ("∏" to true), "bigcup" to ("⋃" to true))

private class TexParser(private val s: String) {
    private var i = 0

    fun parse(): MNode = parseSeq()

    private fun parseSeq(): MNode {
        val items = ArrayList<MNode>()
        while (i < s.length) {
            val c = s[i]
            if (c == '}') break
            if (c == ' ' || c == '\n') { i++; continue }
            items += parseScripted()
        }
        return MSeq(items)
    }

    private fun parseScripted(): MNode {
        val base = parseAtom()
        var sup: MNode? = null
        var sub: MNode? = null
        while (i < s.length && (s[i] == '^' || s[i] == '_' || s[i] == '\'')) {
            when (s[i]) {
                '\'' -> { i++; sup = MSeq(listOfNotNull(sup, MSym("′"))) }
                '^' -> { i++; sup = parseArg() }
                else -> { i++; sub = parseArg() }
            }
        }
        return if (sup != null || sub != null) MScript(base, sup, sub) else base
    }

    private fun parseArg(): MNode {
        while (i < s.length && s[i] == ' ') i++
        if (i >= s.length) return MSeq(emptyList())
        if (s[i] == '{') { i++; val n = parseSeq(); if (i < s.length && s[i] == '}') i++; return n }
        return parseAtom()
    }

    private fun rawGroup(): String {
        while (i < s.length && s[i] == ' ') i++
        if (i < s.length && s[i] == '{') {
            var depth = 0
            val start = i + 1
            while (i < s.length) {
                if (s[i] == '{') depth++ else if (s[i] == '}') { depth--; if (depth == 0) break }
                i++
            }
            val r = s.substring(start, i.coerceAtMost(s.length))
            if (i < s.length) i++
            return r
        }
        return ""
    }

    private fun parseAtom(): MNode {
        if (i >= s.length) return MSeq(emptyList())
        val c = s[i]
        return when {
            c == '{' -> { i++; val n = parseSeq(); if (i < s.length && s[i] == '}') i++; n }
            c == '\\' -> parseCommand()
            c.isDigit() -> {
                val st = i
                while (i < s.length && (s[i].isDigit() || (s[i] == '.' && i + 1 < s.length && s[i + 1].isDigit()))) i++
                MSym(s.substring(st, i))
            }
            c in 'a'..'z' || c in 'A'..'Z' -> { i++; MSym(italic(c)) }
            else -> {
                i++
                when (c) {
                    '+' -> MSym("+", BIN)
                    '-' -> MSym("−", BIN)
                    '*' -> MSym("⋅", BIN)
                    '=' -> MSym("=", REL)
                    '<' -> MSym("<", REL)
                    '>' -> MSym(">", REL)
                    ',' -> MSym(",", PUNCT)
                    ';' -> MSym(";", PUNCT)
                    '(', '[' -> MSym(c.toString(), OPEN)
                    '~' -> MSpace(0.3f)
                    else -> MSym(c.toString())
                }
            }
        }
    }

    private fun parseCommand(): MNode {
        i++ // backslash
        if (i >= s.length) return MSeq(emptyList())
        if (!s[i].isLetter()) {
            val c = s[i]; i++
            return when (c) {
                ',' -> MSpace(0.17f)
                ':' -> MSpace(0.22f)
                ';' -> MSpace(0.28f)
                ' ' -> MSpace(0.3f)
                '!' -> MSpace(-0.12f)
                '{' -> MSym("{", OPEN)
                '|' -> MSym("‖")
                else -> MSym(c.toString())
            }
        }
        val st = i
        while (i < s.length && s[i].isLetter()) i++
        val name = s.substring(st, i)
        return when (name) {
            "frac", "dfrac", "tfrac" -> { val a = parseArg(); val b = parseArg(); MFrac(a, b) }
            "sqrt" -> MSqrt(parseArg())
            "text", "mathrm", "textrm", "mathbf", "operatorname" -> MText(rawGroup(), name == "operatorname")
            "vec", "hat", "bar", "dot", "ddot", "tilde", "overline" -> MAccent(parseArg(), name)
            "left", "right", "big", "Big", "bigg", "displaystyle", "limits" -> {
                if (i < s.length && s[i] == '.') i++
                MSeq(emptyList())
            }
            "quad" -> MSpace(1f)
            "qquad" -> MSpace(2f)
            else -> BIG_OPS[name]?.let { MBig(it.first, it.second) }
                ?: SYMBOLS[name]
                ?: if (name in OPERATOR_NAMES) MText(name, true) else MSym(name)
        }
    }
}

/** A laid-out box: width, ascent and descent around a baseline, plus a paint routine. */
class MathBox(val w: Float, val asc: Float, val desc: Float, private val paint: DrawScope.(Float, Float, Color) -> Unit) {
    val h: Float get() = asc + desc
    fun draw(scope: DrawScope, x: Float, baseline: Float, color: Color) = scope.paint(x, baseline, color)
}

class MathLayout(private val tm: TextMeasurer, private val density: Density) {

    fun build(tex: String, sizePx: Float): MathBox = lay(TexParser(tex).parse(), sizePx)

    private fun glyph(text: String, size: Float, font: FontFamily = UE.Math, asc: Float = 0.72f, desc: Float = 0.24f, shiftY: Float = 0f): MathBox {
        val sp = with(density) { size.toSp() }
        val res = tm.measure(text, TextStyle(fontFamily = font, fontSize = sp, platformStyle = PlatformTextStyle(includeFontPadding = false)), softWrap = false, maxLines = 1)
        val fb = res.firstBaseline
        return MathBox(res.size.width.toFloat(), asc * size - shiftY, desc * size + shiftY) { x, y, c ->
            drawText(res, color = c, topLeft = Offset(x, y - fb + shiftY))
        }
    }

    private fun lay(n: MNode, size: Float): MathBox = when (n) {
        is MSym -> glyph(n.text, size)
        is MSpace -> MathBox(n.em * size, 0f, 0f) { _, _, _ -> }
        is MText -> if (n.op) glyph(n.text, size) else glyph(n.text, size * 0.86f, UE.Display)
        is MBig -> big(n, size)
        is MSeq -> seq(n, size)
        is MFrac -> frac(n, size)
        is MSqrt -> sqrt(n, size)
        is MScript -> script(n, size)
        is MAccent -> accent(n, size)
    }

    private fun big(n: MBig, size: Float): MathBox {
        val g = size * (if (n.limits) 1.5f else 1.75f)
        // Centre the enlarged operator on the math axis of the surrounding text.
        val shift = 0.25f * (g - size)
        val b = glyph(n.sym, g, asc = 0.78f, desc = 0.28f, shiftY = shift)
        return MathBox(b.w + size * 0.06f, b.asc, b.desc) { x, y, c -> b.draw(this, x, y, c) }
    }

    private fun seq(n: MSeq, size: Float): MathBox {
        val boxes = ArrayList<MathBox>(n.items.size)
        val xs = FloatArray(n.items.size)
        var x = 0f
        var asc = 0.4f * size
        var desc = 0f
        var prevKind = OPEN // start of a list behaves like after an opening delimiter (unary minus)
        for ((idx, item) in n.items.withIndex()) {
            val kind = (item as? MSym)?.kind ?: if (item is MSpace) prevKind else ORD
            val b = lay(item, size)
            var pre = 0f
            var post = 0f
            if (item is MSym) when (kind) {
                BIN -> if (prevKind == ORD) { pre = 0.2f * size; post = 0.2f * size }
                REL -> { pre = 0.27f * size; post = 0.27f * size }
                PUNCT -> post = 0.18f * size
            }
            if (item is MText && item.op) { if (prevKind == ORD && idx > 0) pre = 0.14f * size; post = 0.14f * size }
            if (item is MBig) { if (idx > 0) pre = 0.1f * size; post = 0.12f * size }
            x += pre
            xs[idx] = x
            x += b.w + post
            boxes += b
            asc = max(asc, b.asc); desc = max(desc, b.desc)
            prevKind = when {
                item is MSpace -> prevKind
                item is MSym && (kind == BIN || kind == REL || kind == OPEN || kind == PUNCT) -> if (kind == BIN && pre == 0f) OPEN else kind
                else -> ORD
            }
        }
        return MathBox(x, asc, desc) { ox, y, c -> for (k in boxes.indices) boxes[k].draw(this, ox + xs[k], y, c) }
    }

    private fun frac(n: MFrac, size: Float): MathBox {
        val inner = size * 0.9f
        val num = lay(n.num, inner)
        val den = lay(n.den, inner)
        val pad = 0.14f * size
        val w = max(num.w, den.w) + 2 * pad
        val axis = 0.27f * size
        val gap = 0.16f * size
        val rule = max(1.2f, size * 0.055f)
        val asc = axis + gap + num.h
        val desc = gap + den.h - axis
        return MathBox(w + 0.08f * size, asc, max(desc, 0f)) { x, y, c ->
            val x0 = x + 0.04f * size
            num.draw(this, x0 + (w - num.w) / 2, y - axis - gap - num.desc, c)
            den.draw(this, x0 + (w - den.w) / 2, y - axis + gap + den.asc, c)
            drawLine(c, Offset(x0, y - axis), Offset(x0 + w, y - axis), rule, StrokeCap.Round)
        }
    }

    private fun sqrt(n: MSqrt, size: Float): MathBox {
        val body = lay(n.body, size)
        val lead = 0.62f * size
        val top = body.asc + 0.2f * size
        val bottom = max(body.desc, 0.08f * size)
        val sw = max(1.2f, size * 0.055f)
        return MathBox(lead + body.w + 0.12f * size, top + sw, bottom) { x, y, c ->
            val p = Path()
            p.moveTo(x + 0.04f * size, y - top * 0.42f)
            p.lineTo(x + 0.17f * size, y - top * 0.5f)
            p.lineTo(x + 0.34f * size, y + bottom - sw)
            p.lineTo(x + 0.56f * size, y - top)
            p.lineTo(x + lead + body.w + 0.08f * size, y - top)
            drawPath(p, c, style = Stroke(sw, cap = StrokeCap.Round, join = StrokeJoin.Round))
            body.draw(this, x + lead, y, c)
        }
    }

    private fun script(n: MScript, size: Float): MathBox {
        val base = lay(n.base, size)
        val ss = size * 0.68f
        val sup = n.sup?.let { lay(it, ss) }
        val sub = n.sub?.let { lay(it, ss) }
        val bigBase = n.base as? MBig
        if (bigBase != null && bigBase.limits) {
            val w = maxOf(base.w, sup?.w ?: 0f, sub?.w ?: 0f)
            val gap = 0.1f * size
            val asc = base.asc + (sup?.let { gap + it.h } ?: 0f)
            val desc = base.desc + (sub?.let { gap + it.h } ?: 0f)
            return MathBox(w, asc, desc) { x, y, c ->
                base.draw(this, x + (w - base.w) / 2, y, c)
                sup?.draw(this, x + (w - sup.w) / 2, y - base.asc - gap - sup.desc, c)
                sub?.draw(this, x + (w - sub.w) / 2, y + base.desc + gap + sub.asc, c)
            }
        }
        val isInt = bigBase != null
        val up = if (isInt) base.asc - 0.5f * ss else max(0.42f * size, base.asc - 0.42f * ss)
        val down = if (isInt) base.desc - 0.1f * ss else max(0.2f * size, base.desc + 0.02f * size)
        val subKern = if (isInt) -0.32f * size else 0f
        val supKern = if (isInt) 0.02f * size else 0.03f * size
        val w = base.w + maxOf((sup?.w ?: 0f) + supKern, (sub?.w ?: 0f) + subKern + 0.03f * size, 0f) + 0.04f * size
        val asc = max(base.asc, sup?.let { up + it.asc } ?: 0f)
        val desc = max(base.desc, sub?.let { down + it.desc } ?: 0f)
        return MathBox(w, asc, desc) { x, y, c ->
            base.draw(this, x, y, c)
            sup?.draw(this, x + base.w + supKern, y - up, c)
            sub?.draw(this, x + base.w + subKern + 0.03f * size, y + down, c)
        }
    }

    private fun accent(n: MAccent, size: Float): MathBox {
        val body = lay(n.body, size)
        val sw = max(1.1f, size * 0.05f)
        val lift = 0.2f * size
        return MathBox(body.w, body.asc + lift, body.desc) { x, y, c ->
            body.draw(this, x, y, c)
            val ty = y - body.asc - lift * 0.25f
            val cx = x + body.w / 2 + 0.04f * size
            when (n.kind) {
                "vec" -> {
                    val x0 = x + body.w * 0.12f
                    val x1 = x + body.w * 0.98f + 0.05f * size
                    drawLine(c, Offset(x0, ty), Offset(x1, ty), sw, StrokeCap.Round)
                    drawLine(c, Offset(x1, ty), Offset(x1 - 0.14f * size, ty - 0.08f * size), sw, StrokeCap.Round)
                    drawLine(c, Offset(x1, ty), Offset(x1 - 0.14f * size, ty + 0.08f * size), sw, StrokeCap.Round)
                }
                "hat" -> {
                    drawLine(c, Offset(cx - 0.14f * size, ty + 0.04f * size), Offset(cx, ty - 0.08f * size), sw, StrokeCap.Round)
                    drawLine(c, Offset(cx, ty - 0.08f * size), Offset(cx + 0.14f * size, ty + 0.04f * size), sw, StrokeCap.Round)
                }
                "bar", "overline" -> drawLine(c, Offset(x + body.w * 0.08f, ty), Offset(x + body.w * 0.96f, ty), sw, StrokeCap.Round)
                "tilde" -> {
                    val p = Path(); p.moveTo(cx - 0.16f * size, ty + 0.02f * size)
                    p.cubicTo(cx - 0.06f * size, ty - 0.1f * size, cx + 0.06f * size, ty + 0.1f * size, cx + 0.16f * size, ty - 0.03f * size)
                    drawPath(p, c, style = Stroke(sw, cap = StrokeCap.Round))
                }
                "dot" -> drawCircle(c, sw * 1.1f, Offset(cx, ty))
                "ddot" -> { drawCircle(c, sw * 1.1f, Offset(cx - 0.09f * size, ty)); drawCircle(c, sw * 1.1f, Offset(cx + 0.09f * size, ty)) }
            }
        }
    }
}

@Composable
fun rememberMathBox(tex: String, size: TextUnit): MathBox {
    val tm = rememberTextMeasurer(cacheSize = 0)
    val density = LocalDensity.current
    return remember(tex, size, density.density, density.fontScale) {
        MathLayout(tm, density).build(tex, with(density) { size.toPx() })
    }
}

/**
 * Renders [tex]. If the equation is wider than the space available it is scaled down to fit.
 * [reveal] in 0..1 wipes the equation on from the left, as if it were being written.
 */
@Composable
fun MathText(tex: String, modifier: Modifier = Modifier, size: TextUnit = 20.sp, color: Color = UE.Text, reveal: Float = 1f) {
    val box = rememberMathBox(tex, size)
    val pad = 2f
    Canvas(
        modifier.layout { measurable, constraints ->
            val natW = (box.w + 2 * pad).coerceAtLeast(1f)
            val natH = (box.h + 2 * pad).coerceAtLeast(1f)
            val k = if (constraints.hasBoundedWidth && natW > constraints.maxWidth) constraints.maxWidth / natW else 1f
            val p = measurable.measure(Constraints.fixed((natW * k).roundToInt().coerceAtLeast(1), (natH * k).roundToInt().coerceAtLeast(1)))
            layout(p.width, p.height) { p.place(0, 0) }
        },
    ) {
        val k = this.size.width / (box.w + 2 * pad)
        clipRect(right = this.size.width * reveal.coerceIn(0f, 1f) + 1f) {
            scale(k, k, pivot = Offset.Zero) { box.draw(this, pad, pad + box.asc, color) }
        }
    }
}

/** An equation that writes itself on whenever [tex] (or [key]) changes. */
@Composable
fun WrittenMath(tex: String, modifier: Modifier = Modifier, size: TextUnit = 20.sp, color: Color = UE.Text, key: Any? = tex, durationMs: Int = 900, delayMs: Int = 0) {
    val a = remember { Animatable(0f) }
    LaunchedEffect(key) { a.snapTo(0f); a.animateTo(1f, tween(durationMs, delayMs, FastOutSlowInEasing)) }
    MathText(tex, modifier, size, color, a.value)
}
