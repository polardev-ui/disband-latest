package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.NoteAdd
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.calls.CallOverlay

@Composable
fun MainScreen(app: AppState) {
    var selected by rememberSaveable { mutableStateOf(0) }
    Box(Modifier.fillMaxSize()) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            bottomBar = {
                NavigationBar {
                    listOf(
                        "Servers" to Icons.Filled.Dns,
                        "Messages" to Icons.Filled.Email,
                        "Friends" to Icons.Filled.Group,
                        "Notes" to Icons.Filled.NoteAdd,
                        "You" to Icons.Filled.Person,
                    ).forEachIndexed { index, (label, icon) ->
                        NavigationBarItem(
                            selected = selected == index,
                            onClick = { selected = index },
                            icon = { Icon(icon, contentDescription = label) },
                            label = { Text(label) },
                        )
                    }
                }
            },
        ) { innerPadding ->
            Box(Modifier.fillMaxSize().padding(innerPadding)) {
                when (selected) {
                    0 -> ServersScreen(app)
                    1 -> MessagesScreen(app)
                    2 -> FriendsScreen(app)
                    3 -> NotesScreen(app)
                    else -> YouScreen(app)
                }
            }
        }
        CallOverlay(app)
    }
}