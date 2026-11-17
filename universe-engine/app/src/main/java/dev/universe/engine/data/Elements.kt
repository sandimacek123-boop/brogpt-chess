package dev.universe.engine.data

import android.content.Context
import androidx.compose.ui.graphics.Color
import dev.universe.engine.core.ui.UE
import org.json.JSONArray

/** One chemical element. Temperatures in kelvin, density in kg/m³, energies in kJ/mol, radius in pm. */
class Element(
    val z: Int, val symbol: String, val name: String, val mass: Double, val category: String, val group: Int, val period: Int, val block: String,
    val electronegativity: Double?, val config: String, val shells: IntArray, val melt: Double?, val boil: Double?, val density: Double?, val phase: String,
    val year: Int?, val discoverer: String?, val ionization: Double?, val affinity: Double?, val radius: Double?, val appearance: String?, val summary: String,
) {
    /** Position in the 18-column layout: f-block elements go to two extra rows (8 and 9) below the main table. */
    val col: Int get() = if (isF) z - (if (z < 89) 57 else 89) + 3 else group
    val row: Int get() = if (isF) (if (z < 89) 9 else 10) else period
    val isF: Boolean get() = z in 57..71 || z in 89..103
    val family: Family get() = Family.of(category)

    /** State at temperature [k] kelvin and 1 atm, from the melting and boiling points (null when unknown). */
    fun stateAt(k: Double): String? = when {
        melt == null && boil == null -> null
        boil != null && k >= boil -> "gas"
        melt != null && k >= melt -> "liquid"
        melt == null && boil != null -> null
        else -> "solid"
    }
}

enum class Family(val label: String, val color: Color) {
    Alkali("Alkali metals", Color(0xFFFF5470)), Alkaline("Alkaline earth metals", Color(0xFFFFC14D)), Transition("Transition metals", Color(0xFF2E7BFF)),
    PostTransition("Post-transition metals", Color(0xFF7FA3C8)), Metalloid("Metalloids", Color(0xFF3DFFB4)), Nonmetal("Reactive nonmetals", Color(0xFF00E5FF)),
    Noble("Noble gases", Color(0xFF8E5CFF)), Lanthanide("Lanthanides", Color(0xFFFF4FD8)), Actinide("Actinides", Color(0xFFFF8A5B)), Unknown("Properties unknown", Color(0xFF8D97BD));
    companion object {
        fun of(c: String) = when {
            c.startsWith("unknown") -> Unknown
            c == "alkali metal" -> Alkali
            c == "alkaline earth metal" -> Alkaline
            c == "transition metal" -> Transition
            c == "post-transition metal" -> PostTransition
            c == "metalloid" -> Metalloid
            c == "noble gas" -> Noble
            c == "lanthanide" -> Lanthanide
            c == "actinide" -> Actinide
            else -> Nonmetal
        }
    }
}

object Elements {
    @Volatile private var cache: List<Element>? = null

    fun all(context: Context): List<Element> = cache ?: synchronized(this) {
        cache ?: load(context.assets.open("elements.json").bufferedReader().use { it.readText() }).also { cache = it }
    }

    fun load(json: String): List<Element> {
        val arr = JSONArray(json)
        return List(arr.length()) { i ->
            val o = arr.getJSONObject(i)
            fun d(k: String): Double? = if (o.isNull(k)) null else o.optDouble(k).takeIf { !it.isNaN() }
            fun s(k: String): String? = if (o.isNull(k)) null else o.optString(k).takeIf { it.isNotBlank() }
            val sh = o.getJSONArray("sh")
            Element(
                z = o.getInt("z"), symbol = o.getString("s"), name = o.getString("n"), mass = o.getDouble("m"), category = o.optString("cat"),
                group = o.optInt("g"), period = o.optInt("p"), block = o.optString("b"), electronegativity = d("en"), config = o.optString("cfg"),
                shells = IntArray(sh.length()) { sh.getInt(it) }, melt = d("mp"), boil = d("bp"), density = d("d"), phase = o.optString("ph"),
                year = if (o.isNull("y")) null else o.optInt("y"), discoverer = s("by"), ionization = d("ie"), affinity = d("ea"), radius = d("r"),
                appearance = s("ap"), summary = o.optString("sum"),
            )
        }
    }

    /** Standard atomic weights by symbol, for molar masses. */
    fun massOf(context: Context, symbol: String): Double = all(context).firstOrNull { it.symbol == symbol }?.mass ?: 0.0
}

fun yearText(y: Int?): String = when { y == null -> "—"; y < 0 -> "antiquity"; else -> y.toString() }
