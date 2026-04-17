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
  };

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
    if (!state.player.onGround) {
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
  }

  let lastTimeMs = performance.now();
  function loop(nowMs) {
    const deltaMs = Math.min(nowMs - lastTimeMs, 100);
    const deltaSec = deltaMs / 1000;
    lastTimeMs = nowMs;
    state.elapsedMs += deltaMs;
    state.frameCount += 1;
    updatePhysics(deltaSec);
    renderFrame();
    window.requestAnimationFrame(loop);
  }

  window.requestAnimationFrame(loop);
}

function bootGame() {
  console.info("[my-dino] 脚本已加载，开始初始化。");
  initGameCanvas();
}

window.addEventListener("DOMContentLoaded", bootGame);
