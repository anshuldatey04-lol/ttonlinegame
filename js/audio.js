/* ══════════════════════════════════════════════════════════════════════════
   audio.js — AudioManager
   Procedural sound effects using Web Audio API
   ══════════════════════════════════════════════════════════════════════════ */

window.AudioManager = (function () {
  let ctx = null;
  let masterGain = null;
  let enabled = true;
  let volume = 0.7;

  function init() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
    } catch (e) {
      console.warn('[Audio] Web Audio not supported');
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function setVolume(v) {
    volume = v / 100;
    if (masterGain) masterGain.gain.value = enabled ? volume : 0;
  }

  function setEnabled(on) {
    enabled = on;
    if (masterGain) masterGain.gain.value = enabled ? volume : 0;
  }

  // ── Procedural sounds ──────────────────────────────────────────────────

  function _envelope(gainNode, attack, sustain, release) {
    const t = ctx.currentTime;
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(0.8, t + attack);
    gainNode.gain.setValueAtTime(0.8, t + attack + sustain);
    gainNode.gain.linearRampToValueAtTime(0, t + attack + sustain + release);
  }

  function playHit() {
    if (!ctx || !enabled) return;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(480, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);
    _envelope(g, 0.002, 0.02, 0.06);
    osc.connect(g); g.connect(masterGain);
    osc.start(); osc.stop(ctx.currentTime + 0.1);
  }

  function playBounce() {
    if (!ctx || !enabled) return;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.12);
    _envelope(g, 0.001, 0.04, 0.08);
    osc.connect(g); g.connect(masterGain);
    osc.start(); osc.stop(ctx.currentTime + 0.13);
  }

  function playPoint() {
    if (!ctx || !enabled) return;
    [0, 0.12, 0.24].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'triangle';
      const freqs = [440, 550, 660];
      osc.frequency.setValueAtTime(freqs[i], ctx.currentTime + delay);
      _envelope(g, 0.005, 0.1, 0.15);
      osc.connect(g); g.connect(masterGain);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
  }

  function playWin() {
    if (!ctx || !enabled) return;
    const melody = [523, 659, 784, 1047];
    melody.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      _envelope(g, 0.01, 0.2, 0.2);
      osc.connect(g); g.connect(masterGain);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.45);
    });
  }

  function playLose() {
    if (!ctx || !enabled) return;
    const melody = [330, 294, 262, 220];
    melody.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.2);
      _envelope(g, 0.01, 0.2, 0.3);
      osc.connect(g); g.connect(masterGain);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.5);
    });
  }

  return { init, resume, setVolume, setEnabled, playHit, playBounce, playPoint, playWin, playLose };
})();
