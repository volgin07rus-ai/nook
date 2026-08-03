package com.volgin.nook

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Показ уведомлений о напоминаниях. */
object NookNotifications {
    private const val TAG = "NookReminder"

    /** Канал. С Android 8 уведомление без канала не показывается вообще. */
    const val CHANNEL = "nook_reminders"

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL) != null) return

        val channel = NotificationChannel(
            CHANNEL,
            context.getString(R.string.nook_channel_reminders),
            // Высокая важность — иначе напоминание не всплывёт и не прозвучит,
            // а тихая строчка в шторке напоминанием быть перестаёт.
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.nook_channel_reminders_hint)
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    fun show(context: Context, notificationId: Int, text: String) {
        ensureChannel(context)

        val open = PendingIntent.getActivity(
            context,
            notificationId,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_nook_notification)
            .setContentTitle(context.getString(R.string.nook_reminder_title))
            .setContentText(text)
            // Длинное название задачи иначе обрезается на середине.
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(notificationId, notification)
        } catch (e: SecurityException) {
            // Разрешение не выдано. Показывать нечего, и падать тоже незачем:
            // при следующем запуске приложение спросит его снова.
            Log.w(TAG, "уведомления запрещены: ${e.message}")
        }
    }
}
