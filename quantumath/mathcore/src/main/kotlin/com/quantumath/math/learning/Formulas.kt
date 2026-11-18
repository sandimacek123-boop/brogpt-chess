package com.quantumath.math.learning

data class FormulaEntry(val category: String, val name: String, val formula: String, val variables: List<Pair<String, String>>, val example: String)

object FormulaLibrary {
    private fun f(cat: String, name: String, formula: String, vars: String, example: String) =
        FormulaEntry(cat, name, formula, vars.split(";").filter { it.isNotBlank() }.map { it.substringBefore("=").trim() to it.substringAfter("=").trim() }, example)

    val all: List<FormulaEntry> = listOf(
        // Algebra
        f("Algebra", "Quadratic formula", "x = (−b ± √(b² − 4ac)) / 2a", "a,b,c = coefficients of ax² + bx + c = 0 (a ≠ 0)", "x² − 3x + 2 = 0 → x = 1, 2"),
        f("Algebra", "Discriminant", "Δ = b² − 4ac", "Δ = discriminant; a,b,c = quadratic coefficients", "x² + x + 1: Δ = −3 (complex roots)"),
        f("Algebra", "Difference of squares", "a² − b² = (a − b)(a + b)", "a,b = any expressions", "x² − 9 = (x − 3)(x + 3)"),
        f("Algebra", "Perfect square", "(a ± b)² = a² ± 2ab + b²", "a,b = any expressions", "(x + 2)² = x² + 4x + 4"),
        f("Algebra", "Sum of cubes", "a³ + b³ = (a + b)(a² − ab + b²)", "a,b = any expressions", "x³ + 8 = (x + 2)(x² − 2x + 4)"),
        f("Algebra", "Binomial theorem", "(a + b)ⁿ = Σ C(n,k) aⁿ⁻ᵏ bᵏ", "n = non-negative integer; C(n,k) = binomial coefficient", "(x + 1)³ = x³ + 3x² + 3x + 1"),
        f("Algebra", "Laws of exponents", "aᵐaⁿ = aᵐ⁺ⁿ, (aᵐ)ⁿ = aᵐⁿ, a⁻ⁿ = 1/aⁿ", "a = base > 0; m,n = exponents", "2³·2⁴ = 2⁷ = 128"),
        f("Algebra", "Logarithm laws", "log(xy) = log x + log y, log(xⁿ) = n log x", "x,y > 0", "log 200 = log 2 + log 100 ≈ 2.301"),
        f("Algebra", "Change of base", "log_b x = ln x / ln b", "b = base (b > 0, b ≠ 1); x > 0", "log₂ 10 = ln 10/ln 2 ≈ 3.3219"),
        f("Algebra", "Arithmetic series", "Sₙ = n(a₁ + aₙ)/2", "n = number of terms; a₁ = first; aₙ = last", "1 + … + 100 = 5050"),
        f("Algebra", "Geometric series", "Sₙ = a₁(1 − rⁿ)/(1 − r);  S∞ = a₁/(1 − r), |r| < 1", "a₁ = first term; r = ratio", "1 + 1/2 + 1/4 + … = 2"),
        f("Algebra", "Slope of a line", "m = (y₂ − y₁)/(x₂ − x₁)", "(x₁,y₁),(x₂,y₂) = two points", "(1,2),(3,8): m = 3"),
        f("Algebra", "Point-slope form", "y − y₁ = m(x − x₁)", "m = slope; (x₁,y₁) = point on the line", "m = 2 through (1,3): y = 2x + 1"),
        f("Algebra", "Compound interest", "A = P(1 + r/n)ⁿᵗ", "P = principal; r = annual rate; n = compoundings per year; t = years", "P = 1000, r = 5%, n = 12, t = 10 → A ≈ 1647.01"),
        // Geometry
        f("Geometry", "Pythagorean theorem", "a² + b² = c²", "a,b = legs; c = hypotenuse", "3² + 4² = 5²"),
        f("Geometry", "Circle", "A = πr², C = 2πr", "r = radius", "r = 2: A = 4π ≈ 12.566"),
        f("Geometry", "Triangle area", "A = ½·b·h = ½·ab·sin C", "b = base; h = height; a,b = sides; C = included angle", "b = 6, h = 4 → A = 12"),
        f("Geometry", "Heron's formula", "A = √(s(s − a)(s − b)(s − c)), s = (a + b + c)/2", "a,b,c = sides; s = semi-perimeter", "3,4,5 → A = 6"),
        f("Geometry", "Trapezoid", "A = ½(a + b)h", "a,b = parallel sides; h = height", "a = 3, b = 5, h = 2 → A = 8"),
        f("Geometry", "Regular polygon", "A = ½·n·s·a;  interior angle = 180°(n − 2)/n", "n = sides; s = side length; a = apothem", "hexagon: interior angle 120°"),
        f("Geometry", "Sphere", "V = 4πr³/3, S = 4πr²", "r = radius", "r = 3: V = 36π ≈ 113.10"),
        f("Geometry", "Cylinder", "V = πr²h, S = 2πr(r + h)", "r = radius; h = height", "r = 1, h = 2: V = 2π"),
        f("Geometry", "Cone", "V = πr²h/3, S = πr(r + l), l = √(r² + h²)", "r = radius; h = height; l = slant height", "r = 3, h = 4: V = 12π"),
        f("Geometry", "Distance between points", "d = √((x₂ − x₁)² + (y₂ − y₁)²)", "(x₁,y₁),(x₂,y₂) = points", "(0,0),(3,4): d = 5"),
        f("Geometry", "Shoelace formula", "A = ½|Σ(xᵢyᵢ₊₁ − xᵢ₊₁yᵢ)|", "(xᵢ,yᵢ) = polygon vertices in order", "(0,0),(4,0),(4,3): A = 6"),
        f("Geometry", "Arc length & sector", "s = rθ, A = ½r²θ", "r = radius; θ = angle in radians", "r = 2, θ = π/2: s = π"),
        // Trigonometry
        f("Trigonometry", "Pythagorean identity", "sin²θ + cos²θ = 1", "θ = any angle", "θ = 30°: 1/4 + 3/4 = 1"),
        f("Trigonometry", "Tangent", "tan θ = sin θ / cos θ", "θ ≠ π/2 + kπ", "tan 45° = 1"),
        f("Trigonometry", "Double angle", "sin 2θ = 2 sin θ cos θ;  cos 2θ = 1 − 2sin²θ", "θ = any angle", "sin 60° = 2·(1/2)·(√3/2)"),
        f("Trigonometry", "Angle addition", "sin(a ± b) = sin a cos b ± cos a sin b", "a,b = angles", "sin 75° = (√6 + √2)/4"),
        f("Trigonometry", "Law of sines", "a/sin A = b/sin B = c/sin C", "a,b,c = sides; A,B,C = opposite angles", "ASA and AAS triangles"),
        f("Trigonometry", "Law of cosines", "c² = a² + b² − 2ab cos C", "a,b,c = sides; C = angle opposite c", "a = 7, b = 5, C = 60° → c = √39"),
        f("Trigonometry", "Degrees ↔ radians", "rad = deg·π/180", "deg = degrees; rad = radians", "180° = π"),
        // Calculus
        f("Calculus", "Definition of the derivative", "f′(x) = lim_{h→0} (f(x + h) − f(x))/h", "f = differentiable function", "f(x) = x² → f′(x) = 2x"),
        f("Calculus", "Power rule", "d/dx xⁿ = n xⁿ⁻¹", "n = real exponent", "d/dx x⁵ = 5x⁴"),
        f("Calculus", "Product rule", "(fg)′ = f′g + fg′", "f,g = differentiable functions", "(x sin x)′ = sin x + x cos x"),
        f("Calculus", "Quotient rule", "(f/g)′ = (f′g − fg′)/g²", "g ≠ 0", "(sin x/x)′ = (x cos x − sin x)/x²"),
        f("Calculus", "Chain rule", "(f ∘ g)′(x) = f′(g(x))·g′(x)", "f,g = differentiable", "(sin x²)′ = 2x cos x²"),
        f("Calculus", "Standard derivatives", "(eˣ)′ = eˣ, (ln x)′ = 1/x, (sin x)′ = cos x, (cos x)′ = −sin x", "x in the domain", "(e^(2x))′ = 2e^(2x)"),
        f("Calculus", "Fundamental theorem", "∫ₐᵇ f(x) dx = F(b) − F(a), F′ = f", "F = antiderivative of continuous f", "∫₀¹ x² dx = 1/3"),
        f("Calculus", "Integration by parts", "∫ u dv = uv − ∫ v du", "u,v = differentiable functions", "∫ x eˣ dx = (x − 1)eˣ + C"),
        f("Calculus", "Standard integrals", "∫ 1/x dx = ln|x|, ∫ eˣ dx = eˣ, ∫ 1/(1 + x²) dx = atan x", "+ C omitted", "∫₀¹ 1/(1 + x²) dx = π/4"),
        f("Calculus", "Taylor series", "f(x) = Σ f⁽ⁿ⁾(a)(x − a)ⁿ/n!", "a = expansion point", "eˣ = 1 + x + x²/2! + …"),
        f("Calculus", "L'Hôpital's rule", "lim f/g = lim f′/g′ for 0/0 or ∞/∞", "f,g differentiable near the point, g′ ≠ 0", "lim sin x/x = lim cos x/1 = 1"),
        f("Calculus", "Arc length", "L = ∫ₐᵇ √(1 + f′(x)²) dx", "f = smooth function", "y = x on [0,1]: L = √2"),
        f("Calculus", "Mean value theorem", "f′(c) = (f(b) − f(a))/(b − a) for some c in (a, b)", "f continuous on [a,b], differentiable on (a,b)", "f(x) = x² on [0,2]: c = 1"),
        // Statistics
        f("Statistics", "Mean", "x̄ = Σxᵢ / n", "xᵢ = data values; n = count", "2, 4, 6 → 4"),
        f("Statistics", "Sample variance", "s² = Σ(xᵢ − x̄)² / (n − 1)", "n − 1 = Bessel's correction", "2, 4, 6 → s² = 4"),
        f("Statistics", "Standard deviation", "s = √s²", "s² = variance", "s² = 4 → s = 2"),
        f("Statistics", "z-score", "z = (x − μ)/σ", "μ = mean; σ = standard deviation", "x = 130, μ = 100, σ = 15 → z = 2"),
        f("Statistics", "Normal density", "f(x) = e^(−(x−μ)²/(2σ²)) / (σ√(2π))", "μ = mean; σ = standard deviation", "standard normal: f(0) ≈ 0.3989"),
        f("Statistics", "Linear regression", "b = Σ(x − x̄)(y − ȳ)/Σ(x − x̄)²,  a = ȳ − b x̄", "y = a + bx; least squares", "(1,3),(2,5),(3,7): y = 1 + 2x"),
        f("Statistics", "Correlation", "r = Σ(x − x̄)(y − ȳ)/√(Σ(x − x̄)² Σ(y − ȳ)²)", "−1 ≤ r ≤ 1", "perfectly linear data: r = ±1"),
        // Probability
        f("Probability", "Permutations", "nPr = n!/(n − r)!", "n = items; r = chosen (order matters)", "5P2 = 20"),
        f("Probability", "Combinations", "nCr = n!/(r!(n − r)!)", "order does not matter", "5C2 = 10"),
        f("Probability", "Addition rule", "P(A ∪ B) = P(A) + P(B) − P(A ∩ B)", "A,B = events", "P(king or heart) = 4/52 + 13/52 − 1/52 = 4/13"),
        f("Probability", "Conditional probability", "P(A | B) = P(A ∩ B)/P(B)", "P(B) > 0", "dice: P(6 | even) = 1/3"),
        f("Probability", "Bayes' theorem", "P(A | B) = P(B | A)P(A)/P(B)", "P(B) > 0", "medical tests and base rates"),
        f("Probability", "Binomial distribution", "P(X = k) = C(n,k) pᵏ(1 − p)ⁿ⁻ᵏ", "n = trials; p = success probability", "n = 10, p = 0.5, k = 5 → 0.2461"),
        f("Probability", "Poisson distribution", "P(X = k) = λᵏ e^(−λ)/k!", "λ = mean rate", "λ = 3, k = 2 → 0.2240"),
        f("Probability", "Expected value", "E[X] = Σ xᵢ P(xᵢ)", "xᵢ = outcomes", "fair die: 3.5"),
        // Linear algebra
        f("Linear algebra", "2×2 determinant", "det = ad − bc", "[[a, b], [c, d]]", "[[1,2],[3,4]] → −2"),
        f("Linear algebra", "2×2 inverse", "A⁻¹ = (1/det)·[[d, −b], [−c, a]]", "det ≠ 0", "[[1,2],[3,4]]⁻¹ = [[−2,1],[1.5,−0.5]]"),
        f("Linear algebra", "Dot product", "u·v = Σuᵢvᵢ = |u||v|cos θ", "θ = angle between vectors", "(1,2)·(3,4) = 11"),
        f("Linear algebra", "Cross product", "u × v = (u₂v₃ − u₃v₂, u₃v₁ − u₁v₃, u₁v₂ − u₂v₁)", "3D vectors", "i × j = k"),
        f("Linear algebra", "Projection", "proj_v u = (u·v / v·v)·v", "v ≠ 0", "proj_(1,0)(3,4) = (3,0)"),
        f("Linear algebra", "Rotation matrix", "R(θ) = [[cos θ, −sin θ], [sin θ, cos θ]]", "θ = counter-clockwise angle", "R(90°)(1,0) = (0,1)"),
        // Complex & number theory
        f("Complex numbers", "Euler's formula", "e^(iθ) = cos θ + i sin θ", "θ = real angle", "e^(iπ) + 1 = 0"),
        f("Complex numbers", "Modulus", "|a + bi| = √(a² + b²)", "a,b = real parts", "|3 + 4i| = 5"),
        f("Complex numbers", "De Moivre's theorem", "(r e^(iθ))ⁿ = rⁿ e^(inθ)", "n = integer", "(1 + i)⁴ = −4"),
        f("Number theory", "GCD × LCM", "gcd(a, b)·lcm(a, b) = |ab|", "a,b = integers", "gcd(4,6)·lcm(4,6) = 2·12 = 24"),
        f("Number theory", "Fermat's little theorem", "aᵖ ≡ a (mod p)", "p = prime", "2⁷ ≡ 2 (mod 7)"),
        f("Number theory", "Euler's totient (prime power)", "φ(pᵏ) = pᵏ − pᵏ⁻¹", "p = prime", "φ(9) = 6"),
        // Physics-related mathematics
        f("Physics math", "Kinematics", "s = ut + ½at², v = u + at, v² = u² + 2as", "u = initial velocity; a = acceleration; t = time; s = displacement", "u = 0, a = 9.81, t = 2 → s ≈ 19.62 m"),
        f("Physics math", "Projectile range", "R = v² sin(2θ)/g", "v = launch speed; θ = angle; g = 9.81 m/s²", "v = 20, θ = 45° → R ≈ 40.8 m"),
        f("Physics math", "Simple harmonic motion", "x(t) = A cos(ωt + φ), T = 2π/ω", "A = amplitude; ω = angular frequency", "ω = 2π → T = 1 s"),
        f("Physics math", "Exponential decay", "N(t) = N₀ e^(−λt), t½ = ln 2/λ", "λ = decay constant", "λ = 0.1 → t½ ≈ 6.93"),
        f("Physics math", "Inverse-square law", "I = P/(4πr²)", "P = power; r = distance", "double r → quarter intensity"),
    )

    val categories get() = all.map { it.category }.distinct()

    fun search(q: String): List<FormulaEntry> {
        val t = q.trim().lowercase()
        if (t.isEmpty()) return all
        return all.filter { it.name.lowercase().contains(t) || it.category.lowercase().contains(t) || it.formula.lowercase().contains(t) || it.example.lowercase().contains(t) }
    }
}
