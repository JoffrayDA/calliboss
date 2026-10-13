// Modèle de données V2 : activité → programme → exercice → séries libres.
// Fonctions pures, sauf newId (horodatage + hasard).

export const SCHEMA = 2;
export const ADVANCE_AFTER = 2; // séances de suite au max avant de proposer le palier suivant

export function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// Identifiant stable : préfixe + horodatage + suffixe. Jamais dérivé d'un nom ni d'un rang.
export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyState() {
  return {
    schema: SCHEMA,
    settings: { activities: ["cali", "run"], goals: { cali: 3, run: 2, muscu: 3 }, shareWeight: true, lastProgram: {}, place: "parc" },
    profile: { avatar: "" },
    programs: [],
    progress: {}, // exId -> { step: stepId, transition: date | null }
    progressLog: [], // { date, exId, stepId, name }
    proposals: [], // exIds prêts pour le palier suivant, en attente de réponse
    sessions: [],
    runs: [],
    runDraft: { checks: {} },
    weights: [],
    draft: null,
  };
}

export function findProgram(state, id) {
  return state.programs.find((p) => p.id === id) || null;
}
export function findExercise(state, exId) {
  for (const p of state.programs) {
    const ex = p.exercises.find((e) => e.id === exId);
    if (ex) return ex;
  }
  return null;
}
export function programsOf(state, activity) {
  return state.programs.filter((p) => p.activity === activity);
}

export function hasLadder(ex) {
  return !!(ex.ladder && ex.ladder.length);
}
// Rang du palier actuel d'un exercice (0 si inconnu).
export function levelOf(state, ex) {
  if (!hasLadder(ex)) return 0;
  const pr = state.progress[ex.id];
  const i = pr ? ex.ladder.findIndex((k) => k.id === pr.step) : -1;
  return i < 0 ? 0 : i;
}
// Ce qu'on fait vraiment à ce palier : variante maison si demandée et disponible.
export function stepView(step, home) {
  if (home && step.alt) return { ...step.alt, id: step.id, home: true };
  return { name: step.name, min: step.min, max: step.max, unit: step.unit, tip: step.tip || "", id: step.id, home: false };
}

// Ligne de séance prête à remplir pour un exercice, à un palier donné (ou sans palier).
export function entryFor(ex, level, home, count, tag = "") {
  const sets = Array.from({ length: Math.max(1, count) }, () => ({ n: 0 }));
  if (hasLadder(ex)) {
    const st = stepView(ex.ladder[Math.max(0, Math.min(level, ex.ladder.length - 1))], home);
    return { exId: ex.id, stepId: st.id, name: st.name, unit: st.unit, loaded: !!ex.loaded, home: st.home, tag, min: st.min, max: st.max, tip: st.tip, sets, note: "" };
  }
  return { exId: ex.id, stepId: null, name: ex.name, unit: ex.unit || "reps", loaded: !!ex.loaded, home: false, tag, sets, note: "" };
}

export function setsCount(program, ex) {
  return program.layout === "circuit" ? program.rounds || 3 : ex.sets || 3;
}

// Brouillon d'une séance à partir d'un programme. En transition, le palier suivant est ajouté d'office.
export function draftFrom(state, program, date, place) {
  const home = place === "maison";
  const entries = [];
  program.exercises.forEach((ex) => {
    const lvl = levelOf(state, ex);
    const n = setsCount(program, ex);
    entries.push(entryFor(ex, lvl, home, n));
    const pr = state.progress[ex.id];
    if (hasLadder(ex) && pr && pr.transition && lvl < ex.ladder.length - 1) entries.push(entryFor(ex, lvl + 1, home, n, "extra"));
  });
  return {
    id: newId("s"),
    date,
    activity: program.activity,
    programId: program.id,
    programName: program.name,
    layout: program.layout,
    place,
    checks: {},
    entries,
    note: "",
    touched: Date.now(),
  };
}
export function freeDraft(activity, date) {
  return { id: newId("s"), date, activity, programId: null, programName: "Séance libre", layout: "sets", place: "parc", checks: {}, entries: [], note: "", free: true, touched: Date.now() };
}

export function filled(sets) {
  return (sets || []).filter((s) => s.n > 0).length;
}
export function total(sets) {
  return (sets || []).reduce((a, s) => a + (s.n || 0), 0);
}
export function topKg(sets) {
  return Math.max(0, ...(sets || []).filter((s) => s.n > 0).map((s) => s.kg || 0));
}

