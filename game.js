"use strict";

function initGameCanvas() {
  const canvas = document.getElementById("game-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    console.warn("[my-dino] 未找到 #game-canvas，跳过初始化。");
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.warn("[my-dino] 2D 上下文初始化失败。");
    return;
  }

  // ---- Tunable physics params ----
  const gravity = 1600; // px/s^2
  const jumpVelocity = -720; // px/s
  const groundY = canvas.height - 72; // 地面顶边 y
  const playerStartY = groundY - 64; // 初始玩家底边贴地（等待开始态）
  const obstacleSpeedBase = 260; // px/s
  const obstacleSpeedMax = 420; // px/s cap
  const obstacleSpawnGapMinBase = 1.2; // sec
  const obstacleSpawnGapMaxBase = 2.1; // sec
  const difficultyRampSec = 45; // 到达难度上限所需秒数
  const warmupSec = 3.2; // 开局学习反应窗口
  const distanceScale = 0.08; // px -> m
  const jumpBufferSec = 0.12; // 提前按键可缓存，提升起跳手感
  const coyoteTimeSec = 0.08; // 离地后短暂宽限，避免“踩边按不出”
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
    score: 0,
    gravity,
    ground: {
      y: groundY,
      height: canvas.height - groundY,
    },
    player: {
      x: 120,
      y: playerStartY,
      width: 52,
      height: 64,
      vy: 0,
      onGround: false,
      coyoteTimerSec: 0,
    },
    obstacles: [],
    nextSpawnInSec: 0,
    phase: GAME_PHASE.READY,
    jumpBufferTimerSec: 0,
  };

  function resetRoundState() {
    const { player, ground } = state;
    state.runTimeSec = 0;
    state.distanceM = 0;
    state.score = 0;
    state.obstacles = [];
    state.jumpBufferTimerSec = 0;
    state.nextSpawnInSec = 0;

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

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function getDifficulty01() {
    const ramp = Math.min(state.runTimeSec / difficultyRampSec, 1);
    return ramp;
  }

  function getCurrentObstacleSpeed() {
    const d = getDifficulty01();
    return obstacleSpeedBase + (obstacleSpeedMax - obstacleSpeedBase) * d;
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
    const width = randomRange(26, 42);
    const height = randomRange(42, 68);
    state.obstacles.push({
      x: canvas.width + width,
      y: state.ground.y - height,
      width,
      height,
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
    for (const obstacle of obstacles) {
      const isSeparated =
        player.x + player.width <= obstacle.x ||
        player.x >= obstacle.x + obstacle.width ||
        player.y + player.height <= obstacle.y ||
        player.y >= obstacle.y + obstacle.height;
      if (!isSeparated) {
        return true;
      }
    }
    return false;
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
      player.vy = 0;
      player.onGround = true;
      player.coyoteTimerSec = coyoteTimeSec;
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
    if (state.jumpBufferTimerSec <= 0) {
      return;
    }
    tryJump();
  }

  function handleKeyDown(event) {
    const isSpace = event.code === "Space" || event.key === " ";
    const isArrowUp = event.code === "ArrowUp" || event.key === "ArrowUp";
    const isRestart = event.code === "KeyR" || event.key === "r" || event.key === "R";
    if (!isSpace && !isArrowUp && !isRestart) {
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
      state.jumpBufferTimerSec = jumpBufferSec;
      tryJump();
    }
  }

  window.addEventListener("keydown", handleKeyDown, { passive: false });

  function renderFrame() {
    const t = state.elapsedMs / 1000;

    // Animated background to make continuous refresh visible.
    const wave = 0.5 + 0.5 * Math.sin(t * 2);
    const bgShade = Math.floor(20 + wave * 30);
    ctx.fillStyle = `rgb(${bgShade}, ${bgShade + 20}, ${bgShade + 40})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const { ground, player } = state;

    // Ground: stable collision surface for the player.
    ctx.fillStyle = "#16a34a";
    ctx.fillRect(0, ground.y, canvas.width, ground.height);

    // Player placeholder body.
    ctx.fillStyle = "#60a5fa";
    ctx.fillRect(player.x, player.y, player.width, player.height);

    // Obstacle placeholders.
    ctx.fillStyle = "#f97316";
    for (const obstacle of state.obstacles) {
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }

    ctx.fillStyle = "#f9fafb";
    ctx.font = "20px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.fillText("重力下落演示运行中...", 20, 36);

    ctx.font = "16px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.fillText(`distance: ${state.distanceM.toFixed(1)} m`, 20, 64);
    ctx.fillText(
      `score: ${state.score}`,
      20,
      88
    );
    ctx.fillText(`onGround: ${player.onGround ? "yes" : "no"}`, 20, 112);
    const currentSpeed = getCurrentObstacleSpeed();
    const difficultyPercent = Math.round(getDifficulty01() * 100);
    ctx.fillText(
      `speed: ${currentSpeed.toFixed(0)} diff: ${difficultyPercent}%`,
      20,
      136
    );
    ctx.fillText(`难度依据：存活时间越久，障碍越快且间隔更短`, 20, 160);

    if (state.phase === GAME_PHASE.PLAYING && state.runTimeSec < warmupSec) {
      const left = (warmupSec - state.runTimeSec).toFixed(1);
      ctx.fillStyle = "#fde68a";
      ctx.fillText(`开局练习窗口 ${left}s`, 20, 184);
    }

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

  let lastTimeMs = performance.now();
  function loop(nowMs) {
    const deltaMs = Math.min(nowMs - lastTimeMs, 100);
    const deltaSec = deltaMs / 1000;
    lastTimeMs = nowMs;
    state.elapsedMs += deltaMs;
    state.frameCount += 1;

    if (state.phase === GAME_PHASE.PLAYING) {
      state.runTimeSec += deltaSec;
      state.distanceM += getCurrentObstacleSpeed() * deltaSec * distanceScale;
      state.score = Math.floor(state.distanceM * 10);
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
