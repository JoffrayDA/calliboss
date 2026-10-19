// État unique de l'app. Seul ce fichier modifie l'état et écrit dans localStorage.
// Une action modifie, enregistre, puis prévient les abonnés (écran, envoi au groupe, copie de secours).
import { today } from "./core/dates.js";
import { clone, copyProgram, draftFrom, draftFromSession, entryFor, emptyState, findExercise, findProgram, freeDraft, hasLadder, levelOf, newId, programFromSession, sessionFrom, setsCount } from "./core/model.js";
import { starterState } from "./core/catalog.js";
import { topUpFromV1, upgrade } from "./core/migrate.js";
import { readyForNext } from "./core/stats.js";

const KEY = "calliboss.v2";
const KEY_V1 = "calliboss.v1"; // jamais modifiée ni supprimée : c'est la sauvegarde de la V1

export let saveFailed = false;
export let migrated = false; // vrai si cet état vient d'être repris de la V1 à ce lancement
export let fromDisk = false; // vrai si cet état a été relu du téléphone (et non créé vide au lancement)
const subscribers = [];
let state = load();

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (e) {
    return null;
  }
}
function load() {
  const v2 = upgrade(read(KEY));
  if (v2) {
    fromDisk = true;
    // Une seule fois : récupère ce qui a été noté dans la V1 après le premier passage en V2.
    if (!v2.settings.v1TopUp) {
      topUpFromV1(v2, read(KEY_V1));
      v2.settings.v1TopUp = true;
      try {
        localStorage.setItem(KEY, JSON.stringify(v2));
      } catch (e) {}
    }
    return v2;
  }
  const v1 = upgrade(read(KEY_V1));
  if (v1) {
    migrated = true;
    fromDisk = true;
    v1.settings.v1TopUp = true;
    try {
      localStorage.setItem(KEY, JSON.stringify(v1));
    } catch (e) {}
    return v1;
  }
  return starterState();
}

export function getState() {
  return state;
}
export function subscribe(fn) {
  subscribers.push(fn);
}
// `silent` : enregistre sans redessiner l'écran (saisie en cours dans un champ).
function commit(silent = false) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
  } catch (e) {
    saveFailed = true;
  }
  subscribers.forEach((fn) => fn(state, silent));
}
const touch = () => state.draft && (state.draft.touched = Date.now());
const program = () => (state.draft && state.draft.programId ? findProgram(state, state.draft.programId) : null);

// ---------- Réglages et profil ----------
export function setActivities(list) {
  state.settings.activities = list;
  commit();
}
export function setGoal(activity, n) {
  state.settings.goals[activity] = n;
  commit();
}
export function setShareWeight(on) {
  state.settings.shareWeight = on;
  commit();
}
export function setAvatar(src) {
  state.profile.avatar = src;
  commit();
}

