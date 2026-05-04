/* ══════════════════════════════════════════════════════════════════════════
   input.js — Input Manager
   Handles: Mouse, Keyboard, Touch, Phone (via WebSocket)
   ══════════════════════════════════════════════════════════════════════════ */

window.InputManager = (function () {

  let sensitivity    = 5;
  let racketCallback = null; // (side, x, y) => void
  let side           = 'red';
  let mouseX         = 0;
  let mouseY         = 0;
  let smoothX        = 0;
  let smoothY        = 0;
  let phoneConnected = { red: false, blue: false };
  let phoneData      = {
    red:  { rotation: { x: 0, y: 0, z: 0 }, acceleration: { x: 0, y: 0, z: 0 }, targetX: 0, targetY: 0 },
    blue: { rotation: { x: 0, y: 0, z: 0 }, acceleration: { x: 0, y: 0, z: 0 }, targetX: 0, targetY: 0 }
  };

  const C = PhysicsEngine.getConstants();

  // ── Init ─────────────────────────────────────────────────────────────────
  function init(opts = {}) {
    sensitivity    = opts.sensitivity || 5;
    side           = opts.side        || 'red';
    racketCallback = opts.onRacket;

    _bindMouse();
    _bindTouch();
    _bindKeyboard();
  }

  // ── Mouse ─────────────────────────────────────────────────────────────────
  function _bindMouse() {
    window.addEventListener('mousemove', (e) => {
      // Normalize -1 to 1
      mouseX = ((e.clientX / window.innerWidth) - 0.5) * 2;
      mouseY = -((e.clientY / window.innerHeight) - 0.5) * 2;
    });
  }

  // ── Touch (for tablet/PC touch screens) ───────────────────────────────────
  function _bindTouch() {
    window.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      mouseX  = ((t.clientX / window.innerWidth) - 0.5) * 2;
      mouseY = -((t.clientY / window.innerHeight) - 0.5) * 2;
    }, { passive: true });
  }

  // ── Keyboard (WASD / Arrow keys as fallback) ──────────────────────────────
  const keys = {};
  function _bindKeyboard() {
    window.addEventListener('keydown', (e) => { keys[e.code] = true; });
    window.addEventListener('keyup',   (e) => { keys[e.code] = false; });
  }

  // ── Phone input (called from network.js) ──────────────────────────────────
  function onPhoneInput(phoneX, phoneSide) {
    // Legacy 2D input
    phoneConnected[phoneSide] = true;
    if (phoneSide === side && racketCallback) {
      const worldX = phoneX * C.tableHalfWid * (sensitivity / 5);
      const worldY = C.tableHeight + 0.2;
      racketCallback(phoneSide, worldX, worldY);
    }
  }

  function onMotionData(data) {
    const s = data.side || 'red';
    phoneConnected[s] = true;

    // Map tilt to target X/Y
    // Pitch (x) -> Vertical movement (Y in world)
    // Roll (y) -> Horizontal movement (X in world)
    // We expect values around -90 to 90
    const tiltX = (data.rotation.y / 45); // Roll for X
    const tiltY = -(data.rotation.x / 45); // Pitch for Y

    phoneData[s].targetX = Math.max(-1.5, Math.min(1.5, tiltX));
    phoneData[s].targetY = Math.max(-1, Math.min(1, tiltY));
    phoneData[s].rotation = data.rotation;
    phoneData[s].acceleration = data.acceleration;

    _updatePhoneIndicator();
  }

  function setPhoneConnected(phoneSide, connected) {
    phoneConnected[phoneSide] = connected;
    _updatePhoneIndicator();
  }

  function _updatePhoneIndicator() {
    const el = document.getElementById('hud-phone');
    if (!el) return;
    const anyConnected = phoneConnected.red || phoneConnected.blue;
    el.textContent = anyConnected ? '📱 Phone Connected' : '🖱 Mouse Control';
    el.classList.toggle('active', anyConnected);
  }

  // ── Update loop (called every frame) ─────────────────────────────────────
  function update() {
    let worldX, worldY, rotation;

    if (phoneConnected[side]) {
      const data = phoneData[side];
      // Smooth interpolation for phone data
      smoothX += (data.targetX - smoothX) * 0.15;
      smoothY += (data.targetY - smoothY) * 0.15;

      worldX = smoothX * C.tableHalfWid * 1.2;
      worldY = C.tableHeight + 0.3 + smoothY * 0.4;
      rotation = data.rotation;
    } else {
      // Smooth interpolation for mouse
      smoothX += (mouseX - smoothX) * 0.22;
      smoothY += (mouseY - smoothY) * 0.22;

      worldX = smoothX * C.tableHalfWid;
      worldY = C.tableHeight + 0.3 + smoothY * 0.5;
      rotation = null;
    }

    if (racketCallback) {
      racketCallback(side, worldX, worldY, rotation);
    }
  }

  // For local multiplayer — separate input per side
  function getLocalInputPos(localSide) {
    if (localSide === 'red') {
      const x = ((keys['KeyA'] ? -1 : 0) + (keys['KeyD'] ? 1 : 0)) * C.tableHalfWid * 0.9;
      const y = C.tableHeight + 0.2 + ((keys['KeyW'] ? 1 : 0) + (keys['KeyS'] ? -1 : 0)) * 0.3;
      return { x, y };
    } else {
      const x = ((keys['ArrowLeft'] ? -1 : 0) + (keys['ArrowRight'] ? 1 : 0)) * C.tableHalfWid * 0.9;
      const y = C.tableHeight + 0.2 + ((keys['ArrowUp'] ? 1 : 0) + (keys['ArrowDown'] ? -1 : 0)) * 0.3;
      return { x, y };
    }
  }

  function setSensitivity(v) { sensitivity = v; }
  function setSide(s)        { side = s; }
  function getMouseX()       { return smoothX; }
  function isPhoneConnected(s) { return phoneConnected[s]; }

  return {
    init, update, onPhoneInput, setPhoneConnected,
    setSensitivity, setSide, getMouseX, getLocalInputPos
  };
})();
