/* ══════════════════════════════════════════════════════════════════════════
   bot.js — Bot AI for Single Player Mode
   ══════════════════════════════════════════════════════════════════════════ */

window.BotAI = (function () {

  const DIFFICULTIES = {
    easy:   { hitChance: 0.25, reactionDelay: 0.40, errorRange: 0.35 },
    medium: { hitChance: 0.50, reactionDelay: 0.20, errorRange: 0.20 },
    hard:   { hitChance: 0.75, reactionDelay: 0.05, errorRange: 0.10 }
  };

  let difficulty    = 'medium';
  let targetX       = 0;
  let targetY       = 0;
  let smoothTargetX = 0;
  let smoothTargetY = 0;
  let waitingForBall= false;
  let reactionTimer = 0;

  const C = PhysicsEngine.getConstants();

  function setDifficulty(d) {
    difficulty = DIFFICULTIES[d] ? d : 'medium';
  }

  // Returns: { x, y } — desired racket position for blue (bot)
  function update(ballState, dt) {
    const cfg = DIFFICULTIES[difficulty];

    // React when ball is moving toward bot or in bot's half
    const ballInBotHalf = ballState.z < 0;
    const ballComingToBot = ballState.vz < 0;

    if (ballComingToBot || (ballInBotHalf && Math.abs(ballState.vz) < 1.0)) {
      if (!waitingForBall) {
        waitingForBall = true;
        reactionTimer  = cfg.reactionDelay;
      }

      if (reactionTimer > 0) {
        reactionTimer -= dt;
      } else {
        // Continuous prediction
        const dz      = Math.abs(ballState.z - (-(C.tableHalfLen - 0.05)));
        const timeToZ = dz / Math.max(Math.abs(ballState.vz), 0.5);
        
        const errorFactor = Math.min(1.0, dz / C.tableHalfLen);
        const error = (Math.random() - 0.5) * cfg.errorRange * errorFactor * 2;
        
        const predX   = ballState.x + ballState.vx * timeToZ + error;
        targetX       = Math.max(-C.tableHalfWid + 0.1, Math.min(C.tableHalfWid - 0.1, predX));
        
        // Predict Y (target slightly above ball's predicted height)
        const predY   = ballState.y + ballState.vy * timeToZ + 0.5 * C.gravity * timeToZ * timeToZ;
        targetY       = Math.max(C.tableHeight + 0.05, Math.min(C.tableHeight + 0.6, predY + 0.1));
      }
    } else {
      waitingForBall = false;
      // Return to center
      if (Math.abs(targetX) < 0.01) targetX = 0;
      else targetX *= 0.96;
      
      const defaultY = C.tableHeight + 0.2;
      if (Math.abs(targetY - defaultY) < 0.01) targetY = defaultY;
      else targetY += (defaultY - targetY) * 0.05;
    }

    // Smooth but faster approach
    const speed = 7.0 * (difficulty === 'easy' ? 0.6 : difficulty === 'hard' ? 1.6 : 1.0);
    smoothTargetX += (targetX - smoothTargetX) * Math.min(1, speed * dt);
    smoothTargetY += (targetY - smoothTargetY) * Math.min(1, speed * dt);

    return { x: smoothTargetX, y: smoothTargetY };
  }

  // Decide if bot hits or misses (called when ball reaches bot's zone)
  function decidesHit() {
    const cfg = DIFFICULTIES[difficulty];
    return Math.random() < cfg.hitChance;
  }

  // Get a random return direction after hit
  function getReturnX() {
    const error = (Math.random() - 0.5) * DIFFICULTIES[difficulty].errorRange * 3;
    return error; // relative to table center
  }

  function reset() {
    targetX = 0; smoothTargetX = 0;
    const defaultY = C.tableHeight + 0.2;
    targetY = defaultY; smoothTargetY = defaultY;
    waitingForBall = false; reactionTimer = 0;
  }

  return { setDifficulty, update, decidesHit, getReturnX, reset };
})();
