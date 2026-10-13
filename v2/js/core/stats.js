// Tout ce qui se calcule depuis les séances et les sorties. Rien ici n'est stocké.
import { addDays, mondayOf, today } from "./dates.js";
import { ADVANCE_AFTER, filled, hasLadder, levelOf, topKg, total } from "./model.js";
import { fmtKm } from "./run.js";

// Jours d'entraînement d'une activité (Set de dates).
export function datesOf(state, activity) {
  if (activity === "run") return new Set(state.runs.map((r) => r.date));
  return new Set(state.sessions.filter((s) => s.activity === activity).map((s) => s.date));
}
export function doneInWeek(state, activity, monday) {
  const end = addDays(monday, 7);
  return [...datesOf(state, activity)].filter((d) => d >= monday && d < end).length;
}
export function goalOf(state, activity) {
  return state.settings.goals[activity] || 0;
}
// Avancement de la semaine sur ses propres objectifs : { done, goal, pct } (done plafonné par activité).
export function weekProgress(state, monday = mondayOf(today())) {
  let done = 0, goal = 0;
  state.settings.activities.forEach((a) => {
    const g = goalOf(state, a);
    goal += g;
    done += Math.min(g, doneInWeek(state, a, monday));
  });
  return { done, goal, pct: goal ? Math.round((done / goal) * 100) : 0 };
}
// Semaines d'affilée où tous les objectifs sont atteints (la semaine en cours compte si déjà atteinte).
export function streak(state) {
  const full = (m) => {
    const w = weekProgress(state, m);
    return w.goal > 0 && w.done >= w.goal;
  };
  let monday = mondayOf(today());
  let n = full(monday) ? 1 : 0;
  monday = addDays(monday, -7);
  while (full(monday)) {
    n++;
    monday = addDays(monday, -7);
  }
  return n;
}

const sameLine = (a, b) => (a.exId ? a.exId === b.exId && a.stepId === b.stepId : a.name.trim().toLowerCase() === b.name.trim().toLowerCase()) && !!a.home === !!b.home;

// Dernière perf notée pour une ligne (même exercice, même palier, même lieu), avant la date donnée.
export function lastPerf(state, entry, beforeId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    if (s.id === beforeId) continue;
    const e = s.entries.find((x) => sameLine(x, entry) && filled(x.sets) > 0);
    if (e) return { date: s.date, sets: e.sets, loaded: !!e.loaded };
  }
  return null;
}
export function setsText(sets, loaded) {
  const done = sets.filter((s) => s.n > 0);
  if (!loaded) return sets.map((s) => s.n).join(" · ");
  const kgs = [...new Set(done.map((s) => s.kg || 0))];
  const kg = (v) => String(v).replace(".", ",");
  if (kgs.length === 1) return `${done.map((s) => s.n).join(" · ")} à ${kg(kgs[0])} kg`;
  return done.map((s) => `${s.n}×${kg(s.kg || 0)}`).join(" · ");
}

// Séance précédente du même programme.
export function prevSession(state, s) {
  if (!s.programId) return null;
  const i = state.sessions.indexOf(s);
  for (let j = (i < 0 ? state.sessions.length : i) - 1; j >= 0; j--) if (state.sessions[j].programId === s.programId) return state.sessions[j];
  return null;
}
// Écart de chaque ligne avec la séance précédente du même programme : { d, unit } ou null.
export function deltas(state, s) {
  const prev = prevSession(state, s);
  return s.entries.map((e) => {
    const p = prev && prev.entries.find((x) => sameLine(x, e) && (x.tag || "") === (e.tag || ""));
    if (!p) return null;
    if (e.loaded && topKg(e.sets) !== topKg(p.sets)) return { d: Math.round((topKg(e.sets) - topKg(p.sets)) * 100) / 100, unit: "kg" };
    return { d: total(e.sets) - total(p.sets), unit: e.unit };
  });
}

// Exercices du programme prêts pour le palier suivant : max partout, ADVANCE_AFTER séances de suite,
// au palier actuel, hors variante maison et hors paliers en plus.
export function readyForNext(state, program) {
  return program.exercises
    .filter((ex) => {
      if (!hasLadder(ex)) return false;
      const lvl = levelOf(state, ex);
      if (lvl >= ex.ladder.length - 1) return false;
      const step = ex.ladder[lvl];
      const recent = state.sessions
        .map((s) => s.entries.find((e) => e.exId === ex.id && e.stepId === step.id && !e.home && !e.tag))
        .filter(Boolean)
        .slice(-ADVANCE_AFTER);
      return recent.length === ADVANCE_AFTER && recent.every((e) => e.sets.length > 0 && e.sets.every((x) => x.n >= step.max));
    })
    .map((ex) => ex.id);
}

// Faits marquants : première séance, première fois d'un nouveau mouvement, paliers débloqués,
// records de charge et de distance. Du plus récent au plus ancien.
export function milestones(state) {
  const ev = [];
  const seen = new Set();
  const bestKg = {};
  const firstOf = {};
  state.sessions.forEach((s) => {
    const opening = !firstOf[s.activity];
    if (opening) firstOf[s.activity] = s.id;
    if (!ev.length && opening && s === state.sessions[0]) ev.push({ date: s.date, kind: "start", text: "Première séance" });
    s.entries.forEach((e) => {
      if (e.home) return;
      const key = e.name.trim().toLowerCase();
      // Un mouvement est connu par son nom ou par son identifiant : le renommer n'en fait pas une première fois.
      const idKey = e.stepId || e.exId;
      const known = seen.has(key) || (idKey && seen.has(idKey));
      // Les mouvements de la toute première séance d'une activité sont le point de départ, pas des faits marquants.
      if (!known && !opening) ev.push({ date: s.date, kind: "first", text: `Première fois : ${e.name}` });
      seen.add(key);
      if (idKey) seen.add(idKey);
      if (e.loaded) {
        const kg = topKg(e.sets);
        if (bestKg[key] !== undefined && kg > bestKg[key]) ev.push({ date: s.date, kind: "record", text: `Record : ${e.name} à ${String(kg).replace(".", ",")} kg` });
        bestKg[key] = Math.max(bestKg[key] || 0, kg);
      }
    });
  });
  state.progressLog.filter((l) => l.date && (l.dir === undefined || l.dir > 0)).forEach((l) => ev.push({ date: l.date, kind: "step", text: `Palier débloqué : ${l.name}` }));
  let best = 0;
  state.runs.forEach((r, i) => {
    if (i === 0) ev.push({ date: r.date, kind: "start", text: `Première sortie : ${fmtKm(r.km)} km` });
    else if (r.km > best) ev.push({ date: r.date, kind: "record", text: `Record de distance : ${fmtKm(r.km)} km` });
    best = Math.max(best, r.km);
  });
  return ev.sort((a, b) => b.date.localeCompare(a.date));
}

export function keyFigures(state) {
  return { sessions: state.sessions.length + state.runs.length, streak: streak(state), records: milestones(state).filter((m) => m.kind === "record" || m.kind === "step").length };
}

// Points d'une courbe par exercice : total par séance du palier principal.
export function exercisePoints(state, exId) {
  return state.sessions
    .map((s) => ({ s, e: s.entries.find((x) => x.exId === exId && !x.tag && filled(x.sets) > 0) }))
    .filter((x) => x.e)
    .map(({ s, e }) => ({ date: s.date, y: e.loaded ? topKg(e.sets) : total(e.sets), seg: `${e.stepId}${e.home ? "h" : ""}`, label: e.name }));
}
