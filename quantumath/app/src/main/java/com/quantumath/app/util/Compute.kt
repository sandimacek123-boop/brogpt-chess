package com.quantumath.app.util

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quantumath.math.core.MathError
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

sealed interface Outcome<out T> {
    data object Idle : Outcome<Nothing>
    data object Loading : Outcome<Nothing>
    data class Ok<T>(val value: T) : Outcome<T>
    data class Err(val message: String) : Outcome<Nothing>
}

fun friendlyError(e: Throwable): String = when (e) {
    is MathError -> e.message ?: "Math error"
    is ArithmeticException -> e.message?.let { "Arithmetic error: $it" } ?: "Arithmetic error"
    is NumberFormatException -> "Invalid number"
    is StackOverflowError -> "Expression is too deeply nested"
    is OutOfMemoryError -> "Not enough memory for this computation"
    is IllegalArgumentException -> e.message ?: "Invalid input"
    else -> e.message ?: e.javaClass.simpleName
}

/** Background computation on Dispatchers.Default, with cancellation of the previous run and a time limit. */
private val workerScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

suspend fun <T> computeLimited(timeoutMs: Long, block: () -> T): T {
    val d = workerScope.async { block() }
    return try {
        withTimeout(timeoutMs) { d.await() }
    } catch (e: TimeoutCancellationException) {
        d.cancel(); throw MathError("Stopped after ${timeoutMs / 1000} s — this computation is too expensive. Try simpler input or a smaller range.")
    } catch (e: CancellationException) { d.cancel(); throw e }
}

class Computation<T>(private val scope: CoroutineScope) {
    private val _state = MutableStateFlow<Outcome<T>>(Outcome.Idle)
    val state: StateFlow<Outcome<T>> = _state.asStateFlow()
    private var job: Job? = null

    fun run(timeoutMs: Long = 20_000, onOk: suspend (T) -> Unit = {}, block: () -> T) {
        job?.cancel()
        _state.value = Outcome.Loading
        job = scope.launch {
            try {
                val v = computeLimited(timeoutMs, block)
                _state.value = Outcome.Ok(v)
                onOk(v)
            } catch (e: CancellationException) { throw e } catch (e: Throwable) { _state.value = Outcome.Err(friendlyError(e)) }
        }
    }
    fun clear() { job?.cancel(); _state.value = Outcome.Idle }
}

fun <T> ViewModel.computation() = Computation<T>(viewModelScope)
