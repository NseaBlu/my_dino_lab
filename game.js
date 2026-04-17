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
  const playerStartY = -120; // 初始高度（越小越高，0 是画布顶边）
  const groundY = canvas.height - 72; // 地面顶边 y
  const obstacleSpeed = 320; // px/s
  const obstacleSpawnGapMinSec = 1.2; // 最短生成间隔，避免贴脸
  const obstacleSpawnGapMaxSec = 2.1; // 最长生成间隔，避免太空

  const state = {
    elapsedMs: 0,
    frameCount: 0,
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
    },
    obstacles: [],
    nextSpawnInSec: 0,
    isGameOver: false,
  };

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function scheduleNextObstacle() {
    state.nextSpawnInSec = randomRange(
      obstacleSpawnGapMinSec,
      obstacleSpawnGapMaxSec
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
    state.nextSpawnInSec -= deltaSec;
    if (state.nextSpawnInSec <= 0) {
      spawnObstacle();
      scheduleNextObstacle();
    }

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
      return;
    }
    player.onGround = false;

    player.vy += gravity * deltaSec;
    player.y += player.vy * deltaSec;

    if (player.vy >= 0 && player.y + player.height >= groundTop) {
      player.y = groundTop - player.height;
      player.vy = 0;
      player.onGround = true;
    }
  }

  function tryJump() {
    if (state.isGameOver || !state.player.onGround) {
      return;
    }
    state.player.vy = jumpVelocity;
    state.player.onGround = false;
  }

  function handleKeyDown(event) {
    if (event.code !== "ArrowUp") {
      return;
    }

    // Keep gameplay stable: stop default page scrolling on ArrowUp.
    event.preventDefault();
    tryJump();
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
    ctx.fillText(`frame: ${state.frameCount}`, 20, 64);
    ctx.fillText(
      `playerY: ${player.y.toFixed(1)} vy: ${player.vy.toFixed(1)}`,
      20,
      88
    );
    ctx.fillText(
      `onGround: ${player.onGround ? "yes" : "no"} (ArrowUp to jump)`,
      20,
      112
    );
    ctx.fillText(
      `obstacles: ${state.obstacles.length} next: ${state.nextSpawnInSec.toFixed(
        2
      )}s`,
      20,
      136
    );

    if (state.isGameOver) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.textAlign = "center";
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 34px 'Segoe UI', 'Microsoft YaHei', sans-serif";
      ctx.fillText("游戏结束", canvas.width / 2, canvas.height / 2 - 8);
      ctx.font = "18px 'Segoe UI', 'Microsoft YaHei', sans-serif";
      ctx.fillText("你撞到了障碍物", canvas.width / 2, canvas.height / 2 + 28);
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

    if (!state.isGameOver) {
      updatePhysics(deltaSec);
      updateObstacles(deltaSec);
      if (checkPlayerObstacleCollision()) {
        state.isGameOver = true;
      }
    }

    renderFrame();
    window.requestAnimationFrame(loop);
  }

  scheduleNextObstacle();
  window.requestAnimationFrame(loop);
}

function bootGame() {
  console.info("[my-dino] 脚本已加载，开始初始化。");
  initGameCanvas();
}

window.addEventListener("DOMContentLoaded", bootGame);
