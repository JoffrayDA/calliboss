// Écran Aujourd'hui : la semaine, une carte par activité, le programme prêt à démarrer.
import { addDays, ago, dayNum, longDate, mondayOf, prettyDate, today } from "../core/dates.js";
import { activity } from "../core/catalog.js";
import { findExercise, findProgram, levelOf, programsOf } from "../core/model.js";
import { datesOf, doneInWeek, goalOf } from "../core/stats.js";
import { RUN, fmtKm, runLimit } from "../core/run.js";
import * as store from "../store.js";
import { getAccount } from "../cloud/account.js";
import { esc, nav, plural, toast } from "./dom.js";
import { icon } from "./icons.js";
import { teaser } from "./group.js";

const EXPORT_EVERY = 30; // jours

function weekCard(state) {
  const t = today();
  const monday = mondayOf(t);
  const acts = state.settings.activities;
  const sets = acts.map((a) => ({ a: activity(a), dates: datesOf(state, a) }));
  const counts = sets
    .map(({ a }) => `<div class="count"><div class="num">${doneInWeek(state, a.id, monday)}<small>/${goalOf(state, a.id)}</small></div><span><i class="dot ${a.tone === "s" ? "s" : ""}"></i>${esc(a.label)}</span></div>`)
    .join("");
  const days = ["L", "M", "M", "J", "V", "S", "D"]
    .map((l, i) => {
      const d = addDays(monday, i);
      const tones = new Set(sets.filter((x) => x.dates.has(d)).map((x) => x.a.tone));
      return `<div class="day ${[...tones].join(" ")} ${d === t ? "now" : ""}"><i></i>${l}</div>`;
    })
    .join("");
  return `<div class="block"><div class="counts">${counts}</div><div class="week">${days}</div></div>`;
}

