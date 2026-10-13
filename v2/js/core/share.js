// Ce qui part au groupe, calculé depuis l'état : résumé du membre et événements du fil.
// Et ce qu'on calcule depuis les résumés des autres : défi commun, série de groupe.
import { addDays, dayNum, mondayOf, today } from "./dates.js";
import { doneInWeek, goalOf, milestones, setsText, streak, weekProgress } from "./stats.js";
import { fmtKm } from "./run.js";

const SHARE_LAST = 20;
const WEEKS = 12;
export const AVATAR_MAX = 20000; // octets
export const PHOTO_MAX = 60000;

// Une image venue d'ailleurs n'est affichée que si c'est une petite image JPEG ou WebP en data URL.
export function validImage(src, max) {
  return typeof src === "string" && /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src) && src.length <= max * 1.4;
}

// Résumé partagé. Garde les champs lus par la V1 (goals, streak, program, sessions[].lines, runs, weights).
export function summary(state) {
  const monday = mondayOf(today());
  const wp = weekProgress(state, monday);
  const weeks = {};
  for (let i = 0; i < WEEKS; i++) {
    const m = addDays(monday, -7 * i);
    weeks[m] = weekProgress(state, m).done;
  }
  const strength = state.sessions.slice(-SHARE_LAST);
  const lastProgram = state.programs.find((p) => p.id === (strength[strength.length - 1] || {}).programId);
  return {
    v: 2,
    avatar: state.profile.avatar || "",
    goals: { cali: goalOf(state, "cali"), run: goalOf(state, "run") },
    activities: state.settings.activities,
    week: { monday, done: wp.done, goal: wp.goal },
    weeks,
    streak: streak(state),
    program: lastProgram ? lastProgram.name : "",
    sessions: strength.map((s) => ({
      date: s.date,
      activity: s.activity,
      mode: s.place,
      name: s.programName,
      complete: !!s.complete,
      feel: s.feel || null,
      lines: s.entries.map((e) => ({ name: e.name, unit: e.unit, sets: e.sets.map((x) => x.n), text: setsText(e.sets, e.loaded), tag: e.home ? "maison" : e.tag === "bonus" ? "bonus" : "" })),
    })),
    runs: state.runs.slice(-SHARE_LAST).map((r) => ({ date: r.date, km: r.km, sec: r.sec })),
    weights: state.settings.shareWeight ? [...state.weights].sort((a, b) => a.date.localeCompare(b.date)).slice(-SHARE_LAST) : null,
    programs: state.programs.map((p) => ({
      activity: p.activity,
      name: p.name,
      layout: p.layout,
      rounds: p.rounds,
      rest: p.rest,
      checks: p.checks,
      exercises: p.exercises.map((ex) => ({ name: ex.name, unit: ex.unit, loaded: !!ex.loaded, sets: ex.sets, ladder: (ex.ladder || []).map(({ id, ...k }) => k) })),
    })),
  };
}

// Événements du fil des 14 derniers jours. `key` rend l'identifiant rejouable sans doublon.
export function feedEvents(state) {
  const from = addDays(today(), -14);
  const ev = [];
  milestones(state)
    .filter((m) => m.date >= from && m.kind !== "start")
    .forEach((m) => ev.push({ type: m.kind, key: `${m.date}_${hash(m.text)}`, date: m.date, text: lower(m.text) }));
  state.sessions.filter((s) => s.date >= from).forEach((s) => ev.push({ type: "session", key: s.id, date: s.date, text: `${s.programName}, ${s.entries.length} exo${s.entries.length > 1 ? "s" : ""}` }));
  state.runs.filter((r) => r.date >= from).forEach((r) => ev.push({ type: "run", key: r.date, date: r.date, text: `a couru ${fmtKm(r.km)} km` }));
  return ev.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
}
function lower(t) {
  return t.charAt(0).toLowerCase() + t.slice(1);
}
export function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Lecture prudente du résumé d'un membre (il vient d'un autre téléphone, V1 ou V2).
export function readMember(m) {
  const d = m.data && typeof m.data === "object" ? m.data : {};
  const list = (a) => (Array.isArray(a) ? a.filter((x) => x && typeof x.date === "string") : []);
  const monday = mondayOf(today());
  const sessions = list(d.sessions), runs = list(d.runs);
  let done, goal;
  if (d.v === 2 && d.week && d.week.monday === monday) {
    done = +d.week.done || 0;
    goal = +d.week.goal || 0;
  } else {
    // Résumé V1 ou d'une semaine passée : on recompte depuis les dates partagées.
    const end = addDays(monday, 7);
    const inWeek = (arr) => new Set(arr.map((x) => x.date).filter((x) => x >= monday && x < end)).size;
    const g = d.goals || {};
    const gc = +g.cali || 0, gr = +g.run || 0;
    goal = gc + gr;
    done = Math.min(gc, inWeek(sessions)) + Math.min(gr, inWeek(runs));
  }
  return {
    uid: m.uid,
    pseudo: m.pseudo,
    updated: m.updated,
    avatar: validImage(d.avatar, AVATAR_MAX) ? d.avatar : "",
    done,
    goal,
    pct: goal ? Math.min(100, Math.round((done / goal) * 100)) : 0,
    weeks: d.weeks && typeof d.weeks === "object" ? d.weeks : {},
    streak: +d.streak || 0,
    sessions,
    runs,
    weights: list(d.weights),
    programs: Array.isArray(d.programs) ? d.programs.filter((p) => p && typeof p.name === "string" && Array.isArray(p.exercises)) : [],
  };
}

// Défi commun de la semaine : séances de tous contre un objectif (celui du groupe, sinon la somme des objectifs).
export function challenge(members, target) {
  const goal = +target > 0 ? +target : members.reduce((a, m) => a + m.goal, 0);
  const done = members.reduce((a, m) => a + m.done, 0);
  return { done, goal, pct: goal ? Math.min(100, Math.round((done / goal) * 100)) : 0, won: goal > 0 && done >= goal };
}
// Semaines passées d'affilée où le défi a été réussi (d'après les semaines partagées par chacun).
export function groupStreak(members, target) {
  const goal = +target > 0 ? +target : members.reduce((a, m) => a + m.goal, 0);
  if (!goal || !members.length) return 0;
  let monday = addDays(mondayOf(today()), -7), n = 0;
  for (let i = 0; i < WEEKS - 1; i++) {
    const done = members.reduce((a, m) => a + (+m.weeks[monday] || 0), 0);
    if (done < goal) break;
    n++;
    monday = addDays(monday, -7);
  }
  return n;
}
export function daysSince(date) {
  return dayNum(today()) - dayNum(date);
}
export { doneInWeek };
