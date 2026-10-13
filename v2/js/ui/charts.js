// Courbes épurées : un trait, une aire en dégradé léger, le dernier point mis en avant, pas de grille.
import { dayNum, shortDate } from "../core/dates.js";
import { esc } from "./dom.js";

let uid = 0;

function scale(points, W, H, pad) {
  const xs = points.map((p) => dayNum(p.date));
  const ys = points.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 1; x1 += 1; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const sx = (x) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y) => pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  return { xs, sx, sy };
}

// Petite courbe sans axes (carte Poids). `tone` : "sky" ou "orange".
export function sparkline(points, tone = "sky", label = "") {
  if (points.length < 2) return "";
  const W = 300, H = 64;
  const { xs, sx, sy } = scale(points, W, H, { l: 4, r: 4, t: 8, b: 8 });
  const line = points.map((p, i) => `${i ? "L" : "M"}${sx(xs[i]).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
  const id = `g${++uid}`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--${tone})" stop-opacity=".35"/><stop offset="1" stop-color="var(--${tone})" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${W - 4} ${H} L4 ${H} Z" fill="url(#${id})"/>
    <path d="${line}" fill="none" stroke="var(--${tone})" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

// Courbe avec dates aux extrémités et valeurs min/max. points : [{ date, y, seg?, label? }].
// La ligne se coupe à chaque changement de `seg` (nouveau palier), marqué par un trait vertical.
export function lineChart(points, { tone = "orange", fmt = (v) => String(Math.round(v * 10) / 10).replace(".", ","), label = "" } = {}) {
  if (points.length < 2) return "";
  const W = 320, H = 140, pad = { l: 8, r: 34, t: 14, b: 22 };
  const { xs, sx, sy } = scale(points, W, H, pad);
  const id = `g${++uid}`;
  let svg = "", path = "", area = "", segStart = 0;
  const closeArea = (i) => {
    area += ` L${sx(xs[i]).toFixed(1)} ${H - pad.b} L${sx(xs[segStart]).toFixed(1)} ${H - pad.b} Z`;
  };
  points.forEach((p, i) => {
    const x = sx(xs[i]).toFixed(1), y = sy(p.y).toFixed(1);
    const fresh = i === 0 || p.seg !== points[i - 1].seg;
    if (fresh && i > 0) {
      closeArea(i - 1);
      segStart = i;
      svg += `<line class="mark" x1="${x}" x2="${x}" y1="${pad.t}" y2="${H - pad.b}"/>`;
    }
    path += `${fresh ? "M" : "L"}${x} ${y}`;
    area += `${fresh ? "M" : "L"}${x} ${y}`;
  });
  closeArea(points.length - 1);
  const last = points[points.length - 1];
  const ys = points.map((p) => p.y);
  const lx = sx(xs[xs.length - 1]), ly = sy(last.y);
  svg += `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--${tone})" stop-opacity=".3"/><stop offset="1" stop-color="var(--${tone})" stop-opacity="0"/></linearGradient></defs>`;
  svg += `<path d="${area}" fill="url(#${id})"/><path d="${path}" fill="none" stroke="var(--${tone})" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  svg += `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5" fill="var(--${tone})" stroke="var(--surface)" stroke-width="2"/>`;
  svg += `<text class="axis" x="${W - pad.r + 6}" y="${(sy(Math.max(...ys)) + 4).toFixed(1)}">${fmt(Math.max(...ys))}</text>`;
  if (Math.min(...ys) !== Math.max(...ys)) svg += `<text class="axis" x="${W - pad.r + 6}" y="${(sy(Math.min(...ys)) + 4).toFixed(1)}">${fmt(Math.min(...ys))}</text>`;
  svg += `<text class="axis" x="${pad.l}" y="${H - 4}">${esc(shortDate(points[0].date))}</text>`;
  svg += `<text class="axis" x="${W - pad.r}" y="${H - 4}" text-anchor="end">${esc(shortDate(last.date))}</text>`;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${svg}</svg></div>`;
}
