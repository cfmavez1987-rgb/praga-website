# Сборка мобильных приложений

## Android

### Требования:
- Android Studio
- Java JDK 8+

### Сборка:
1. Откройте Android Studio
2. File → Open → выберите папку `android/`
3. Дождитесь синхронизации Gradle
4. Скопируйте файлы из `app/` в `android/app/src/main/assets/`:
   ```bash
   cp app/app.html android/app/src/main/assets/
   cp app/manifest.json android/app/src/main/assets/
   cp -r app/images android/app/src/main/assets/
   cp app/sw.js android/app/src/main/assets/
   ```
5. Build → Build Bundle(s) / APK(s) → Build APK(s)
6. APK будет в `android/app/build/outputs/apk/debug/`

### Для Google Play:
1. Build → Generate Signed Bundle / APK
2. Выберите APK
3. Создайте или выберите keystore
4. Выполните релизную сборку

---

## iOS

### Требования:
- macOS
- Xcode 14+
- Apple Developer Account (для публикации)

### Сборка:
1. Откройте Terminal
2. Выполните:
   ```bash
   cd ios
   chmod +x setup.sh
   ./setup.sh
   ```
3. Откройте `PragaStore.xcodeproj` в Xcode
4. Настройте Bundle Identifier
5. Выберите Device → Run

### Для App Store:
1. Product → Archive
2. Upload to App Store Connect
3. Заполните метаданные
4. Отправьте на ревью

---

## Что включено:

### Android:
- WebView приложение
- Полноэкранный режим
- Тёмная тема
- Поддержка Android 7.0+

### iOS:
- WKWebView приложение
- Статус-бар светлый
- Поддержка iOS 14+
- Portrait ориентация

---

## Структура файлов:

```
android/
├── app/
│   ├── src/main/
│   │   ├── java/com/praga/store/
│   │   │   └── MainActivity.java
│   │   ├── res/
│   │   │   ├── layout/activity_main.xml
│   │   │   └── values/
│   │   ├── assets/          ← Сюда копируйте файлы приложения
│   │   └── AndroidManifest.xml
│   └── build.gradle
├── build.gradle
└── settings.gradle

ios/
├── PragaStore/
│   ├── AppDelegate.swift
│   ├── ViewController.swift
│   ├── Info.plist
│   └── Resources/           ← Сюда копируйте файлы приложения
└── setup.sh
```