// Séance enregistrée à partir d'un brouillon : autonome, elle ne relit plus jamais le programme.
export function sessionFrom(draft, program, feel, note) {
  const entries = draft.entries
    .filter((e) => filled(e.sets) > 0)
    .map((e) => {
      const out = { exId: e.exId, stepId: e.stepId, name: e.name, unit: e.unit, loaded: !!e.loaded, home: !!e.home, tag: e.tag || "", sets: e.sets.map((s) => (e.loaded ? { n: s.n || 0, kg: s.kg || 0 } : { n: s.n || 0 })) };
      if (e.note) out.note = e.note;
      return out;
    });
  const checks = (program && program.checks) || [];
  const main = draft.entries.filter((e) => !e.tag);
  const complete = main.length > 0 && main.every((e) => e.sets.length > 0 && filled(e.sets) === e.sets.length) && checks.every((c) => draft.checks[c.id]);
  return { id: draft.id, date: draft.date, activity: draft.activity, programId: draft.programId, programName: draft.programName, place: draft.place, complete, checks: { ...draft.checks }, entries, feel: feel || null, note: note || "" };
}

// Rouvre une séance enregistrée en brouillon pour la corriger.
export function draftFromSession(s, program) {
  return {
    id: s.id,
    date: s.date,
    activity: s.activity,
    programId: s.programId,
    programName: s.programName,
    layout: program ? program.layout : "sets",
    place: s.place || "parc",
    checks: { ...(s.checks || {}) },
    entries: s.entries.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x })), note: e.note || "" })),
    note: s.note || "",
    feel: s.feel || null,
    free: !s.programId,
    touched: Date.now(),
  };
}

// Programme construit à partir d'une séance libre : un exercice par mouvement fait.
export function programFromSession(s, name) {
  const seen = new Set();
  const exercises = [];
  s.entries.forEach((e) => {
    const key = e.name.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    exercises.push({ id: newId("x"), name: e.name, unit: e.unit, loaded: !!e.loaded, sets: e.sets.length || 3 });
  });
  return { id: newId("p"), activity: s.activity, name, layout: "sets", rounds: 3, rest: "", checks: [], exercises };
}

// Copie d'un programme : nouveaux identifiants partout, la progression ne suit pas.
export function copyProgram(p, name) {
  const c = clone(p);
  c.id = newId("p");
  c.name = name || `${p.name} (copie)`;
  c.exercises.forEach((ex) => {
    ex.id = newId("x");
    (ex.ladder || []).forEach((k) => (k.id = newId("k")));
  });
  return c;
}

// Nettoie un programme reçu d'ailleurs (groupe, import) : seules les formes connues passent.
export function sanitizeProgram(raw, activity) {
  const str = (v, max) => String(v == null ? "" : v).slice(0, max);
  const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? Math.min(+v, 999) : d);
  const unit = (u) => (u === "s" ? "s" : "reps");
  const step = (k) => ({ name: str(k.name, 80), min: num(k.min, 1), max: num(k.max, 10), unit: unit(k.unit), tip: str(k.tip, 160) });
  const exercises = (Array.isArray(raw.exercises) ? raw.exercises : []).slice(0, 30).map((ex) => {
    const out = { id: newId("x"), name: str(ex.name, 80) || "Exercice", unit: unit(ex.unit), loaded: !!ex.loaded, sets: Math.min(num(ex.sets, 3), 12) };
    if (Array.isArray(ex.ladder) && ex.ladder.length)
      out.ladder = ex.ladder.slice(0, 12).map((k) => {
        const s = { id: newId("k"), ...step(k) };
        if (k.alt && typeof k.alt === "object") s.alt = step(k.alt);
        return s;
      });
    return out;
  });
  return {
    id: newId("p"),
    activity,
    name: str(raw.name, 60) || "Programme",
    layout: raw.layout === "circuit" ? "circuit" : "sets",
    rounds: Math.min(num(raw.rounds, 3), 10),
    rest: str(raw.rest, 120),
    checks: (Array.isArray(raw.checks) ? raw.checks : []).slice(0, 8).map((c, i) => {
      const o = { id: str(c.id, 20) || `c${i}`, text: str(c.text, 200), when: c.when === "after" ? "after" : "before" };
      if (c.alt) o.alt = str(c.alt, 200);
      return o;
    }),
    exercises,
  };
}
