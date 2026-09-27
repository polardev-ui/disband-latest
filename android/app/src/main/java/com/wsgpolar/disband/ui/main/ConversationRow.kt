package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Radii
import com.wsgpolar.disband.core.color
import com.wsgpolar.disband.data.UserStatus
import com.wsgpolar.disband.ui.AvatarImage

/**
 * One conversation, mirroring iOS ConversationRow: an 8dp accent unread dot on
 * the leading edge (its slot reserved when read so rows stay aligned), the
 * 44dp avatar with presence, then name and time over preview and unread
 * count. Press highlight uses the 14dp radius. Public so MessagesScreen and
 * friends can reuse the same row.
 */
@Composable
fun ConversationRow(
    iconUrl: String?,
    name: String,
    subtitle: String? = null,
    status: UserStatus? = null,
    preview: String? = null,
    time: String? = null,
    unread: Int = 0,
    selected: Boolean = false,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    val isUnread = unread > 0

    Row(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp)
            .clip(RoundedCornerShape(Radii.pressLarge))
            .background(if (selected) palette.accent.copy(alpha = 0.10f) else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(if (isUnread) palette.accent else Color.Transparent),
        )

        AvatarImage(
            url = iconUrl,
            name = name,
            size = 44.dp,
            presence = status?.color(palette),
        )

        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    name,
                    color = if (isUnread) palette.textPrimary else palette.textSecondary,
                    fontSize = 15.sp,
                    fontWeight = if (isUnread) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Spacer(Modifier.width(6.dp))
                Spacer(Modifier.weight(1f))
                if (!time.isNullOrEmpty()) {
                    Text(
                        time,
                        color = if (isUnread) palette.textPrimary else palette.textMuted,
                        fontSize = 12.sp,
                        maxLines = 1,
                    )
                }
            }
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    preview ?: subtitle ?: "",
                    color = if (isUnread) palette.accent else palette.textMuted,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (isUnread) {
                    Spacer(Modifier.width(6.dp))
                    Box(
                        Modifier
                            .clip(CircleShape)
                            .background(Brand.danger)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    ) {
                        Text(
                            if (unread > 99) "99+" else "$unread",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}