// Proposition de palier suivant : l'app propose, tu décides.
function proposals(state) {
  return state.proposals
    .map((exId) => {
      const ex = findExercise(state, exId);
      if (!ex || !ex.ladder) return "";
      const lvl = levelOf(state, ex);
      const next = ex.ladder[lvl + 1];
      if (!next) return "";
      const inTransition = !!(state.progress[exId] && state.progress[exId].transition);
      return `<div class="block accent">
        <div class="row">${icon("steps")}<h2 class="grow">${esc(ex.name)} : prêt pour la suite ?</h2></div>
        <p class="small">Tu as fait le maximum partout, deux séances de suite, en ${esc(ex.ladder[lvl].name)}. Palier suivant : <b>${esc(next.name)}</b> (${next.min} à ${next.max} ${next.unit === "s" ? "s" : "reps"}).</p>
        <div class="row wrap">
          <button class="btn main sm" data-act="prop-up" data-ex="${exId}">Passer</button>
          ${inTransition ? "" : `<button class="btn quiet sm" data-act="prop-trans" data-ex="${exId}">Progressivement</button>`}
          <button class="btn quiet sm" data-act="prop-later" data-ex="${exId}">Pas encore</button>
        </div>
        ${inTransition ? "" : `<p class="small muted">Progressivement : tu gardes ${esc(ex.ladder[lvl].name)} et ${esc(next.name)} s'ajoute en plus à chaque séance.</p>`}
      </div>`;
    })
    .join("");
}

function strengthCard(state, a, main) {
  const list = programsOf(state, a.id);
  const p = findProgram(state, state.settings.lastProgram[a.id]) || list[0];
  const dates = [...datesOf(state, a.id)].sort();
  const last = dates[dates.length - 1];
  const doneToday = last === today();
  const head = (sub) => `<div class="row"><div class="act-ico ${a.tone}">${icon(a.icon)}</div><div class="grow"><div class="act-title">${esc(a.label)}</div><p class="small muted">${sub}</p></div>${doneToday ? `<span class="chip">${icon("check")}Fait</span>` : ""}</div>`;
  if (!p)
    return `<div class="block">${head("Aucun programme pour l'instant")}
      <button class="btn ${main ? "main" : "quiet"} wide" data-act="programs" data-activity="${a.id}">Choisir un programme</button></div>`;
  return `<div class="block">${head(`${esc(p.name)} · ${plural(p.exercises.length, "exo")}${last ? ` · dernière fois ${esc(ago(last))}` : ""}`)}
    <button class="btn ${main && !doneToday ? "main" : "quiet"} wide" data-act="start" data-id="${p.id}">Démarrer</button>
    <button class="link" data-act="programs" data-activity="${a.id}">Autre programme ou séance libre</button></div>`;
}

function runCard(state, a, main) {
  const lim = runLimit(state.runs, today());
  const doneToday = state.runs.some((r) => r.date === today());
  const sub = lim ? `Limite du bloc : ${fmtKm(lim.km)} km par sortie` : "Note ta dernière sortie pour avoir un repère";
  return `<div class="block"><div class="row"><div class="act-ico ${a.tone}">${icon(a.icon)}</div><div class="grow"><div class="act-title">${esc(a.label)}</div><p class="small muted">${sub}</p></div>${doneToday ? `<span class="chip">${icon("check")}Fait</span>` : ""}</div>
    <button class="btn ${main && !doneToday ? "main" : "quiet"} wide" data-act="go" data-to="run">Noter une sortie</button></div>`;
}

function exportReminder(state) {
  if (getAccount() || state.sessions.length + state.runs.length < 3) return "";
  const last = state.settings.lastExport;
  const days = last ? dayNum(today()) - dayNum(last) : null;
  if (days !== null && days < EXPORT_EVERY) return "";
  return `<div class="block"><p class="small">${last ? `Dernier export il y a ${days} jours.` : "Tes séances ne sont enregistrées que sur ce téléphone."} Crée un compte dans l'onglet Groupe pour une copie de secours automatique, ou exporte un fichier.</p>
    <button class="btn quiet sm" data-act="go" data-to="settings">Ouvrir les réglages</button></div>`;
}

export function render(root, state) {
  const t = today();
  const d = state.draft;
  const monday = new Date().getDay() === 1;
  const weighed = state.weights.some((w) => w.date === t);
  // Le bouton principal va à la première activité pas encore faite aujourd'hui.
  const acts = state.settings.activities.map(activity);
  const firstOpen = acts.find((a) => !datesOf(state, a.id).has(t));
  root.innerHTML = `<section class="screen">
    <div><p class="eyebrow">${esc(longDate(t))}</p><h1>Aujourd'hui</h1></div>
    ${store.saveFailed ? `<div class="block accent"><p class="small bad">Impossible d'enregistrer sur ce téléphone (stockage plein ou bloqué). Exporte tes données depuis les réglages.</p></div>` : ""}
    ${d ? `<div class="block accent">
        <div class="row">${icon("timer")}<div class="grow"><h2>Séance en cours</h2><p class="small muted">${esc(d.programName)}${d.date !== t ? ` · commencée ${esc(prettyDate(d.date))}` : ""}</p></div></div>
        <div class="row"><button class="btn main grow" data-act="go" data-to="session">Reprendre</button><button class="btn quiet" data-act="discard">Abandonner</button></div>
      </div>` : ""}
    ${proposals(state)}
    ${weekCard(state)}
    ${monday && !weighed ? `<div class="block"><p>C'est lundi : pèse-toi au réveil, avant de manger.</p><button class="btn quiet sm" data-act="go" data-to="weight">Noter mon poids</button></div>` : ""}
    ${acts.map((a) => (a.id === "run" ? runCard(state, a, a === firstOpen) : strengthCard(state, a, a === firstOpen))).join("")}
    ${teaser()}
    ${exportReminder(state)}
    ${store.migrated ? `<p class="note">Tes données de la première version ont été reprises. L'ancienne app garde sa copie intacte.</p>` : ""}
  </section>`;
}

export const actions = {
  go: (el) => nav.go(el.dataset.to),
  programs: (el) => nav.go("programs", { activity: el.dataset.activity }),
  start(el) {
    const s = store.getState();
    if (s.draft && !confirm("Une séance est déjà en cours. La remplacer par celle-ci ?")) return;
    store.startProgram(el.dataset.id);
    nav.go("session");
  },
  discard() {
    if (!confirm("Abandonner la séance en cours ? Ce que tu as noté sera perdu.")) return;
    store.discardDraft();
  },
  "prop-up"(el) {
    const step = store.stepMove(el.dataset.ex, 1);
    if (step) toast(`Nouveau palier : ${step.name}`);
  },
  "prop-trans"(el) {
    store.setTransition(el.dataset.ex, true);
    toast("Ajouté en plus à chaque séance");
  },
  "prop-later"(el) {
    store.dismissProposal(el.dataset.ex);
    toast("On garde ce palier. La question reviendra.");
  },
};
export { RUN };
