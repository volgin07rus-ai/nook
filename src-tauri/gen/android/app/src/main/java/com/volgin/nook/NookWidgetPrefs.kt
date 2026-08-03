package com.volgin.nook

import android.content.Context

/**
 * Какую записку показывает каждый виджет блокнота.
 *
 * Хранится отдельно от данных приложения намеренно: это настройка виджета, а
 * не содержимое, и писать её в общий файл значило бы дать виджету право на
 * запись туда — ровно то, чего мы избегаем.
 */
object NookWidgetPrefs {
    private const val FILE = "nook_widget_prefs"
    private const val NOTE = "note_"

    /**
     * Не идентификатор записки, а правило: показывать ту, которую правили
     * последней. Виджет, привязанный к конкретной записке, новых не увидит
     * никогда — это по замыслу, но чаще на экран кладут «то, чем занят сейчас»,
     * и для этого нужен именно такой выбор. Собака в начале — чтобы значение
     * нельзя было спутать с настоящим id.
     */
    const val LATEST = "@latest"

    private fun prefs(context: Context) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun noteId(context: Context, widgetId: Int): String? =
        prefs(context).getString(NOTE + widgetId, null)

    fun setNoteId(context: Context, widgetId: Int, noteId: String) {
        prefs(context).edit().putString(NOTE + widgetId, noteId).apply()
    }

    /** Виджет сняли с экрана — его выбор больше не нужен. */
    fun forget(context: Context, widgetIds: IntArray) {
        val editor = prefs(context).edit()
        for (id in widgetIds) editor.remove(NOTE + id)
        editor.apply()
    }
}
