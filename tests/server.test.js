import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { shipCoords } from '@battleship/shared';

// Середовище ДО імпорту серверних модулів: ефемерна БД + тестовий секрет.
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const { createServer } = await import('../server/index.js');
const { getUserByName } = await import('../server/db.js');

let server;
let baseURL;

beforeAll(async () => {
  ({ server } = createServer());
  await new Promise((resolve) => server.listen(0, resolve));
  baseURL = `http://localhost:${server.address().port}`;
});

afterAll(() => {
  server?.close();
});

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(baseURL + path, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

function once(socket, event) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout очікуючи "${event}"`)), 8000);
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

function connect(token) {
  return ioClient(baseURL, { auth: { token }, transports: ['websocket'], forceNew: true });
}

// Той самий легальний флот, що у тестах ядра — 20 клітин.
function fixtureFleet() {
  return [
    { coords: shipCoords(0, 0, 4, 'H') },
    { coords: shipCoords(2, 0, 3, 'H') },
    { coords: shipCoords(4, 0, 3, 'H') },
    { coords: shipCoords(6, 0, 2, 'H') },
    { coords: shipCoords(8, 0, 2, 'H') },
    { coords: shipCoords(0, 5, 2, 'H') },
    { coords: [{ r: 2, c: 5 }] },
    { coords: [{ r: 4, c: 5 }] },
    { coords: [{ r: 6, c: 5 }] },
    { coords: [{ r: 8, c: 5 }] },
  ];
}
const ALL_SHIP_CELLS = fixtureFleet().flatMap((s) => s.coords);

describe('REST авторизація', () => {
  it('реєстрація → логін → токен', async () => {
    const reg = await post('/api/auth/register', { username: 'alice', password: 'secret' });
    expect(reg.status).toBe(201);

    const login = await post('/api/auth/login', { username: 'alice', password: 'secret' });
    expect(login.status).toBe(200);
    expect(login.json.token).toBeTruthy();
    expect(login.json.user.username).toBe('alice');
  });

  it('повторна реєстрація того самого імені → 409', async () => {
    await post('/api/auth/register', { username: 'bob', password: 'secret' });
    const dup = await post('/api/auth/register', { username: 'bob', password: 'other' });
    expect(dup.status).toBe(409);
  });

  it('невірний пароль → 401', async () => {
    await post('/api/auth/register', { username: 'carol', password: 'secret' });
    const bad = await post('/api/auth/login', { username: 'carol', password: 'wrong' });
    expect(bad.status).toBe(401);
  });

  it('гостьовий вхід видає токен', async () => {
    const g = await post('/api/auth/guest', {});
    expect(g.json.token).toBeTruthy();
    expect(g.json.user.guest).toBe(true);
  });

  it('сокет без токена відхиляється', async () => {
    const sock = connect(undefined);
    const err = await once(sock, 'connect_error');
    expect(err).toBeTruthy();
    sock.close();
  });
});

describe('Авторитарний онлайн-матч', () => {
  it('повний сценарій: створити → зайти → флоти → перемога → статистика в БД', async () => {
    // Дві реальні (не гостьові) особи, щоб перевірити запис у БД.
    await post('/api/auth/register', { username: 'player1', password: 'secret' });
    await post('/api/auth/register', { username: 'player2', password: 'secret' });
    const t1 = (await post('/api/auth/login', { username: 'player1', password: 'secret' })).json.token;
    const t2 = (await post('/api/auth/login', { username: 'player2', password: 'secret' })).json.token;

    const s1 = connect(t1);
    const s2 = connect(t2);
    await Promise.all([once(s1, 'connect'), once(s2, 'connect')]);

    // p1 створює кімнату
    s1.emit('room:create');
    const { code } = await once(s1, 'room:created');
    expect(code).toMatch(/^[A-Z0-9]{4}$/);

    // p2 заходить → обидва отримують match:placement
    const placement1 = once(s1, 'match:placement');
    const placement2 = once(s2, 'match:placement');
    s2.emit('room:join', { code });
    const [pl1, pl2] = await Promise.all([placement1, placement2]);
    expect(pl1.playerNum).toBe(1);
    expect(pl2.playerNum).toBe(2);
    expect(pl1.opponent).toBe('player2');
    expect(pl2.opponent).toBe('player1');

    // Обидва подають флоти → починається бій
    const battle1 = once(s1, 'match:battle');
    const battle2 = once(s2, 'match:battle');
    s1.emit('fleet:submit', { ships: fixtureFleet() });
    s2.emit('fleet:submit', { ships: fixtureFleet() });
    const [b1, b2] = await Promise.all([battle1, battle2]);
    expect(b1.yourTurn).toBe(true); // господар ходить першим
    expect(b2.yourTurn).toBe(false);

    // p1 послідовно стріляє по всіх клітинах флоту p2 (усі влучання → хід зберігається).
    const over1 = once(s1, 'game:over');
    const over2 = once(s2, 'game:over');
    let i = 0;
    const fireNext = () => {
      if (i < ALL_SHIP_CELLS.length) {
        const { r, c } = ALL_SHIP_CELLS[i++];
        s1.emit('fire', { r, c });
      }
    };
    s1.on('shot:result', (res) => {
      expect(res.result).toBe('hit');
      if (i < ALL_SHIP_CELLS.length) fireNext();
    });
    fireNext();

    const [result, lossForP2] = await Promise.all([over1, over2]);
    expect(result.win).toBe(true);
    expect(result.reason).toBe('fleet-destroyed');
    expect(lossForP2.win).toBe(false);

    // Статистика записана в БД
    expect(getUserByName('player1').wins).toBe(1);
    expect(getUserByName('player2').losses).toBe(1);

    s1.close();
    s2.close();
  }, 20000);
});
