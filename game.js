"use strict";

function initGameCanvas() {
  const canvas = document.getElementById("game-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  // Initial placeholder drawing, ready for future game rendering logic.
  ctx.fillStyle = "#111827";
  ctx.font = "24px 'Segoe UI', 'Microsoft YaHei', sans-serif";
  ctx.fillText("画布已就绪：可开始编写跑酷逻辑", 20, 46);
}

window.addEventListener("DOMContentLoaded", initGameCanvas);
