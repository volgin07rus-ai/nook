package com.volgin.nook

import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StyleSpan
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService

/** Сорок две клетки месяца для сетки виджета-календаря. */
class NookCalendarWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        NookCalendarGridFactory(applicationContext)
}

private class NookCalendarGridFactory(private val context: Context) :
    RemoteViewsService.RemoteViewsFactory {

    private var cells: List<NookData.DayCell> = emptyList()

    override fun onCreate() {}

    override fun onDataSetChanged() {
        cells = NookData.monthCells(context)
    }

    override fun onDestroy() {
        cells = emptyList()
    }

    override fun getCount(): Int = cells.size

    private val dotIds = intArrayOf(R.id.nook_cell_dot1, R.id.nook_cell_dot2, R.id.nook_cell_dot3)

    override fun getViewAt(position: Int): RemoteViews {
        val cell = cells[position]
        val row = RemoteViews(context.packageName, R.layout.nook_calendar_cell)
        row.setOnClickFillInIntent(R.id.nook_cell_root, Intent())

        // Хвосты соседних месяцев не рисуются вовсе. Сетка всегда шесть
        // недель, и серые числа чужого месяца по краям делали её пёстрой;
        // пустые клетки читаются спокойнее, а где кончается месяц — и так ясно.
        if (!cell.inMonth) {
            row.setViewVisibility(R.id.nook_cell_day, View.INVISIBLE)
            row.setViewVisibility(R.id.nook_cell_today, View.INVISIBLE)
            for (id in dotIds) row.setViewVisibility(id, View.GONE)
            return row
        }

        // Жирным помечен сегодняшний день. Через span, а не setTypeface:
        // RemoteViews вызывает методы по имени и через отражение, а метода
        // setTypeface(Int) у TextView нет — упало бы на устройстве, не здесь.
        val text: CharSequence = if (cell.today) {
            SpannableString(cell.day.toString()).apply {
                setSpan(StyleSpan(Typeface.BOLD), 0, length, Spanned.SPAN_INCLUSIVE_EXCLUSIVE)
            }
        } else {
            cell.day.toString()
        }
        row.setViewVisibility(R.id.nook_cell_day, View.VISIBLE)
        row.setTextViewText(R.id.nook_cell_day, text)

        // Сегодня — число цветом подложки на кружке цвета текста. Выходные
        // чуть тише будней, как в календаре внутри приложения.
        row.setViewVisibility(R.id.nook_cell_today, if (cell.today) View.VISIBLE else View.INVISIBLE)
        val color = when {
            cell.today -> R.color.nook_widget_bg
            cell.weekend -> R.color.nook_widget_fg_2
            else -> R.color.nook_widget_fg
        }
        row.setTextColor(R.id.nook_cell_day, context.getColor(color))

        // День без дел остаётся просто числом — ради этого всё и затевалось.
        for ((index, id) in dotIds.withIndex()) {
            if (index >= cell.dots.size) {
                row.setViewVisibility(id, View.GONE)
                continue
            }
            row.setViewVisibility(id, View.VISIBLE)
            row.setInt(
                id,
                "setColorFilter",
                cell.dots[index] ?: context.getColor(R.color.nook_widget_control),
            )
        }

        return row
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = true
}
