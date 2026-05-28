const { useState, useEffect, useRef } = React;

const BOARD_SIZE = 10;
const LETTERS = ["А", "Б", "В", "Г", "Д", "Е", "Є", "Ж", "З", "И"];
const SHIP_SIZES = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];

function SeaBattleApp() {
    // Екрани: 'auth-screen', 'menu-screen', 'online-screen', 'game-screen', 'leaderboard-screen'
    const [currentScreen, setCurrentScreen] = useState('auth-screen');
    const [stats, setStats] = useState({ wins: 0, losses: 0, offline: false });

    // --- ТВОЯ ЧАСТИНА: Стани для авторизації та лідерборду ---
    const [currentUser, setCurrentUser] = useState(null);
    const [authMode, setAuthMode] = useState('login'); // 'login' або 'register'
    const [authData, setAuthData] = useState({ username: '', password: '' });
    const [authMessage, setAuthMessage] = useState('');
    const [leaderboard, setLeaderboard] = useState([]);
    // -----------------------------------------------------------

    // Ігрові стани
    const [gameMode, setGameMode] = useState('bot'); // 'bot' або 'online'
    const [roomIdInput, setRoomIdInput] = useState('');
    const [generatedRoomId, setGeneratedRoomId] = useState('XXXX');
    const [statusText, setStatusText] = useState('Завантаження систем...');
    const [gameModeTitle, setGameModeTitle] = useState('Бойова операція');

    // Матриці полів
    const [playerBoard, setPlayerBoard] = useState(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill('.')));
    const [enemyBoard, setEnemyBoard] = useState(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill('.')));

    // Фаза розстановки та готовності
    const [isPlacementPhase, setIsPlacementPhase] = useState(false);
    const [currentShipIndex, setCurrentShipIndex] = useState(0);
    const [placementDirection, setPlacementDirection] = useState('H');

    const [isReadyPhase, setIsReadyPhase] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isEnemyReady, setIsEnemyReady] = useState(false);

    // Таймер ходу
    const [turnTimer, setTurnTimer] = useState(30);

    const [isPlayerTurn, setIsPlayerTurn] = useState(true);
    const [isGameOver, setIsGameOver] = useState(false);

    // Рефи
    const playerShipsRef = useRef([]);
    const enemyShipsRef = useRef([]);
    const myNumberRef = useRef(1);
    const currentRoomIdRef = useRef('');
    const socketRef = useRef(null);
    const timerIntervalRef = useRef(null);
    const aiStateRef = useRef({ compHunting: false, compHits: [], compNextTargets: [] });

    // --- ТВОЯ ЧАСТИНА: Функції авторизації та бази даних ---
    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setAuthMessage('Зачекайте...');

        const endpoint = authMode === 'login' ? '/api/login' : '/api/register';

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(authData)
            });
            const data = await res.json();

            if (data.success) {
                if (authMode === 'register') {
                    setAuthMode('login');
                    setAuthMessage('Реєстрація успішна! Тепер увійдіть.');
                    setAuthData({ ...authData, password: '' });
                } else {
                    setCurrentUser(data.username);
                    setStats({ wins: data.wins, losses: data.losses, offline: false });
                    setCurrentScreen('menu-screen');
                    setAuthMessage('');
                }
            } else {
                setAuthMessage(data.error || 'Помилка');
            }
        } catch (error) {
            setAuthMessage('Помилка з\'єднання з сервером');
        }
    };

    const showLeaderboardScreen = async () => {
        try {
            const res = await fetch('/api/leaderboard');
            const data = await res.json();
            setLeaderboard(data);
            setCurrentScreen('leaderboard-screen');
        } catch (error) {
            alert('Помилка завантаження лідерборду');
        }
    };

    const sendGameResultToDB = (outcome) => {
        setIsGameOver(true);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        setStatusText(outcome === 'win' ? "Операція успішна (Перемога)" : "Операція провалена (Поразка)");

        if (currentUser) {
            fetch('/api/stats/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: currentUser, result: outcome })
            }).then(() => {
                setStats(prev => ({
                    ...prev,
                    wins: outcome === 'win' ? prev.wins + 1 : prev.wins,
                    losses: outcome === 'loss' ? prev.losses + 1 : prev.losses
                }));
            }).catch(err => console.error(err));
        }

        if (socketRef.current) socketRef.current.disconnect();
    };
    // -----------------------------------------------------------

    // Логіка роботи таймера ходу
    useEffect(() => {
        if (!isPlacementPhase && !isReadyPhase && !isGameOver && currentScreen === 'game-screen') {
            setTurnTimer(30);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

            timerIntervalRef.current = setInterval(() => {
                setTurnTimer(prev => {
                    if (prev <= 1) {
                        clearInterval(timerIntervalRef.current);
                        handleTimeOut();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [isPlayerTurn, isPlacementPhase, isReadyPhase, isGameOver, currentScreen]);

    const handleTimeOut = () => {
        if (isGameOver || isPlacementPhase || isReadyPhase) return;
        if (isPlayerTurn) {
            setStatusText("Час вичерпано! Хід переходить до супротивника.");
            setIsPlayerTurn(false);
            if (gameMode === 'online') {
                socketRef.current.emit('turnTimeout', { roomId: currentRoomIdRef.current });
            } else {
                setTimeout(() => robotTurnLogic(enemyBoard), 600);
            }
        }
    };

    // Хелпери перевірок та генерації
    const isValidPosition = (board, r, c, size, dir) => {
        for (let i = 0; i < size; i++) {
            let nr = r + (dir === 'V' ? i : 0), nc = c + (dir === 'H' ? i : 0);
            if (nr >= BOARD_SIZE || nc >= BOARD_SIZE) return false;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    let cr = nr + dr, cc = nc + dc;
                    if (cr >= 0 && cr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE && board[cr][cc] === 'S') return false;
                }
            }
        }
        return true;
    };

    const generateFleetRandomly = (boardCopy) => {
        let fleet = [];
        SHIP_SIZES.forEach(size => {
            let placed = false;
            while (!placed) {
                let dir = Math.random() < 0.5 ? 'H' : 'V';
                let r = Math.floor(Math.random() * BOARD_SIZE), c = Math.floor(Math.random() * BOARD_SIZE);
                if (isValidPosition(boardCopy, r, c, size, dir)) {
                    let coords = [];
                    for (let i = 0; i < size; i++) {
                        let nr = r + (dir === 'V' ? i : 0), nc = c + (dir === 'H' ? i : 0);
                        boardCopy[nr][nc] = 'S'; coords.push({ r: nr, c: nc });
                    }
                    fleet.push({ coords, hits: 0, sunk: false }); placed = true;
                }
            }
        });
        return fleet;
    };

    const checkShipSunkInternal = (boardCopy, fleet, r, c) => {
        for (let ship of fleet) {
            if (ship.coords.some(co => co.r === r && co.c === c)) {
                ship.hits++;
                if (ship.hits === ship.coords.length) {
                    ship.sunk = true;
                    ship.coords.forEach(co => {
                        boardCopy[co.r][co.c] = 'K';
                        for (let dr = -1; dr <= 1; dr++) {
                            for (let dc = -1; dc <= 1; dc++) {
                                let nr = co.r + dr, nc = co.c + dc;
                                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && boardCopy[nr][nc] === '.') boardCopy[nr][nc] = 'M';
                            }
                        }
                    });
                    return true;
                }
                return false;
            }
        }
        return false;
    };

    const markSunkVisualAround = (boardCopy, startR, startC) => {
        boardCopy[startR][startC] = 'K';
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                let nr = startR + dr, nc = startC + dc;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && boardCopy[nr][nc] === '.') boardCopy[nr][nc] = 'M';
            }
        }
    };

    const countKCells = (board) => {
        let count = 0;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++) if (board[r][c] === 'K') count++;
        return count;
    };

    // Старт проти БОТА
    const startBotGame = () => {
        setGameMode('bot');
        setIsPlayerTurn(true);
        setIsPlacementPhase(true);
        setPlacementDirection('H');
        setCurrentShipIndex(0);
        setIsGameOver(false);
        setIsReadyPhase(false);
        setIsReady(false);
        setIsEnemyReady(false);
        setGameModeTitle("Локальна симуляція (Підготовка флоту)");
        setStatusText("Стратегічне розгортання сил...");

        playerShipsRef.current = [];
        const emptyP = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill('.'));
        const emptyE = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill('.'));

        enemyShipsRef.current = generateFleetRandomly(emptyE);
        setPlayerBoard(emptyP);
        setEnemyBoard(emptyE);
        setCurrentScreen('game-screen');
    };

    // Мережева підготовка
    const showOnlineSetup = () => {
        const newRoomId = 'room-' + Math.random().toString(36).substr(2, 4);
        setGeneratedRoomId(newRoomId);
        setRoomIdInput('');
        setCurrentScreen('online-screen');
    };

    const startOnlineGame = (roomId) => {
        if (!roomId) return alert("Введіть ідентифікатор лобі!");
        setGameMode('online');
        setIsPlacementPhase(true);
        setCurrentShipIndex(0);
        setIsGameOver(false);
        setIsReadyPhase(false);
        setIsReady(false);
        setIsEnemyReady(false);
        currentRoomIdRef.current = roomId;

        setGameModeTitle("Мережева гра (Підготовка флоту)");
        setStatusText("З'єднання із сервером...");

        const emptyP = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill('.'));
        const emptyE = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill('.'));
        setPlayerBoard(emptyP);
        setEnemyBoard(emptyE);
        playerShipsRef.current = [];
        enemyShipsRef.current = [];

        setCurrentScreen('game-screen');
        socketRef.current = io();

        socketRef.current.on('playerAssignment', (data) => {
            myNumberRef.current = data.playerNum;
            setIsPlayerTurn(data.playerNum === 1);
            setStatusText("Очікування підключення супротивника для початку розстановки...");
        });

        socketRef.current.on('gameStarted', () => {
            setStatusText("Супротивник на місці. Розставте свої кораблі!");
        });

        socketRef.current.on('enemyReadyUpdate', (data) => {
            setIsEnemyReady(data.isReady);
            if (data.isReady) {
                setStatusText("Супротивник готовий до бою!");
            } else {
                setStatusText("Очікування готовності супротивника...");
            }
        });

        socketRef.current.on('battleStarted', () => {
            setIsReadyPhase(false);
            setGameModeTitle("Мережева операція (Бій)");
            setStatusText(myNumberRef.current === 1 ? "Ваш хід" : "Хід супротивника");
            setIsPlayerTurn(myNumberRef.current === 1);
        });

        socketRef.current.on('enemyTimeout', () => {
            setIsPlayerTurn(true);
            setStatusText("Супротивник вичерпав час! Ваш хід.");
        });

        socketRef.current.on('enemyShotAttempt', ({ r, c }) => {
            setPlayerBoard(prev => {
                let boardCopy = prev.map(row => [...row]);
                let cellState = boardCopy[r][c];
                let result = 'miss';
                let isSunk = false;

                if (cellState === 'S') {
                    boardCopy[r][c] = 'X';
                    result = 'hit';
                    isSunk = checkShipSunkInternal(boardCopy, playerShipsRef.current, r, c);
                } else if (cellState === '.') {
                    boardCopy[r][c] = 'M';
                }

                socketRef.current.emit('shareShotResult', { roomId: currentRoomIdRef.current, r, c, result, isSunk });

                if (result === 'miss') {
                    setIsPlayerTurn(true);
                    setStatusText("Ваш хід");
                } else {
                    setStatusText("Супротивник атакує знову");
                    if (playerShipsRef.current.every(s => s.sunk)) sendGameResultToDB('loss');
                }
                return boardCopy;
            });
        });

        socketRef.current.on('enemyShotResult', ({ r, c, result, isSunk }) => {
            setEnemyBoard(prev => {
                let boardCopy = prev.map(row => [...row]);
                if (result === 'hit') {
                    boardCopy[r][c] = isSunk ? 'K' : 'X';
                    if (isSunk) markSunkVisualAround(boardCopy, r, c);
                    setStatusText(isSunk ? "Ціль знищено!" : "Влучання!");
                    if (countKCells(boardCopy) === 20) sendGameResultToDB('win');
                } else {
                    boardCopy[r][c] = 'M';
                    setIsPlayerTurn(false);
                    setStatusText("Хід супротивника");
                }
                return boardCopy;
            });
        });

        socketRef.current.on('enemyDisconnected', () => {
            alert("Супротивник розірвав з'єднання. Вам зараховано перемогу.");
            sendGameResultToDB('win');
        });

        socketRef.current.emit('joinOnlineRoom', roomId);
    };

    const exitToMenu = () => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
        setCurrentScreen('menu-screen');
    };

    const handlePlayerBoardClick = (r, c) => {
        if (!isPlacementPhase) return;
        const size = SHIP_SIZES[currentShipIndex];

        if (isValidPosition(playerBoard, r, c, size, placementDirection)) {
            let boardCopy = playerBoard.map(row => [...row]);
            let coords = [];
            for (let i = 0; i < size; i++) {
                let nr = r + (placementDirection === 'V' ? i : 0);
                let nc = c + (placementDirection === 'H' ? i : 0);
                boardCopy[nr][nc] = 'S';
                coords.push({ r: nr, c: nc });
            }
            playerShipsRef.current.push({ coords, hits: 0, sunk: false });
            setPlayerBoard(boardCopy);

            const nextIndex = currentShipIndex + 1;
            setCurrentShipIndex(nextIndex);

            if (nextIndex >= SHIP_SIZES.length) goToReadyPhase();
        } else {
            alert("Недопустима позиція! Кораблі не повинні перетинатися чи торкатися один одного.");
        }
    };

    const autoPlaceRemaining = () => {
        if (!isPlacementPhase) return;
        const boardCopy = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill('.'));
        playerShipsRef.current = generateFleetRandomly(boardCopy);
        setPlayerBoard(boardCopy);
        goToReadyPhase();
    };

    const goToReadyPhase = () => {
        setIsPlacementPhase(false);
        setIsReadyPhase(true);
        if (gameMode === 'bot') {
            setStatusText("Флот розгорнуто. Підтвердіть готовність до початку симуляції.");
        } else {
            setStatusText("Флот розгорнуто. Натисніть кнопку готовності.");
        }
    };

    const handleReadyClick = () => {
        setIsReady(true);
        if (gameMode === 'bot') {
            setIsReadyPhase(false);
            setGameModeTitle("Локальна симуляція (Бій)");
            setStatusText("Ваш хід. Стріляйте по ворожому радару.");
            setIsPlayerTurn(true);
        } else {
            setStatusText("Очікування готовності супротивника...");
            socketRef.current.emit('playerReady', { roomId: currentRoomIdRef.current, isReady: true });
        }
    };

    const handleCellClick = (r, c) => {
        if (isPlacementPhase || isReadyPhase || !isPlayerTurn || isGameOver || enemyBoard[r][c] === 'X' || enemyBoard[r][c] === 'M' || enemyBoard[r][c] === 'K') return;

        if (gameMode === 'online') {
            setIsPlayerTurn(false);
            socketRef.current.emit('makeShot', { roomId: currentRoomIdRef.current, r, c });
        } else {
            let boardCopy = enemyBoard.map(row => [...row]);
            if (boardCopy[r][c] === '.') {
                boardCopy[r][c] = 'M';
                setStatusText("Промах");
                setIsPlayerTurn(false);
                setEnemyBoard(boardCopy);
                setTimeout(() => robotTurnLogic(boardCopy), 600);
            } else if (boardCopy[r][c] === 'S') {
                boardCopy[r][c] = 'X';
                let sunk = checkShipSunkInternal(boardCopy, enemyShipsRef.current, r, c);
                setEnemyBoard(boardCopy);
                if (enemyShipsRef.current.every(s => s.sunk)) {
                    sendGameResultToDB('win');
                } else {
                    setStatusText(sunk ? "Ціль знищено!" : "Влучання!");
                    setTurnTimer(30);
                }
            }
        }
    };

    const robotTurnLogic = (currentEnemyBoard) => {
        if (isGameOver) return;
        let r, c;
        let ai = aiStateRef.current;

        setPlayerBoard(prevPlayerBoard => {
            let boardCopy = prevPlayerBoard.map(row => [...row]);

            if (ai.compHunting && ai.compNextTargets.length > 0) {
                let target = ai.compNextTargets.shift(); r = target.r; c = target.c;
            } else {
                do {
                    r = Math.floor(Math.random() * BOARD_SIZE); c = Math.floor(Math.random() * BOARD_SIZE);
                } while (boardCopy[r][c] === 'X' || boardCopy[r][c] === 'M' || boardCopy[r][c] === 'K');
            }

            if (boardCopy[r][c] === '.' || boardCopy[r][c] === 'M') {
                boardCopy[r][c] = 'M';
                setStatusText("Ваш хід");
                setIsPlayerTurn(true);
            } else if (boardCopy[r][c] === 'S') {
                boardCopy[r][c] = 'X';
                ai.compHits.push({ r, c }); ai.compHunting = true;
                let sunk = checkShipSunkInternal(boardCopy, playerShipsRef.current, r, c);

                if (sunk) {
                    ai.compHunting = false; ai.compHits = []; ai.compNextTargets = [];
                } else {
                    let dirs = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }];
                    dirs.forEach(d => {
                        let nr = r + d.r, nc = c + d.c;
                        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                            if (boardCopy[nr][nc] === '.' || boardCopy[nr][nc] === 'S') ai.compNextTargets.push({ r: nr, c: nc });
                        }
                    });
                }
                if (playerShipsRef.current.every(s => s.sunk)) {
                    sendGameResultToDB('loss');
                } else {
                    setTimeout(() => robotTurnLogic(boardCopy), 600);
                }
            }
            return boardCopy;
        });
    };

    const renderGrid = (boardData, isEnemy) => {
        let gridClass = isEnemy ? "grid enemy-board" : ("grid player-board" + (isPlacementPhase ? " placing-mode" : ""));
        let cells = [];
        cells.push(<div key="corner" className="cell label"></div>);
        for (let i = 0; i < BOARD_SIZE; i++) {
            cells.push(<div key={`lbl-h-${i}`} className="cell label">{LETTERS[i]}</div>);
        }

        for (let r = 0; r < BOARD_SIZE; r++) {
            cells.push(<div key={`lbl-v-${r}`} className="cell label">{r + 1}</div>);
            for (let c = 0; c < BOARD_SIZE; c++) {
                let cellClass = "cell game-cell";
                const val = boardData[r][c];
                if (val === 'S' && !isEnemy) cellClass += ' ship';
                if (val === 'X') cellClass += ' hit';
                if (val === 'M') cellClass += ' miss';
                if (val === 'K') cellClass += ' sunk';

                const clickHandler = () => {
                    if (isEnemy) handleCellClick(r, c);
                    else handlePlayerBoardClick(r, c);
                };

                cells.push(<div key={`cell-${r}-${c}`} className={cellClass} onClick={clickHandler}></div>);
            }
        }
        return <div className={gridClass}>{cells}</div>;
    };

    return (
        <main className="app-container">
            {/* ТВОЯ ЧАСТИНА: ЕКРАН АВТОРИЗАЦІЇ */}
            <section id="auth-screen" className={`screen ${currentScreen === 'auth-screen' ? 'active' : ''}`}>
                <header className="menu-header">
                    <h1>МОРСЬКИЙ БІЙ</h1>
                    <p className="subtitle">Авторизація пілота</p>
                </header>
                <div className="menu-card" style={{ maxWidth: '400px', margin: '0 auto' }}>
                    <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
                        {authMode === 'login' ? 'Вхід у систему' : 'Реєстрація'}
                    </h2>

                    <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <input
                            type="text"
                            placeholder="Ім'я гравця (Логін)"
                            value={authData.username}
                            onChange={(e) => setAuthData({ ...authData, username: e.target.value })}
                            required
                            style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
                        />
                        <input
                            type="password"
                            placeholder="Пароль"
                            value={authData.password}
                            onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                            required
                            style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
                        />
                        <button type="submit" className="btn btn-primary">
                            {authMode === 'login' ? 'Увійти' : 'Створити акаунт'}
                        </button>
                    </form>

                    {authMessage && (
                        <p style={{ textAlign: 'center', marginTop: '15px', color: authMessage.includes('Помилка') ? 'red' : 'green' }}>
                            {authMessage}
                        </p>
                    )}

                    <div style={{ textAlign: 'center', marginTop: '20px' }}>
                        <button className="btn btn-link" onClick={() => {
                            setAuthMode(authMode === 'login' ? 'register' : 'login');
                            setAuthMessage('');
                        }}>
                            {authMode === 'login' ? 'Ще немає акаунту? Зареєструватися' : 'Вже є акаунт? Увійти'}
                        </button>
                    </div>
                </div>
            </section>

            {/* МЕНЮ ЕКРАН */}
            <section id="menu-screen" className={`screen ${currentScreen === 'menu-screen' ? 'active' : ''}`}>
                <header className="menu-header">
                    <h1>МОРСЬКИЙ БІЙ</h1>
                    <p className="subtitle">Тактичний мережевий симулятор</p>
                </header>
                <div className="menu-card">
                    {/* Привітання користувача */}
                    <div style={{ textAlign: 'center', marginBottom: '20px', fontSize: '1.2rem', color: '#0056b3' }}>
                        <strong>Пілот: {currentUser}</strong>
                    </div>

                    <div className="action-group">
                        <button className="btn btn-primary" onClick={startBotGame}>Грати проти ШІ</button>
                        <button className="btn btn-outline" onClick={showOnlineSetup}>Мережева гра</button>
                        {/* Кнопка лідерборду */}
                        <button className="btn btn-outline" style={{ background: '#ffc107', color: '#000', borderColor: '#ffc107' }} onClick={showLeaderboardScreen}>Таблиця лідерів 🏆</button>
                    </div>
                    <footer className="stats-panel">
                        <span className="stats-label">Ваша статистика:</span>
                        <span id="stats-display" className="stats-value">
                            Перемог: {stats.wins} | Програшів: {stats.losses}
                        </span>
                    </footer>
                </div>
            </section>

            {/* ТВОЯ ЧАСТИНА: ЕКРАН ЛІДЕРБОРДУ */}
            <section id="leaderboard-screen" className={`screen ${currentScreen === 'leaderboard-screen' ? 'active' : ''}`}>
                <header className="menu-header">
                    <h2>ТОП-10 ПІЛОТІВ 🏆</h2>
                </header>
                <div className="menu-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', marginBottom: '20px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #ccc', background: '#f8f9fa' }}>
                                <th style={{ padding: '10px' }}>#</th>
                                <th style={{ padding: '10px' }}>Ім'я гравця</th>
                                <th style={{ padding: '10px' }}>Перемоги</th>
                                <th style={{ padding: '10px' }}>Поразки</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaderboard.map((player, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '10px' }}>{index + 1}</td>
                                    <td style={{ padding: '10px', fontWeight: 'bold' }}>{player.username}</td>
                                    <td style={{ padding: '10px', color: 'green' }}>{player.wins}</td>
                                    <td style={{ padding: '10px', color: 'red' }}>{player.losses}</td>
                                </tr>
                            ))}
                            {leaderboard.length === 0 && (
                                <tr>
                                    <td colSpan="4" style={{ padding: '20px' }}>Немає даних для відображення</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <div style={{ textAlign: 'center' }}>
                        <button className="btn btn-primary" onClick={() => setCurrentScreen('menu-screen')}>Повернутися в меню</button>
                    </div>
                </div>
            </section>

            {/* ОНЛАЙН НАЛАШТУВАННЯ */}
            <section id="online-screen" className={`screen ${currentScreen === 'online-screen' ? 'active' : ''}`}>
                <h2>Мережевий режим</h2>
                <p className="screen-desc">Створіть нову бойову зону або підключіться до існуючої</p>
                <div className="lobby-grid">
                    <div className="lobby-card">
                        <h3>Створити лобі</h3>
                        <p>Надішліть цей унікальний маркер супротивнику для підключення:</p>
                        <div className="token-display">{generatedRoomId}</div>
                        <button className="btn btn-primary" onClick={() => startOnlineGame(generatedRoomId)}>Ініціалізувати</button>
                    </div>
                    <div className="lobby-card">
                        <h3>Приєднатися</h3>
                        <p>Введіть ідентифікатор лобі, створений вашим супротивником:</p>
                        <input type="text" placeholder="Наприклад: room-a4f2" value={roomIdInput} onChange={(e) => setRoomIdInput(e.target.value)} autoComplete="off" />
                        <button className="btn btn-outline" onClick={() => startOnlineGame(roomIdInput)}>Увійти в бій</button>
                    </div>
                </div>
                <button className="btn btn-link" onClick={() => setCurrentScreen('menu-screen')}>Повернутися в меню</button>
            </section>

            {/* ЕКРАН ГРИ */}
            <section id="game-screen" className={`screen ${currentScreen === 'game-screen' ? 'active' : ''}`}>
                <header className="game-header">
                    <h2>{gameModeTitle}</h2>
                    <div className="status-badge">{statusText}</div>
                    {!isPlacementPhase && !isReadyPhase && !isGameOver && (
                        <div className={`timer-badge ${turnTimer <= 10 ? 'urgent' : ''}`}>
                            Залишилось часу: {turnTimer} сек
                        </div>
                    )}
                </header>

                {isPlacementPhase && (
                    <div id="placement-controls" className="placement-box">
                        <p id="placement-instruction">
                            Встановіть {SHIP_SIZES[currentShipIndex]}-палубний корабель ({currentShipIndex + 1}/{SHIP_SIZES.length})
                        </p>
                        <div className="placement-buttons">
                            <button className={`btn btn-placement ${placementDirection === 'H' ? 'active' : ''}`} onClick={() => setPlacementDirection('H')}>Горизонтально</button>
                            <button className={`btn btn-placement ${placementDirection === 'V' ? 'active' : ''}`} onClick={() => setPlacementDirection('V')}>Вертикально</button>
                        </div>
                        <button className="btn btn-link" onClick={autoPlaceRemaining}>Розставити випадково</button>
                    </div>
                )}

                {isReadyPhase && (
                    <div className="ready-box">
                        <p>Всі кораблі успішно розміщено на позиціях.</p>
                        <button className="btn btn-ready" disabled={isReady} onClick={handleReadyClick}>
                            {isReady ? "Очікування готовності..." : "Готовий до бою"}
                        </button>
                        {gameMode === 'online' && (
                            <div className="ready-indicators">
                                <span className={`indicator ${isReady ? 'ready' : ''}`}>Ви: {isReady ? 'Готовий' : 'Ні'}</span>
                                <span className={`indicator ${isEnemyReady ? 'ready' : ''}`}>Ворог: {isEnemyReady ? 'Готовий' : 'Ні'}</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="battlefield">
                    <div className="board-wrapper">
                        <span className="board-title">Ваш флот</span>
                        {renderGrid(playerBoard, false)}
                    </div>
                    <div className="board-wrapper" style={{ display: (!isPlacementPhase && !isReadyPhase) ? 'block' : 'none' }}>
                        <span className="board-title">Радар супротивника</span>
                        {renderGrid(enemyBoard, true)}
                    </div>
                </div>

                <footer className="game-footer">
                    <button className="btn btn-danger" onClick={exitToMenu}>Капітулювати</button>
                </footer>
            </section>
        </main>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<SeaBattleApp />);