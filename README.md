# ПРАГА

Магазин разливного пива и закусок: маркетинговый сайт и PWA-магазин.

## Структура

- `website/` — маркетинговый сайт;
- `app/` — PWA: каталог, корзина, заказы и админ-панель;
- `firestore.rules` — проверяемые правила доступа Firestore;
- `scripts/migrate-firestore.js` — миграция старых `shop/*` документов;
- `tests/firestore.rules.test.js` — тесты правил в Firebase Emulator.

## Локальный запуск

```bash
cd app && python3 -m http.server 8888
```

Приложение: `http://localhost:8888/app.html`.

## Проверка Firestore Rules

Требуются Node.js и Java (для Firebase Emulator):

```bash
npm install
npm run test:rules
```

## Безопасное развёртывание

Не публикуйте правила до подготовки новой схемы данных и администратора: старый клиент использует несовместимые публичные записи в `shop/*`.

1. В Firebase Authentication включите Email/Password и создайте администратора.
2. В Firestore Console создайте `admins/<AUTH_UID>` с полем `enabled: true`.
3. Сделайте резервную копию Firestore.
4. Настройте Application Default Credentials локально и запустите:

```bash
npm run migrate:dry-run
```

5. После проверки отчёта выполните:

```bash
npm run migrate:apply
```

6. Разверните обновлённое PWA и проверьте каталог, заказ и админ-панель.
7. Только после успешной проверки разверните правила:

```bash
npm run deploy:rules
```

Подробный порядок, модель доступа и ограничения описаны в [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).
