import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { migrateV1, upgrade, isV1, topUpFromV1, V1_PROGRAM_ID } from "../js/core/migrate.js";
import { draftFrom, sessionFrom, findProgram, copyProgram, programFromSession, levelOf, sanitizeProgram } from "../js/core/model.js";
import { starterState, TEMPLATES, instantiate } from "../js/core/catalog.js";
import { readyForNext, deltas, milestones, weekProgress, lastPerf, setsText } from "../js/core/stats.js";
import { runLimit, runWarnings } from "../js/core/run.js";
import { summary, feedEvents, readMember, challenge, validImage, AVATAR_MAX } from "../js/core/share.js";
import { mondayOf, addDays, today } from "../js/core/dates.js";

// État V1 réaliste : paliers montés, transition, palier en plus, bonus, variante maison, course, poids, brouillon.
function v1Fixture() {
  const res = (level, sets, extra) => ({ level, home: false, sets, extras: extra ? [extra] : [] });
  return {
    settings: { weeklyGoal: 4, runGoal: 1, kind: "cali", shareWeight: false, lastExport: "2026-10-01" },
    levels: { pull: 1, push: 1, dips: 0, legs: 0, abs: 0, rope: 0 },
    sessions: [
      { date: "2026-09-19", mode: "parc", complete: true, checks: { warmup: true, mobility: true, cooldown: true }, results: { pull: res(0, [8, 8, 8]), push: res(0, [12, 12, 12]), dips: res(0, [10, 9, 8]) }, bonus: [] },
      { date: "2026-09-22", mode: "maison", complete: false, results: { pull: { level: 0, home: true, sets: [10, 0, 0], extras: [] }, push: res(0, [12, 12, 12]) }, bonus: [{ name: "Burpees", unit: "reps", sets: [10, 8, 0] }] },
      { date: "2026-10-12", mode: "parc", complete: true, results: { pull: res(1, [4, 4, 3], { level: 0, home: false, sets: [6, 0, 0], name: "Tractions australiennes", unit: "reps" }), push: res(1, [8, 7, 6]), gone: { level: -1, home: false, name: "Ancien exo", unit: "s", sets: [30, 30, 0], extras: [] } }, bonus: [] },
    ],
    runs: [{ date: "2026-09-28", km: 4.13, sec: 1660, rpe: 6, mobility: ["ankle", "hang"] }],
    runDraft: { checks: { squat: true } },
    weights: [{ date: "2026-09-21", kg: 79.6 }, { date: "2026-10-12", kg: 78.4 }],
    levelLog: [{ date: "2026-10-05", exId: "pull", level: 1 }, { date: "2026-10-05", exId: "push", level: 1 }],
    proposals: ["push"],
    transitions: { dips: "2026-10-10" },
    draft: { date: "2026-10-13", mode: "parc", checks: { warmup: true }, sets: { pull: [4, 0, 0] }, extras: { dips: [{ level: 1, home: false, sets: [3, 0, 0] }] }, bonus: [], touched: 1 },
    program: null,
  };
}

test("reprise V1 : rien n'est perdu", () => {
  const v1 = v1Fixture();
  const frozen = JSON.stringify(v1);
  assert.ok(isV1(v1));
  const s = migrateV1(v1);
  assert.equal(JSON.stringify(v1), frozen, "l'entrée V1 n'est pas modifiée");

  assert.equal(s.schema, 2);
  assert.deepEqual(s.settings.goals, { cali: 4, run: 1, muscu: 3 });
  assert.equal(s.settings.shareWeight, false);
  assert.equal(s.settings.lastExport, "2026-10-01");

  const p = findProgram(s, V1_PROGRAM_ID);
  assert.equal(p.name, "Débutant V0");
  assert.equal(p.exercises.length, 6);
  assert.equal(p.layout, "circuit");
  assert.equal(p.checks.length, 3);

  const pull = p.exercises[0];
  assert.equal(levelOf(s, pull), 1);
  assert.equal(pull.ladder[1].name, "Tractions négatives");
  assert.equal(pull.ladder[0].alt.name, "Superman au sol");
  assert.equal(s.progress.x_dips.transition, "2026-10-10");
  assert.deepEqual(s.proposals, ["x_push"]);
  assert.equal(s.progressLog.length, 2);
  assert.equal(s.progressLog[0].name, "Tractions négatives");

  assert.equal(s.sessions.length, 3);
  const [a, b, c] = s.sessions;
  assert.equal(a.entries.length, 3);
  assert.deepEqual(a.entries[0], { exId: "x_pull", stepId: "k_pull_0", name: "Tractions australiennes", unit: "reps", loaded: false, home: false, tag: "", sets: [{ n: 8 }, { n: 8 }, { n: 8 }] });
  assert.equal(a.complete, true);
  assert.equal(b.place, "maison");
  assert.equal(b.entries[0].name, "Superman au sol");
  assert.equal(b.entries[0].home, true);
  assert.deepEqual(b.entries[2], { exId: null, stepId: null, name: "Burpees", unit: "reps", loaded: false, home: false, tag: "bonus", sets: [{ n: 10 }, { n: 8 }, { n: 0 }] });
  assert.equal(c.entries.find((e) => e.tag === "extra").name, "Tractions australiennes");
  const gone = c.entries.find((e) => e.exId === "x_gone");
  assert.equal(gone.name, "Ancien exo");
  assert.equal(gone.stepId, null);
  assert.equal(gone.unit, "s");
  // Chaque série notée en V1 se retrouve en V2
  const v1Total = v1.sessions.flatMap((se) => [...Object.values(se.results).flatMap((r) => [r.sets, ...r.extras.map((x) => x.sets)]), ...se.bonus.map((x) => x.sets)]).flat().reduce((x, y) => x + y, 0);
  const v2Total = s.sessions.flatMap((se) => se.entries.flatMap((e) => e.sets.map((x) => x.n))).reduce((x, y) => x + y, 0);
  assert.equal(v2Total, v1Total);

  assert.deepEqual(s.runs, [{ date: "2026-09-28", km: 4.13, sec: 1660, rpe: 6, feel: null, note: "", mobility: ["ankle", "hang"] }]);
  assert.deepEqual(s.runDraft, { checks: { squat: true } });
  assert.deepEqual(s.weights, v1.weights);

  assert.equal(s.draft.date, "2026-10-13");
  assert.equal(s.draft.entries[0].sets[0].n, 4);
  assert.equal(s.draft.entries[0].name, "Tractions négatives");
  assert.ok(s.draft.entries.some((e) => e.tag === "extra" && e.name === "Dips négatifs (barres parallèles)" && e.sets[0].n === 3));
  assert.equal(s.draft.checks.warmup, true);
});

