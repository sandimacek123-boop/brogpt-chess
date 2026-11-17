package dev.divide.game.audio

import java.io.File
import java.io.RandomAccessFile
import kotlin.math.*
import kotlin.random.Random

/**
 * Every sound in the game is synthesised here from oscillators and noise — no recorded audio ships with the app.
 * Buffers are mono floats in −1…1; [writeWav] stores them as 16-bit PCM.
 */
object Synth {
    const val SR = 44100

    private fun n(sec: Double, sr: Int = SR) = (sec * sr).toInt()
    private val rnd = Random(1234)

    fun writeWav(file: File, data: FloatArray, sr: Int = SR) {
        val bytes = ByteArray(44 + data.size * 2)
        fun i32(o: Int, v: Int) { bytes[o] = v.toByte(); bytes[o + 1] = (v shr 8).toByte(); bytes[o + 2] = (v shr 16).toByte(); bytes[o + 3] = (v shr 24).toByte() }
        fun i16(o: Int, v: Int) { bytes[o] = v.toByte(); bytes[o + 1] = (v shr 8).toByte() }
        "RIFF".forEachIndexed { i, c -> bytes[i] = c.code.toByte() }; i32(4, 36 + data.size * 2)
        "WAVEfmt ".forEachIndexed { i, c -> bytes[8 + i] = c.code.toByte() }
        i32(16, 16); i16(20, 1); i16(22, 1); i32(24, sr); i32(28, sr * 2); i16(32, 2); i16(34, 16)
        "data".forEachIndexed { i, c -> bytes[36 + i] = c.code.toByte() }; i32(40, data.size * 2)
        for (k in data.indices) { val v = (data[k].coerceIn(-1f, 1f) * 32767).toInt(); i16(44 + k * 2, v) }
        RandomAccessFile(file, "rw").use { it.setLength(0); it.write(bytes) }
    }

    // ------------------------------------------------------------------ building blocks
    /** State-variable filter run over a buffer; cutoff may change per sample via [fc]. */
    private fun svf(x: FloatArray, sr: Int, q: Float, mode: Int, fc: (Int) -> Float): FloatArray {
        val out = FloatArray(x.size); var ic1 = 0f; var ic2 = 0f; val k = 1f / q
        for (i in x.indices) {
            val g = tan(PI * (fc(i).coerceIn(20f, sr * 0.45f)) / sr).toFloat()
            val a1 = 1f / (1f + g * (g + k)); val a2 = g * a1; val a3 = g * a2
            val v3 = x[i] - ic2; val v1 = a1 * ic1 + a2 * v3; val v2 = ic2 + a2 * ic1 + a3 * v3
            ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2
            out[i] = when (mode) { 0 -> v2; 1 -> v1; else -> x[i] - k * v1 - v2 }
        }
        return out
    }
    private fun noise(len: Int) = FloatArray(len) { rnd.nextFloat() * 2 - 1 }
    private fun env(i: Int, len: Int, attack: Float, decay: Float, sr: Int = SR): Float { val t = i.toFloat() / sr; return min(1f, t / max(attack, 1e-4f)) * exp(-t / decay) }
    private fun sat(x: Float, d: Float) = (tanh((x * d).toDouble()) / tanh(d.toDouble())).toFloat()
    private fun mixInto(dst: FloatArray, src: FloatArray, at: Int, gain: Float) { for (i in src.indices) { val j = at + i; if (j in dst.indices) dst[j] += src[i] * gain } }
    private fun normalize(x: FloatArray, peak: Float = 0.9f): FloatArray { var m = 1e-6f; for (v in x) m = max(m, abs(v)); val k = peak / m; for (i in x.indices) x[i] *= k; return x }
    private fun fadeOut(x: FloatArray, sec: Float, sr: Int = SR): FloatArray { val f = n(sec.toDouble(), sr).coerceAtMost(x.size); for (i in 0 until f) x[x.size - 1 - i] *= i.toFloat() / f; return x }
    fun midi(m: Float) = 440f * 2f.pow((m - 69f) / 12f)

    // ------------------------------------------------------------------ sound effects
    fun slice(pitch: Float = 1f): FloatArray {
        val len = n(0.32); val nz = noise(len)
        val sweep = svf(nz, SR, 1.6f, 1) { i -> 9000f * pitch * exp(-i / (SR * 0.06f)) + 900f }
        val out = FloatArray(len)
        for (i in 0 until len) {
            val t = i.toFloat() / SR
            val ping = (sin(2 * PI * 2350 * pitch * t) * 0.5 + sin(2 * PI * 3720 * pitch * t) * 0.3).toFloat() * exp(-t / 0.07f)
            out[i] = sweep[i] * env(i, len, 0.002f, 0.07f) * 1.4f + ping * 0.55f
        }
        return normalize(out, 0.8f)
    }

