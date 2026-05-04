/* ══════════════════════════════════════════════════════════════════════════
   controller-smartphone.js — Smartphone Controller Logic
   Handles: Socket.IO, DeviceOrientation, DeviceMotion, Calibration
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  let socket = null;
  let sessionCode = null;
  let playerRole = null;
  let isCalibrated = false;
  let calibrationOffset = { alpha: 0, beta: 0, gamma: 0 };
  let lastOrientation = { alpha: 0, beta: 0, gamma: 0 };
  let lastMotion = { x: 0, y: 0, z: 0 };
  let isActive = false;

  const UI = {
    setupView: document.getElementById('setup-view'),
    gameView: document.getElementById('game-view'),
    setupStatus: document.getElementById('setup-status'),
    gameStatus: document.getElementById('game-status'),
    inputCode: document.getElementById('input-code'),
    btnRed: document.getElementById('btn-join-red'),
    btnBlue: document.getElementById('btn-join-blue'),
    btnStart: document.getElementById('btn-start'),
    btnCalibrate: document.getElementById('btn-calibrate'),
    displayCode: document.getElementById('display-code'),
    roleBadge: document.getElementById('role-badge'),
    debug: document.getElementById('debug-info')
  };

  // ── Connection ─────────────────────────────────────────────────────────────
  function init() {
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('phoneReady', (data) => {
      UI.setupView.classList.add('hidden');
      UI.gameView.classList.remove('hidden');
      UI.displayCode.textContent = sessionCode;
      UI.roleBadge.className = `role-indicator role-${playerRole}`;
    });

    socket.on('phoneError', (data) => {
      alert(data.message || 'Error connecting');
      UI.setupStatus.textContent = data.message;
    });

    UI.btnRed.addEventListener('click', () => join('red'));
    UI.btnBlue.addEventListener('click', () => join('blue'));
    UI.btnStart.addEventListener('click', requestPermissions);
    UI.btnCalibrate.addEventListener('click', calibrate);

    // Auto-fill code from URL if present
    const params = new URLSearchParams(window.location.search);
    if (params.has('code')) {
      UI.inputCode.value = params.get('code');
    }
    if (params.has('role')) {
      join(params.get('role'));
    }
  }

  function join(role) {
    sessionCode = UI.inputCode.value.trim();
    if (sessionCode.length !== 6) {
      alert('Please enter a valid 6-digit code');
      return;
    }
    playerRole = role;
    socket.emit('phoneConnect', { code: sessionCode, role: playerRole });
  }

  // ── Sensors ────────────────────────────────────────────────────────────────
  async function requestPermissions() {
    // iOS 13+ permission request
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const orientationRes = await DeviceOrientationEvent.requestPermission();
        const motionRes = await DeviceMotionEvent.requestPermission();
        
        if (orientationRes === 'granted' && motionRes === 'granted') {
          startSensors();
        } else {
          alert('Permissions denied');
        }
      } catch (err) {
        console.error(err);
        alert('Error requesting permissions: ' + err.message);
      }
    } else {
      // Android or older iOS
      startSensors();
    }
  }

  function startSensors() {
    isActive = true;
    UI.btnStart.classList.add('hidden');
    UI.btnCalibrate.style.display = 'block';

    window.addEventListener('deviceorientation', (e) => {
      lastOrientation = {
        alpha: e.alpha || 0,
        beta:  e.beta  || 0,
        gamma: e.gamma || 0
      };
      updateDebug();
    }, true);

    window.addEventListener('devicemotion', (e) => {
      const acc = e.accelerationIncludingGravity || e.acceleration;
      if (acc) {
        lastMotion = {
          x: acc.x || 0,
          y: acc.y || 0,
          z: acc.z || 0
        };
      }
    }, true);

    // Send data loop at ~60Hz
    setInterval(sendData, 1000 / 60);
  }

  function calibrate() {
    calibrationOffset = { ...lastOrientation };
    isCalibrated = true;
    UI.gameStatus.textContent = 'Calibrated ✅';
    setTimeout(() => {
      UI.gameStatus.textContent = `Connected to session: ${sessionCode}`;
    }, 2000);
  }

  function sendData() {
    if (!isActive || !socket.connected) return;

    // Apply calibration
    let alpha = lastOrientation.alpha - calibrationOffset.alpha;
    let beta  = lastOrientation.beta  - calibrationOffset.beta;
    let gamma = lastOrientation.gamma - calibrationOffset.gamma;

    // Simple payload
    socket.emit('motionData', {
      type: 'motion_data',
      rotation: { x: beta, y: gamma, z: alpha },
      acceleration: lastMotion,
      side: playerRole
    });
  }

  function updateDebug() {
    UI.debug.innerHTML = `
      Alpha (Yaw):   ${lastOrientation.alpha.toFixed(1)}°<br>
      Beta (Pitch):  ${lastOrientation.beta.toFixed(1)}°<br>
      Gamma (Roll):  ${lastOrientation.gamma.toFixed(1)}°<br>
      Acc X:         ${lastMotion.x.toFixed(2)}<br>
      Acc Y:         ${lastMotion.y.toFixed(2)}<br>
      Acc Z:         ${lastMotion.z.toFixed(2)}
    `;
  }

  init();
})();
