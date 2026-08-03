package com.volgin.nook

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.ListView
import android.widget.TextView

/**
 * Спрашивает, какую записку показывать, когда виджет блокнота кладут на экран.
 *
 * Каждый виджет держит свой выбор, поэтому записок на главном экране может
 * быть сколько угодно — по одной на виджет.
 *
 * Результат обязателен: пока не вернём RESULT_OK с идентификатором виджета,
 * система считает, что настройка не завершилась, и виджет не появится. Уход
 * назад — это отказ, и он тоже должен быть корректным, отсюда RESULT_CANCELED
 * с самого начала.
 */
class NookNotesConfigActivity : Activity() {

    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        widgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))

        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        setContentView(R.layout.nook_notes_config)

        val notes = NookData.notes(this) ?: emptyList()
        val empty = findViewById<TextView>(R.id.nook_config_empty)
        val list = findViewById<ListView>(R.id.nook_config_list)

        if (notes.isEmpty()) {
            list.visibility = View.GONE
            empty.visibility = View.VISIBLE
            empty.setText(R.string.nook_config_empty)
            return
        }

        /*
         * Первым пунктом — правило, а не записка.
         *
         * Виджет, привязанный к конкретной записке, никогда не покажет ту,
         * которую завели после него: он помнит свой выбор. Это верно по замыслу,
         * но чаще на экран кладут не «вот эту записку навсегда», а «то, над чем
         * я сейчас», и для второго нужен именно такой пункт.
         */
        val ids = ArrayList<String>()
        val labels = ArrayList<String>()

        ids.add(NookWidgetPrefs.LATEST)
        labels.add(
            getString(R.string.nook_config_latest) +
                "\n" + getString(R.string.nook_config_latest_hint),
        )
        for (note in notes) {
            ids.add(note.id)
            labels.add("${note.title}\n${note.date}")
        }

        list.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, labels)
        list.onItemClickListener =
            AdapterView.OnItemClickListener { _, _, position, _ -> choose(ids[position]) }
    }

    private fun choose(noteId: String) {
        NookWidgetPrefs.setNoteId(this, widgetId, noteId)

        // Первую отрисовку система сама не запускает: настройка закончилась
        // после того, как виджет уже создан, поэтому рисуем его здесь.
        val manager = AppWidgetManager.getInstance(this)
        NookNotesWidget().onUpdate(this, manager, intArrayOf(widgetId))

        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        finish()
    }
}
