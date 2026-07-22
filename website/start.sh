#!/bin/bash
cd "$(dirname "$0")"
echo "Запуск сервера на http://localhost:8888"
echo "Для остановки нажмите Ctrl+C"
python3 -m http.server 8888
