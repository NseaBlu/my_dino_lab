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

  const state = {
    elapsedMs: 0,
    frameCount: 0,
  };

  function renderFrame() {
    const t = state.elapsedMs / 1000;

    // Animated background to make continuous refresh visible.
    const wave = 0.5 + 0.5 * Math.sin(t * 2);
    const bgShade = Math.floor(20 + wave * 30);
    ctx.fillStyle = `rgb(${bgShade}, ${bgShade + 20}, ${bgShade + 40})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barX = (state.elapsedMs * 0.18) % (canvas.width + 120) - 120;
    ctx.fillStyle = "#60a5fa";
    ctx.fillRect(barX, canvas.height * 0.5 - 12, 120, 24);

    ctx.fillStyle = "#f9fafb";
    ctx.font = "20px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.fillText("绘制循环运行中...", 20, 36);

    ctx.font = "16px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.fillText(`frame: ${state.frameCount}`, 20, 64);
  }

  let lastTimeMs = performance.now();
  function loop(nowMs) {
    const deltaMs = Math.min(nowMs - lastTimeMs, 100);
    lastTimeMs = nowMs;
    state.elapsedMs += deltaMs;
    state.frameCount += 1;
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
