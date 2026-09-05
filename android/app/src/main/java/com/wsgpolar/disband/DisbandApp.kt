package com.wsgpolar.disband

import android.app.Application
import com.wsgpolar.disband.core.DisbandSupabase
import com.wsgpolar.disband.data.PushRegistrar
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Holds the app-wide services created once per process. */
class AppContainer(private val context: Application) {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val presence = com.wsgpolar.disband.data.PresenceService(appScope)
    val dmUnread = com.wsgpolar.disband.data.DmUnreadStore(context)
    val themeManager = com.wsgpolar.disband.core.ThemeManager(context)
    val turnService = com.wsgpolar.disband.data.TurnService()
    val notes = com.wsgpolar.disband.data.NotesService(appScope)
    val calls = com.wsgpolar.disband.call.CallManager(appScope, context)

    val appState = com.wsgpolar.disband.state.AppState(
        scope = appScope,
        context = context,
        themeManager = themeManager,
        presence = presence,
        dmUnread = dmUnread,
        notes = notes,
        turnService = turnService,
        calls = calls,
    )

    fun begin() {
        DisbandSupabase.initialize(context)
        appState.begin()
        PushRegistrar.initialize(context)
        com.wsgpolar.disband.data.MessagingService.configure(calls)
    }
}

class DisbandApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        container.begin()
    }
}