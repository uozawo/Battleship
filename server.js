const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Підключення до бази даних SQLite (файл game.db створиться автоматично в папці проекту)
const db = new sqlite3.Database('./game.db', (err) => {
    if (err) {
        console.error('Помилка підключення до БД:', err.message);
    } else {
        console.log('Підключено до бази даних SQLite.');
    }
});

// Створення таблиці користувачів, якщо її ще немає
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0
)`);

// ====================================================================
// АВТОРИЗАЦІЯ, ПРОФІЛЬ ТА ЛІДЕРБОРД (Твоя частина роботи)
// ====================================================================

// 1. Реєстрація нового користувача
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Заповніть всі поля' });
    }

    try {
        // Безпечно хешуємо пароль перед збереженням у базу
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function (err) {
            if (err) {
                return res.status(400).json({ error: 'Користувач з таким іменем вже існує' });
            }
            res.json({ success: true, message: 'Реєстрація успішна' });
        });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера під час реєстрації' });
    }
});

// 2. Вхід у профіль (Авторизація)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Заповніть всі поля' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Помилка бази даних' });
        }
        if (!user) {
            return res.status(400).json({ error: 'Користувача не знайдено' });
        }

        // Перевіряємо, чи збігається введений пароль із хешем у базі
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(400).json({ error: 'Невірний пароль' });
        }

        // Повертаємо дані користувача для профілю на фронтенді
        res.json({
            success: true,
            message: 'Вхід виконано успішно',
            username: user.username,
            wins: user.wins,
            losses: user.losses
        });
    });
});

// 3. Оновлення статистики після завершення гри
app.post('/api/stats/update', (req, res) => {
    const { username, result } = req.body; // result може бути 'win' або 'loss'

    if (!username) {
        return res.status(400).json({ error: 'Не вказано ім\'я гравця' });
    }

    const field = result === 'win' ? 'wins' : 'losses';

    db.run(`UPDATE users SET ${field} = ${field} + 1 WHERE username = ?`, [username], function (err) {
        if (err) {
            return res.status(500).json({ error: 'Помилка оновлення статистики' });
        }
        res.json({ success: true, message: 'Статистику гравця оновлено' });
    });
});

// 4. Отримання Топ-10 гравців для таблиці лідерів
app.get('/api/leaderboard', (req, res) => {
    db.all('SELECT username, wins, losses FROM users ORDER BY wins DESC LIMIT 10', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Помилка отримання даних таблиці лідерів' });
        }
        res.json(rows);
    });
});

// ====================================================================
// ІГРОВА ЛОГІКА ТА КІМНАТИ (Логіка твоїх колег)
// ====================================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const rooms = {};

io.on('connection', (socket) => {
    console.log(`Клієнт підключився: ${socket.id}`);

    socket.on('joinOnlineRoom', (roomId) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = { p1: socket.id, p2: null, p1Ready: false, p2Ready: false };
            socket.emit('playerAssignment', { playerNum: 1 });
            console.log(`Гравець 1 створив кімнату: ${roomId}`);
        } else if (!rooms[roomId].p2) {
            rooms[roomId].p2 = socket.id;
            socket.emit('playerAssignment', { playerNum: 2 });
            io.to(roomId).emit('gameStarted');
            console.log(`Гравець 2 приєднався до кімнати: ${roomId}`);
        }
    });

    socket.on('playerReady', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;

        if (socket.id === room.p1) {
            room.p1Ready = true;
        } else if (socket.id === room.p2) {
            room.p2Ready = true;
        }

        socket.to(data.roomId).emit('enemyReadyUpdate', { isReady: true });

        if (room.p1Ready && room.p2Ready) {
            io.to(data.roomId).emit('battleStarted');
            console.log(`Обидва гравці готові в кімнаті: ${data.roomId}. Бій розпочато!`);
        }
    });

    socket.on('makeShot', (data) => {
        socket.to(data.roomId).emit('enemyShotAttempt', { r: data.r, c: data.c });
    });

    socket.on('shareShotResult', (data) => {
        socket.to(data.roomId).emit('enemyShotResult', {
            r: data.r,
            c: data.c,
            result: data.result,
            isSunk: data.isSunk
        });
    });

    socket.on('turnTimeout', (data) => {
        socket.to(data.roomId).emit('enemyTimeout');
    });

    socket.on('disconnect', () => {
        console.log(`Клієнт відключився: ${socket.id}`);
        for (const roomId in rooms) {
            if (rooms[roomId].p1 === socket.id || rooms[roomId].p2 === socket.id) {
                socket.to(roomId).emit('enemyDisconnected');
                delete rooms[roomId];
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Сервер симулятора запущено на http://localhost:${PORT}`);
});