package com.volgin.nook

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Calendar

/**
 * Чтение задач для виджета.
 *
 * Виджет живёт в том же приложении, что и Nook, поэтому просто читает тот же
 * файл. Пишет в него только приложение — виджет ничего не меняет, и это
 * снимает весь вопрос о том, кто кого затрёт.
 *
 * Путь: tauri отдаёт app_data_dir как context.dataDir, а хранилище лежит там
 * под именем nook.json и держит данные под ключом "data".
 */
object NookData {
    private const val TAG = "NookWidget"
    private const val FILE = "nook.json"
    private const val KEY = "data"
    /** Совпадает с defaultSettings() в приложении. */
    private const val DEFAULT_OPACITY = 0.35f

    /** Задача в том виде, в каком её показывает виджет. */
    data class Item(val title: String, val meta: String, val overdue: Boolean)

    /**
     * Всё, что виджет берёт из файла за одно чтение.
     *
     * items == null означает, что файла ещё нет: приложение ни разу не
     * открывали. Пустой список — что задач действительно нет, и это разные
     * сообщения на экране.
     */
    data class Snapshot(val items: List<Item>?, val opacity: Float)

    /**
     * Где лежит файл: tauri отдаёт app_data_dir как context.dataDir, туда и
     * пишет хранилище. filesDir проверяется вторым — это соседняя папка внутри
     * того же dataDir, и если поведение tauri когда-нибудь изменится, виджет
     * не ослепнет молча.
     */
    private fun storeFile(context: Context): File? =
        listOf(File(context.dataDir, FILE), File(context.filesDir, FILE))
            .firstOrNull { it.exists() }

    /** Список задач, или null, если читать пока нечего. */
    fun read(context: Context, limit: Int = 50): List<Item>? = snapshot(context, limit).items

    fun snapshot(context: Context, limit: Int = 50): Snapshot {
        val file = storeFile(context) ?: return Snapshot(null, DEFAULT_OPACITY)

        val root = try {
            JSONObject(file.readText())
        } catch (e: Exception) {
            // Файл могли застать на середине записи. Показать «нет данных»
            // честнее, чем упасть: следующее обновление всё поправит.
            Log.w(TAG, "не удалось прочитать $FILE: ${e.message}")
            return Snapshot(null, DEFAULT_OPACITY)
        }

        val data = root.optJSONObject(KEY) ?: return Snapshot(null, DEFAULT_OPACITY)

        // Та же настройка, что двигает ползунок у виджета на компьютере.
        val opacity = data.optJSONObject("settings")
            ?.optDouble("widgetOpacity", DEFAULT_OPACITY.toDouble())
            ?.toFloat()
            ?.coerceIn(0.1f, 1f)
            ?: DEFAULT_OPACITY

        val tasks = data.optJSONArray("tasks") ?: return Snapshot(emptyList(), opacity)
        val today = todayKey()

        val items = ArrayList<Item>()
        for (i in 0 until tasks.length()) {
            val task = tasks.optJSONObject(i) ?: continue
            if (task.optBoolean("done", false)) continue

            val title = task.optString("title", "").trim()
            if (title.isEmpty()) continue

            val due = task.optString("due", "").takeIf { it.isNotEmpty() && it != "null" }
            val overdue = due != null && due < today

            items.add(Item(title = title, meta = dueLabel(due, today), overdue = overdue))
        }

        // Тот же порядок, что в приложении при сортировке «сначала срочные»:
        // просроченное, потом ближайшее по сроку, потом бессрочное.
        items.sortWith(compareBy({ !it.overdue }, { it.meta.isEmpty() }))
        return Snapshot(if (items.size > limit) items.subList(0, limit) else items, opacity)
    }

    /** Напоминание, которое надо поставить на будильник. */
    data class Reminder(val id: String, val title: String, val at: Long)

