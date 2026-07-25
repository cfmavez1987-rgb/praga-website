#!/bin/bash
# Script to setup iOS project

echo "=== Настройка iOS проекта ==="

# Copy web assets
mkdir -p PragaStore/Resources
cp ../app/app.html PragaStore/Resources/index.html
cp ../app/manifest.json PragaStore/Resources/
cp -r ../app/images PragaStore/Resources/
cp ../app/sw.js PragaStore/Resources/

echo "Файлы скопированы в PragaStore/Resources/"
echo ""
echo "Для сборки:"
echo "1. Откройте PragaStore.xcodeproj в Xcode"
echo "2. Добавьте папку Resources в проект"
echo "3. Выберите Target -> Signing & Capabilities"
echo "4. Настройте Bundle Identifier"
echo "5. Выберите Device и нажмите Run"
