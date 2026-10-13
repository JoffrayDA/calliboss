// Reprise des données V1 (clé calliboss.v1 ou fichier d'export V1) vers le modèle V2.
// Fonction pure : ne lit ni n'écrit aucun stockage, ne modifie pas son entrée.
import { V1_DEFAULT } from "./v1-default.js";
import { SCHEMA, clone, emptyState, entryFor } from "./model.js";

const V1_PROGRAM_KEYS = ["name", "rounds", "restBetweenRounds", "warmup", "mobility", "cooldown", "exercises"];
export const V1_PROGRAM_ID = "p_v1";
const exId = (id) => `x_${id}`;
const stepId = (id, i) => `k_${id}_${i}`;

function v1Step(st) {
  return { name: st.name, min: st.min, max: st.max, unit: st.unit === "s" ? "s" : "reps", tip: st.tip || "" };
}

// Programme V1 (circuit à paliers, variantes maison) → programme V2 de calisthénie.
export function convertProgram(v1, id = V1_PROGRAM_ID) {
  const p = {};
  V1_PROGRAM_KEYS.forEach((k) => (p[k] = v1 && v1[k] !== undefined ? v1[k] : V1_DEFAULT[k]));
  const checks = [];
  if (p.warmup) checks.push({ id: "warmup", text: p.warmup.parc || "", alt: p.warmup.maison || "", when: "before" });
  if (p.mobility) checks.push({ id: "mobility", text: p.mobility, when: "before" });
  if (p.cooldown) checks.push({ id: "cooldown", text: p.cooldown.parc || "", alt: p.cooldown.maison || "", when: "after" });
  return {
    id,
    activity: "cali",
    name: p.name || "Mon programme",
    layout: "circuit",
    rounds: p.rounds || 3,
    rest: p.restBetweenRounds || "",
    checks,
    exercises: p.exercises.map((ex) => ({
      id: exId(ex.id),
      name: ex.name,
      unit: ex.ladder[0] && ex.ladder[0].unit === "s" ? "s" : "reps",
      loaded: false,
      sets: p.rounds || 3,
      ladder: ex.ladder.map((st, i) => {
        const k = { id: stepId(ex.id, i), ...v1Step(st) };
        if (st.home) k.alt = v1Step(st.home);
        return k;
      }),
    })),
  };
}

const toSets = (arr) => (Array.isArray(arr) ? arr : []).map((v) => ({ n: +v > 0 ? +v : 0 }));

export function isV1(data) {
  return !!data && typeof data === "object" && data.schema === undefined && Array.isArray(data.sessions);
}

