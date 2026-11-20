@file:Suppress("unused")

package androidx.room

import kotlin.reflect.KClass

/*
 * Compile-time stand-ins for the Room annotations used by the shared data classes and DAO interfaces.
 * Room itself is Android-only in this project; on desktop the DAOs are implemented by
 * com.quantumath.app.data.DesktopDatabase (a JSON-file store), so these annotations carry no behaviour.
 */
annotation class Entity(val tableName: String = "", val indices: Array<Index> = [])
annotation class Index(vararg val value: String)
annotation class PrimaryKey(val autoGenerate: Boolean = false)
annotation class Dao
annotation class Query(val value: String)
annotation class Insert(val onConflict: Int = OnConflictStrategy.ABORT)
annotation class Update
annotation class Delete
annotation class Transaction
annotation class Database(val entities: Array<KClass<*>>, val version: Int, val exportSchema: Boolean = true)

annotation class OnConflictStrategy {
    companion object {
        const val NONE = 0; const val REPLACE = 1; const val ROLLBACK = 2; const val ABORT = 3; const val FAIL = 4; const val IGNORE = 5
    }
}

abstract class RoomDatabase {
    abstract fun clearAllTables()
    /** Runs [block] atomically with respect to persistence. */
    open suspend fun <R> runInTransaction(block: suspend () -> R): R = block()
}

suspend fun <R> RoomDatabase.withTransaction(block: suspend () -> R): R = runInTransaction(block)