    /**
     * Напоминания, которым ещё предстоит сработать.
     *
     * Отсеиваются те же три случая, что и в приложении: задача выполнена,
     * напоминание уже доставлено, времени не выставлено. `reminded` ставит
     * приложение, когда узнаёт о срабатывании, — так задача, о которой уже
     * напомнили, не попадёт на будильник повторно.
     */
    fun reminders(context: Context): List<Reminder> {
        val file = storeFile(context) ?: return emptyList()
        val data = try {
            JSONObject(file.readText()).optJSONObject(KEY)
        } catch (e: Exception) {
            Log.w(TAG, "не удалось прочитать $FILE: ${e.message}")
            null
        } ?: return emptyList()

        val tasks = data.optJSONArray("tasks") ?: return emptyList()
        val out = ArrayList<Reminder>()
        for (i in 0 until tasks.length()) {
            val task = tasks.optJSONObject(i) ?: continue
            if (task.optBoolean("done", false)) continue
            if (task.optBoolean("reminded", false)) continue

            val at = task.optLong("remindAt", 0L)
            if (at <= 0L) continue

            val id = task.optString("id", "")
            val title = task.optString("title", "").trim()
            if (id.isEmpty() || title.isEmpty()) continue

            out.add(Reminder(id, title, at))
        }
        return out
    }

    /** Записка в списке выбора: заголовок, дата и чем её потом найти. */
    data class NoteItem(val id: String, val title: String, val date: String)

    /** Из чего состоит строка записки на экране виджета. */
    enum class LineKind { HEADING, TEXT, BULLET, TODO }

    data class Line(val text: String, val kind: LineKind, val done: Boolean)

    data class NoteContent(val title: String, val lines: List<Line>)

    /**
     * Содержимое одной записки, разобранное на строки.
     *
     * Виджету не нужен разбор разметки как таковой — ему нужно знать, что
     * рисовать слева от строки: ничего, точку или кружок, и зачёркивать ли
     * текст. Поэтому здесь не парсер, а извлечение этих трёх признаков.
     */
    fun noteContent(context: Context, noteId: String): NoteContent? {
        val file = storeFile(context) ?: return null
        val data = try {
            JSONObject(file.readText()).optJSONObject(KEY)
        } catch (e: Exception) {
            Log.w(TAG, "не удалось прочитать $FILE: ${e.message}")
            null
        } ?: return null

        val notes = data.optJSONArray("notes") ?: return null

        val chosen = if (noteId == NookWidgetPrefs.LATEST) latest(notes) else byId(notes, noteId)
        val note = chosen ?: return null
        return NoteContent(title = noteTitle(note), lines = parseLines(note.optString("body", "")))
    }

    private fun byId(notes: JSONArray, noteId: String): JSONObject? {
        for (i in 0 until notes.length()) {
            val note = notes.optJSONObject(i) ?: continue
            if (note.optString("id") == noteId) return note
        }
        return null
    }

    /** Самая свежая по времени правки — то же, что показывает список в приложении. */
    private fun latest(notes: JSONArray): JSONObject? {
        var best: JSONObject? = null
        for (i in 0 until notes.length()) {
            val note = notes.optJSONObject(i) ?: continue
            val current = best
            if (current == null || note.optLong("updatedAt", 0L) > current.optLong("updatedAt", 0L)) {
                best = note
            }
        }
        return best
    }

    private val TODO_LIST = Regex("(?is)<ul class=\"todo\">(.*?)</ul>")
    private val BLOCK = Regex("(?is)<(p|h2|li)\\b([^>]*)>(.*?)</\\1>")

    private fun parseLines(html: String): List<Line> {
        // Пометить строки списков с галочками, пока видно, какому списку они
        // принадлежат: дальше разбор идёт поблочно и это уже не восстановить.
        val marked = TODO_LIST.replace(html) { m ->
            m.groupValues[1].replace(Regex("(?i)<li\\b"), "<li data-todo=\"1\"")
        }

        val lines = ArrayList<Line>()
        for (m in BLOCK.findAll(marked)) {
            val tag = m.groupValues[1].lowercase()
            val attrs = m.groupValues[2]
            val text = stripTags(m.groupValues[3]).trim()
            if (text.isEmpty()) continue

            val kind = when {
                tag == "h2" -> LineKind.HEADING
                tag == "li" && attrs.contains("data-todo") -> LineKind.TODO
                tag == "li" -> LineKind.BULLET
                else -> LineKind.TEXT
            }
            lines.add(Line(text, kind, attrs.contains("data-done=\"1\"")))
        }
        return lines
    }