    fun impact(weight: Float): FloatArray {
        val len = n(0.9 + weight * 0.6); val out = FloatArray(len); val nz = noise(len)
        val crack = svf(nz, SR, 0.9f, 1) { 2600f }
        val rumble = svf(nz, SR, 0.7f, 0) { 180f }
        var ph = 0.0
        for (i in 0 until len) {
            val t = i.toFloat() / SR
            val f = 38 + 140 * exp(-t * 18) * (1 + weight)
            ph += 2 * PI * f / SR
            val body = sin(ph).toFloat() * exp(-t / (0.22f + 0.2f * weight))
            out[i] = sat(body * 1.2f + crack[i] * exp(-t / 0.03f) * 0.9f + rumble[i] * exp(-t / 0.25f) * 1.3f, 2.4f)
        }
        return fadeOut(normalize(out, 0.95f), 0.2f)
    }

    fun clang(): FloatArray {
        val len = n(0.9); val out = FloatArray(len)
        val parts = floatArrayOf(1f, 2.76f, 5.4f, 8.93f, 13.34f); val amps = floatArrayOf(1f, 0.6f, 0.45f, 0.3f, 0.2f)
        for (i in 0 until len) {
            val t = i.toFloat() / SR
            var s = 0f
            for (k in parts.indices) s += amps[k] * sin(2 * PI * 520 * parts[k] * t).toFloat() * exp(-t / (0.5f / (1 + k * 0.6f)))
            out[i] = sat(s * 0.9f + (rnd.nextFloat() - 0.5f) * exp(-t / 0.01f), 2.8f)
        }
        return normalize(out, 0.85f)
    }

    /** FM bell for catching primes; [note] is a MIDI note number. */
    fun bell(note: Float, len0: Double = 1.1): FloatArray {
        val len = n(len0); val out = FloatArray(len); val f = midi(note)
        for (i in 0 until len) {
            val t = i.toFloat() / SR
            val mod = sin(2 * PI * f * 3.5 * t) * 2.2 * exp(-t * 4.0)
            out[i] = (sin(2 * PI * f * t + mod) * exp(-t * 3.2) + 0.25 * sin(2 * PI * f * 2 * t) * exp(-t * 7.0)).toFloat() * min(1f, t / 0.002f)
        }
        return fadeOut(normalize(out, 0.6f), 0.15f)
    }

    fun tick(): FloatArray { val len = n(0.08); val out = FloatArray(len); for (i in 0 until len) { val t = i.toFloat() / SR; out[i] = (sin(2 * PI * 1800 * t) * exp(-t / 0.012)).toFloat() + (rnd.nextFloat() - 0.5f) * 0.4f * exp(-t / 0.004f) }; return normalize(out, 0.5f) }

    fun riser(sec: Double, up: Boolean = true): FloatArray {
        val len = n(sec); val nz = noise(len)
        val f = svf(nz, SR, 2.5f, 1) { i -> val x = i.toFloat() / len; (if (up) 300f * 30f.pow(x) else 9000f / 30f.pow(x)) }
        val out = FloatArray(len); var ph = 0.0
        for (i in 0 until len) { val x = i.toFloat() / len; ph += 2 * PI * (if (up) 110 * 8.0.pow(x.toDouble()) else 880 / 8.0.pow(x.toDouble())) / SR; out[i] = (f[i] * 1.2f + (ph % (2 * PI) / PI - 1).toFloat() * 0.25f) * (if (up) x * x else (1 - x)) }
        return normalize(out, 0.7f)
    }

    fun bossDown(): FloatArray {
        val a = impact(1.6f); val r = riser(0.5, false); val len = a.size + n(1.2); val out = FloatArray(len)
        mixInto(out, a, 0, 1f); mixInto(out, r, 0, 0.5f)
        for (k in 0 until 5) mixInto(out, bell(74f + listOf(0, 3, 7, 10, 14)[k], 1.4), n(0.12 + k * 0.09), 0.25f)
        return fadeOut(normalize(out, 0.95f), 0.5f)
    }

    fun arpeggio(notes: List<Float>, step: Double): FloatArray { val out = FloatArray(n(step * notes.size + 1.0)); notes.forEachIndexed { k, m -> mixInto(out, bell(m, 0.9), n(step * k), 0.5f) }; return fadeOut(normalize(out, 0.7f), 0.2f) }

