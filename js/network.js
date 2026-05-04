/* ══════════════════════════════════════════════════════════════════════════
   network.js — NetworkManager
   Handles Socket.IO connection, session creation/joining, sync
   ══════════════════════════════════════════════════════════════════════════ */

window.NetworkManager = (function () {

  let socket      = null;
  let gameId      = null;
  let sessionCode = null;
  let playerRole  = null; // 'red' | 'blue' | null (single)
  let callbacks   = {};
  let connected   = false;

  // ── Init / Connect ────────────────────────────────────────────────────────
  function init(opts = {}) {
    callbacks = opts;
    const serverUrl = window.location.origin;
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5
    });

    _bindSocketEvents();
  }

  function _bindSocketEvents() {

    socket.on('connect', () => {
      connected = true;
      _updateConnBadge(true);
      if (callbacks.onConnect) callbacks.onConnect(socket.id);
    });

    socket.on('disconnect', () => {
      connected = false;
      _updateConnBadge(false);
      if (callbacks.onDisconnect) callbacks.onDisconnect();
    });

    // ── Session ──────────────────────────────────────────────────────────
    socket.on('sessionCreated', (data) => {
      gameId      = data.gameId;
      sessionCode = data.code;
      playerRole  = data.role;
      _updateSessionCode(data.code);
      if (callbacks.onSessionCreated) callbacks.onSessionCreated(data);
    });

    socket.on('joinedSession', (data) => {
      gameId      = data.gameId;
      sessionCode = data.code;
      playerRole  = data.role;
      if (callbacks.onJoinedSession) callbacks.onJoinedSession(data);
    });

    socket.on('joinError', (data) => {
      if (callbacks.onJoinError) callbacks.onJoinError(data);
    });

    socket.on('bothConnected', (data) => {
      if (callbacks.onBothConnected) callbacks.onBothConnected(data);
    });

    // ── Game ──────────────────────────────────────────────────────────────
    socket.on('countdown', (data) => {
      if (callbacks.onCountdown) callbacks.onCountdown(data);
    });

    socket.on('serve', (data) => {
      if (callbacks.onServe) callbacks.onServe(data);
    });

    socket.on('ballSync', (data) => {
      if (callbacks.onBallSync) callbacks.onBallSync(data);
    });

    socket.on('ballEvent', (data) => {
      if (callbacks.onBallEvent) callbacks.onBallEvent(data);
    });

    socket.on('racketSync', (data) => {
      if (callbacks.onRacketSync) callbacks.onRacketSync(data);
    });

    socket.on('scoreUpdate', (data) => {
      if (callbacks.onScoreUpdate) callbacks.onScoreUpdate(data);
    });

    socket.on('pointEnd', (data) => {
      if (callbacks.onPointEnd) callbacks.onPointEnd(data);
    });

    socket.on('gameOver', (data) => {
      if (callbacks.onGameOver) callbacks.onGameOver(data);
    });

    socket.on('opponentDisconnected', () => {
      if (callbacks.onOpponentDisconnected) callbacks.onOpponentDisconnected();
    });

    // ── Phone ─────────────────────────────────────────────────────────────
    socket.on('phoneConnected', (data) => {
      InputManager.setPhoneConnected(data.role, true);
      if (callbacks.onPhoneConnected) callbacks.onPhoneConnected(data);
    });

    socket.on('phoneDisconnected', (data) => {
      InputManager.setPhoneConnected(data.role, false);
      if (callbacks.onPhoneDisconnected) callbacks.onPhoneDisconnected(data);
    });

    socket.on('phoneReady', (data) => {
      if (callbacks.onPhoneReady) callbacks.onPhoneReady(data);
    });

    socket.on('motionData', (data) => {
      if (callbacks.onMotionData) callbacks.onMotionData(data);
    });

    // ── Bot (single player) ───────────────────────────────────────────────
    socket.on('botHit', (data) => {
      if (callbacks.onBotHit) callbacks.onBotHit(data);
    });

    socket.on('botMiss', () => {
      if (callbacks.onBotMiss) callbacks.onBotMiss();
    });

    // ── Rematch ───────────────────────────────────────────────────────────
    socket.on('rematch', (data) => {
      if (callbacks.onRematch) callbacks.onRematch(data);
    });

    socket.on('opponentReady', () => {
      if (callbacks.onOpponentReady) callbacks.onOpponentReady();
    });
  }

  // ── Emitters ──────────────────────────────────────────────────────────────

  function createSession(mode) {
    if (!socket) return;
    socket.emit('createSession', { mode });
  }

  function joinSession(code) {
    if (!socket) return;
    socket.emit('joinSession', { code });
  }

  function startGame() {
    if (!socket) return;
    socket.emit('startGame');
  }

  function sendRacketInput(x, s, y, rotation) {
    if (!socket || !connected) return;
    socket.emit('racketInput', { x, side: s || playerRole, y, rotation });
  }

  function requestBotHit(ball) {
    if (!socket) return;
    socket.emit('requestBotHit', { ball });
  }

  function sendReady() {
    if (!socket) return;
    socket.emit('playerReady');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _updateSessionCode(code) {
    const el = document.getElementById('session-code');
    if (el) el.textContent = code;
  }

  function _updateConnBadge(on) {
    const dot   = document.getElementById('conn-dot');
    const label = document.getElementById('conn-label');
    if (dot)   dot.classList.toggle('connected', on);
    if (label) label.textContent = on ? 'Connected' : 'Disconnected';
  }

  function getSessionCode() { return sessionCode; }
  function getGameId()      { return gameId; }
  function getRole()        { return playerRole; }
  function isConnected()    { return connected; }

  // Build the share URL
  function getShareUrl() {
    return `${window.location.origin}?join=${sessionCode}`;
  }

  // Check if we were opened via invite link
  function checkInviteUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('join') || null;
  }

  return {
    init, createSession, joinSession, startGame,
    sendRacketInput, requestBotHit, sendReady,
    getSessionCode, getGameId, getRole, isConnected, getShareUrl, checkInviteUrl
  };
})();
