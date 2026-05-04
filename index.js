const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

// Serve static files from public/
app.use(express.static(path.join(__dirname, '../public')));

// ─── In-memory stores ────────────────────────────────────────────────────────
const sessions = new Map();   // code → { hostId, guestId, gameId, state }
const phones   = new Map();   // phoneId → { sessionCode, role, socketId }
const games    = new Map();   // gameId → full game state (server-authoritative)

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generate6DigitCode() {
  let code;
  do { code = Math.floor(100000 + Math.random() * 900000).toString(); }
  while (sessions.has(code));
  return code;
}

function createGameState(gameId, mode) {
  return {
    gameId,
    mode,             // 'single' | 'multi' | 'local'
    state: 'waiting', // waiting | countdown | playing | point | gameover
    ball: { x: 0, y: 0.15, z: 0, vx: 0, vy: 0, vz: 0 },
    scores: { red: 0, blue: 0 },
    server: 'red',    // who serves next
    winner: null,
    lastUpdate: Date.now(),
    rackets: {
      red:  { x: 0, vx: 0 },
      blue: { x: 0, vx: 0 }
    },
    countdownValue: 3
  };
}

// ─── Physics constants (server-authoritative) ─────────────────────────────────
const PHYSICS = {
  gravity:        -9.8,
  tableHalfLen:   1.37,   // metres (half table length)
  tableHalfWid:   0.76,
  tableHeight:    0.76,
  netHeight:      0.1525,
  ballRadius:     0.02,
  bounceRestitution: 0.85,
  racketWidth:    0.18,
  racketHeight:   0.02,
  winScore:       15,
  dt:             1 / 60
};

function serveBall(gameState) {
  const dir = gameState.server === 'red' ? -1 : 1;
  gameState.ball = {
    x: 0, y: 0.3, z: dir * 0.5,
    vx: (Math.random() - 0.5) * 0.5,
    vy: 0.8,
    vz: dir * -3.5
  };
  gameState.state = 'playing';
}

function stepPhysics(gs) {
  const b  = gs.ball;
  const dt = PHYSICS.dt;

  b.vy += PHYSICS.gravity * dt;
  b.x  += b.vx * dt;
  b.y  += b.vy * dt;
  b.z  += b.vz * dt;

  // Table bounce (y)
  const tableTop = PHYSICS.tableHeight + PHYSICS.ballRadius;
  if (b.y <= tableTop && Math.abs(b.x) < PHYSICS.tableHalfWid && Math.abs(b.z) < PHYSICS.tableHalfLen) {
    b.y  = tableTop + 0.001;
    if (b.vy < 0) {
      b.vy = -b.vy * PHYSICS.bounceRestitution;
    }
    b.vx *= 0.98;
    b.vz *= 0.98;
    return { event: 'tableBounce' };
  }

  // Net collision (DISABLED)
  /*
  if (Math.abs(b.z) < 0.02 && b.y <= PHYSICS.tableHeight + PHYSICS.netHeight && Math.abs(b.x) <= PHYSICS.tableHalfWid) {
    b.vz = -b.vz * 0.5;
    b.vx *= 0.8;
    // Push ball out of the net collision zone to prevent sticking
    b.z = (b.z < 0 ? -1 : 1) * 0.021;
    return { event: 'netHit' };
  }
  */

  // Racket collision
  for (const [side, rk] of Object.entries(gs.rackets)) {
    const rz = side === 'red' ? PHYSICS.tableHalfLen - 0.05 : -(PHYSICS.tableHalfLen - 0.05);
    const approaching = (side === 'red' && b.vz > 0) || (side === 'blue' && b.vz < 0);
    if (approaching && Math.abs(b.z - rz) < 0.07 &&
        Math.abs(b.x - rk.x) < PHYSICS.racketWidth / 2 &&
        b.y > PHYSICS.tableHeight && b.y < PHYSICS.tableHeight + 0.5) {
      const spin = rk.vx * 0.3;
      b.vz = -b.vz * 0.9;
      b.vy = Math.abs(b.vy) * 0.6 + 2.0;
      b.vx = b.vx * 0.7 + spin;
      b.z  = rz + (side === 'red' ? -0.08 : 0.08);
      return { event: 'racketHit', side };
    }
  }

  // Out of bounds checks
  if (b.y < PHYSICS.tableHeight - 0.3) return { event: 'ballLost', scorer: b.vz > 0 ? 'blue' : 'red' };
  if (Math.abs(b.x) > PHYSICS.tableHalfWid * 2) return { event: 'ballLost', scorer: b.vz > 0 ? 'blue' : 'red' };
  if (Math.abs(b.z) > PHYSICS.tableHalfLen * 1.5) {
    // Who missed
    const miss = b.vz > 0 ? 'red' : 'blue';
    return { event: 'ballLost', scorer: miss === 'red' ? 'blue' : 'red' };
  }

  return null;
}

