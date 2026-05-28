const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let dbStats = { wins: 0, losses: 0 };

app.get('/api/stats', (req, res) => {
    res.json(dbStats);
});

app.post('/api/stats/update', (req, res) => {
    const { result } = req.body;
    if (result === 'win') dbStats.wins++;
    if (result === 'loss') dbStats.losses++;
    res.json({ success: true, stats: dbStats });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const rooms = {};

io.on('connection', (socket) => {
    console.log(`Клієнт підключився: ${socket.id}`);

    socket.on('joinOnlineRoom', (roomId) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            // Розширена структура кімнати для збереження стану готовності
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

    // Фіксація натискання кнопки готовності гравцями
    socket.on('playerReady', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;

        if (socket.id === room.p1) {
            room.p1Ready = true;
        } else if (socket.id === room.p2) {
            room.p2Ready = true;
        }

        // Повідомляємо супротивника про готовність
        socket.to(data.roomId).emit('enemyReadyUpdate', { isReady: true });

        // Якщо обидва гравці натиснули кнопку — запускаємо бій
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

    // Передача ходу іншому гравцю у разі вичерпання ліміту часу
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
