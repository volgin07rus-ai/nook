package com.volgin.nook

import android.content.Context
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File

/**
 * Обновление виджетов и будильников по факту записи данных.
 *
 * Виджет и приложение — разные процессы, и сам виджет об изменении не узнаёт.
 * Раньше приложение сообщало ему один раз, уходя в фон, и этого не хватало:
 * запись отложена на доли секунды после набора, так что уход с экрана её
 * обгонял. Виджет успевал перечитать ещё старый файл, а второго повода
 * обновиться у него уже не было — и он оставался со вчерашним списком, пока его
 * не снимут с экрана и не поставят заново.
 *
 * Здесь наблюдение идёт за самим файлом: любая запись, чья угодно и когда
 * угодно, доходит до виджетов сама. А пока приложение не запущено, писать в файл
 * некому, так что пропустить нечего.
 */
object NookWatcher {
    private const val TAG = "NookWidget"
    private const val FILE = "nook.json"

    /**
     * Одна запись — это несколько событий подряд, и хранилище пишет через
     * временный файл с переименованием. Пауза склеивает их в одно обновление и
     * заодно даёт записи закончиться, чтобы виджет не прочитал половину файла.
     */
    private const val SETTLE_MS = 350L

    private val handler = Handler(Looper.getMainLooper())
    private val observers = ArrayList<FileObserver>()
    private var pending: Runnable? = null

    /**
     * Начинает следить. Зовётся из [MainActivity] и не останавливается: наблюдать
     * надо и после ухода приложения с экрана — именно там садится отложенная
     * запись, из-за которой всё и затевалось. Процесс умрёт — умрёт и наблюдение,
     * но тогда и писать в файл будет некому.
     */
    fun start(context: Context) {
        if (observers.isNotEmpty()) return
        val app = context.applicationContext

        // Те же две папки, в которых NookData ищет файл.
        for (dir in listOfNotNull(app.dataDir, app.filesDir)) {
            if (!dir.isDirectory) continue
            val observer = watch(app, dir)
            try {
                observer.startWatching()
                observers.add(observer)
            } catch (e: Exception) {
                Log.w(TAG, "не удалось следить за ${dir.absolutePath}: ${e.message}")
            }
        }
    }

    private fun watch(app: Context, dir: File): FileObserver {
        // CLOSE_WRITE, а не MODIFY: он приходит после того, как файл закрыт,
        // то есть дописан целиком. MOVED_TO — на случай записи через временный
        // файл, DELETE — на случай очистки данных.
        val mask = FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO or FileObserver.DELETE

        // Конструктор от File появился только в Android 10, а приложение
        // работает начиная с Android 7, поэтому путь строкой.
        @Suppress("DEPRECATION")
        return object : FileObserver(dir.absolutePath, mask) {
            override fun onEvent(event: Int, path: String?) {
                // Временные файлы хранилища начинаются с того же имени.
                if (path != null && !path.startsWith(FILE)) return
                schedule(app)
            }
        }
    }

    /** Событие приходит на своём потоке, поэтому очередь ведётся на главном. */
    private fun schedule(app: Context) {
        handler.post {
            pending?.let { handler.removeCallbacks(it) }
            val run = Runnable {
                pending = null
                try {
                    NookBaseWidget.refreshAll(app)
                    // Та же запись могла завести или снять напоминание. Ставить
                    // будильник здесь, а не при закрытии приложения: иначе
                    // напоминание на ближайшие минуты не успело бы попасть в
                    // систему до того, как оно должно сработать.
                    NookAlarms.reschedule(app)
                } catch (e: Exception) {
                    Log.w(TAG, "не удалось обновить виджеты и будильники: ${e.message}")
                }
            }
            pending = run
            handler.postDelayed(run, SETTLE_MS)
        }
    }
}
