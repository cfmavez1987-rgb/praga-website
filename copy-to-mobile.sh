#!/bin/bash
# Copy web files to mobile projects

echo "=== Копирование файлов в мобильные проекты ==="

# Android assets
echo "Копирование в Android..."
mkdir -p android/app/src/main/assets
cp app/app.html android/app/src/main/assets/
cp app/manifest.json android/app/src/main/assets/
cp -r app/images android/app/src/main/assets/
cp app/sw.js android/app/src/main/assets/
cp app/icon-192.png android/app/src/main/assets/
cp app/icon-512.png android/app/src/main/assets/
echo "✓ Android готов"

# iOS resources
echo "Копирование в iOS..."
mkdir -p ios/PragaStore/Resources
cp app/app.html ios/PragaStore/Resources/index.html
cp app/manifest.json ios/PragaStore/Resources/
cp -r app/images ios/PragaStore/Resources/
cp app/sw.js ios/PragaStore/Resources/
cp app/icon-192.png ios/PragaStore/Resources/
cp app/icon-512.png ios/PragaStore/Resources/
echo "✓ iOS готов"

echo ""
echo "=== Готово! ==="
echo "Android: Откройте android/ в Android Studio"
echo "iOS: Откройте ios/PragaStore.xcodeproj в Xcode"