test("reprise V1 : programme perso et import", () => {
  const v1 = v1Fixture();
  v1.program = { name: "Perso", rounds: 4, exercises: [{ id: "xabc", name: "Tirage", ladder: [{ name: "Tirage élastique", min: 5, max: 10, unit: "reps", tip: "" }] }] };
  v1.levels = { xabc: 0 };
  v1.sessions = [{ date: "2026-10-01", mode: "parc", complete: true, results: { xabc: { level: 0, home: false, sets: [5, 5, 5, 5], extras: [] } }, bonus: [] }];
  v1.draft = null;
  const s = upgrade(v1);
  assert.equal(s.programs[0].name, "Perso");
  assert.equal(s.programs[0].rounds, 4);
  assert.equal(s.programs[0].checks.length, 3, "échauffement de base repris quand le programme perso n'en définit pas");
  assert.equal(s.sessions[0].entries[0].name, "Tirage élastique");
  assert.equal(s.sessions[0].entries[0].sets.length, 4);
  assert.equal(upgrade({ foo: 1 }), null);
  assert.equal(upgrade(JSON.parse(JSON.stringify(s))).sessions.length, 1, "un état V2 repasse sans changement");
});

test("séance : brouillon, validation, séries libres et charges", () => {
  const s = starterState();
  s.programs.push(instantiate(TEMPLATES.find((t) => t.name === "Full body A")));
  const muscu = s.programs[1];
  const d = draftFrom(s, muscu, "2026-10-13", "parc");
  assert.equal(d.entries.length, 4);
  assert.equal(d.entries[0].sets.length, 4);
  d.entries[0].sets = [{ n: 8, kg: 40 }, { n: 8, kg: 42.5 }, { n: 6, kg: 42.5 }, { n: 0, kg: 42.5 }, { n: 5, kg: 40 }];
  const done = sessionFrom(d, muscu, "ok", "bien");
  assert.equal(done.entries.length, 1);
  assert.equal(done.entries[0].sets.length, 5);
  assert.equal(done.complete, false);
  assert.equal(done.feel, "ok");
  assert.equal(setsText(done.entries[0].sets, true), "8×40 · 8×42,5 · 6×42,5 · 5×40");
  assert.equal(setsText([{ n: 8, kg: 40 }, { n: 8, kg: 40 }], true), "8 · 8 à 40 kg");

  s.sessions.push(done);
  const d2 = draftFrom(s, muscu, "2026-10-15", "parc");
  d2.entries[0].sets = [{ n: 8, kg: 45 }];
  const next = sessionFrom(d2, muscu);
  s.sessions.push(next);
  assert.deepEqual(deltas(s, next)[0], { d: 2.5, unit: "kg" });
  assert.equal(lastPerf(s, d2.entries[0], next.id).date, "2026-10-13");
  assert.ok(milestones(s).some((m) => m.kind === "record" && m.text.includes("45 kg")));

  const copy = copyProgram(muscu);
  assert.notEqual(copy.id, muscu.id);
  assert.notEqual(copy.exercises[0].id, muscu.exercises[0].id);
  const fromFree = programFromSession(next, "Test");
  assert.equal(fromFree.exercises[0].name, "Squat");
  assert.equal(fromFree.exercises[0].loaded, true);
});