    fun gameOver(): FloatArray {
        val len = n(2.4); val out = FloatArray(len); var ph = 0.0
        for (i in 0 until len) { val t = i.toFloat() / SR; ph += 2 * PI * (220 * exp(-t * 0.9)) / SR; out[i] = sat((sin(ph) + 0.5 * sin(ph * 1.5)).toFloat() * exp(-t / 1.1f) * 0.8f, 1.8f) }
        mixInto(out, impact(1.2f), 0, 0.7f)
        return fadeOut(normalize(out, 0.9f), 0.6f)
    }

    // ------------------------------------------------------------------ music
    private class Track(val bpm: Double, val bars: Int, val sr: Int) {
        val beat = 60.0 / bpm; val step16 = beat / 4
        val len = (bars * 4 * beat * sr).toInt()
        val buf = FloatArray(len)
        fun at(step: Double) = (step * step16 * sr).toInt()
        fun add(sig: FloatArray, step: Double, gain: Float) { val o = at(step); for (i in sig.indices) { var j = o + i; if (j >= len) j -= len; buf[j] += sig[i] * gain } }
    }

    private fun kick(sr: Int, punch: Float = 1f): FloatArray { val len = (0.42 * sr).toInt(); val out = FloatArray(len); var ph = 0.0; for (i in 0 until len) { val t = i.toDouble() / sr; ph += 2 * PI * (46 + 130 * punch * exp(-t * 30)) / sr; out[i] = sat((sin(ph) * exp(-t * 7)).toFloat(), 2.2f) }; return out }
    private fun clap(sr: Int): FloatArray { val len = (0.3 * sr).toInt(); val nz = FloatArray(len) { rnd.nextFloat() * 2 - 1 }; val b = svf(nz, sr, 0.8f, 1) { 2000f }; for (i in 0 until len) { val t = i.toFloat() / sr; var e = 0f; for (o in floatArrayOf(0f, 0.01f, 0.02f)) if (t >= o) e += exp(-(t - o) * 180f); e += 0.6f * exp(-max(0f, t - 0.02f) * 14f) * (if (t > 0.02f) 1f else 0f); b[i] = sat(b[i] * e * 1.4f + sin(2 * PI * 190 * t).toFloat() * exp(-t * 30f) * 0.4f, 1.6f) }; return b }
    private fun hat(sr: Int, open: Boolean): FloatArray { val len = ((if (open) 0.25 else 0.05) * sr).toInt(); val nz = FloatArray(len) { rnd.nextFloat() * 2 - 1 }; val h = svf(nz, sr, 0.7f, 2) { 7500f }; for (i in 0 until len) h[i] *= exp(-i.toFloat() / sr / (if (open) 0.08f else 0.015f)); return h }
    private fun bass808(sr: Int, f0: Float, f1: Float, dur: Double, drive: Float): FloatArray { val len = (dur * sr).toInt(); val out = FloatArray(len); var ph = 0.0; for (i in 0 until len) { val x = i.toFloat() / len; val f = if (x < 0.55f) f0 else f0 * (f1 / f0).pow((x - 0.55f) / 0.45f); ph += 2 * PI * f / sr; val e = min(1f, i.toFloat() / (0.004f * sr)) * min(1f, (len - i).toFloat() / (0.03f * sr)); out[i] = sat((sin(ph) + 0.2 * sin(2 * ph)).toFloat() * e, drive) }; return out }
    private fun cowbell(sr: Int, f: Float): FloatArray { val len = (0.22 * sr).toInt(); val out = FloatArray(len); for (i in 0 until len) { val t = i.toFloat() / sr; val s = sign(sin(2 * PI * f * t)).toFloat() * 0.6f + sign(sin(2 * PI * f * 1.48 * t)).toFloat() * 0.45f; out[i] = s * (0.75f * exp(-t * 38) + 0.25f * exp(-t * 9)) }; return svf(out, sr, 0.7f, 1) { f * 2f } }
    private fun pad(sr: Int, notes: List<Float>, dur: Double, cutoff: Float): FloatArray {
        val len = (dur * sr).toInt(); val out = FloatArray(len)
        for (m in notes) for (det in floatArrayOf(-0.008f, 0f, 0.007f)) { val f = midi(m) * (1 + det); var ph = rnd.nextFloat(); for (i in 0 until len) { ph = (ph + f / sr) % 1f; out[i] += (ph * 2 - 1) } }
        val lp = svf(out, sr, 0.7f, 0) { cutoff }
        for (i in 0 until len) { val x = i.toFloat() / len; lp[i] *= min(1f, x * 6f) * min(1f, (1 - x) * 6f) / (notes.size * 3) }
        return lp
    }