function handlePoint(gs, scorer, nextServer) {
  gs.scores[scorer]    = Math.min(gs.scores[scorer] + 1, 99);
  const loser           = scorer === 'red' ? 'blue' : 'red';
  gs.scores[loser]      = Math.max(0, gs.scores[loser]);
  gs.server             = nextServer || loser;   // default: loser serves next
  gs.state              = 'point';
  if (gs.scores[scorer] >= PHYSICS.winScore) {
    gs.state  = 'gameover';
    gs.winner = scorer;
  }
  return gs.state;
}

// ─── Game loop (server-authoritative for multiplayer) ─────────────────────────
const GAME_LOOPS = new Map(); // gameId → interval

function startGameLoop(gameId, roomName) {
  if (GAME_LOOPS.has(gameId)) return;
  const interval = setInterval(() => {
    const gs = games.get(gameId);
    if (!gs) { clearInterval(interval); GAME_LOOPS.delete(gameId); return; }
    if (gs.state !== 'playing') return;

    const event = stepPhysics(gs);
    if (event) {
      if (event.event === 'ballLost') {
        const st = handlePoint(gs, event.scorer);
        io.to(roomName).emit('scoreUpdate', { scores: gs.scores, scorer: event.scorer, server: gs.server });
        if (st === 'gameover') {
          io.to(roomName).emit('gameOver', { winner: gs.winner, scores: gs.scores });
          clearInterval(interval);
          GAME_LOOPS.delete(gameId);
        } else {
          io.to(roomName).emit('pointEnd', { scorer: event.scorer, server: gs.server });
          setTimeout(() => {
            if (games.has(gameId)) {
              serveBall(games.get(gameId));
              io.to(roomName).emit('serve', { ball: games.get(gameId).ball, server: gs.server });
            }
          }, 2500);
        }
      } else {
        io.to(roomName).emit('ballEvent', event);
      }
    }

    io.to(roomName).emit('ballSync', { ball: gs.ball, t: Date.now() });
  }, 1000 / 60);

  GAME_LOOPS.set(gameId, interval);
}

