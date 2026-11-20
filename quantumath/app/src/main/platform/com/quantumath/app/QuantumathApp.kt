package com.quantumath.app

import android.app.Application
import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import androidx.room.Room
import com.quantumath.app.data.AppDatabase
import com.quantumath.app.data.SettingsRepository

class QuantumathApp : Application() {
    lateinit var container: AppContainer
    override fun onCreate() {
        super.onCreate()
        container = AppContainer(buildAndroidDatabase(this), SettingsRepository(dataStore))
    }
}

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

fun buildAndroidDatabase(context: Context, inMemory: Boolean = false): AppDatabase =
    (if (inMemory) Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
    else Room.databaseBuilder(context, AppDatabase::class.java, "quantumath.db")).build()

val Context.container: AppContainer get() = (applicationContext as QuantumathApp).container
