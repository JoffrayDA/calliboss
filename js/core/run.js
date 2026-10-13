// Course : coach par blocs. Dans un bloc de `blockDays` jours, une sortie ne dépasse pas
// min(capKm, growth × plus longue sortie du bloc précédent).
import { addDays, dayNum } from "./dates.js";

export const RUN = {
  blockStart: "2026-10-01",
  blockDays: 14,
  growth: 1.3,
  capKm: 10,
  // Après la course, jamais juste avant la calisthénie (l'étirement statique baisse la force).
  mobility: [
    { id: "ankle", text: "Chevilles : genou au mur 2×10 par jambe, puis tenir 30 s" },
    { id: "squat", text: "Squat profond tenu 3×30 s (tiens un poteau si besoin)" },
    { id: "wrist", text: "Poignets : rotations + bascules à quatre pattes 2×10" },
    { id: "shoulder", text: "Épaules : étirement doux vers l'arrière, mains sur un banc derrière toi 2×30 s" },
    { id: "hang", text: "Suspension passive à la barre 3×20–30 s" },
    { id: "cossack", text: "Cossack squat 2×6 par côté" },
  ],
};

export function fmtKm(km) {
  return String(parseFloat((+km || 0).toFixed(2))).replace(".", ",");
}
export function fmtPace(secPerKm) {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function paceOf(r) {
  return r.sec / r.km;
}
export function longest(runs) {
  return runs.length ? Math.max(...runs.map((r) => r.km)) : 0;
}

function blockOf(date) {
  return Math.floor((dayNum(date) - dayNum(RUN.blockStart)) / RUN.blockDays);
}
function blockRange(b) {
  const start = addDays(RUN.blockStart, b * RUN.blockDays);
  return [start, addDays(start, RUN.blockDays - 1)];
}
export function runsBetween(runs, from, to, exceptDate) {
  return runs.filter((r) => r.date >= from && r.date <= to && r.date !== exceptDate);
}

// Limite d'une sortie à la date donnée. Bloc précédent vide : pas de hausse,
// on reprend la plus longue des 4 semaines d'avant. Aucun repère : null.
export function runLimit(runs, date) {
  const b = Math.max(0, blockOf(date));
  const [start, end] = blockRange(b);
  const [ps, pe] = blockRange(b - 1);
  const prev = longest(runsBetween(runs, ps, pe));
  let km, base, hold = false;
  if (prev) {
    base = prev;
    km = prev * RUN.growth;
  } else {
    base = longest(runsBetween(runs, addDays(start, -28), addDays(start, -1)));
    if (!base) return null;
    km = base;
    hold = true;
  }
  km = Math.min(RUN.capKm, Math.round(km * 10) / 10);
  return { km, base, hold, start, end, capped: km >= RUN.capKm };
}

// Alertes du coach avant d'enregistrer une sortie.
export function runWarnings(runs, date, km, pace) {
  const w = [];
  const lim = date >= RUN.blockStart ? runLimit(runs, date) : null;
  if (lim && km > lim.km + 0.05) w.push(`Au-dessus de ta limite du bloc : ${fmtKm(lim.km)} km max.`);
  const recent = runsBetween(runs, addDays(date, -14), addDays(date, -1), date);
  const month = runsBetween(runs, addDays(date, -30), addDays(date, -1), date);
  if (recent.length && month.length && km > longest(recent) && pace < Math.min(...month.map(paceOf)))
    w.push("Distance et vitesse en hausse en même temps : une seule à la fois.");
  return w;
}
