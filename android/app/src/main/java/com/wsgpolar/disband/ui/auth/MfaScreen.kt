package com.wsgpolar.disband.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.state.AppState
import kotlinx.coroutines.launch

@Composable
fun MfaScreen(app: AppState) {
    val palette = LocalPalette.current
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        Modifier
            .fillMaxSize()
            .background(palette.background)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Filled.Security, contentDescription = null, tint = palette.accent, modifier = Modifier.size(52.dp))
        Spacer(Modifier.size(16.dp))
        Text("Two-Factor Authentication", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = palette.textPrimary)
        Spacer(Modifier.size(8.dp))
        Text(
            "Enter the 6-digit code from your authenticator app.",
            fontSize = 14.sp,
            color = palette.textMuted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.size(20.dp))
        OutlinedTextField(
            value = code,
            onValueChange = { code = it.filter(Char::isDigit).take(6) },
            label = { Text("000000") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            textStyle = androidx.compose.ui.text.TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold),
            modifier = Modifier.fillMaxWidth(),
        )

        error?.let {
            Spacer(Modifier.size(12.dp))
            Text(it, fontSize = 13.sp, color = Brand.dnd)
        }
        Spacer(Modifier.size(20.dp))

        Button(
            onClick = {
                busy = true
                scope.launch {
                    error = app.verifyMfa(code)
                    busy = false
                }
            },
            enabled = !busy && code.length == 6,
            colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Verify", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(vertical = 6.dp))
        }
        TextButton(onClick = { scope.launch { app.signOut() } }) {
            Text("Sign out", color = palette.textMuted, fontSize = 13.sp)
        }
    }
}