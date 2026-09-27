@echo off
chcp 65001 >nul
setlocal

rem ---------------------------------------------------------------------------
rem  Сборка Android-версии Nook.
rem
rem  Все инструменты берутся из папки "Инструменты" двумя уровнями выше этого
rem  файла (Claude  code\Инструменты). Путь относительный, поэтому переезд всей
rem  папки целиком сборку не ломает. В систему ничего не прописано, поэтому
rem  переменные задаются здесь.
rem
rem  ВНИМАНИЕ: в src-tauri\gen\android лежит написанный вручную код виджета
rem  (NookWidget.kt, NookData.kt, NookWidgetService.kt, разметка nook_widget*,
rem  строки и цвета, записи в AndroidManifest.xml). Команда "tauri android init"
rem  пересоздаёт эту папку и всё перечисленное сотрёт. Запускать её повторно
rem  можно только сделав копию этих файлов.
rem
rem  Почему сборка идёт в обход "tauri android build": та команда создаёт
rem  символическую ссылку на собранную библиотеку, а Windows без режима
rem  разработчика этого не разрешает. Здесь библиотека просто копируется.
rem  Из-за этого линкер для Android приходится указывать вручную — обычно это
rem  делает за нас сама tauri.
rem ---------------------------------------------------------------------------

for %%I in ("%~dp0..\..\Инструменты") do set "TOOLS=%%~fI"
set "NDK=%TOOLS%\android-sdk\ndk\27.3.13750724"
set "NDKBIN=%NDK%\toolchains\llvm\prebuilt\windows-x86_64\bin"

set "RUSTUP_HOME=%TOOLS%\rust\rustup"
set "CARGO_HOME=%TOOLS%\rust\cargo"
set "JAVA_HOME=%TOOLS%\jdk-17"
set "ANDROID_HOME=%TOOLS%\android-sdk"
set "NDK_HOME=%NDK%"
set "GRADLE_USER_HOME=%TOOLS%\gradle"
set "PATH=%CARGO_HOME%\bin;%PATH%"

rem 24 — минимальная версия Android, которую поддерживает приложение.
set "CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER=%NDKBIN%\aarch64-linux-android24-clang.cmd"
set "CC_aarch64_linux_android=%NDKBIN%\aarch64-linux-android24-clang.cmd"
set "AR_aarch64_linux_android=%NDKBIN%\llvm-ar.exe"

rem Где лежит Android-проект. По этой переменной сборка Rust заново пишет
rem gen\android\tauri.settings.gradle — файл с абсолютными путями к библиотекам
rem Tauri внутри папки с инструментами. Без неё файл остаётся старым, и после
rem переезда папки gradle ищет библиотеки там, где их уже нет.
set "TAURI_ANDROID_PROJECT_PATH=%~dp0src-tauri\gen\android"

cd /d "%~dp0"

rem Обновить дату у tauri.conf.json: cargo перезапускает генератор gradle-файлов
rem только когда что-то из его входов изменилось, а смена переменной окружения
rem входом не считается. Файл не меняется, меняется только дата.
copy /b "src-tauri\tauri.conf.json"+,, "src-tauri\tauri.conf.json" >nul

set "APK=src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk"

echo.
echo [1/4] Интерфейс
call npm run build || goto :fail

echo.
echo [2/4] Rust под Android (arm64, релиз)
rem --features tauri/custom-protocol обязателен. Без него Tauri считает сборку
rem отладочной и вместо встроенного интерфейса открывает http://localhost:1420,
rem то есть на телефоне будет пустой экран с ошибкой. Обычно этот флаг
rem подставляет "tauri build", а мы её обходим.
cargo build --manifest-path "src-tauri\Cargo.toml" --target aarch64-linux-android --release --features tauri/custom-protocol || goto :fail

echo.
echo [3/4] Копирование библиотеки
set "JNI=src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
if not exist "%JNI%" mkdir "%JNI%"
copy /y "src-tauri\target\aarch64-linux-android\release\libnook_lib.so" "%JNI%\libnook_lib.so" >nul || goto :fail

echo.
echo [4/4] Сборка apk
rem Старый файл удаляется намеренно: упаковщик дописывает в существующий apk,
rem не обрезая его, и от прошлой сборки остаётся мёртвый хвост. Один раз это
rem дало 138 МБ вместо 12.
if exist "%APK%" del /q "%APK%"
pushd "src-tauri\gen\android"
call gradlew.bat assembleArm64Debug -x rustBuildArm64Debug --console=plain || (popd & goto :fail)
popd

echo.
echo Готово:
echo   %APK%
for %%F in ("%APK%") do echo   размер: %%~zF байт
echo.
echo Установить на подключённый телефон:
echo   "%ANDROID_HOME%\platform-tools\adb.exe" install -r "%APK%"
goto :end

:fail
echo.
echo Сборка не удалась. Смотри сообщение выше.

:end
echo.
pause
