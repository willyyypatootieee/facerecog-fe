import { HEATMAP_ALPHA } from "@/constants/camera";

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Point = {
  x: number;
  y: number;
};

export function drawCnnAttentionHeatmap(
  ctx: CanvasRenderingContext2D,
  box: Box,
  landmarks?: { positions?: Point[] }
) {
  const points =
    landmarks?.positions && landmarks.positions.length > 0
      ? landmarks.positions
      : [
          { x: box.x + box.width * 0.5, y: box.y + box.height * 0.42 },
          { x: box.x + box.width * 0.34, y: box.y + box.height * 0.35 },
          { x: box.x + box.width * 0.66, y: box.y + box.height * 0.35 },
          { x: box.x + box.width * 0.5, y: box.y + box.height * 0.68 },
        ];

  const attentionPoints = [
    points[30] || points[0],
    points[36] || points[1],
    points[45] || points[2],
    points[51] || points[3],
    { x: box.x + box.width * 0.5, y: box.y + box.height * 0.52 },
  ].filter(Boolean);

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (const point of attentionPoints) {
    const radius = Math.max(box.width, box.height) * 0.22;
    const gradient = ctx.createRadialGradient(
      point.x,
      point.y,
      0,
      point.x,
      point.y,
      radius
    );

    gradient.addColorStop(0, `rgba(34, 197, 94, ${HEATMAP_ALPHA})`);
    gradient.addColorStop(0.45, `rgba(234, 179, 8, ${HEATMAP_ALPHA * 0.7})`);
    gradient.addColorStop(1, "rgba(59, 130, 246, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawReadableLabelOnMirroredCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  box: Box,
  label: string,
  options: {
    background: string;
    foreground?: string;
    subLabel?: string;
  }
) {
  const visualX = canvasWidth - box.x - box.width;
  const labelHeight = 26;
  const labelY = Math.max(0, box.y - labelHeight - 6);
  const labelWidth = Math.max(150, ctx.measureText(label).width + 28);

  ctx.save();
  ctx.translate(canvasWidth, 0);
  ctx.scale(-1, 1);
  ctx.fillStyle = options.background;
  ctx.fillRect(visualX, labelY, labelWidth, labelHeight);
  ctx.font = "14px Arial";
  ctx.fillStyle = options.foreground || "#ffffff";
  ctx.fillText(label, visualX + 12, labelY + 17);

  if (options.subLabel) {
    ctx.font = "12px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(options.subLabel, visualX + 12, box.y + box.height + 18);
  }

  ctx.restore();
}