// ---------- Séance en cours ----------
export function startProgram(programId) {
  const p = findProgram(state, programId);
  if (!p) return;
  state.draft = draftFrom(state, p, today(), state.settings.place || "parc");
  state.settings.lastProgram[p.activity] = p.id;
  commit();
}
export function startFree(activity) {
  state.draft = freeDraft(activity, today());
  commit();
}
export function discardDraft() {
  state.draft = null;
  commit();
}
// Changer de lieu repart du programme : les mouvements ne sont pas les mêmes à la maison.
export function draftPlace(place) {
  const p = program();
  if (!p) return;
  const old = state.draft;
  state.settings.place = place;
  state.draft = { ...draftFrom(state, p, old.date, place), id: old.id, checks: old.checks };
  commit();
}
export function draftSet(ei, si, field, value) {
  const set = state.draft.entries[ei].sets[si];
  set[field] = value;
  touch();
  commit(true);
}
// Coche rapide : remplit la série avec la valeur proposée, ou la vide si elle était remplie.
export function draftTick(ei, si, suggestion) {
  const set = state.draft.entries[ei].sets[si];
  set.n = set.n > 0 ? 0 : suggestion;
  touch();
  commit();
}
export function draftAddSet(ei) {
  const e = state.draft.entries[ei];
  const last = e.sets[e.sets.length - 1];
  e.sets.push(e.loaded ? { n: 0, kg: last ? last.kg || 0 : 0 } : { n: 0 });
  touch();
  commit();
}
export function draftRemoveSet(ei) {
  const e = state.draft.entries[ei];
  if (e.sets.length > 1) e.sets.pop();
  touch();
  commit();
}
export function draftCheck(id, on) {
  state.draft.checks[id] = on;
  touch();
  commit(true);
}
export function draftNote(ei, text) {
  state.draft.entries[ei].note = text;
  touch();
  commit();
}
export function draftSessionNote(text) {
  state.draft.note = text;
  commit(true);
}
// Renommer depuis la séance. `keep` : le nouveau nom reste dans le programme (l'historique suit par identifiant).
export function draftRename(ei, name, keep) {
  const e = state.draft.entries[ei];
  e.name = name;
  if (keep && e.exId) {
    const ex = findExercise(state, e.exId);
    if (ex) {
      const step = hasLadder(ex) && ex.ladder.find((k) => k.id === e.stepId);
      if (step && e.home && step.alt) step.alt.name = name;
      else if (step) step.name = name;
      else ex.name = name;
    }
  } else if (!keep) {
    // Remplacé pour aujourd'hui seulement : la ligne ne compte plus pour cet exercice du programme.
    e.exId = null;
    e.stepId = null;
    e.tag = "bonus";
  }
  touch();
  commit();
}
export function draftSetCount(ei, n, keep) {
  const e = state.draft.entries[ei];
  n = Math.max(1, Math.min(12, n));
  while (e.sets.length < n) e.sets.push(e.loaded ? { n: 0, kg: (e.sets[e.sets.length - 1] || {}).kg || 0 } : { n: 0 });
  e.sets.length = n;
  const ex = keep && e.exId ? findExercise(state, e.exId) : null;
  const p = program();
  if (ex && p) {
    if (p.layout === "circuit") p.rounds = n;
    else ex.sets = n;
  }
  touch();
  commit();
}
export function draftAddEntry(name, unit, loaded) {
  const sets = Array.from({ length: 3 }, () => (loaded ? { n: 0, kg: 0 } : { n: 0 }));
  state.draft.entries.push({ exId: null, stepId: null, name, unit, loaded, home: false, tag: state.draft.free ? "" : "bonus", sets, note: "" });
  touch();
  commit();
}
// Faire aussi un autre palier du même exercice dans la séance.
export function draftAddStep(exId, level) {
  const ex = findExercise(state, exId);
  const p = program();
  if (!ex || !p) return;
  const at = state.draft.entries.map((e) => e.exId).lastIndexOf(exId);
  state.draft.entries.splice(at + 1, 0, entryFor(ex, level, state.draft.place === "maison", setsCount(p, ex), "extra"));
  touch();
  commit();
}
export function draftRemoveEntry(ei) {
  state.draft.entries.splice(ei, 1);
  touch();
  commit();
}

export function validateDraft(feel, note) {
  const d = state.draft;
  const p = program();
  const session = sessionFrom(d, p, feel, note);
  state.sessions = state.sessions.filter((s) => s.id !== session.id);
  state.sessions.push(session);
  state.sessions.sort((a, b) => a.date.localeCompare(b.date));
  state.draft = null;
  if (p) state.proposals = readyForNext(state, p);
  commit();
  return session;
}
// Rouvre une séance pour la corriger : elle redevient le brouillon et sera réenregistrée à sa date.
export function reopenSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  state.draft = draftFromSession(s, s.programId ? findProgram(state, s.programId) : null);
  state.sessions = state.sessions.filter((x) => x.id !== id);
  commit();
}
export function deleteSession(id) {
  state.sessions = state.sessions.filter((s) => s.id !== id);
  commit();
}
export function saveSessionAsProgram(id, name) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return null;
  const p = programFromSession(s, name);
  state.programs.push(p);
  s.programId = p.id;
  s.programName = p.name;
  s.entries.forEach((e) => {
    const ex = p.exercises.find((x) => x.name.trim().toLowerCase() === e.name.trim().toLowerCase());
    if (ex && !e.exId) {
      e.exId = ex.id;
      e.tag = "";
    }
  });
  state.settings.lastProgram[p.activity] = p.id;
  commit();
  return p;
}

// ---------- Programmes ----------
export function addProgram(p) {
  state.programs.push(p);
  commit();
  return p;
}
export function duplicateProgram(id) {
  const p = findProgram(state, id);
  return p ? addProgram(copyProgram(p)) : null;
}
// Enregistre un programme modifié. La progression pointant un palier supprimé revient au premier palier.
export function saveProgram(p) {
  p = clone(p);
  p.exercises.forEach((ex) => {
    ex.id = ex.id || newId("x");
    (ex.ladder || []).forEach((k) => (k.id = k.id || newId("k")));
    if (ex.ladder && !ex.ladder.length) delete ex.ladder;
    const pr = state.progress[ex.id];
    if (pr && !(ex.ladder || []).some((k) => k.id === pr.step)) delete state.progress[ex.id];
  });
  const i = state.programs.findIndex((x) => x.id === p.id);
  if (i >= 0) state.programs[i] = p;
  else state.programs.push(p);
  state.proposals = state.proposals.filter((id) => findExercise(state, id));
  if (state.draft && state.draft.programId === p.id) state.draft = null;
  commit();
}
export function deleteProgram(id) {
  state.programs = state.programs.filter((p) => p.id !== id);
  Object.keys(state.settings.lastProgram).forEach((a) => state.settings.lastProgram[a] === id && delete state.settings.lastProgram[a]);
  if (state.draft && state.draft.programId === id) state.draft = null;
  state.proposals = state.proposals.filter((x) => findExercise(state, x));
  commit();
}

