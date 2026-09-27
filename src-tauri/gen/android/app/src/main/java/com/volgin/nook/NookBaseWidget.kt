package com.volgin.nook

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews

/**
 * Общая часть двух виджетов: задач и блокнота.
 *
 * Отличаются они только тем, откуда берут строки, — рамка, логотип, счётчик,
 * прозрачность и переход в приложение у них одни и те же.
 *
 * Оба только показывают. Отметить или отредактировать отсюда нельзя намеренно:
 * виджет и приложение — разные процессы, и если оба начнут писать в один файл,
 * они затрут правки друг друга. Читать одновременно безопасно.
 *
 * Обновляются не по таймеру, а по факту: приложение зовёт [refreshAll], уходя
 * в фон, то есть ровно тогда, когда список мог измениться.
 */
abstract class NookBaseWidget : AppWidgetProvider() {

    /** Служба, которая подаёт строки в список. */
    protected abstract val serviceClass: Class<*>

    /** Подпись рядом с логотипом: виджета два, и на экране они одинаковые. */
    protected abstract fun label(context: Context, widgetId: Int): String

    /** Сколько строк покажет список; null — показывать нечего. */
    protected abstract fun rows(context: Context, widgetId: Int): Int?

    /** Число в правом углу шапки, или пусто. */
    protected open fun badge(context: Context, widgetId: Int): String = ""

    /** Что написать, когда данные есть, но список пуст. */
    protected abstract fun emptyText(context: Context): String

    override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
        for (id in widgetIds) render(context, manager, id)
    }

    private fun render(context: Context, manager: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.nook_widget)

        val total = rows(context, widgetId)

        views.setTextViewText(R.id.nook_widget_label, label(context, widgetId))
        views.setTextViewText(R.id.nook_widget_count, badge(context, widgetId))

        // Прозрачность подложки берётся из той же настройки, что двигает
        // ползунок у виджета на компьютере. Менять альфу можно только у
        // картинки, поэтому фон и лежит отдельным слоем.
        val opacity = NookData.snapshot(context).opacity
        views.setInt(R.id.nook_widget_bg, "setImageAlpha", (opacity * 255).toInt())

        if (total == null || total == 0) {
            views.setViewVisibility(R.id.nook_widget_list, View.GONE)
            views.setViewVisibility(R.id.nook_widget_empty, View.VISIBLE)
            views.setTextViewText(
                R.id.nook_widget_empty,
                if (total == null) context.getString(R.string.nook_widget_no_data)
                else emptyText(context),
            )
        } else {
            views.setViewVisibility(R.id.nook_widget_empty, View.GONE)
            views.setViewVisibility(R.id.nook_widget_list, View.VISIBLE)

            val service = Intent(context, serviceClass)
            service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            // Без своего data система переиспользует фабрику соседнего
            // экземпляра виджета и покажет в нём чужой список. Сам intent,
            // свёрнутый в строку, и даёт нужную уникальность.
            service.data = Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME))
            // Помечен устаревшим с Android 12 в пользу RemoteCollectionItems,
            // но тот требует API 31, а приложение работает с Android 7.
            @Suppress("DEPRECATION")
            views.setRemoteAdapter(R.id.nook_widget_list, service)
        }

        // Один шаблон на весь список: строки подставляют в него свой intent.
        views.setPendingIntentTemplate(R.id.nook_widget_list, openApp(context))
        views.setOnClickPendingIntent(R.id.nook_widget_header, openApp(context))

        manager.updateAppWidget(widgetId, views)
        manager.notifyAppWidgetViewDataChanged(widgetId, R.id.nook_widget_list)
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
        /**
         * Перерисовать все размещённые виджеты обоих видов. Зовётся из
         * приложения, когда оно уходит в фон: до этого момента виджетов на
         * экране всё равно не видно, а после — они уже показывают свежее.
         */
        fun refreshAll(context: Context) {
            // Календарь живёт своей разметкой и обновляется сам.
            NookCalendarWidget.refresh(context)

            val kinds = listOf(NookWidget::class.java, NookNotesWidget::class.java)
            for (widget in kinds) {
                val manager = AppWidgetManager.getInstance(context)
                val ids = manager.getAppWidgetIds(ComponentName(context, widget))
                if (ids.isEmpty()) continue

                context.sendBroadcast(
                    Intent(context, widget).apply {
                        action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                    },
                )
            }
        }
    }
}