    /** Driving 140 BPM loop for play. [intensity] 0 = normal waves, 1 = boss. */
    fun battleLoop(intensity: Int, sr: Int = 32000): FloatArray {
        val tr = Track(if (intensity == 0) 140.0 else 150.0, 8, sr)
        val k = kick(sr, if (intensity == 0) 1f else 1.3f); val c = clap(sr); val hc = hat(sr, false); val ho = hat(sr, true)
        val root = if (intensity == 0) 38f else 37f   // D / C#
        val bassLine = if (intensity == 0) listOf(0 to 0f, 6 to 0f, 10 to 3f, 16 to 0f, 19 to 0f, 24 to 5f, 26 to 3f) else listOf(0 to 0f, 3 to 0f, 6 to 0f, 10 to 1f, 16 to 0f, 22 to -2f, 26 to 1f, 28 to 0f)
        val melody = if (intensity == 0) listOf(0, 2, 3, 5, 6, 8, 10, 11, 12, 14) else listOf(0, 1, 3, 4, 6, 7, 9, 11, 12, 13, 14, 15)
        val scale = floatArrayOf(0f, 3f, 5f, 7f, 10f, 12f, 15f)
        for (bar in 0 until 8) {
            val o = bar * 16.0
            for (s in (if (intensity == 0) listOf(0, 6, 10) else listOf(0, 3, 8, 10, 14))) tr.add(k, o + s, 0.9f)
            for (s in listOf(4, 12)) tr.add(c, o + s, 0.5f)
            for (s in 0 until 16) tr.add(if (s == 14 && bar % 2 == 0) ho else hc, o + s + (if (s % 2 == 1) 0.12 else 0.0), if (s % 4 == 0) 0.22f else 0.13f)
            if (bar % 2 == 1) for (s in listOf(15.0, 15.5)) tr.add(hc, o + s, 0.12f)
        }
        for (half in 0 until 4) for ((s, semi) in bassLine) {
            val next = bassLine.map { it.first }.firstOrNull { it > s } ?: 32
            tr.add(bass808(sr, midi(root + semi), midi(root + semi - (if (s == 26 || s == 28) 5f else 0f)), (next - s) * tr.step16, if (intensity == 0) 2.6f else 3.4f), half * 32.0 + s, 0.5f)
        }
        val r = Random(if (intensity == 0) 7 else 11)
        for (bar in 0 until 8) for (s in melody) if (r.nextFloat() < 0.8f) {
            val note = root + 36f + scale[(s * 3 + bar * (if (bar % 4 == 3) 2 else 1)) % scale.size] + (if (intensity == 1 && s % 3 == 0) 1f else 0f)
            tr.add(cowbell(sr, midi(note)), bar * 16.0 + s, 0.22f)
        }
        if (intensity == 1) tr.add(pad(sr, listOf(root + 12f, root + 15f, root + 19f), tr.len.toDouble() / sr, 900f), 0.0, 0.5f)
        return normalize(tr.buf.also { for (i in it.indices) it[i] = sat(it[i] * 0.9f, 1.4f) }, 0.85f)
    }

    /** Slow, dark menu loop. */
    fun menuLoop(sr: Int = 32000): FloatArray {
        val tr = Track(84.0, 4, sr)
        val chords = listOf(listOf(50f, 53f, 57f, 60f), listOf(48f, 52f, 55f, 59f), listOf(46f, 50f, 53f, 57f), listOf(45f, 49f, 52f, 57f))
        chords.forEachIndexed { i, ch -> tr.add(pad(sr, ch, 4 * tr.beat + 0.4, 1300f), i * 16.0, 0.9f) }
        val r = Random(3)
        for (bar in 0 until 4) for (s in 0 until 16 step 2) if (r.nextFloat() < 0.55f) {
            val m = chords[bar][r.nextInt(4)] + 24f
            val b = FloatArray((0.9 * sr).toInt()); val f = midi(m)
            for (i in b.indices) { val t = i.toFloat() / sr; b[i] = (sin(2 * PI * f * t + sin(2 * PI * f * 2 * t) * exp(-t * 5.0)) * exp(-t * 3.5)).toFloat() }
            tr.add(b, bar * 16.0 + s, 0.16f)
        }
        val k = kick(sr, 0.6f)
        for (bar in 0 until 4) tr.add(k, bar * 16.0, 0.35f)
        return normalize(tr.buf, 0.7f)
    }
}
