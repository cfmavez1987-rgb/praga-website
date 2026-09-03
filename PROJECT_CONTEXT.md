# Проект ПРАГА — технический контекст

## Обзор

**ПРАГА** — магазин разливного пива и закусок в Актау. Репозиторий включает:

1. `website/` — маркетинговый сайт;
2. `app/` — PWA-каталог, корзина, оформление заказов и админ-панель;
3. `smm/` — материалы для социальных сетей.

Стек: статические HTML/CSS/JavaScript, Firebase SDK 9.23 compat, Firebase Authentication и Cloud Firestore. Лендинг и PWA публикуются на Vercel.

## Firebase

- Project ID: `praga-store`;
- конфигурация клиента находится в `app/app.html`;
- Firebase Web API key является публичным идентификатором, а не паролем; доступ защищают Authentication и `firestore.rules`.

### Актуальная схема

```text
products/{productId}       публичный каталог
orders/{orderId}           один заказ на документ
publicSettings/store       только публичный WhatsApp
admins/{firebaseAuthUid}   allowlist администраторов
```

Legacy-схема `shop/product_*`, `shop/orders` и `shop/settings` используется только как источник миграции и после cutover полностью запрещена Rules.

### Модель доступа

- любой посетитель может читать товары и `publicSettings/store`;
- неавторизованный посетитель может только создать один строго валидируемый заказ; ID документа совпадает с `clientOrderId`, поэтому повторная отправка не создаёт дубликат;
- каждая позиция заказа должна ссылаться на активный товар и допустимый для него размер;
- посетитель не может читать, перечислять, менять или удалять заказы;
- наличие Firebase-аккаунта само по себе не даёт прав администратора;
- администратор должен быть одновременно авторизован и иметь `admins/<uid>.enabled == true`;
- `admins/**`, `shop/**` и неизвестные коллекции недоступны клиентам;
- цены и итог из браузера не записываются как доверенные данные заказа; админ-интерфейс рассчитывает отображаемую сумму по текущему каталогу;
- Rules не обеспечивают полноценный rate limiting: перед публичным запуском следует включить Firebase App Check, а для серверного расчёта цены и усиленной защиты от автоматизированного спама — перенести создание заказа в trusted backend (Callable Function/Cloud Run).

Правила лежат в `firestore.rules` и покрыты тестами `tests/firestore.rules.test.js`.

## Администратор

1. В Firebase Console → Authentication включить Email/Password.
2. Создать пользователя с уникальным email и сильным паролем.
3. Скопировать UID пользователя.
4. Через Firestore Console или Admin SDK создать:

```text
admins/<UID>
  enabled: true
```

Клиент не может читать или изменять allowlist. Старые `adminLogin`/`adminPass` удалены из приложения и не должны переноситься из `shop/settings`. Пароль `12345` следует считать раскрытым и заменить везде, где он мог использоваться повторно.

## Миграция данных

До миграции обязательно создать резервную копию Firestore. Не добавлять service-account JSON в Git; использовать Application Default Credentials.

```bash
npm install
npm run migrate:dry-run
```

Dry-run читает legacy-данные, проверяет преобразование и ничего не записывает. После проверки проекта и отчёта:

```bash
npm run migrate:apply
```

Миграция:

- переносит отдельные `shop/product_*` или fallback `shop/products.items` в `products/{id}`;
- разбивает `shop/orders.items` на детерминированные `orders/legacy-*`;
- копирует только WhatsApp в `publicSettings/store`;
- не переносит логин или пароль;
- не перезаписывает существующие destination-документы;
- не удаляет legacy-данные.

Повторный запуск должен показать пропуски без дубликатов. Ошибочные заказы (например, товар не найден) не переносятся и перечисляются в отчёте.

## Проверка Rules

Для Firebase Emulator требуется Java:

```bash
npm install
npm run test:rules
```

Тесты проверяют публичные чтения, создание заказов, границы всех полей, отказ обычному Firebase-пользователю, права allowlisted-администратора, неизменяемость данных заказа и запрет legacy/unknown путей.

## Порядок production cutover без остановки каталога и заказов

1. Создать backup Firestore.
2. Включить Email/Password, создать администратора и allowlist-документ.
3. Запустить dry-run и затем apply-миграцию.
4. Выполнить тесты Rules в Emulator.
5. Опубликовать обновлённый PWA, пока legacy-правила ещё временно действуют.
6. В чистом браузере проверить каталог, создание заказа и отсутствие чтения заказов.
7. В отдельной админ-сессии проверить вход, товары, WhatsApp и статусы заказов.
8. Обновить PWA Service Worker и опубликовать новые нативные сборки.
9. Развернуть проверенные правила:

```bash
npm run deploy:rules
```

10. Немедленно повторить public/admin smoke-тесты.
11. После периода хранения удалить `shop/settings` и остальные legacy-документы через контролируемый операторский процесс.

Нельзя откатываться к `allow read, write: if true`. При проблеме следует выпустить узкое исправление приложения/Rules, сохраняя закрытый доступ.

## Локальный запуск

Лендинг:

```bash
cd website && python3 -m http.server 8080
```

PWA:

```bash
cd app && python3 -m http.server 8888
```

Открыть `http://localhost:8888/app.html`.

## Мобильные ресурсы

`app/` — единственный канонический источник. Перед сборкой:

```bash
bash copy-to-mobile.sh
```

Android получает `assets/index.html`, iOS — `Resources/index.html`. Старые установленные сборки, использующие legacy-схему, перестанут работать после закрытия `shop/**`; выпуск обновления должен предшествовать окончательному cutover.

## Дизайн-система

```css
--bg: #0D0B08;
--card: #1A1714;
--amber: #D4940A;
--amber-l: #F5B731;
--txt: #F2E8D5;
--txt2: #A89B8C;
--txt3: #6B6055;
--brd: #2A2520;
--danger: #E74C3C;
--success: #27AE60;
```

Шрифты: Playfair Display для заголовков, Inter для основного текста. Валюта — тенге (₸). Сайт и PWA остаются разными приложениями.

## Ссылки

- сайт: https://praga-website.vercel.app/
- PWA: https://praga-website.vercel.app/app
- Firebase Console: https://console.firebase.google.com/project/praga-store
