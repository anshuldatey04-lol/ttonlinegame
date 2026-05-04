/* ══════════════════════════════════════════════════════════════════════════
   game.js — Game State Machine + Main Loop
   Orchestrates all modules: Physics, Renderer, Input, Network, Bot, UI
   ══════════════════════════════════════════════════════════════════════════ */

(function () {

  // ── Game State ─────────────────────────────────────────────────────────────
  const State = {
    HOME:       'home',
    LOBBY:      'lobby',
    DIFFICULTY: 'difficulty',
    COUNTDOWN:  'countdown',
    PLAYING:    'playing',
    PAUSED:     'paused',
    POINT_END:  'point_end',
    GAME_OVER:  'gameover'
  };

  let currentState = State.HOME;
  let gameMode     = null; // 'single' | 'multi' | 'local'
  let playerSide   = 'red';
  let animFrameId  = null;
  let isRunning    = false;

  // ── Initialise all subsystems ─────────────────────────────────────────────
  function boot() {
    AudioManager.init();

    UIManager.init();
    UIManager.showScreen('screen-home');

    PhysicsEngine.init({
      onTableBounce: () => AudioManager.playBounce(),
      onRacketHit:   (e) => {
        AudioManager.playHit();
        Renderer.triggerShake(0.012);
      },
      onPoint: (data) => {
        const isPlayerPoint = data.scorer === playerSide;
        UIManager.showPointFlash(data.scorer, isPlayerPoint);
        UIManager.updateScore(data.scores.red, data.scores.blue);
        UIManager.setServeIndicator(data.server);
        AudioManager.playPoint();
        currentState = State.POINT_END;
        setTimeout(() => {
          if (gameMode === 'single' || gameMode === 'local') {
            PhysicsEngine.serve();
            currentState = State.PLAYING;
          }
        }, 2400);
      },
      onGameOver: (data) => {
        currentState = State.GAME_OVER;
        const won = data.winner === playerSide;
        UIManager.showGameOver(won, data.scores);
      }
    });

    const canvas = document.getElementById('game-canvas');
    Renderer.init(canvas);

    InputManager.init({
      side:        'red',
      sensitivity: 5,
      onRacket: (side, x, y, rotation) => {
        if (currentState !== State.PLAYING && currentState !== State.POINT_END) return;
        PhysicsEngine.setRacket(side, x, y, rotation);
        NetworkManager.sendRacketInput(x, side, y, rotation);
      }
    });

    NetworkManager.init({
      onConnect:    (id) => { console.log('[Net] Connected', id); },
      onDisconnect: ()   => { console.log('[Net] Disconnected'); },

      onSessionCreated: (data) => {
        _onSessionCreated(data);
      },
      onJoinedSession: (data) => {
        _onJoinedSession(data);
      },
      onJoinError: (data) => {
        alert('❌ ' + (data.message || 'Could not join session'));
        UIManager.showScreen('screen-home');
      },
      onBothConnected: (data) => {
        UIManager.setLobbyP2Ready(true);
        UIManager.setLobbyStatus('✅ Opponent connected! Starting soon…');
        setTimeout(() => NetworkManager.startGame(), 1000);
      },
      onCountdown: (data) => {
        UIManager.showCountdown(data.value, () => {
          currentState = State.PLAYING;
        });
      },
      onServe: (data) => {
        PhysicsEngine.setState({ ball: data.ball });
        UIManager.setServeIndicator(data.server);
      },
      onBallSync: (data) => {
        if (gameMode === 'multi') {
          PhysicsEngine.setState({ ball: data.ball });
        }
      },
      onRacketSync: (data) => {
        if (gameMode === 'multi') {
          PhysicsEngine.setRacket(data.side, data.x, data.y, data.rotation);
        }
      },
      onScoreUpdate: (data) => {
        UIManager.updateScore(data.scores.red, data.scores.blue);
        UIManager.setServeIndicator(data.server);
      },
      onPointEnd: (data) => {
        const isPlayerPoint = data.scorer === playerSide;
        UIManager.showPointFlash(data.scorer, isPlayerPoint);
        AudioManager.playPoint();
        currentState = State.POINT_END;
      },
      onGameOver: (data) => {
        currentState = State.GAME_OVER;
        const won = data.winner === playerSide;
        UIManager.showGameOver(won, data.scores);
      },
      onOpponentDisconnected: () => {
        alert('⚠️ Opponent disconnected!');
        _goHome();
      },
      onPhoneConnected: (data) => {
        UIManager.setPhoneStatus(`📱 ${data.role.toUpperCase()} phone connected!`, true);
      },
      onPhoneDisconnected: (data) => {
        UIManager.setPhoneStatus(`📱 ${data.role.toUpperCase()} phone disconnected`, false);
      },
      onMotionData: (data) => {
        InputManager.onMotionData(data);
      },
      onBotHit: (data) => {
        // Bot hit — apply to physics
        const ps = PhysicsEngine.getState();
        const b  = ps.ball;
        b.vz  =  Math.abs(b.vz) * 0.85;
        b.vy  =  1.6 + Math.random() * 0.5;
        b.vx  += data.spin || 0;
        PhysicsEngine.setState({ ball: b });
      },
      onBotMiss: () => {
        // Bot missed → player scores
        console.log('[Bot] Miss');
      },
      onRematch: (data) => {
        _startMatchFromState(data.gameState);
      }
    });

    _bindHomeButtons();
    _bindDifficultyButtons();
    _bindGameButtons();
    _checkInviteLink();

    // Auto-create session for connection code
    NetworkManager.createSession('single');
  }

  // ── Home button bindings ────────────────────────────────────────────────────
  function _bindHomeButtons() {
    document.getElementById('btn-single')?.addEventListener('click', () => {
      AudioManager.resume();
      UIManager.showScreen('screen-difficulty');
    });

    document.getElementById('btn-multi')?.addEventListener('click', () => {
      AudioManager.resume();
      _startMultiplayer();
    });

    document.getElementById('btn-local')?.addEventListener('click', () => {
      AudioManager.resume();
      _startLocal();
    });

    document.getElementById('btn-lobby-back')?.addEventListener('click', () => {
      _goHome();
    });
  }

  function _bindDifficultyButtons() {
    const cards = document.querySelectorAll('.diff-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });

    document.getElementById('btn-start-single')?.addEventListener('click', () => {
      const active = document.querySelector('.diff-card.active');
      const diff   = active ? active.getAttribute('data-diff') : 'medium';
      _launchSinglePlayer(diff);
    });

    document.getElementById('btn-diff-back')?.addEventListener('click', () => {
      UIManager.showScreen('screen-home');
    });
  }

  function _bindGameButtons() {
    // Game over
    document.getElementById('btn-replay')?.addEventListener('click', () => {
      AudioManager.resume();
      if (gameMode === 'single') { _startSinglePlayer(); }
      else if (gameMode === 'local') { _startLocal(); }
      else { NetworkManager.sendReady(); }
    });
    document.getElementById('btn-go-home')?.addEventListener('click', _goHome);

    // Pause
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (currentState === State.PLAYING) _pauseGame();
        else if (currentState === State.PAUSED) _resumeGame();
      }
    });
    document.getElementById('btn-resume')?.addEventListener('click', _resumeGame);
    document.getElementById('btn-restart')?.addEventListener('click', _restartMatch);
    document.getElementById('btn-pause-exit')?.addEventListener('click', _goHome);

    // Pause menu volume
    const pauseVol = document.getElementById('pause-volume');
    if (pauseVol) {
      pauseVol.addEventListener('input', () => {
        AudioManager.setVolume(parseInt(pauseVol.value));
        // Sync with home screen slider
        const homeVol = document.getElementById('snd-volume');
        if (homeVol) homeVol.value = pauseVol.value;
        const homeLabel = document.getElementById('snd-vol-label');
        if (homeLabel) homeLabel.textContent = pauseVol.value;
      });
    }
  }

  // ── Check for invite URL ────────────────────────────────────────────────────
  function _checkInviteLink() {
    const code = NetworkManager.checkInviteUrl();
    if (code) {
      setTimeout(() => {
        gameMode = 'multi';
        UIManager.showScreen('screen-lobby');
        UIManager.setLobbyStatus('⏳ Joining game…');
        NetworkManager.joinSession(code);
      }, 800);
    }
  }

  // ── Game Mode Launchers ────────────────────────────────────────────────────

  function _startSinglePlayer() {
    UIManager.showScreen('screen-difficulty');
  }

  function _launchSinglePlayer(diff) {
    gameMode   = 'single';
    playerSide = 'red';
    InputManager.setSide('red');
    BotAI.setDifficulty(diff);
    BotAI.reset();

    UIManager.setPlayerLabels('YOU', 'BOT');
    UIManager.setSplitScreen(false);
    Renderer.setSplitMode(false);
    PhysicsEngine.reset();
    UIManager.updateScore(0, 0);
    UIManager.setServeIndicator('red');
    UIManager.showScreen('screen-game');

    NetworkManager.createSession('single');
    _runCountdown(() => {
      PhysicsEngine.serve();
      currentState = State.PLAYING;
    });
  }

  function _startMultiplayer() {
    gameMode = 'multi';
    playerSide = 'red';
    InputManager.setSide('red');
    UIManager.showScreen('screen-lobby');
    UIManager.setLobbyStatus('⏳ Waiting for opponent…');

    NetworkManager.createSession('multi');
    // sessionCreated callback will fill in the URL
  }

  function _startLocal() {
    gameMode   = 'local';
    playerSide = 'red';
    InputManager.setSide('red');

    UIManager.setPlayerLabels('RED', 'BLUE');
    UIManager.setSplitScreen(true);
    Renderer.setSplitMode(true);
    PhysicsEngine.reset();
    UIManager.updateScore(0, 0);
    UIManager.setServeIndicator('red');
    UIManager.showScreen('screen-game');

    NetworkManager.createSession('local');
    _runCountdown(() => {
      PhysicsEngine.serve();
      currentState = State.PLAYING;
    });
  }

  // ── Session callbacks ───────────────────────────────────────────────────────
  function _onSessionCreated(data) {
    document.getElementById('session-code').textContent = data.code;

    if (gameMode === 'multi') {
      const shareUrl = NetworkManager.getShareUrl();
      UIManager.setLobbyUrl(shareUrl);
    }
  }

  function _onJoinedSession(data) {
    playerSide = data.role || 'blue';
    InputManager.setSide(playerSide);
    UIManager.setLobbyStatus('✅ Joined! Waiting for host to start…');
    UIManager.showScreen('screen-lobby');

    // Swap labels for blue player perspective
    if (playerSide === 'blue') {
      UIManager.setPlayerLabels('BOT / OPP', 'YOU');
    }
  }

  function _startMatchFromState(gs) {
    PhysicsEngine.reset();
    if (gs) {
      PhysicsEngine.setState({
        scores: gs.scores, serving: gs.server || 'red', gameState: 'idle'
      });
    }
    UIManager.updateScore(0, 0);
    UIManager.showScreen('screen-game');
    _runCountdown(() => {
      PhysicsEngine.serve();
      currentState = State.PLAYING;
    });
  }

  // ── Countdown ───────────────────────────────────────────────────────────────
  function _runCountdown(onDone) {
    currentState = State.COUNTDOWN;
    UIManager.showCountdown('READY');
    setTimeout(() => UIManager.showCountdown(1), 1000);
    setTimeout(() => UIManager.showCountdown(2), 2000);
    setTimeout(() => UIManager.showCountdown(3), 3000);
    setTimeout(() => {
      UIManager.showCountdown(0, onDone);
    }, 4000);
  }

  // ── Pause ────────────────────────────────────────────────────────────────────
  function _pauseGame() {
    currentState = State.PAUSED;
    UIManager.showPause(true);
  }
  function _resumeGame() {
    currentState = State.PLAYING;
    UIManager.showPause(false);
  }

  function _restartMatch() {
    UIManager.showPause(false);
    if (gameMode === 'single') { _startSinglePlayer(); }
    else if (gameMode === 'local') { _startLocal(); }
    else { 
      // Multiplayer: just request ready
      NetworkManager.sendReady(); 
    }
  }

  // ── Home ─────────────────────────────────────────────────────────────────────
  function _goHome() {
    currentState = State.HOME;
    gameMode     = null;
    UIManager.showPause(false);
    UIManager.setSplitScreen(false);
    Renderer.setSplitMode(false);
    PhysicsEngine.reset();
    UIManager.showScreen('screen-home');
    // Re-create connection session for the code
    setTimeout(() => NetworkManager.createSession('single'), 500);
  }

  // ── Main Game Loop ────────────────────────────────────────────────────────────
  function _loop() {
    animFrameId = requestAnimationFrame(_loop);

    if (currentState === State.PLAYING || currentState === State.POINT_END) {
      const dt = 1 / 60;

      // ── Input ──
      InputManager.update();

      // ── Single player bot ──
      if (gameMode === 'single' && currentState === State.PLAYING) {
        const ps  = PhysicsEngine.getState();
        const botPos = BotAI.update(ps.ball, dt); // botPos now {x, y}
        PhysicsEngine.setRacket('blue', botPos.x, botPos.y);
      }

      // ── Local multiplayer input ──
      if (gameMode === 'local' && currentState === State.PLAYING) {
        const redInput  = InputManager.getLocalInputPos('red');
        const blueInput = InputManager.getLocalInputPos('blue');
        PhysicsEngine.setRacket('red', redInput.x, redInput.y);
        PhysicsEngine.setRacket('blue', blueInput.x, blueInput.y);
      }

      // ── Physics (single + local only; multi uses server-authoritative) ──
      if (gameMode !== 'multi') {
        const event = PhysicsEngine.step();
        if (event) {
          // Events are handled via callbacks in PhysicsEngine.init()
        }
      }
    }

    // ── Render ──
    const physState = PhysicsEngine.getState();
    Renderer.render(gameMode === 'local', physState, playerSide);
  }

  // ── Start ────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    boot();
    _loop();
  });

})();
