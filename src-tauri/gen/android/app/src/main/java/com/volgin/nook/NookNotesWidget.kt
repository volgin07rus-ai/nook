package com.volgin.nook

import android.content.Context

/**
 * Виджет с одной запиской — той, что выбрали при добавлении.
 *
 * Именно одной, а не списком: записку кладут на экран, чтобы видеть её текст,
 * а не чтобы открыть приложение и там её искать. Каждый виджет помнит свой
 * выбор, так что записок на экране может быть несколько.
 */
class NookNotesWidget : NookBaseWidget() {
    override val serviceClass: Class<*> = NookNotesWidgetService::class.java

    override fun label(context: Context, widgetId: Int): String =
        content(context, widgetId)?.title ?: context.getString(R.string.nook_notes_label_short)

    /**
     * null и 0 значат разное, и сообщения на экране у них разные: null — файла
     * нет, приложение ни разу не открывали; 0 — записка выбрана, но её больше
     * нет или в ней пусто.
     */
    override fun rows(context: Context, widgetId: Int): Int? {
        if (NookData.notes(context) == null) return null
        return content(context, widgetId)?.lines?.size ?: 0
    }

    override fun emptyText(context: Context): String = context.getString(R.string.nook_notes_gone)

    private fun content(context: Context, widgetId: Int): NookData.NoteContent? {
        val noteId = NookWidgetPrefs.noteId(context, widgetId) ?: return null
        return NookData.noteContent(context, noteId)
    }

    /** Виджет сняли с экрана — забываем, какую записку он показывал. */
    override fun onDeleted(context: Context, widgetIds: IntArray) {
        NookWidgetPrefs.forget(context, widgetIds)
        super.onDeleted(context, widgetIds)
    }
}
