package com.volgin.nook

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log

/**
 * Напоминания через системный будильник.
 *
 * Раньше их отсчитывал поток внутри приложения. На компьютере это работает —
 * программа висит в трее и живёт всегда. На телефоне нет: система замораживает
 * фоновое приложение через считанные секунды после того, как его убрали с
 * экрана, и поток вместе с ним. То есть напоминание могло сработать только
 * тогда, когда приложение и так открыто, — ровно в том случае, когда оно не
 * нужно.
 *
 * AlarmManager принадлежит системе. Ей и передаётся время: она разбудит
 * приложение сама, хоть через неделю, хоть из выключенного состояния.
 *
 * Что показывать, читается из того же nook.json, что и виджеты. Писать в него
 * отсюда по-прежнему нельзя — отметки о доставке лежат отдельно, в своих
 * настройках, чтобы два процесса не затирали файл друг другу.
 */
object NookAlarms {
    private const val TAG = "NookReminder"
    private const val PREFS = "nook_alarms"
    private const val SCHEDULED = "scheduled"
    private const val DELIVERED = "delivered"

    const val ACTION_FIRE = "com.volgin.nook.REMINDER"
    const val EXTRA_KEY = "key"
    const val EXTRA_TEXT = "text"

    /**
     * Ключ — задача вместе со временем. Перенесённое напоминание получает новый
     * ключ и потому считается новым: отметка о доставке старого его не глушит.
     */
    private fun keyOf(id: String, at: Long): String = "$id@$at"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /**
     * Приводит будильники в соответствие с данными: заводит новые, снимает
     * отменённые. Зовётся при запуске, при каждой записи в файл и после
     * перезагрузки телефона.
     */
    fun reschedule(context: Context) {
        val app = context.applicationContext
        val manager = app.getSystemService(AlarmManager::class.java) ?: return
        val store = prefs(app)

        val delivered = HashSet(store.getStringSet(DELIVERED, emptySet()) ?: emptySet())
        val previous = HashSet(store.getStringSet(SCHEDULED, emptySet()) ?: emptySet())

        val live = HashSet<String>()
        for (reminder in NookData.reminders(app)) {
            val key = keyOf(reminder.id, reminder.at)
            live.add(key)
            // Уже показывали — второй раз не надо. Приложение снимет отметку,
            // когда узнает о срабатывании и уберёт напоминание из данных.
            if (key in delivered) continue
            set(app, manager, key, reminder.title, reminder.at)
        }

        for (stale in previous - live) cancel(app, manager, stale)

        // Отметки нужны ровно столько, сколько напоминание живёт в данных.
        delivered.retainAll(live)

        store.edit()
            .putStringSet(SCHEDULED, live)
            .putStringSet(DELIVERED, delivered)
            .apply()
    }

    /** Записывает, что напоминание доставлено, чтобы оно не всплыло повторно. */
    fun markDelivered(context: Context, key: String) {
        val store = prefs(context.applicationContext)
        val delivered = HashSet(store.getStringSet(DELIVERED, emptySet()) ?: emptySet())
        delivered.add(key)
        store.edit().putStringSet(DELIVERED, delivered).apply()
    }

    private fun intentFor(context: Context, key: String, text: String): Intent =
        Intent(context, NookReminderReceiver::class.java).apply {
            action = ACTION_FIRE
            putExtra(EXTRA_KEY, key)
            putExtra(EXTRA_TEXT, text)
            // Различает будильники между собой. Extras в это сравнение не
            // входят, поэтому без своего data система считала бы все
            // напоминания одним и тем же и держала бы только последнее.
            data = Uri.parse("nook://reminder/${Uri.encode(key)}")
        }

    private fun set(
        context: Context,
        manager: AlarmManager,
        key: String,
        text: String,
        at: Long,
    ) {
        val pending = PendingIntent.getBroadcast(
            context,
            key.hashCode(),
            intentFor(context, key, text),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Время в прошлом система отдаёт сразу — и это правильно: напоминание,
        // пропущенное при выключенном телефоне, всплывёт при включении.
        try {
            if (canBeExact(manager)) {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
            } else {
                // Точность запрещена настройками — сработает с задержкой, но
                // сработает. Промолчать здесь было бы хуже.
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "точный будильник запрещён: ${e.message}")
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
        }
    }

    private fun canBeExact(manager: AlarmManager): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()

    private fun cancel(context: Context, manager: AlarmManager, key: String) {
        val pending = PendingIntent.getBroadcast(
            context,
            key.hashCode(),
            intentFor(context, key, ""),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        ) ?: return
        manager.cancel(pending)
        pending.cancel()
    }
}
