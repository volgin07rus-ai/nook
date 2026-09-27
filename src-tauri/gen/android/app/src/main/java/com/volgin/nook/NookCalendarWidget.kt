package com.volgin.nook

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * Виджет-календарь: текущий месяц целиком.
 *
 * Это календарь в первую очередь и список дел во вторую. Пустой месяц выглядит
 * ровно как настенный календарь — числа и всё; там, где что-то назначено, под
 * числом появляется точка цвета категории. Так на виджет можно смотреть даже
 * когда дел нет, и он остаётся полезным.
 *
 * Общий с остальными виджетами каркас тут не подходит: у тех список строк, а
 * здесь сетка семь на шесть, и рисуется она своей разметкой.
 */
class NookCalendarWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
        for (id in widgetIds) render(context, manager, id)
    }

    private fun render(context: Context, manager: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.nook_calendar_widget)

        views.setTextViewText(R.id.nook_cal_month, NookData.monthLabel())

        // Прозрачность — из той же настройки, что у остальных виджетов.
        val opacity = NookData.snapshot(context).opacity
        views.setInt(R.id.nook_widget_bg, "setImageAlpha", (opacity * 255).toInt())

        val service = Intent(context, NookCalendarWidgetService::class.java)
        service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
        service.data = Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME))
        @Suppress("DEPRECATION")
        views.setRemoteAdapter(R.id.nook_cal_grid, service)

        views.setPendingIntentTemplate(R.id.nook_cal_grid, openApp(context))
        views.setOnClickPendingIntent(R.id.nook_widget_header, openApp(context))

        manager.updateAppWidget(widgetId, views)
        manager.notifyAppWidgetViewDataChanged(widgetId, R.id.nook_cal_grid)
    }

    private fun openApp(context: Context): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        /** Перерисовать все размещённые календари. Зовётся из [NookBaseWidget]. */
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, NookCalendarWidget::class.java))
            if (ids.isEmpty()) return
            context.sendBroadcast(
                Intent(context, NookCalendarWidget::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                },
            )
        }
    }
}
