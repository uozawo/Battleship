# Battleship — Модернізація (Дизайн / Специфікація)

**Дата:** 2026-05-28
**Статус:** Затверджено користувачем (працювати автономно)

## Мета

Модернізувати існуючий проєкт `uozawo/Battleship`: сучасний фронтенд (новий дизайн
«Naval Command HUD»), нормальна авторизація на SQLite з JWT, авторитарний сервер для
онлайн-гри, можливість створювати/заходити в кімнати та грати у двох вкладках на
`localhost`. Усе локально. Додати детальний опис роботи (README).

## Стек і обґрунтування

| Шар | Технологія | Навіщо |
|---|---|---|
| Фронтенд | React 18 + Vite | Реальна збірка JSX, HMR, компоненти. Заміна CDN+Babel-у-браузері |
| Реалтайм | Socket.io | Кімнати, ходи, таймер, дисконекти |
| Бекенд | Node.js + Express | REST (auth, leaderboard) + роздача статики |
| БД | SQLite через вбудований `node:sqlite` (Node 24) | Синхронний, без нативної збірки й без зайвої залежності (перевірено: працює на цій машині) |
| Авторизація | `jsonwebtoken` + `bcryptjs` | Підписаний токен → захищені API і сокет |
| Тести | Vitest | Юніт-тести ядра + інтеграційні (auth, сокет-матч) |
| Оркестрація | npm workspaces + `concurrently` | Один `npm install`, один `npm run dev` |

## Структура (npm workspaces)

```
Battleship/
├── package.json          # workspaces [shared, server, client] + скрипти
├── shared/
│   ├── package.json
│   └── engine.js         # ЄДИНА pure-логіка правил (без залежностей)
├── server/
│   ├── package.json
│   ├── index.js          # bootstrap Express + Socket.io
│   ├── db.js             # node:sqlite (DatabaseSync), таблиця users, запити
│   ├── auth.js           # /register /login /guest /me + JWT middleware
│   ├── socket.js         # JWT-автентифікація сокета, події
│   └── rooms.js          # авторитарний матч-менеджер (стейт-машина)
├── client/
│   ├── package.json
│   ├── index.html
│   ├── vite.config.js    # proxy /api + /socket.io → :3000
│   └── src/
│       ├── main.jsx, App.jsx
│       ├── api.js, socket.js
│       ├── context/AuthContext.jsx
│       ├── hooks/useOnlineGame.js
│       ├── screens/{Auth,Menu,Lobby,Game,Leaderboard}.jsx
│       ├── components/{Board,Cell,PlacementPanel,TurnTimer,ReadyPanel,ResultModal,...}.jsx
│       └── styles/{tokens.css, *.module.css}
├── tests/                # engine.test.js, auth.test.js, match.test.js
└── README.md             # детальний опис
```

## `shared/engine.js` — контракт (єдине джерело правил)

Pure ESM, без залежностей; імпортується сервером (авторитет) і клієнтом (бот + підказки).

- Константи: `BOARD_SIZE = 10`, `SHIP_SIZES = [4,3,3,2,2,2,1,1,1,1]`, `LETTERS`.
- `createEmptyBoard()` → 10×10 матриця `'.'`.
- `isValidPlacement(board, r, c, size, dir)` → bool (межі + заборона дотику/перетину).
- `generateRandomFleet()` → `{ board, ships }`.
- `validateFleet(ships)` → `{ ok, board } | { ok:false, reason }` — перевірка легальності
  поданого флоту (правильні розміри 4/3/3/2/2/2/1/1/1/1, без дотику, в межах).
- `applyShot(board, ships, r, c)` → `{ result:'hit'|'miss'|'repeat', sunk, sunkCoords, won }`.

Стани клітин: `'.'` порожньо, `'S'` корабель, `'X'` влучання, `'M'` промах, `'K'` потоплено.

## Авторизація (JWT)

- `POST /api/auth/register {username,password}` → bcrypt-хеш, INSERT. 400 якщо зайнято.
- `POST /api/auth/login {username,password}` → перевірка, JWT (`exp 7d`) + `{user}`.
- `POST /api/auth/guest` → тимчасовий JWT з випадковим іменем `Guest-xxxx`, `is_guest:true`
  (для зручного тесту у 2 вкладки; не потрапляє в лідерборд).
