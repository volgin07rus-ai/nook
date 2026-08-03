package com.volgin.nook

import android.content.Context

/** Виджет со списком невыполненных задач. Всё общее — в [NookBaseWidget]. */
class NookWidget : NookBaseWidget() {
    override val serviceClass: Class<*> = NookWidgetService::class.java

    override fun label(context: Context, widgetId: Int): String =
        context.getString(R.string.nook_widget_label_short)

    override fun rows(context: Context, widgetId: Int): Int? = NookData.read(context)?.size

    override fun badge(context: Context, widgetId: Int): String {
        val open = NookData.read(context)?.size ?: 0
        return if (open > 0) open.toString() else ""
    }

    override fun emptyText(context: Context): String = context.getString(R.string.nook_widget_empty)
}
