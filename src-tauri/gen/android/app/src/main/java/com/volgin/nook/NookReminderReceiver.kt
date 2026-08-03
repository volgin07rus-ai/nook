package com.volgin.nook

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Что происходит, когда будильник сработал.
 *
 * Получателя поднимает система, поэтому приложение для этого запускать не надо
 * — уведомление приходит и при полностью закрытом Nook.
 */
class NookReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            // Перезагрузка стирает все заведённые будильники, а обновление
            // приложения — часть из них. И там, и там нужно расставить заново.
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            -> NookAlarms.reschedule(context)

            NookAlarms.ACTION_FIRE -> {
                val key = intent.getStringExtra(NookAlarms.EXTRA_KEY) ?: return
                val text = intent.getStringExtra(NookAlarms.EXTRA_TEXT) ?: return
                // Отметка ставится до показа: если показать не выйдет из-за
                // запрета, второй раз будить человека тем же всё равно нельзя.
                NookAlarms.markDelivered(context, key)
                NookNotifications.show(context, key.hashCode(), text)
            }
        }
    }
}
