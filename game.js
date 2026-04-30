"use strict";

function initGameCanvas() {
  const canvas = document.getElementById("game-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    console.warn("[my-dino] 未找到 #game-canvas，跳过初始化。");
    return;
  }
  const statusEl = document.getElementById("game-status");

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.warn("[my-dino] 2D 上下文初始化失败。");
    return;
  }
  // Reduce shimmer for low-res obstacle sprites when moving.
  ctx.imageSmoothingEnabled = false;

  // ---- Tunable physics params ----
  const gravity = 1600; // px/s^2
  const jumpVelocity = -720; // px/s
  const groundY = canvas.height - 72; // 地面顶边 y
  const playerStandWidth = 52;
  const playerStandHeight = 64;
  const playerCrouchWidth = 62;
  const playerCrouchHeight = 40;
  const playerStartY = groundY - playerStandHeight; // 初始玩家底边贴地（等待开始态）
  const obstacleSpeedBase = 260; // px/s
  const obstacleSpeedMax = 420; // px/s cap
  const obstacleSpawnGapMinBase = 1.2; // sec
  const obstacleSpawnGapMaxBase = 2.1; // sec
  const difficultyRampSec = 45; // 到达难度上限所需秒数
  const warmupSec = 3.2; // 开局学习反应窗口
  const distanceScale = 0.08; // px -> m
  const jumpBufferSec = 0.12; // 提前按键可缓存，提升起跳手感
  const coyoteTimeSec = 0.08; // 离地后短暂宽限，避免“踩边按不出”
  const pteroFrameDurationSec = 0.2;
  const playerFrameDurationSec = 0.12;
  const groundStripeGap = 32;
  const groundStripeWidth = 14;
  const groundStripeHeight = 4;
  // Sky clouds (visual only; driven by elapsed time in render, no gameplay hooks).
  const cloudWrapW = 1280;
  const cloudDriftPxPerSec = 20;
  const cloudCount = 10;
  const cloudSkyTop = 6;
  const obstacleSprites = {
    cactusSmall: createSprite("./assets/obstacles/cactus-small.png"),
    cactusLarge: createSprite("./assets/obstacles/cactus-large.png"),
    ptero1: createSprite("./assets/obstacles/ptero-1.png"),
    ptero2: createSprite("./assets/obstacles/ptero-2.png"),
  };
  const playerSprites = {
    standing: createSprite("./assets/player/trex-standing.png"),
    run1: createSprite("./assets/player/trex-run-1.png"),
    run2: createSprite("./assets/player/trex-run-2.png"),
    duck1: createSprite("./assets/player/trex-ducking.png"),
    duck2: createSprite("./assets/player/trex-ducking-2.png"),
  };
  const GAME_PHASE = {
    READY: "READY",
    PLAYING: "PLAYING",
    GAMEOVER: "GAMEOVER",
  };

  const state = {
    elapsedMs: 0,
    frameCount: 0,
    runTimeSec: 0,
    distanceM: 0,
    scoreAcc: 0,
    score: 0,
    gravity,
    ground: {
      y: groundY,
      height: canvas.height - groundY,
    },
    player: {
      x: 120,
      y: playerStartY,
      width: playerStandWidth,
      height: playerStandHeight,
      vy: 0,
      onGround: false,
      coyoteTimerSec: 0,
      isCrouching: false,
    },
    obstacles: [],
    nextSpawnInSec: 0,
    phase: GAME_PHASE.READY,
    jumpBufferTimerSec: 0,
    groundScrollX: 0,
  };

  function resetRoundState() {
    const { player, ground } = state;
    state.runTimeSec = 0;
    state.distanceM = 0;
    state.scoreAcc = 0;
    state.score = 0;
    state.obstacles = [];
    state.jumpBufferTimerSec = 0;
    state.nextSpawnInSec = 0;

    player.isCrouching = false;
    applyPlayerPose(playerStandWidth, playerStandHeight);
    player.y = ground.y - player.height;
    player.vy = 0;
    player.onGround = true;
    player.coyoteTimerSec = coyoteTimeSec;

    scheduleNextObstacle();
  }

  function startNewRound() {
    resetRoundState();
    state.phase = GAME_PHASE.PLAYING;
  }

  function applyPlayerPose(nextWidth, nextHeight) {
    const player = state.player;
    const bottomY = player.y + player.height;
    player.width = nextWidth;
    player.height = nextHeight;
    player.y = bottomY - player.height;
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  const cloudSkyBottom = groundY - 40;
  function buildSkyClouds() {
    const list = [];
    for (let i = 0; i < cloudCount; i++) {
      list.push({
        x0: randomRange(0, cloudWrapW),
        y: randomRange(cloudSkyTop, cloudSkyBottom),
        s: randomRange(0.48, 1.05),
      });
    }
    return list;
  }
  const skyClouds = buildSkyClouds();

  function createSprite(src) {
    const image = new Image();
    image.src = src;
    return image;
  }

  function isSpriteReady(image) {
    return image.complete && image.naturalWidth > 0;
  }

  function getDifficulty01() {
    const ramp = Math.min(state.runTimeSec / difficultyRampSec, 1);
    return ramp;
  }

  function getCurrentObstacleSpeed() {
    const d = getDifficulty01();
    return obstacleSpeedBase + (obstacleSpeedMax - obstacleSpeedBase) * d;
  }

  function getCurrentScoreRate() {
    const d = getDifficulty01();
    return 10 + 8 * d;
  }

  function getCurrentSpawnGapRange() {
    const d = getDifficulty01();
    const minGap = obstacleSpawnGapMinBase - 0.45 * d;
    const maxGap = obstacleSpawnGapMaxBase - 0.55 * d;
    return {
      min: Math.max(minGap, 0.95),
      max: Math.max(maxGap, 1.35),
    };
  }

  function scheduleNextObstacle() {
    const gap = getCurrentSpawnGapRange();
    state.nextSpawnInSec = randomRange(
      gap.min,
      gap.max
    );
  }

  function spawnObstacle() {
    const roll = Math.random();
    let kind = "cactusSmall";
    let width = 24;
    let height = 48;

    if (roll > 0.65 && roll <= 0.9) {
      kind = "cactusLarge";
      width = 32;
      height = 62;
    } else if (roll > 0.9) {
      kind = "ptero";
      width = 56;
      height = 46;
    }

    let y = state.ground.y - height;
    if (kind === "ptero") {
      y = state.ground.y - height - randomRange(14, 52);
    }

    state.obstacles.push({
      x: canvas.width + width,
      y,
      width,
      height,
      kind,
    });
  }

  function updateObstacles(deltaSec) {
    if (state.runTimeSec < warmupSec) {
      return;
    }

    state.nextSpawnInSec -= deltaSec;
    if (state.nextSpawnInSec <= 0) {
      spawnObstacle();
      scheduleNextObstacle();
    }

    const obstacleSpeed = getCurrentObstacleSpeed();
    for (const obstacle of state.obstacles) {
      obstacle.x -= obstacleSpeed * deltaSec;
    }

    state.obstacles = state.obstacles.filter(
      (obstacle) => obstacle.x + obstacle.width > 0
    );
  }

  function checkPlayerObstacleCollision() {
    const { player, obstacles } = state;
    // 判定依据：玩家矩形与障碍矩形使用 AABB（轴对齐包围盒）重叠检测。
    const playerHitbox = getPlayerHitbox(player);
    for (const obstacle of obstacles) {
      const hitbox = getObstacleHitbox(obstacle);
      const isSeparated =
        playerHitbox.x + playerHitbox.width <= hitbox.x ||
        playerHitbox.x >= hitbox.x + hitbox.width ||
        playerHitbox.y + playerHitbox.height <= hitbox.y ||
        playerHitbox.y >= hitbox.y + hitbox.height;
      if (!isSeparated) {
        return true;
      }
    }
    return false;
  }

  function getPlayerHitbox(player) {
    if (player.isCrouching) {
      return {
        x: player.x + 8,
        y: player.y + 6,
        width: player.width - 16,
        height: player.height - 10,
      };
    }
    return {
      x: player.x + 8,
      y: player.y + 5,
      width: player.width - 16,
      height: player.height - 10,
    };
  }

  function getObstacleHitbox(obstacle) {
    if (obstacle.kind === "cactusSmall") {
      return {
        x: obstacle.x + 4,
        y: obstacle.y + 5,
        width: obstacle.width - 8,
        height: obstacle.height - 8,
      };
    }
    if (obstacle.kind === "cactusLarge") {
      return {
        x: obstacle.x + 5,
        y: obstacle.y + 4,
        width: obstacle.width - 10,
        height: obstacle.height - 8,
      };
    }
    if (obstacle.kind !== "ptero") {
      return obstacle;
    }
    // Shrink ptero hitbox asymmetrically to better match body/tail silhouette.
    return {
      x: obstacle.x + 7,
      y: obstacle.y + 6,
      width: obstacle.width - 13,
      height: obstacle.height - 12,
    };
  }

  function updatePhysics(deltaSec) {
    const { player, gravity, ground } = state;
    const groundTop = ground.y;

    if (player.onGround && player.y + player.height >= groundTop) {
      player.y = groundTop - player.height;
      player.vy = 0;
      player.coyoteTimerSec = coyoteTimeSec;
      return;
    }
    player.onGround = false;
    player.coyoteTimerSec = Math.max(player.coyoteTimerSec - deltaSec, 0);

    player.vy += gravity * deltaSec;
    player.y += player.vy * deltaSec;

    if (player.vy >= 0 && player.y + player.height >= groundTop) {
      player.y = groundTop - player.height;
      // 落地时若仍有跳跃缓冲，只在这一帧起跳一次（避免缓冲期间每帧 tryJump 造成连跳）
      if (state.jumpBufferTimerSec > 0) {
        player.vy = jumpVelocity;
        player.onGround = false;
        player.coyoteTimerSec = 0;
        state.jumpBufferTimerSec = 0;
      } else {
        player.vy = 0;
        player.onGround = true;
        player.coyoteTimerSec = coyoteTimeSec;
      }
    }
  }

  function tryJump() {
    if (state.phase !== GAME_PHASE.PLAYING) {
      return;
    }
    const canJump = state.player.onGround || state.player.coyoteTimerSec > 0;
    if (!canJump) {
      return;
    }
    state.player.vy = jumpVelocity;
    state.player.onGround = false;
    state.player.coyoteTimerSec = 0;
    state.jumpBufferTimerSec = 0;
  }

  function consumeBufferedJump(deltaSec) {
    state.jumpBufferTimerSec = Math.max(state.jumpBufferTimerSec - deltaSec, 0);
  }

  function handleKeyDown(event) {
    const isSpace = event.code === "Space" || event.key === " ";
    const isArrowUp = event.code === "ArrowUp" || event.key === "ArrowUp";
    const isArrowDown = event.code === "ArrowDown" || event.key === "ArrowDown";
    const isRestart = event.code === "KeyR" || event.key === "r" || event.key === "R";
    if (!isSpace && !isArrowUp && !isArrowDown && !isRestart) {
      return;
    }

    // Keep gameplay stable: stop default page scrolling on play keys.
    event.preventDefault();

    if (state.phase === GAME_PHASE.READY) {
      if (isSpace) {
        startNewRound();
      }
      return;
    }

    if (state.phase === GAME_PHASE.GAMEOVER) {
      if (isRestart) {
        startNewRound();
      }
      return;
    }

    if (state.phase === GAME_PHASE.PLAYING && isArrowUp) {
      if (event.repeat) {
        return;
      }
      state.jumpBufferTimerSec = jumpBufferSec;
      tryJump();
    }

    // Crouch is ground-only to avoid midair pose forcing into ground.
    if (state.phase === GAME_PHASE.PLAYING && isArrowDown) {
      const { player } = state;
      if (!player.onGround || player.isCrouching) {
        return;
      }
      player.isCrouching = true;
      applyPlayerPose(playerCrouchWidth, playerCrouchHeight);
      player.y = state.ground.y - player.height;
    }
  }

  function handleKeyUp(event) {
    const isArrowUp = event.code === "ArrowUp" || event.key === "ArrowUp";
    const isArrowDown = event.code === "ArrowDown" || event.key === "ArrowDown";
    if (state.phase !== GAME_PHASE.PLAYING) {
      return;
    }
    if (isArrowUp) {
      state.jumpBufferTimerSec = 0;
    }
    if (isArrowDown && state.player.isCrouching) {
      state.player.isCrouching = false;
      applyPlayerPose(playerStandWidth, playerStandHeight);
      if (state.player.onGround) {
        state.player.y = state.ground.y - state.player.height;
      }
    }
  }

  window.addEventListener("keydown", handleKeyDown, { passive: false });
  window.addEventListener("keyup", handleKeyUp);

  function renderFrame() {
    const t = state.elapsedMs / 1000;

    // Animated background to make continuous refresh visible.
    const wave = 0.5 + 0.5 * Math.sin(t * 2);
    const bgShade = Math.floor(20 + wave * 30);
    ctx.fillStyle = `rgb(${bgShade}, ${bgShade + 20}, ${bgShade + 40})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawSkyClouds(t);

    const { ground, player } = state;

    // Ground: stable collision surface for the player.
    ctx.fillStyle = "#16a34a";
    ctx.fillRect(0, ground.y, canvas.width, ground.height);
    drawGroundStripes(ground.y);

    drawPlayer(player, t);

    // Obstacle placeholders.
    ctx.fillStyle = "#f97316";
    for (const obstacle of state.obstacles) {
      drawObstacle(obstacle, t);
    }

    ctx.fillStyle = "#f9fafb";
    ctx.font = "20px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`score: ${state.score}`, canvas.width - 20, 36);
    ctx.textAlign = "start";

    updateStatusText();

    if (state.phase === GAME_PHASE.READY) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.textAlign = "center";
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 34px 'Segoe UI', 'Microsoft YaHei', sans-serif";
      ctx.fillText("准备开始", canvas.width / 2, canvas.height / 2 - 8);
      ctx.font = "18px 'Segoe UI', 'Microsoft YaHei', sans-serif";
      ctx.fillText("按空格键开始", canvas.width / 2, canvas.height / 2 + 28);
      ctx.fillText("进行中用 ↑ 跳跃", canvas.width / 2, canvas.height / 2 + 56);
      ctx.textAlign = "start";
    } else if (state.phase === GAME_PHASE.GAMEOVER) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.textAlign = "center";
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 34px 'Segoe UI', 'Microsoft YaHei', sans-serif";
      ctx.fillText("游戏结束", canvas.width / 2, canvas.height / 2 - 8);
      ctx.font = "18px 'Segoe UI', 'Microsoft YaHei', sans-serif";
      ctx.fillText("你撞到了障碍物", canvas.width / 2, canvas.height / 2 + 28);
      ctx.fillText("按 R 键重开", canvas.width / 2, canvas.height / 2 + 56);
      ctx.fillText(
        `本局距离 ${state.distanceM.toFixed(1)} m / 分数 ${state.score}`,
        canvas.width / 2,
        canvas.height / 2 + 84
      );
      ctx.textAlign = "start";
    }
  }

  function updateStatusText() {
    if (!(statusEl instanceof HTMLElement)) {
      return;
    }
    const currentSpeed = getCurrentObstacleSpeed();
    const difficultyPercent = Math.round(getDifficulty01() * 100);
    let text = `distance: ${state.distanceM.toFixed(1)} m | onGround: ${
      state.player.onGround ? "yes" : "no"
    } | speed: ${currentSpeed.toFixed(0)} | diff: ${difficultyPercent}% | 难度依据：存活时间越久，障碍越快且间隔更短`;
    if (state.phase === GAME_PHASE.PLAYING && state.runTimeSec < warmupSec) {
      const left = (warmupSec - state.runTimeSec).toFixed(1);
      text += ` | 开局练习窗口 ${left}s`;
    }
    statusEl.textContent = text;
  }

  function drawGroundStripes(groundTopY) {
    const offset = ((state.groundScrollX % groundStripeGap) + groundStripeGap) % groundStripeGap;
    const y = Math.round(groundTopY + 10);
    ctx.fillStyle = "#15803d";
    for (let x = -offset; x < canvas.width + groundStripeWidth; x += groundStripeGap) {
      ctx.fillRect(
        Math.round(x),
        y,
        groundStripeWidth,
        groundStripeHeight
      );
    }
  }

  function drawPuffCloud(screenX, skyY, scale) {
    const r = 17 * scale;
    ctx.fillStyle = "rgba(248, 250, 252, 0.9)";
    ctx.beginPath();
    ctx.arc(screenX, skyY, r, 0, Math.PI * 2);
    ctx.arc(screenX + r * 1.05, skyY - r * 0.12, r * 0.92, 0, Math.PI * 2);
    ctx.arc(screenX + r * 2.05, skyY, r * 0.88, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSkyClouds(tSec) {
    const scroll = tSec * cloudDriftPxPerSec;
    const margin = 80;
    for (const c of skyClouds) {
      const worldX = c.x0 - scroll;
      const rApprox = 17 * c.s * 2.8;
      const n0 = Math.floor((-margin - rApprox - worldX) / cloudWrapW);
      const n1 = Math.ceil((canvas.width + margin + rApprox - worldX) / cloudWrapW);
      for (let n = n0; n <= n1; n++) {
        const x = worldX + n * cloudWrapW;
        if (x + rApprox < -margin || x - rApprox > canvas.width + margin) {
          continue;
        }
        drawPuffCloud(x, c.y, c.s);
      }
    }
  }

  function getPlayerSprite(player, tSec) {
    if (state.phase !== GAME_PHASE.PLAYING) {
      return playerSprites.standing;
    }
    if (!player.onGround) {
      return playerSprites.standing;
    }
    const frameIndex = Math.floor(tSec / playerFrameDurationSec) % 2;
    if (player.isCrouching) {
      return frameIndex === 0 ? playerSprites.duck1 : playerSprites.duck2;
    }
    return frameIndex === 0 ? playerSprites.run1 : playerSprites.run2;
  }

  function drawPlayer(player, tSec) {
    const drawX = Math.round(player.x);
    const drawY = Math.round(player.y);
    const sprite = getPlayerSprite(player, tSec);
    if (sprite && isSpriteReady(sprite)) {
      ctx.drawImage(sprite, drawX, drawY, player.width, player.height);
      return;
    }

    // Fallback when player image is not loaded yet.
    ctx.fillStyle = "#60a5fa";
    ctx.fillRect(drawX, drawY, player.width, player.height);
  }

  function drawObstacle(obstacle, tSec) {
    let sprite = null;
    if (obstacle.kind === "cactusSmall") {
      sprite = obstacleSprites.cactusSmall;
    } else if (obstacle.kind === "cactusLarge") {
      sprite = obstacleSprites.cactusLarge;
    } else if (obstacle.kind === "ptero") {
      const frameIndex = Math.floor(tSec / pteroFrameDurationSec) % 2;
      sprite = frameIndex === 0 ? obstacleSprites.ptero1 : obstacleSprites.ptero2;
    }

    if (sprite && isSpriteReady(sprite)) {
      const drawX = Math.round(obstacle.x);
      const drawY = Math.round(obstacle.y);
      ctx.drawImage(sprite, drawX, drawY, obstacle.width, obstacle.height);
      return;
    }

    // Fallback when image is not loaded yet.
    ctx.fillRect(
      Math.round(obstacle.x),
      Math.round(obstacle.y),
      obstacle.width,
      obstacle.height
    );
  }

  let lastTimeMs = performance.now();
  function loop(nowMs) {
    const deltaMs = Math.min(nowMs - lastTimeMs, 100);
    const deltaSec = deltaMs / 1000;
    lastTimeMs = nowMs;
    state.elapsedMs += deltaMs;
    state.frameCount += 1;

    if (state.phase === GAME_PHASE.PLAYING) {
      state.groundScrollX += getCurrentObstacleSpeed() * deltaSec;
      state.runTimeSec += deltaSec;
      state.distanceM += getCurrentObstacleSpeed() * deltaSec * distanceScale;
      state.scoreAcc += getCurrentScoreRate() * deltaSec;
      state.score = Math.floor(state.scoreAcc);
      updatePhysics(deltaSec);
      consumeBufferedJump(deltaSec);
      updateObstacles(deltaSec);
      if (checkPlayerObstacleCollision()) {
        state.phase = GAME_PHASE.GAMEOVER;
      }
    }

    renderFrame();
    window.requestAnimationFrame(loop);
  }

  resetRoundState();
  state.phase = GAME_PHASE.READY;
  window.requestAnimationFrame(loop);
}

function bootGame() {
  console.info("[my-dino] 脚本已加载，开始初始化。");
  initGameCanvas();
}

window.addEventListener("DOMContentLoaded", bootGame);
