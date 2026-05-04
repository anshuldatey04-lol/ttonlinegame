/* ══════════════════════════════════════════════════════════════════════════
   ui.js — UIManager
   Handles all screen transitions, score updates, overlays
   ══════════════════════════════════════════════════════════════════════════ */

window.UIManager = (function () {

  const screens = {};

  function init() {
    document.querySelectorAll('.screen').forEach(s => {
      screens[s.id] = s;
    });
    _buildParticles();
    _bindSettingsUI();
    _bindCopyButtons();
  }

  // ── Screen navigation ─────────────────────────────────────────────────────
  function showScreen(id) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    const target = screens[id];
    if (target) {
      target.classList.add('active');
      // canvas must be positioned absolutely
      if (id === 'screen-game') {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
  }

  // ── Scoreboard ────────────────────────────────────────────────────────────
  function updateScore(red, blue) {
    const elR = document.getElementById('score-red');
    const elB = document.getElementById('score-blue');
    if (elR) { elR.textContent = red;  _popAnim(elR); }
    if (elB) { elB.textContent = blue; _popAnim(elB); }
  }

  function _popAnim(el) {
    el.classList.remove('pop');
    void el.offsetWidth; // reflow
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 300);
  }

  function setServeIndicator(side) {
    document.getElementById('serve-red')?.classList.toggle('active', side === 'red');
    document.getElementById('serve-blue')?.classList.toggle('active', side === 'blue');
  }

  function setPlayerLabels(redLabel, blueLabel) {
    const r = document.getElementById('hud-label-red');
    const b = document.getElementById('hud-label-blue');
    if (r) r.textContent = redLabel;
    if (b) b.textContent = blueLabel;
  }

  // ── Countdown overlay ──────────────────────────────────────────────────────
  function showCountdown(value, onDone) {
    const overlay = document.getElementById('countdown-overlay');
    const numEl   = document.getElementById('countdown-num');
    if (!overlay || !numEl) return;

    if (value === 0) {
      numEl.textContent = 'GO!';
      numEl.style.color = '#2ecc71';
      setTimeout(() => {
        overlay.classList.add('hidden');
        numEl.style.color = '';
        if (onDone) onDone();
      }, 700);
    } else {
      overlay.classList.remove('hidden');
      numEl.textContent = value;
      numEl.classList.remove('pop');
      void numEl.offsetWidth;
      numEl.classList.add('pop');
    }
  }

  // ── Point flash ────────────────────────────────────────────────────────────
  function showPointFlash(scorer, isPlayer) {
    const el  = document.getElementById('point-flash');
    const txt = document.getElementById('point-text');
    if (!el || !txt) return;
    txt.textContent = isPlayer ? '🎯 Point!' : '❌ Miss!';
    txt.style.color = isPlayer ? '#f4d03f' : '#e63946';
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    setTimeout(() => el.classList.add('hidden'), 1800);
  }

  // ── Game over screen ───────────────────────────────────────────────────────
  function showGameOver(won, scores) {
    const title  = document.getElementById('gameover-title');
    const scEl   = document.getElementById('gameover-scores');
    const animEl = document.getElementById('gameover-anim');
    if (title)  title.textContent  = won ? '🏆 You Won!' : '😔 You Lost!';
    if (scEl)   scEl.textContent   = `${scores.red} — ${scores.blue}`;
    if (animEl) animEl.textContent = won ? '🏆' : '😔';
    showScreen('screen-gameover');
    if (won) AudioManager.playWin(); else AudioManager.playLose();
  }

  // ── Lobby status ───────────────────────────────────────────────────────────
  function setLobbyStatus(msg) {
    const el = document.getElementById('lobby-status');
    if (el) el.textContent = msg;
  }

  function setLobbyUrl(url) {
    const el = document.getElementById('lobby-url');
    if (el) el.textContent = url;
  }

  function setLobbyP2Ready(ready) {
    const name = document.getElementById('lobby-p2');
    if (ready && name) {
      name.textContent = 'Opponent';
      name.style.color = 'var(--blue)';
    }
  }

  // ── Split screen toggle ────────────────────────────────────────────────────
  function setSplitScreen(on) {
    const div = document.getElementById('split-divider');
    if (div) div.classList.toggle('show', on);
  }

  // ── Phone status ───────────────────────────────────────────────────────────
  function setPhoneStatus(msg, connected = false) {
    const el = document.getElementById('phone-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('connected', connected);
  }

  // ── Pause overlay ──────────────────────────────────────────────────────────
  function showPause(on) {
    const el = document.getElementById('pause-overlay');
    if (el) el.classList.toggle('hidden', !on);
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  function _buildParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 28; i++) {
      const p    = document.createElement('div');
      p.className = 'particle';
      const size = 3 + Math.random() * 8;
      p.style.cssText = `
        width:${size}px; height:${size}px;
        left:${Math.random() * 100}%;
        animation-duration:${6 + Math.random() * 10}s;
        animation-delay:${-Math.random() * 10}s;
      `;
      container.appendChild(p);
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  function _bindSettingsUI() {
    const volSlider = document.getElementById('snd-volume');
    const volLabel  = document.getElementById('snd-vol-label');
    const sndToggle = document.getElementById('snd-toggle');
    const sensSlider = document.getElementById('sensitivity');
    const sensLabel  = document.getElementById('sens-label');

    volSlider?.addEventListener('input', () => {
      volLabel.textContent = volSlider.value;
      AudioManager.setVolume(parseInt(volSlider.value));
      // Sync with pause menu slider
      const pauseVol = document.getElementById('pause-volume');
      if (pauseVol) pauseVol.value = volSlider.value;
    });
    sndToggle?.addEventListener('change', () => {
      AudioManager.setEnabled(sndToggle.checked);
    });
    sensSlider?.addEventListener('input', () => {
      sensLabel.textContent = sensSlider.value;
      InputManager.setSensitivity(parseInt(sensSlider.value));
    });
  }

  // ── Copy buttons ──────────────────────────────────────────────────────────
  function _bindCopyButtons() {
    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
      const code = document.getElementById('session-code')?.textContent;
      if (code && code !== '------') _copyToClipboard(code, 'btn-copy-code');
    });

    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      const url = document.getElementById('lobby-url')?.textContent;
      if (url && url !== '—') _copyToClipboard(url, 'btn-copy-link');
    });
  }

  function _copyToClipboard(text, btnId) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById(btnId);
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
    }).catch(() => {
      // Fallback
      const el = document.createElement('textarea');
      el.value = text; document.body.appendChild(el);
      el.select(); document.execCommand('copy');
      document.body.removeChild(el);
    });
  }

  return {
    init, showScreen, updateScore, setServeIndicator,
    setPlayerLabels, showCountdown, showPointFlash, showGameOver,
    setLobbyStatus, setLobbyUrl, setLobbyP2Ready,
    setSplitScreen, setPhoneStatus, showPause
  };
})();