// ---------- Paliers : toujours sur ton geste, un pas à la fois ----------
export function stepMove(exId, dir) {
  const ex = findExercise(state, exId);
  if (!ex || !hasLadder(ex)) return null;
  const to = levelOf(state, ex) + (dir > 0 ? 1 : -1);
  if (to < 0 || to >= ex.ladder.length) return null;
  const step = ex.ladder[to];
  state.progress[exId] = { step: step.id, transition: null };
  state.progressLog.push({ date: today(), exId, stepId: step.id, name: step.name, dir: dir > 0 ? 1 : -1 });
  state.proposals = state.proposals.filter((id) => id !== exId);
  if (state.draft && state.draft.entries.some((e) => e.exId === exId)) {
    // Séance en cours : on repart du programme pour cet exercice, les séries notées au nouveau palier sont gardées.
    const p = program();
    const kept = state.draft.entries.find((e) => e.exId === exId && e.stepId === step.id);
    const fresh = entryFor(ex, to, state.draft.place === "maison", p ? setsCount(p, ex) : 3);
    if (kept) fresh.sets = kept.sets;
    const others = state.draft.entries.filter((e) => e.exId === exId && e.stepId !== step.id && e.sets.some((x) => x.n > 0)).map((e) => ({ ...e, tag: "extra" }));
    const at = state.draft.entries.findIndex((e) => e.exId === exId);
    state.draft.entries = state.draft.entries.filter((e) => e.exId !== exId);
    state.draft.entries.splice(at, 0, fresh, ...others);
  }
  commit();
  return step;
}
// Y aller progressivement : le palier suivant est ajouté en plus à chaque séance.
export function setTransition(exId, on) {
  const ex = findExercise(state, exId);
  if (!ex || !hasLadder(ex)) return;
  const lvl = levelOf(state, ex);
  state.progress[exId] = { step: ex.ladder[lvl].id, transition: on ? today() : null };
  state.proposals = state.proposals.filter((id) => id !== exId);
  const d = state.draft;
  if (on && d && lvl < ex.ladder.length - 1 && d.entries.some((e) => e.exId === exId) && !d.entries.some((e) => e.exId === exId && e.stepId === ex.ladder[lvl + 1].id)) {
    const p = program();
    const at = d.entries.map((e) => e.exId).lastIndexOf(exId);
    d.entries.splice(at + 1, 0, entryFor(ex, lvl + 1, d.place === "maison", p ? setsCount(p, ex) : 3, "extra"));
  }
  commit();
}
export function dismissProposal(exId) {
  state.proposals = state.proposals.filter((id) => id !== exId);
  commit();
}

// ---------- Course ----------
export function runCheck(id, on) {
  state.runDraft.checks[id] = on;
  commit(true);
}
export function addRun(run) {
  state.runs = state.runs.filter((r) => r.date !== run.date);
  state.runs.push({ ...run, mobility: Object.keys(state.runDraft.checks).filter((k) => state.runDraft.checks[k]) });
  state.runs.sort((a, b) => a.date.localeCompare(b.date));
  state.runDraft = { checks: {} };
  commit();
}
export function deleteRun(date) {
  state.runs = state.runs.filter((r) => r.date !== date);
  commit();
}

// ---------- Poids ----------
export function addWeight(date, kg) {
  state.weights = state.weights.filter((w) => w.date !== date);
  state.weights.push({ date, kg });
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
  commit();
}
export function deleteWeight(date) {
  state.weights = state.weights.filter((w) => w.date !== date);
  commit();
}

// ---------- Sauvegarde ----------
export function markExported() {
  state.settings.lastExport = today();
  commit();
}
// Remplace tout l'état par des données importées ou restaurées (V1 ou V2). Renvoie false si illisibles.
export function replaceAll(data) {
  const next = upgrade(data);
  if (!next) return false;
  state = next;
  commit();
  return true;
}
// État venu du compte : remplace tout, sauf la séance et la sortie en cours sur ce téléphone.
export function applyRemote(data) {
  const next = upgrade(data);
  if (!next) return false;
  next.draft = state.draft;
  next.runDraft = state.runDraft;
  state = next;
  commit();
  return true;
}
export function resetAll() {
  state = starterState();
  commit();
}
export function isEmpty() {
  return !state.sessions.length && !state.runs.length && !state.weights.length;
}
export { emptyState };
