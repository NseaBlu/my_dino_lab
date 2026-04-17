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

  // Initial placeholder drawing, ready for future game rendering logic.
  ctx.fillStyle = "#111827";
  ctx.font = "24px 'Segoe UI', 'Microsoft YaHei', sans-serif";
  ctx.fillText("画布已就绪：可开始编写跑酷逻辑", 20, 46);
}

function bootGame() {
  console.info("[my-dino] 脚本已加载，开始初始化。");
  initGameCanvas();
}

window.addEventListener("DOMContentLoaded", bootGame);
