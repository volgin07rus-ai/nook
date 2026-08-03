package com.volgin.nook

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts

class MainActivity : TauriActivity() {

  /**
   * Разрешение на уведомления.
   *
   * Спрашивать обязательно: с Android 13 объявления в манифесте мало, а без
   * выданного разрешения система выбрасывает каждое уведомление молча — приложение
   * при этом считает, что всё показано, и ошибки не видит никто.
   *
   * Регистрация только здесь, полем: позже, из onCreate, Android её уже не примет.
   */
  private val askNotifications =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      // Отказ — это ответ, а не сбой. Напоминания останутся в списке задач,
      // просто не всплывут; включить можно в настройках телефона.
      if (granted) NookAlarms.reschedule(this)
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    NookNotifications.ensureChannel(this)
    requestNotifications()

    // Виджеты обновляются сами, по каждой записи в файл данных.
    NookWatcher.start(this)
    // И там же переставляются будильники: новое напоминание попадает в систему
    // сразу, а не ждёт, пока приложение закроют.
    NookAlarms.reschedule(this)
  }

  private fun requestNotifications() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val granted = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED
    if (granted) return
    askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
  }

  /**
   * Ещё одно обновление на уходе с экрана. Наблюдатель делает это и без него,
   * но он начинает работать только с запуском приложения, а файл могли успеть
   * изменить до того.
   */
  override fun onStop() {
    super.onStop()
    NookBaseWidget.refreshAll(this)
    NookAlarms.reschedule(this)
  }
}
