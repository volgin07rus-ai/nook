package com.volgin.nook

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.text.SpannableString
import android.text.style.StrikethroughSpan
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService

/** Подаёт строки выбранной записки в список виджета блокнота. */
class NookNotesWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        val widgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        )
        return NookNotesFactory(applicationContext, widgetId)
    }
}

private class NookNotesFactory(
    private val context: Context,
    private val widgetId: Int,
) : RemoteViewsService.RemoteViewsFactory {

    private var lines: List<NookData.Line> = emptyList()

    override fun onCreate() {}

    /** Вызывается системой на каждом обновлении: здесь перечитывается файл. */
    override fun onDataSetChanged() {
        val noteId = NookWidgetPrefs.noteId(context, widgetId)
        lines = if (noteId == null) emptyList()
        else NookData.noteContent(context, noteId)?.lines ?: emptyList()
    }

    override fun onDestroy() {
        lines = emptyList()
    }

    override fun getCount(): Int = lines.size

    override fun getViewAt(position: Int): RemoteViews {
        val line = lines[position]
        val row = RemoteViews(context.packageName, R.layout.nook_note_line)

        // Маркер слева повторяет то, что видно в приложении: у пункта точка,
        // у галочки кружок, у обычной строки и заголовка — ничего.
        when (line.kind) {
            NookData.LineKind.BULLET -> {
                row.setViewVisibility(R.id.nook_line_marker, View.VISIBLE)
                row.setImageViewResource(R.id.nook_line_marker, R.drawable.nook_widget_dot)
            }
            NookData.LineKind.TODO -> {
                row.setViewVisibility(R.id.nook_line_marker, View.VISIBLE)
                row.setImageViewResource(
                    R.id.nook_line_marker,
                    if (line.done) R.drawable.nook_widget_ring_done else R.drawable.nook_widget_ring,
                )
            }
            else -> row.setViewVisibility(R.id.nook_line_marker, View.INVISIBLE)
        }

        val heading = line.kind == NookData.LineKind.HEADING
        row.setTextViewTextSize(
            R.id.nook_line_text,
            TypedValue.COMPLEX_UNIT_SP,
            if (heading) 16f else 14f,
        )
        row.setTextColor(
            R.id.nook_line_text,
            context.getColor(
                if (line.done) R.color.nook_widget_fg_3 else R.color.nook_widget_fg,
            ),
        )

        // Зачёркивание идёт разметкой самого текста: у RemoteViews нет способа
        // выставить его через свойство, а размеченная строка передаётся как есть.
        if (line.done) {
            val struck = SpannableString(line.text)
            struck.setSpan(StrikethroughSpan(), 0, struck.length, 0)
            row.setTextViewText(R.id.nook_line_text, struck)
        } else {
            row.setTextViewText(R.id.nook_line_text, line.text)
        }

        // Заполняет шаблон, назначенный на список: тап открывает приложение.
        row.setOnClickFillInIntent(R.id.nook_line_text, Intent())
        return row
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = false
}
