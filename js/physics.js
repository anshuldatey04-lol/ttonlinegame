/* ══════════════════════════════════════════════════════════════════════════
   physics.js — Client-side Physics Engine
   Used for Single Player and Local Multiplayer (client-authoritative)
   Multiplayer uses server-authoritative physics from server/index.js
   ══════════════════════════════════════════════════════════════════════════ */

window.PhysicsEngine = (function () {

  const C = {
    gravity:            -9.8,
    tableHalfLen:        1.37,
    tableHalfWid:        0.76,
    tableHeight:         0.76,
    netHeight:           0.1525,
    netThickness:        0.01,
    ballRadius:          0.02,
    bounceRestitution:   0.82,
    frictionXZ:          0.985,
    racketWidth:         0.18,
    racketThickness:     0.02,
    winScore:            15,
    dt:                  1 / 60
  };

  // ── State ──────────────────────────────────────────────────────────────
  let ball   = null;
  let rackets = { red: null, blue: null };
  let scores  = { red: 0, blue: 0 };
  let serving = 'red';
  let gameState = 'idle'; // idle | playing | point | gameover
  let callbacks = {};

  function init(opts = {}) {
    callbacks = opts;
    reset();
  }

  function reset() {
    ball   = { x: 0, y: 0.15, z: 0, vx: 0, vy: 0, vz: 0 };
    rackets = {
      red:  { x: 0, y: C.tableHeight + 0.06, z:  C.tableHalfLen - 0.05, vx: 0, vy: 0 },
      blue: { x: 0, y: C.tableHeight + 0.06, z: -(C.tableHalfLen - 0.05), vx: 0, vy: 0, _decidedHit: false, _willHit: true }
    };
    scores   = { red: 0, blue: 0 };
    serving  = 'red';
    gameState = 'idle';
  }

  function serve() {
    const dir = serving === 'red' ? -1 : 1;
    const jitter = () => (Math.random() - 0.5) * 0.3;
    ball = {
      x: jitter() * 0.2, y: 0.35, z: dir * 0.45,
      vx: jitter(),
      vy: 1.1,
      vz: dir * -3.8
    };
    gameState = 'playing';
  }

  function setRacket(side, x, y, rotation) {
    if (!rackets[side]) return;
    const prevX  = rackets[side].x;
    const prevY  = rackets[side].y;
    rackets[side].x  = Math.max(-C.tableHalfWid + 0.1, Math.min(C.tableHalfWid - 0.1, x));
    if (y !== undefined) {
      rackets[side].y = Math.max(C.tableHeight - 0.1, Math.min(C.tableHeight + 0.8, y));
    }
    if (rotation !== undefined) {
      rackets[side].rotation = rotation;
    }
    rackets[side].vx = rackets[side].x - prevX;
    rackets[side].vy = rackets[side].y - prevY;
  }

  function step() {
    if (gameState !== 'playing') return null;

    const b  = ball;
    const dt = C.dt;

    // ── Gravity ──
    b.vy += C.gravity * dt;

    // ── Position ──
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;

    // ── Table surface bounce ──
    const tableTop = C.tableHeight + C.ballRadius;
    const onTable  = Math.abs(b.x) <= C.tableHalfWid && Math.abs(b.z) <= C.tableHalfLen;
    if (b.y <= tableTop && onTable && b.vy < 0) {
      b.y  = tableTop + 0.005; // Stronger push-out
      b.vy = Math.abs(b.vy) * 0.95; // Less energy loss (previously C.bounceRestitution)
      if (b.vy < 0.6) b.vy = 0.6; // Force minimum bounce to prevent sticking
      
      // Removed frictionXZ to keep ball fast
      // b.vx *= C.frictionXZ;
      // b.vz *= C.frictionXZ;
      if (callbacks.onTableBounce) callbacks.onTableBounce({ x: b.x, z: b.z });
      AudioManager.playBounce();
      return { event: 'tableBounce', x: b.x, z: b.z };
    }

    // ── Net collision (DISABLED) ──
    /*
    const netTop = C.tableHeight + C.netHeight;
    if (Math.abs(b.z) < C.netThickness + C.ballRadius &&
        b.y >= C.tableHeight && b.y <= netTop + C.ballRadius &&
        Math.abs(b.x) <= C.tableHalfWid) {
      
      b.vz *= -0.6;
      b.vx *= 0.7;
      b.vy *= 0.5;
      // Push ball out of the net collision zone to prevent sticking
      b.z = (b.z < 0 ? -1 : 1) * (C.netThickness + C.ballRadius + 0.001);

      if (callbacks.onNetHit) callbacks.onNetHit();
      AudioManager.playBounce(); // Or a specific net sound if available
      return { event: 'netHit' };
    }
    */

    // ── Racket collisions ──
    for (const [side, rk] of Object.entries(rackets)) {
      if (!rk) continue;
      
      // If it's the bot (blue side), check if it decides to hit
      if (side === 'blue' && b.vz < 0 && b.z > -0.5) {
        if (!rk._decidedHit) {
          rk._decidedHit = true;
          rk._willHit = BotAI.decidesHit();
        }
        if (!rk._willHit) continue; 
      } else if (side === 'blue' && b.vz > 0) {
         rk._decidedHit = false;
      }

      const dz = b.z - rk.z;
      const approaching = (side === 'red' && b.vz > 0) || (side === 'blue' && b.vz < 0);
      
      // Increased depth (0.12) and vertical range to prevent pass-through
      if (approaching && Math.abs(dz) < 0.12 &&
          Math.abs(b.x - rk.x) < C.racketWidth / 2 + 0.04 &&
          b.y > C.tableHeight - 0.2 && b.y < C.tableHeight + 0.6) {
        
        const spin = rk.vx * 0.3;
        b.vz = -b.vz * 0.92;
        b.vy = Math.abs(b.vy) * 0.4 + 2.0;
        b.vx = b.vx * 0.65 + spin;
        
        // Correct position to prevent double-hits or sticking
        b.z  = rk.z + (side === 'red' ? -0.1 : 0.1);
        
        if (callbacks.onRacketHit) callbacks.onRacketHit({ side });
        AudioManager.playHit();
        return { event: 'racketHit', side };
      }
    }

    // ── Out of bounds ──
    if (b.y < C.tableHeight - 0.5 || Math.abs(b.x) > C.tableHalfWid * 2.5 || Math.abs(b.z) > C.tableHalfLen * 1.8) {
      // Who missed? Ball going toward red zone means blue served & red missed, etc.
      const miss   = b.vz > 0 ? 'red' : 'blue';
      const scorer = miss === 'red' ? 'blue' : 'red';
      _handlePoint(scorer, miss);
      return { event: 'ballLost', scorer, miss };
    }

    return null;
  }

  function _handlePoint(scorer, miss, nextServer) {
    scores[scorer] = Math.min(scores[scorer] + 1, 99);
    scores[miss]   = Math.max(0, scores[miss]);
    serving        = nextServer || miss; // default: loser serves next
    gameState      = 'point';
    AudioManager.playPoint();
    if (scores[scorer] >= C.winScore) {
      gameState = 'gameover';
      if (callbacks.onGameOver) callbacks.onGameOver({ winner: scorer, scores: { ...scores } });
    } else {
      if (callbacks.onPoint) callbacks.onPoint({ scorer, miss, scores: { ...scores }, server: serving });
    }
  }

  function getState() {
    return {
      ball:     { ...ball },
      rackets:  { red: { ...rackets.red }, blue: { ...rackets.blue } },
      scores:   { ...scores },
      serving,
      gameState
    };
  }

  function getConstants() { return C; }

  function setState(s) {
    if (s.ball)    ball    = { ...s.ball };
    if (s.rackets) {
      if (s.rackets.red)  rackets.red  = { ...s.rackets.red  };
      if (s.rackets.blue) rackets.blue = { ...s.rackets.blue };
    }
    if (s.scores)    scores    = { ...s.scores };
    if (s.serving)   serving   = s.serving;
    if (s.gameState) gameState = s.gameState;
  }

  function setGameState(s) { gameState = s; }

  return { init, reset, serve, step, setRacket, getState, getConstants, setState, setGameState };
})();