- `GET /api/me` (auth) → актуальний профіль (wins/losses).
- `GET /api/leaderboard` → топ-10 не-гостей за `wins`.
- **Немає** публічного `/stats/update`. Статистику оновлює лише сервер по завершенні
  авторитарного матчу (особи гравців відомі з автентифікованих сокетів).
- Секрет JWT — з `.env` (`JWT_SECRET`), у dev фолбек із попередженням.
- Сокет: `io({auth:{token}})`; `io.use` перевіряє JWT, кладе `socket.user`. Без токена — відмова.

### Схема БД (`users`)
`id PK`, `username UNIQUE`, `password_hash`, `wins INT default 0`, `losses INT default 0`,
`created_at`. Гостей у БД не зберігаємо (ефемерні).

## Авторитарний онлайн-матч (стейт-машина кімнати)

1. **waiting** — p1 створив кімнату (код 4 символи), чекає p2.
2. **placement** — обидва зайшли; кожен у UI розставляє флот (вручну / «випадково») і
   надсилає **повний флот** → сервер валідує `validateFleet`, зберігає у себе.
3. **battle** — сервер призначає черговість (p1 перший). `fire {r,c}` → сервер перевіряє
   чий хід + чи не стріляли, рахує `applyShot` по полю суперника, шле результат обом
   (стрільцю — стан ворожого радара, цілі — вхідний постріл). Влучив → ходить ще; промах
   → хід переходить.
4. **finished** — 20 збитих клітин у когось → переможець; сервер оновлює `wins/losses`
   обох у БД (не для гостей), шле `game:over`, чистить кімнату.

**Таймер ходу 30с — серверний**: сервер шле `turn:start {playerId, deadline}`; клієнт лише
показує відлік; по таймауту сервер сам передає хід (`turn:timeout`).

### Події сокета (контракт)
- C→S: `room:create`, `room:join {code}`, `fleet:submit {ships}`, `fire {r,c}`, `room:leave`.
- S→C: `room:created {code}`, `room:joined {playerNum, opponent}`, `match:placement`,
  `fleet:accepted`, `match:battle {yourTurn}`, `turn:start {playerId, deadline}`,
  `shot:result {r,c,result,sunk,sunkCoords}` (по своєму радару),
  `shot:incoming {r,c,result,sunk,sunkCoords}` (по своєму полю),
  `turn:timeout {playerId}`, `game:over {win, reason}`, `opponent:left`,
  `room:error {message}`, `auth:error {message}`.

## Режими
- **Онлайн (2 вкладки)** — авторитарний, як вище. Гостьовий вхід для миттєвого тесту.
- **Проти ШІ** — офлайн на клієнті, та сама `shared/engine.js` + проста «мисливська» AI
  (як у поточному коді: добиває сусідів після влучання).

## Обробка помилок / дисконектів
- Сервер валідує весь ввід, шле типізовані `*:error` → клієнт показує повідомлення.
- Дисконект у бою → суперник отримує `opponent:left` і технічну перемогу; статистика
  оновлюється; кімната чиститься. Реконект — поза обсягом (YAGNI).

## Тестування
- **`shared/engine.js`** — Vitest юніт: валідація флоту (розміри/дотик/межі), `applyShot`
  (hit/miss/repeat), потоплення з обводкою, детекція перемоги.
- **Сервер** — інтеграційні: register/login/JWT/guest; сценарій матчу двох сокет-клієнтів
  (створити→зайти→подати флоти→серія пострілів→перемога→оновлення БД).
- **UI** — ручна перевірка: `npm run dev`, дві вкладки, повний матч.

## Запуск (localhost)
- `npm install` (workspaces ставить усе).
- `npm run dev` → Node-сервер (:3000) + Vite (:5173) одночасно; Vite проксіює `/api` і
  `/socket.io`. Грати на `http://localhost:5173`.
- `npm run build` + `npm start` → Node роздає зібраний клієнт на :3000.

## Deliverable: README
Детальний опис: стек і чому, архітектура, потік даних (REST vs сокет), як працює авторитарний
матч і таймер, як працює JWT-авторизація, структура файлів, як запускати, **як грати у 2 вкладки**.

## Поза обсягом (YAGNI)
Реконект у матч, рейтинг/ELO, історія матчів, чат, деплой за межі localhost, рестав-плей.