test("paliers : proposition après deux séances au max, transition ajoutée d'office", () => {
  const s = starterState();
  const p = s.programs[0];
  const maxed = (date) => {
    const d = draftFrom(s, p, date, "parc");
    d.entries.forEach((e) => (e.sets = e.sets.map(() => ({ n: e.max }))));
    p.checks.forEach((c) => (d.checks[c.id] = true));
    return sessionFrom(d, p);
  };
  s.sessions.push(maxed("2026-10-01"));
  assert.equal(s.sessions[0].complete, true);
  assert.deepEqual(readyForNext(s, p), []);
  s.sessions.push(maxed("2026-10-03"));
  assert.equal(readyForNext(s, p).length, 6);
  s.progress[p.exercises[0].id] = { step: p.exercises[0].ladder[0].id, transition: "2026-10-03" };
  const d = draftFrom(s, p, "2026-10-05", "parc");
  assert.equal(d.entries[1].tag, "extra");
  assert.equal(d.entries[1].name, "Tractions négatives");
  const home = draftFrom(s, p, "2026-10-05", "maison");
  assert.equal(home.entries[0].name, "Superman au sol");
});

test("semaine, course, partage", () => {
  const s = starterState();
  const monday = mondayOf(today());
  s.sessions.push({ id: "s1", date: monday, activity: "cali", programId: s.programs[0].id, programName: "Débutant V0", place: "parc", complete: true, checks: {}, entries: [{ exId: "x_pull", stepId: "k_pull_0", name: "Tractions australiennes", unit: "reps", loaded: false, home: false, tag: "", sets: [{ n: 8 }] }], feel: "ok", note: "" });
  s.runs.push({ date: monday, km: 4, sec: 1600, rpe: null, feel: null, note: "", mobility: [] });
  assert.deepEqual(weekProgress(s, monday), { done: 2, goal: 5, pct: 40 });

  const runs = [{ date: "2026-09-28", km: 4.13, sec: 1660 }];
  assert.equal(runLimit(runs, "2026-10-05").km, 5.4);
  assert.equal(runLimit([], "2026-10-05"), null);
  assert.equal(runWarnings(runs, "2026-10-05", 6, 400).length, 2);

  const sum = summary(s);
  assert.equal(sum.week.done, 2);
  assert.equal(sum.sessions[0].lines[0].name, "Tractions australiennes");
  assert.equal(sum.programs[0].exercises[0].ladder[0].id, undefined, "les identifiants ne partent pas avec le programme partagé");
  const me = readMember({ uid: "a", pseudo: "moi", updated: 1, data: JSON.parse(JSON.stringify(sum)) });
  assert.equal(me.pct, 40);
  const v1Member = readMember({ uid: "b", pseudo: "tom", updated: 1, data: { goals: { cali: 3, run: 0 }, sessions: [{ date: monday }, { date: addDays(monday, 1) }], runs: [] } });
  assert.equal(v1Member.done, 2);
  assert.deepEqual(challenge([me, v1Member], 0), { done: 4, goal: 8, pct: 50, won: false });
  assert.ok(feedEvents(s).some((e) => e.type === "session" && e.key === "s1"));
  assert.equal(validImage("data:image/jpeg;base64,AAAA", AVATAR_MAX), true);
  assert.equal(validImage("javascript:alert(1)", AVATAR_MAX), false);
  assert.equal(validImage("data:image/svg+xml;base64,AAAA", AVATAR_MAX), false);
  assert.equal(sanitizeProgram({ name: "<b>x</b>", exercises: [{ name: 5, sets: "abc" }] }, "muscu").exercises[0].sets, 3);
});

test("rattrapage V1 : ajoute les jours manquants sans rien écraser", () => {
  const v1 = v1Fixture();
  const s = migrateV1(v1);
  s.sessions[0].note = "modifiée en V2";
  v1.sessions.push({ date: "2026-10-14", mode: "parc", complete: true, results: { pull: { level: 1, home: false, sets: [5, 4, 4], extras: [] } }, bonus: [] });
  v1.runs.push({ date: "2026-10-14", km: 5, sec: 2000, rpe: null, mobility: [] });
  v1.weights.push({ date: "2026-10-19", kg: 78 });
  assert.equal(topUpFromV1(s, v1), 3);
  assert.equal(s.sessions.length, 4);
  assert.equal(s.sessions[0].note, "modifiée en V2");
  assert.equal(s.sessions[3].entries[0].sets[0].n, 5);
  assert.equal(topUpFromV1(s, v1), 0);
  assert.equal(topUpFromV1(s, null), 0);
});

test("hors ligne : tous les fichiers de l'app sont dans la liste du service worker", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  const files = [...["css", "fonts", "icons", "js"].flatMap((d) => walk(join(root, d))), ...["index.html", "manifest.webmanifest", "firebase-config.js"].map((f) => join(root, f))].map((f) => relative(root, f).replace(/\\/g, "/"));
  assert.ok(files.length > 30);
  const missing = files.filter((f) => !sw.includes(`"${f}"`));
  assert.deepEqual(missing, []);
});
