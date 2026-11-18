package com.quantumath.math.learning

enum class Level(val label: String) { FOUNDATION("Foundation"), INTERMEDIATE("Intermediate"), ADVANCED("Advanced") }

sealed class Block {
    data class Text(val text: String) : Block()
    data class Formula(val formula: String, val caption: String = "") : Block()
    data class Example(val problem: String, val steps: List<String>, val answer: String) : Block()
    /** answers: accepted values as expressions; order-insensitive when several (e.g. "2, 3"). */
    data class Exercise(val prompt: String, val answers: List<String>, val hint: String, val explanation: String) : Block()
}

data class Lesson(val id: String, val title: String, val topic: String, val level: Level, val minutes: Int, val summary: String, val blocks: List<Block>)

object Lessons {
    val all: List<Lesson> = listOf(
        Lesson("order-ops", "Order of operations", "Arithmetic", Level.FOUNDATION, 6, "Why 2 + 3·4 is 14 and how calculators read expressions.", listOf(
            Block.Text("Operations are evaluated by precedence: parentheses first, then exponents, then multiplication and division (left to right), then addition and subtraction (left to right). Exponents group from the right: 2^3^2 means 2^(3^2)."),
            Block.Formula("2 + 3·4 = 2 + 12 = 14", "Multiplication before addition"),
            Block.Formula("−2² = −(2²) = −4", "The minus sign applies after the exponent"),
            Block.Example("Evaluate 18 ÷ 3 · 2 − 4", listOf("Division and multiplication from left to right: 18 ÷ 3 = 6", "6 · 2 = 12", "12 − 4 = 8"), "8"),
            Block.Exercise("Evaluate 5 + 2·(7 − 3)^2", listOf("37"), "Brackets, then the exponent, then multiply.", "7 − 3 = 4, 4² = 16, 2·16 = 32, 5 + 32 = 37."),
            Block.Exercise("Evaluate 2^3^2", listOf("512"), "Exponents group from the right.", "3² = 9, then 2⁹ = 512."),
        )),
        Lesson("fractions", "Fractions", "Arithmetic", Level.FOUNDATION, 8, "Adding, multiplying and simplifying fractions.", listOf(
            Block.Text("To add fractions, rewrite them with a common denominator. To multiply, multiply numerators and denominators. To divide, multiply by the reciprocal. Always simplify by dividing numerator and denominator by their greatest common divisor."),
            Block.Formula("a/b + c/d = (ad + bc)/(bd)"),
            Block.Formula("(a/b) ÷ (c/d) = (a/b)·(d/c)"),
            Block.Example("1/4 + 2/3", listOf("Common denominator 12", "1/4 = 3/12, 2/3 = 8/12", "3/12 + 8/12 = 11/12"), "11/12"),
            Block.Exercise("Compute 3/4 − 1/6", listOf("7/12"), "Use the common denominator 12.", "3/4 = 9/12, 1/6 = 2/12, 9/12 − 2/12 = 7/12."),
            Block.Exercise("Compute (2/3) ÷ (4/9)", listOf("3/2"), "Multiply by the reciprocal 9/4.", "(2/3)·(9/4) = 18/12 = 3/2."),
        )),
        Lesson("percent", "Percentages", "Arithmetic", Level.FOUNDATION, 6, "Percent as a fraction of 100, increases and decreases.", listOf(
            Block.Text("p% means p/100. Increasing a quantity by p% multiplies it by (1 + p/100); decreasing by p% multiplies by (1 − p/100). Successive changes multiply, they do not add."),
            Block.Formula("new = old · (1 + p/100)"),
            Block.Example("A price of 80 rises by 15%", listOf("Multiplier 1 + 15/100 = 1.15", "80 · 1.15 = 92"), "92"),
            Block.Exercise("What is 35% of 240?", listOf("84"), "Multiply 240 by 0.35.", "0.35·240 = 84."),
            Block.Exercise("A value increases by 10% and then decreases by 10%. Starting from 200, what is the result?", listOf("198"), "Multiply by 1.1 and then by 0.9.", "200·1.1·0.9 = 198 — not 200, because the percentages apply to different bases."),
        )),
        Lesson("powers", "Exponents and roots", "Algebra", Level.FOUNDATION, 8, "Laws of exponents and radicals.", listOf(
            Block.Formula("aᵐ·aⁿ = aᵐ⁺ⁿ,  (aᵐ)ⁿ = aᵐⁿ,  a⁻ⁿ = 1/aⁿ,  a^(1/n) = ⁿ√a"),
            Block.Text("The laws hold for positive bases with any real exponents, and for any nonzero base with integer exponents. A fractional exponent p/q means the q-th root raised to the p-th power."),
            Block.Example("Simplify 8^(2/3)", listOf("Cube root of 8 is 2", "2² = 4"), "4"),
            Block.Exercise("Evaluate 27^(2/3)", listOf("9"), "Take the cube root first.", "∛27 = 3, 3² = 9."),
            Block.Exercise("Evaluate 2^(−3)", listOf("1/8"), "Negative exponent means reciprocal.", "2⁻³ = 1/2³ = 1/8."),
        )),
        Lesson("linear", "Linear equations", "Algebra", Level.FOUNDATION, 8, "Solving ax + b = c by inverse operations.", listOf(
            Block.Text("Apply the same operation to both sides to isolate the unknown. A linear equation has exactly one solution unless the x-terms cancel: then there is either no solution or infinitely many."),
            Block.Example("3(x − 2) = x + 8", listOf("Expand: 3x − 6 = x + 8", "Subtract x: 2x − 6 = 8", "Add 6: 2x = 14", "Divide by 2: x = 7"), "x = 7"),
            Block.Exercise("Solve 5x − 7 = 2x + 8", listOf("5"), "Collect x-terms on one side.", "3x = 15, so x = 5."),
            Block.Exercise("Solve (x + 1)/3 = 4", listOf("11"), "Multiply both sides by 3.", "x + 1 = 12, so x = 11."),
        )),
        Lesson("quadratics", "Quadratic equations", "Algebra", Level.INTERMEDIATE, 10, "Factoring, completing the square, the quadratic formula and the discriminant.", listOf(
            Block.Formula("x = (−b ± √(b² − 4ac)) / (2a)", "Quadratic formula for ax² + bx + c = 0, a ≠ 0"),
            Block.Text("The discriminant Δ = b² − 4ac decides the nature of the roots: Δ > 0 two real roots, Δ = 0 one repeated root, Δ < 0 two complex conjugate roots."),
            Block.Example("x² − 5x + 6 = 0", listOf("Look for two numbers with product 6 and sum −5: −2 and −3", "(x − 2)(x − 3) = 0", "x = 2 or x = 3"), "x = 2, 3"),
            Block.Exercise("Solve x² − x − 12 = 0 (enter both roots separated by a comma)", listOf("-3", "4"), "Find two numbers with product −12 and sum −1.", "(x − 4)(x + 3) = 0 gives x = 4 or x = −3."),
            Block.Exercise("What is the discriminant of 2x² + 3x + 5?", listOf("-31"), "Compute b² − 4ac.", "9 − 40 = −31 < 0, so the roots are complex."),
        )),
        Lesson("functions", "Functions and graphs", "Algebra", Level.INTERMEDIATE, 8, "Domain, range, transformations and composition.", listOf(
            Block.Text("A function assigns exactly one output to each input in its domain. Graph transformations: f(x) + k shifts up, f(x − h) shifts right, a·f(x) stretches vertically, f(bx) compresses horizontally by b."),
            Block.Formula("(f ∘ g)(x) = f(g(x))"),
            Block.Example("f(x) = x², g(x) = x + 3. Find (f ∘ g)(2)", listOf("g(2) = 5", "f(5) = 25"), "25"),
            Block.Exercise("For f(x) = 2x − 1 and g(x) = x², compute f(g(3))", listOf("17"), "Evaluate g first.", "g(3) = 9, f(9) = 17."),
        )),
        Lesson("explog", "Exponentials and logarithms", "Algebra", Level.INTERMEDIATE, 10, "Logarithms as inverse exponentials and the log laws.", listOf(
            Block.Formula("log_b(x) = y  ⇔  bʸ = x   (b > 0, b ≠ 1, x > 0)"),
            Block.Formula("log(xy) = log x + log y,  log(x/y) = log x − log y,  log(xⁿ) = n·log x"),
            Block.Formula("log_b(x) = ln x / ln b", "Change of base"),
            Block.Example("Solve 3·2^(x+1) = 48", listOf("Divide by 3: 2^(x+1) = 16", "16 = 2⁴, so x + 1 = 4", "x = 3"), "x = 3"),
            Block.Exercise("Evaluate log₂(64)", listOf("6"), "Which power of 2 is 64?", "2⁶ = 64."),
            Block.Exercise("Solve 10^x = 0.001", listOf("-3"), "Write 0.001 as a power of 10.", "0.001 = 10⁻³."),
        )),
        Lesson("unit-circle", "The unit circle", "Trigonometry", Level.INTERMEDIATE, 10, "Radians, sine and cosine as coordinates, exact values.", listOf(
            Block.Text("A point at angle θ on the unit circle has coordinates (cos θ, sin θ). One full turn is 2π radians = 360°. Exact values at 30°, 45° and 60° come from the 30-60-90 and 45-45-90 triangles."),
            Block.Formula("sin²θ + cos²θ = 1"),
            Block.Formula("tan θ = sin θ / cos θ"),
            Block.Example("cos(2π/3)", listOf("2π/3 = 120° lies in the second quadrant where cosine is negative", "Reference angle 60°, cos 60° = 1/2"), "−1/2"),
            Block.Exercise("Give sin(π/6) exactly", listOf("1/2"), "π/6 is 30°.", "sin 30° = 1/2."),
            Block.Exercise("Convert 135° to radians (as a multiple of pi, e.g. 3pi/4)", listOf("3pi/4"), "Multiply by π/180.", "135·π/180 = 3π/4."),
        )),
        Lesson("trig-identities", "Trigonometric identities and triangles", "Trigonometry", Level.INTERMEDIATE, 10, "Double angles, law of sines and law of cosines.", listOf(
            Block.Formula("sin 2θ = 2 sin θ cos θ,  cos 2θ = cos²θ − sin²θ"),
            Block.Formula("a/sin A = b/sin B = c/sin C", "Law of sines"),
            Block.Formula("c² = a² + b² − 2ab·cos C", "Law of cosines"),
            Block.Example("Triangle with a = 7, b = 5, C = 60°. Find c", listOf("c² = 49 + 25 − 2·7·5·cos 60°", "= 74 − 35 = 39", "c = √39 ≈ 6.245"), "√39"),
            Block.Exercise("In a triangle with a = 3, b = 4 and C = 90°, what is c?", listOf("5"), "cos 90° = 0.", "c² = 9 + 16 = 25."),
        )),
        Lesson("sequences", "Sequences and series", "Algebra", Level.INTERMEDIATE, 8, "Arithmetic and geometric sequences and their sums.", listOf(
            Block.Formula("aₙ = a₁ + (n − 1)d,   Sₙ = n(a₁ + aₙ)/2", "Arithmetic"),
            Block.Formula("aₙ = a₁·rⁿ⁻¹,   Sₙ = a₁(1 − rⁿ)/(1 − r),   S∞ = a₁/(1 − r) for |r| < 1", "Geometric"),
            Block.Example("1 + 1/2 + 1/4 + …", listOf("Geometric with a₁ = 1, r = 1/2", "S∞ = 1/(1 − 1/2) = 2"), "2"),
            Block.Exercise("Sum the first 100 positive integers", listOf("5050"), "Arithmetic series with a₁ = 1, a₁₀₀ = 100.", "100·101/2 = 5050."),
            Block.Exercise("Sum the infinite series 3 + 1 + 1/3 + …", listOf("9/2"), "r = 1/3.", "3/(1 − 1/3) = 9/2."),
        )),
        Lesson("limits", "Limits", "Calculus", Level.ADVANCED, 10, "The idea of approaching a value, and standard techniques.", listOf(
            Block.Text("lim f(x) as x → a is the value f(x) approaches as x gets close to a (without equalling it). If substitution gives 0/0, simplify (factor and cancel) or use L'Hôpital's rule when f and g are differentiable near a."),
            Block.Formula("lim_{x→0} sin(x)/x = 1"),
            Block.Example("lim_{x→3} (x² − 9)/(x − 3)", listOf("Substitution gives 0/0", "Factor: (x − 3)(x + 3)/(x − 3) = x + 3 for x ≠ 3", "Limit = 6"), "6"),
            Block.Exercise("lim_{x→2} (x² − 4)/(x − 2)", listOf("4"), "Factor the numerator.", "(x − 2)(x + 2)/(x − 2) = x + 2 → 4."),
        )),
        Lesson("derivatives", "Derivatives", "Calculus", Level.ADVANCED, 12, "Rates of change and the differentiation rules.", listOf(
            Block.Formula("f′(x) = lim_{h→0} (f(x + h) − f(x))/h"),
            Block.Formula("(xⁿ)′ = n·xⁿ⁻¹,  (fg)′ = f′g + fg′,  (f/g)′ = (f′g − fg′)/g²,  (f∘g)′ = f′(g)·g′"),
            Block.Example("d/dx [x² sin x]", listOf("Product rule with f = x², g = sin x", "f′ = 2x, g′ = cos x", "2x sin x + x² cos x"), "2x·sin(x) + x²·cos(x)"),
            Block.Exercise("Find f′(2) for f(x) = x³ − 4x", listOf("8"), "f′(x) = 3x² − 4.", "f′(2) = 12 − 4 = 8."),
            Block.Exercise("Find the slope of y = e^(3x) at x = 0", listOf("3"), "Chain rule: derivative of e^(3x) is 3e^(3x).", "3·e⁰ = 3."),
        )),
        Lesson("integrals", "Integrals", "Calculus", Level.ADVANCED, 12, "Antiderivatives, the fundamental theorem and area.", listOf(
            Block.Formula("∫ xⁿ dx = xⁿ⁺¹/(n + 1) + C  (n ≠ −1),   ∫ 1/x dx = ln|x| + C"),
            Block.Formula("∫ₐᵇ f(x) dx = F(b) − F(a)", "Fundamental theorem of calculus"),
            Block.Example("∫₀² 3x² dx", listOf("Antiderivative x³", "2³ − 0³ = 8"), "8"),
            Block.Exercise("Compute ∫₀¹ (2x + 1) dx", listOf("2"), "Antiderivative x² + x.", "(1 + 1) − 0 = 2."),
            Block.Exercise("Compute ∫₀^π sin(x) dx", listOf("2"), "Antiderivative −cos x.", "−cos π + cos 0 = 1 + 1 = 2."),
        )),
        Lesson("matrices", "Vectors and matrices", "Linear algebra", Level.ADVANCED, 12, "Matrix multiplication, determinants and inverses.", listOf(
            Block.Formula("det [[a, b], [c, d]] = ad − bc"),
            Block.Formula("[[a, b], [c, d]]⁻¹ = 1/(ad − bc) · [[d, −b], [−c, a]]"),
            Block.Text("A square matrix is invertible exactly when its determinant is nonzero. The system Ax = b then has the unique solution x = A⁻¹b."),
            Block.Example("det [[2, 1], [5, 3]]", listOf("2·3 − 1·5 = 1"), "1"),
            Block.Exercise("Compute det [[4, 2], [3, 5]]", listOf("14"), "ad − bc.", "20 − 6 = 14."),
            Block.Exercise("Dot product of (1, 2, 3) and (4, −5, 6)", listOf("12"), "Multiply componentwise and add.", "4 − 10 + 18 = 12."),
        )),
        Lesson("probability", "Probability and counting", "Probability", Level.INTERMEDIATE, 10, "Permutations, combinations and basic probability.", listOf(
            Block.Formula("nPr = n!/(n − r)!,   nCr = n!/(r!(n − r)!)"),
            Block.Formula("P(A ∪ B) = P(A) + P(B) − P(A ∩ B)"),
            Block.Example("Probability of exactly 2 heads in 4 fair coin flips", listOf("Favourable outcomes 4C2 = 6", "Total outcomes 2⁴ = 16", "6/16 = 3/8"), "3/8"),
            Block.Exercise("How many ways can a committee of 3 be chosen from 10 people?", listOf("120"), "Order does not matter.", "10C3 = 120."),
            Block.Exercise("Probability that two dice sum to 7", listOf("1/6"), "Count the favourable pairs.", "6 of the 36 ordered pairs sum to 7."),
        )),
        Lesson("statistics", "Descriptive statistics", "Statistics", Level.INTERMEDIATE, 10, "Mean, median, variance and the normal distribution.", listOf(
            Block.Formula("x̄ = Σxᵢ/n,   s² = Σ(xᵢ − x̄)²/(n − 1)"),
            Block.Text("The median is robust to outliers; the mean is not. About 68% / 95% / 99.7% of a normal distribution lies within 1 / 2 / 3 standard deviations of the mean."),
            Block.Example("Data 2, 4, 4, 4, 5, 5, 7, 9", listOf("Sum 40, n = 8, mean 5", "Population variance 4, so σ = 2"), "mean 5, σ = 2"),
            Block.Exercise("Median of 3, 9, 1, 7, 5", listOf("5"), "Sort the data first.", "Sorted: 1, 3, 5, 7, 9; the middle value is 5."),
            Block.Exercise("Mean of 10, 20, 30, 40", listOf("25"), "Add and divide by 4.", "100/4 = 25."),
        )),
        Lesson("complex", "Complex numbers", "Complex numbers", Level.ADVANCED, 10, "Rectangular and polar forms, Euler's formula.", listOf(
            Block.Formula("i² = −1,   z = a + bi = r(cos θ + i sin θ) = r·e^(iθ)"),
            Block.Formula("|z| = √(a² + b²),   arg z = atan2(b, a)"),
            Block.Example("(3 + 4i)(1 − 2i)", listOf("3 − 6i + 4i − 8i²", "= 3 − 2i + 8 = 11 − 2i"), "11 − 2i"),
            Block.Exercise("Modulus of 6 − 8i", listOf("10"), "√(a² + b²).", "√(36 + 64) = 10."),
            Block.Text("De Moivre: (r e^(iθ))ⁿ = rⁿ e^(inθ). The n-th roots of a number are spaced 2π/n apart on a circle."),
        )),
        Lesson("number-theory", "Number theory basics", "Number theory", Level.INTERMEDIATE, 10, "Primes, gcd, the Euclidean algorithm and modular arithmetic.", listOf(
            Block.Text("Every integer > 1 factors uniquely into primes. The Euclidean algorithm finds gcd(a, b) by repeatedly replacing (a, b) with (b, a mod b)."),
            Block.Formula("gcd(a, b)·lcm(a, b) = |ab|"),
            Block.Example("gcd(252, 105)", listOf("252 = 2·105 + 42", "105 = 2·42 + 21", "42 = 2·21 + 0"), "21"),
            Block.Exercise("gcd(84, 36)", listOf("12"), "Use the Euclidean algorithm.", "84 = 2·36 + 12, 36 = 3·12."),
            Block.Exercise("What is 17 mod 5?", listOf("2"), "Remainder after division.", "17 = 3·5 + 2."),
        )),
        Lesson("geometry", "Areas and volumes", "Geometry", Level.FOUNDATION, 8, "Formulas for common shapes and solids.", listOf(
            Block.Formula("Circle: A = πr², C = 2πr"),
            Block.Formula("Cylinder: V = πr²h;  Cone: V = πr²h/3;  Sphere: V = 4πr³/3"),
            Block.Example("Volume of a cone with r = 3, h = 4", listOf("V = π·9·4/3 = 12π ≈ 37.70"), "12π"),
            Block.Exercise("Area of a circle with radius 5 (as a multiple of pi, e.g. 25pi)", listOf("25pi"), "A = πr².", "π·5² = 25π."),
            Block.Exercise("Hypotenuse of a right triangle with legs 5 and 12", listOf("13"), "Pythagoras.", "√(25 + 144) = 13."),
        )),
    )

    fun byId(id: String) = all.firstOrNull { it.id == id }
}