// ─── Socket.IO events ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[+] connected:', socket.id);

  // ── Create session (host opens game) ──────────────────────────────────────
  socket.on('createSession', ({ mode }) => {
    const code   = generate6DigitCode();
    const gameId = uuidv4();
    const gs     = createGameState(gameId, mode);
    games.set(gameId, gs);
    sessions.set(code, { hostId: socket.id, guestId: null, gameId, mode, code });
    socket.join(`game:${gameId}`);
    socket.data.gameId = gameId;
    socket.data.role   = 'host';
    socket.data.side   = 'red';
    socket.emit('sessionCreated', { code, gameId, role: 'red', shareUrl: `?join=${code}` });
    console.log(`[session] created ${code} mode=${mode}`);
  });

  // ── Join session by code ───────────────────────────────────────────────────
  socket.on('joinSession', ({ code }) => {
    const session = sessions.get(code);
    if (!session) return socket.emit('joinError', { message: 'Session not found' });
    if (session.guestId) return socket.emit('joinError', { message: 'Session full' });
    session.guestId = socket.id;
    socket.join(`game:${session.gameId}`);
    socket.data.gameId = session.gameId;
    socket.data.role   = 'guest';
    socket.data.side   = 'blue';
    socket.emit('joinedSession', { code, gameId: session.gameId, role: 'blue' });
    io.to(`game:${session.gameId}`).emit('bothConnected', { mode: session.mode });
    console.log(`[session] joined ${code}`);
  });

  // ── Phone connects as racket ───────────────────────────────────────────────
  socket.on('phoneConnect', ({ code, role }) => {
    const session = sessions.get(code);
    if (!session) return socket.emit('phoneError', { message: 'Invalid code' });
    phones.set(socket.id, { sessionCode: code, role, gameId: session.gameId });
    socket.join(`game:${session.gameId}`);
    socket.data.isPhone = true;
    socket.data.gameId  = session.gameId;
    socket.data.side    = role;
    io.to(`game:${session.gameId}`).emit('phoneConnected', { role });
    socket.emit('phoneReady', { gameId: session.gameId, role });
    console.log(`[phone] connected role=${role} code=${code}`);
  });

  // ── Motion data from phone ────────────────────────────────────────────────
  socket.on('motionData', (data) => {
    const gameId = socket.data.gameId;
    if (!gameId) return;
    // Relay to everyone in the room except sender
    socket.to(`game:${gameId}`).emit('motionData', data);
  });

  // ── Racket input (from phone or mouse) ────────────────────────────────────
  socket.on('racketInput', ({ x, side, y, rotation }) => {
    const gameId = socket.data.gameId;
    const gs     = games.get(gameId);
    if (!gs) return;
    const s      = side || socket.data.side || 'red';
    const rk     = gs.rackets[s];
    const prev   = rk.x;
    rk.x         = Math.max(-PHYSICS.tableHalfWid + 0.1, Math.min(PHYSICS.tableHalfWid - 0.1, x));
    rk.vx        = rk.x - prev;
    if (y !== undefined) rk.y = y;
    if (rotation !== undefined) rk.rotation = rotation;
    // Broadcast to room (not back to sender)
    socket.to(`game:${gameId}`).emit('racketSync', { side: s, x: rk.x, y, rotation });
  });

  // ── Start game (host triggers) ─────────────────────────────────────────────
  socket.on('startGame', () => {
    const gameId = socket.data.gameId;
    const gs     = games.get(gameId);
    if (!gs) return;
    gs.state          = 'countdown';
    io.to(`game:${gameId}`).emit('countdown', { value: 'READY' });
    
    setTimeout(() => io.to(`game:${gameId}`).emit('countdown', { value: 1 }), 1000);
    setTimeout(() => io.to(`game:${gameId}`).emit('countdown', { value: 2 }), 2000);
    setTimeout(() => io.to(`game:${gameId}`).emit('countdown', { value: 3 }), 3000);
    setTimeout(() => {
      io.to(`game:${gameId}`).emit('countdown', { value: 0 });
      serveBall(gs);
      io.to(`game:${gameId}`).emit('serve', { ball: gs.ball, server: gs.server });
      startGameLoop(gameId, `game:${gameId}`);
    }, 4000);
  });

  // ── Bot hit (single-player mode, server decides) ───────────────────────────
  socket.on('requestBotHit', ({ ball }) => {
    const gameId = socket.data.gameId;
    const gs     = games.get(gameId);
    if (!gs || gs.mode !== 'single') return;
    // 50% miss chance
    if (Math.random() < 0.5) {
      socket.emit('botMiss');
    } else {
      const returnX  = (Math.random() - 0.5) * PHYSICS.tableHalfWid * 1.2;
      socket.emit('botHit', { targetX: returnX, spin: (Math.random() - 0.5) * 0.4 });
    }
  });

  // ── Chat / ready for rematch ───────────────────────────────────────────────
  socket.on('playerReady', () => {
    const gameId = socket.data.gameId;
    const gs     = games.get(gameId);
    if (!gs) return;
    if (!gs._readyCount) gs._readyCount = 0;
    gs._readyCount++;
    if (gs._readyCount >= 2 || gs.mode === 'single') {
      const newGs = createGameState(gameId, gs.mode);
      games.set(gameId, newGs);
      io.to(`game:${gameId}`).emit('rematch', { gameState: newGs });
      gs._readyCount = 0;
    } else {
      socket.to(`game:${gameId}`).emit('opponentReady');
    }
  });

  // ── Ping / latency ────────────────────────────────────────────────────────
  socket.on('ping', (cb) => { if (typeof cb === 'function') cb(); });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const gameId = socket.data.gameId;
    if (gameId) {
      if (!socket.data.isPhone) {
        io.to(`game:${gameId}`).emit('opponentDisconnected');
        const interval = GAME_LOOPS.get(gameId);
        if (interval) { clearInterval(interval); GAME_LOOPS.delete(gameId); }
      } else {
        const role = socket.data.side;
        io.to(`game:${gameId}`).emit('phoneDisconnected', { role });
      }
    }
    phones.delete(socket.id);
    console.log('[-] disconnected:', socket.id);
  });
});

// ─── API endpoint for share URL ───────────────────────────────────────────────
app.get('/api/session/:code', (req, res) => {
  const s = sessions.get(req.params.code);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json({ code: s.code, mode: s.mode, hasGuest: !!s.guestId });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\n🏓 Table Tennis Online — server running on http://localhost:${PORT}\n`));
