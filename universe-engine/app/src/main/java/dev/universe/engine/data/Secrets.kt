package dev.universe.engine.data

/** A hidden discovery. [riddle] is all the journal shows until it is found. */
data class Secret(val id: String, val title: String, val riddle: String, val reveal: String)

object Secrets {
    val all = listOf(
        Secret("bigbang", "t = 0", "Every story has a first moment. Knock on the heart of the engine a prime number of times, and it will remember its own.",
            "13.8 billion years ago, everything you will ever touch was packed into a region smaller than an atom. Space itself has been stretching ever since — you just set it off again."),
        Secret("euler", "The most beautiful equation", "Walk exactly halfway around the unit circle, patiently, in a great many small steps.",
            "e^{iπ} + 1 = 0. Five fundamental constants and three basic operations, meeting in one line. Multiplying by e^{iθ} is rotation; rotate half a turn and you land on −1."),
        Secret("golden", "Nature's angle", "Sunflowers know one angle by heart. Find it to the tenth of a degree and the seeds will thank you.",
            "137.5° is 360°/φ². Because φ is the most irrational number, seeds placed at this angle never line up into spokes — every seed gets the most room. Count the spirals: they are Fibonacci numbers."),
        Secret("pibilliards", "π is hiding in the collisions", "Let a heavy block strike a light one against a wall. Make the heavy one a hundred times heavier, then a hundred times again. Count.",
            "With mass ratio 100ⁿ the number of perfectly elastic collisions spells out the first n+1 digits of π. Energy conservation draws a circle in velocity space, and each bounce steps a fixed angle around it."),
        Secret("answer", "The Answer", "Ask the grapher for the answer to life, the universe and everything. It is a very flat line.",
            "Forty-two. Deep Thought took 7.5 million years; you took a few seconds. The question, however, is still unknown."),
        Secret("pluto", "A heart at the edge", "It was the ninth, once. Show the little world some persistent affection.",
            "In 2015 New Horizons found a 1,600 km heart of nitrogen ice on Pluto: Tombaugh Regio. Its western lobe, Sputnik Planitia, is a slowly churning glacier — a geologically alive world, 5.9 billion km from the Sun."),
        Secret("genius", "Elementary, my dear", "Germanium, nickel, uranium, sulfur — touch them in that order and read what you spelled.",
            "Ge·Ni·U·S. All 118 symbols can spell a surprising number of words — the periodic table is an alphabet for matter, and you just wrote with it."),
        Secret("horizon", "Point of no return", "Curiosity pulled you closer than anything should go. Cross the line where even light gives up.",
            "Inside the event horizon the radial direction becomes time-like: falling inward is as unavoidable as tomorrow. From your own point of view you cross it without ceremony — and tides do the rest."),
        Secret("edge", "Beyond the measurable", "Keep going when the ruler runs out — far smaller than small, or far larger than large.",
            "Below the Planck length our theories of space stop making predictions; beyond 46.5 billion light-years light has not had time to reach us. Both edges are limits of knowledge, not necessarily of reality."),
        Secret("deepzoom", "Infinite coastline", "Dive into the black shape until you have magnified it more than a billion times.",
            "The Mandelbrot set's boundary has infinite length and contains tiny copies of the whole set at every scale — all from iterating z² + c. At this depth, the full set would be wider than Earth's orbit."),
    )
    val byId: Map<String, Secret> = all.associateBy { it.id }
}
