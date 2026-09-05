package com.wsgpolar.disband.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.state.AppState
import kotlinx.coroutines.launch

@Composable
fun AuthScreen(app: AppState) {
    val palette = LocalPalette.current
    var modeSignIn by remember { mutableStateOf(true) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val authError by app.authError.collectAsState()
    val authNotice by app.authNotice.collectAsState()

    Column(
        Modifier
            .fillMaxSize()
            .background(palette.background)
            .verticalScroll(rememberScrollState())
            .imePadding()
            .systemBarsPadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Spacer(Modifier.size(40.dp))
        Box(
            Modifier.size(64.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.ChatBubble, contentDescription = null, tint = palette.accent, modifier = Modifier.size(52.dp))
        }
        Text("Disband", fontSize = 34.sp, fontWeight = FontWeight.Bold, color = palette.textPrimary)
        Text(
            if (modeSignIn) "Welcome back!" else "Create your account",
            fontSize = 14.sp,
            color = palette.textMuted,
        )

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            leadingIcon = { Icon(Icons.Filled.Email, null, tint = palette.textMuted, modifier = Modifier.size(18.dp)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            leadingIcon = { Icon(Icons.Filled.Lock, null, tint = palette.textMuted, modifier = Modifier.size(18.dp)) },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )

        authError?.let { error ->
            Text(error, fontSize = 13.sp, color = Brand.dnd, modifier = Modifier.fillMaxWidth())
        }
        authNotice?.let { notice ->
            Text(notice, fontSize = 13.sp, color = Brand.online, modifier = Modifier.fillMaxWidth())
        }

        Button(
            onClick = {
                busy = true
                scope.launch {
                    if (modeSignIn) app.signIn(email, password) else app.signUp(email, password)
                    busy = false
                }
            },
            enabled = !busy && email.isNotBlank() && password.isNotBlank(),
            colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 6.dp),
        ) {
            if (busy) {
                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.size(8.dp))
            }
            Text(
                if (modeSignIn) "Log In" else "Create Account",
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(vertical = 4.dp),
            )
        }

        if (modeSignIn) {
            TextButton(onClick = { scope.launch { app.sendPasswordReset(email) } }) {
                Text("Forgot password?", color = palette.accent, fontSize = 13.sp)
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (modeSignIn) "New to Disband?" else "Already have an account?",
                color = palette.textMuted,
                fontSize = 14.sp,
            )
            TextButton(onClick = { modeSignIn = !modeSignIn }) {
                Text(
                    if (modeSignIn) "Sign up" else "Log in",
                    color = palette.accent,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}