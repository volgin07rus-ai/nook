package com.volgin.nook

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService

/**
 * Поставщик строк для списка внутри виджета. ListView в виджете не умеет
 * работать с обычным адаптером — данные ему подаёт вот такая служба.
 */
class NookWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        NookWidgetFactory(applicationContext)
}

private class NookWidgetFactory(private val context: Context) :
    RemoteViewsService.RemoteViewsFactory {

    private var items: List<NookData.Item> = emptyList()

    override fun onCreate() {}

    /** Вызывается системой на каждом обновлении: здесь перечитывается файл. */
    override fun onDataSetChanged() {
        items = NookData.read(context) ?: emptyList()
    }

    override fun onDestroy() {
        items = emptyList()
    }

    override fun getCount(): Int = items.size

    override fun getViewAt(position: Int): RemoteViews {
        val item = items[position]
        val row = RemoteViews(context.packageName, R.layout.nook_widget_row)

        row.setTextViewText(R.id.nook_row_title, item.title)

        if (item.meta.isEmpty()) {
            row.setViewVisibility(R.id.nook_row_meta, android.view.View.GONE)
        } else {
            row.setViewVisibility(R.id.nook_row_meta, android.view.View.VISIBLE)
            row.setTextViewText(R.id.nook_row_meta, item.meta)
            row.setTextColor(
                R.id.nook_row_meta,
                context.getColor(
                    if (item.overdue) R.color.nook_widget_danger else R.color.nook_widget_fg_3,
                ),
            )
        }

        // Заполняет шаблон, который виджет назначил на список: тап по строке
        // открывает приложение.
        row.setOnClickFillInIntent(R.id.nook_row_title, Intent())
        return row
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = false
}