export function migrateV1(v1) {
  v1 = clone(v1);
  const s = emptyState();
  const program = convertProgram(v1.program || null);
  s.programs = [program];
  const v1Exercises = (v1.program || V1_DEFAULT).exercises || V1_DEFAULT.exercises;
  const byV1Id = {};
  v1Exercises.forEach((ex) => (byV1Id[ex.id] = ex));

  const set = v1.settings || {};
  if (set.weeklyGoal) s.settings.goals.cali = set.weeklyGoal;
  if (set.runGoal) s.settings.goals.run = set.runGoal;
  if (typeof set.shareWeight === "boolean") s.settings.shareWeight = set.shareWeight;
  if (set.lastExport) s.settings.lastExport = set.lastExport;
  s.settings.lastProgram.cali = program.id;

  // Paliers et transitions
  v1Exercises.forEach((ex) => {
    const raw = (v1.levels || {})[ex.id];
    const lvl = Math.max(0, Math.min(typeof raw === "number" ? raw : 0, ex.ladder.length - 1));
    s.progress[exId(ex.id)] = { step: stepId(ex.id, lvl), transition: (v1.transitions || {})[ex.id] || null };
  });
  s.progressLog = (v1.levelLog || [])
    .filter((l) => l && l.date)
    .map((l) => {
      const ex = byV1Id[l.exId];
      const st = ex && ex.ladder[l.level];
      return { date: l.date, exId: exId(l.exId), stepId: st ? stepId(l.exId, l.level) : null, name: st ? st.name : l.exId, dir: 1 };
    });
  s.proposals = (v1.proposals || []).filter((id) => byV1Id[id]).map(exId);

  // Une ligne V1 (palier principal, palier en plus) → ligne V2 autonome
  const line = (id, e, tag) => {
    const ex = byV1Id[id];
    const known = ex && e.level >= 0 && e.level < ex.ladder.length;
    const st = known ? (e.home && ex.ladder[e.level].home ? ex.ladder[e.level].home : ex.ladder[e.level]) : null;
    return {
      exId: exId(id),
      stepId: known ? stepId(id, e.level) : null,
      name: e.name || (st ? st.name : id),
      unit: (e.unit || (st ? st.unit : "reps")) === "s" ? "s" : "reps",
      loaded: false,
      home: !!e.home,
      tag,
      sets: toSets(e.sets),
    };
  };
  const order = v1Exercises.map((ex) => ex.id);
  const used = new Set();
  s.sessions = (v1.sessions || []).map((se) => {
    const ids = [...order];
    Object.keys(se.results || {}).forEach((id) => ids.includes(id) || ids.push(id));
    const entries = [];
    ids.forEach((id) => {
      const r = (se.results || {})[id];
      if (!r) return;
      [[r, ""], ...(r.extras || []).map((x) => [x, "extra"])].forEach(([e, tag]) => {
        if (e.sets && e.sets.some((v) => v > 0)) entries.push(line(id, e, tag));
      });
    });
    (se.bonus || []).forEach((b) => entries.push({ exId: null, stepId: null, name: b.name, unit: b.unit === "s" ? "s" : "reps", loaded: false, home: false, tag: "bonus", sets: toSets(b.sets) }));
    let id = `s_${se.date}`;
    while (used.has(id)) id += "b";
    used.add(id);
    const checks = se.checks || (se.complete ? { warmup: true, mobility: true, cooldown: true } : {});
    return { id, date: se.date, activity: "cali", programId: program.id, programName: program.name, place: se.mode === "maison" ? "maison" : "parc", complete: !!se.complete, checks, entries, feel: null, note: "" };
  });
  s.sessions.sort((a, b) => a.date.localeCompare(b.date));

  s.runs = (v1.runs || []).map((r) => ({ date: r.date, km: r.km, sec: r.sec, rpe: r.rpe == null ? null : r.rpe, feel: null, note: "", mobility: r.mobility || [] }));
  s.runDraft = { checks: (v1.runDraft && v1.runDraft.checks) || {} };
  s.weights = (v1.weights || []).map((w) => ({ date: w.date, kg: w.kg }));

  // Séance en cours au moment du passage
  const d = v1.draft;
  if (d && d.date && !s.sessions.some((x) => x.date === d.date)) {
    const place = d.mode === "maison" ? "maison" : "parc";
    const home = place === "maison";
    const dense = (arr) => Array.from({ length: program.rounds }, (_, i) => ({ n: +((arr || [])[i]) > 0 ? +arr[i] : 0 }));
    const entries = [];
    program.exercises.forEach((ex) => {
      const v1id = ex.id.slice(2);
      const lvl = ex.ladder.findIndex((k) => k.id === s.progress[ex.id].step);
      entries.push({ ...entryFor(ex, lvl, home, program.rounds), sets: dense((d.sets || {})[v1id]) });
      ((d.extras || {})[v1id] || []).forEach((x) => {
        if (x.level >= 0 && x.level < ex.ladder.length) entries.push({ ...entryFor(ex, x.level, !!x.home, program.rounds, "extra"), sets: dense(x.sets) });
      });
    });
    (d.bonus || []).forEach((b) => entries.push({ exId: null, stepId: null, name: b.name, unit: b.unit === "s" ? "s" : "reps", loaded: false, home: false, tag: "bonus", sets: dense(b.sets), note: "" }));
    const any = entries.some((e) => e.sets.some((x) => x.n > 0)) || Object.values(d.checks || {}).some(Boolean);
    if (any) s.draft = { id: `s_${d.date}`, date: d.date, activity: "cali", programId: program.id, programName: program.name, layout: "circuit", place, checks: d.checks || {}, entries, note: "", touched: d.touched || 0 };
  }
  return s;
}

// Remet à niveau un état chargé (V1, V2 incomplet, fichier importé). Renvoie null si illisible.
export function upgrade(data) {
  if (!data || typeof data !== "object") return null;
  if (isV1(data)) return migrateV1(data);
  if (data.schema !== SCHEMA || !Array.isArray(data.sessions)) return null;
  const base = emptyState();
  const s = Object.assign(base, data);
  s.settings = Object.assign(emptyState().settings, data.settings);
  s.settings.goals = Object.assign(emptyState().settings.goals, (data.settings || {}).goals);
  s.settings.lastProgram = s.settings.lastProgram || {};
  s.profile = Object.assign({ avatar: "" }, data.profile);
  return s;
}