    private fun stripTags(html: String): String = html
        .replace(Regex("(?i)<br\\s*/?>"), " ")
        .replace(Regex("<[^>]*>"), "")
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")

    fun notes(context: Context, limit: Int = 50): List<NoteItem>? {
        val file = storeFile(context) ?: return null

        val data = try {
            JSONObject(file.readText()).optJSONObject(KEY)
        } catch (e: Exception) {
            Log.w(TAG, "не удалось прочитать $FILE: ${e.message}")
            null
        } ?: return null

        val notes = data.optJSONArray("notes") ?: return emptyList()
        val items = ArrayList<NoteItem>()
        for (i in 0 until notes.length()) {
            val note = notes.optJSONObject(i) ?: continue
            items.add(
                NoteItem(
                    id = note.optString("id", ""),
                    title = noteTitle(note),
                    date = pastLabel(note.optLong("updatedAt", 0L)),
                ),
            )
            if (items.size >= limit) break
        }
        return items
    }

    /**
     * Имя записки: своё, если его вписали, иначе первая строка текста. Ровно то
     * же правило, что у noteTitle() в приложении — иначе виджет подписывал бы
     * записку не так, как она называется в списке.
     */
    private fun noteTitle(note: JSONObject): String {
        val named = note.optString("title", "").trim()
        if (named.isNotEmpty() && named != "null") return named.take(80)
        return firstLine(note.optString("body", ""))
    }

    /**
     * Первая непустая строка текста. Тело хранится размеченным, поэтому теги
     * здесь снимаются: разбирать разметку виджету незачем, ему нужна строка.
     */
    private fun firstLine(html: String): String {
        val text = html
            .replace(Regex("(?i)<br\\s*/?>"), "\n")
            .replace(Regex("(?i)</(p|div|h2|li|ul|ol)>"), "\n")
            .replace(Regex("<[^>]*>"), "")
            .replace("&nbsp;", " ")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&amp;", "&")

        val line = text.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() }
        return if (line.isNullOrEmpty()) "Без названия" else line.take(80)
    }

    /** Сегодня / Вчера / дата — то же, что в списке записок в приложении. */
    private fun pastLabel(ms: Long): String {
        if (ms <= 0L) return ""
        val then = Calendar.getInstance().apply { timeInMillis = ms }
        val key = "%04d-%02d-%02d".format(
            then.get(Calendar.YEAR),
            then.get(Calendar.MONTH) + 1,
            then.get(Calendar.DAY_OF_MONTH),
        )
        return when (key) {
            todayKey() -> "Сегодня"
            shiftDays(-1) -> "Вчера"
            else -> "%02d.%02d.%04d".format(
                then.get(Calendar.DAY_OF_MONTH),
                then.get(Calendar.MONTH) + 1,
                then.get(Calendar.YEAR),
            )
        }
    }

    private fun dueLabel(due: String?, today: String): String {
        if (due == null) return ""
        if (due == today) return "Сегодня"
        if (due == shiftDays(1)) return "Завтра"
        if (due == shiftDays(-1)) return "Вчера"
        // 'YYYY-MM-DD' -> 'DD.MM'
        val parts = due.split("-")
        return if (parts.size == 3) "${parts[2]}.${parts[1]}" else due
    }

    private fun todayKey(): String = shiftDays(0)

    private fun shiftDays(days: Int): String {
        val c = Calendar.getInstance()
        c.add(Calendar.DAY_OF_YEAR, days)
        return "%04d-%02d-%02d".format(
            c.get(Calendar.YEAR),
            c.get(Calendar.MONTH) + 1,
            c.get(Calendar.DAY_OF_MONTH),
        )
    }
}
