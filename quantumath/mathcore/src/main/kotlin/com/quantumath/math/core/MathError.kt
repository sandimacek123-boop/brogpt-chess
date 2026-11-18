package com.quantumath.math.core

/** All mathematical failures surface as MathError with a user-readable message. */
open class MathError(message: String) : RuntimeException(message)
class ParseError(message: String, val position: Int = -1) : MathError(message)
class DomainError(message: String) : MathError(message)
class DivisionByZero : MathError("Division by zero")
class Unsupported(message: String) : MathError(message)
class OverflowError(message: String = "Result is too large to represent") : MathError(message)
