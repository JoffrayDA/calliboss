// Écran Séance : une carte par exercice, séries libres, charges, crayon, ressenti à la validation.
import { prettyDate, today } from "../core/dates.js";
import { activity } from "../core/catalog.js";
import { filled, findExercise, findProgram, levelOf, stepView } from "../core/model.js";
import { lastPerf, setsText } from "../core/stats.js";
import * as store from "../store.js";
import { $, closeSheet, esc, fr, nav, openSheet, startRest, stopRest, toast, unitLabel } from "./dom.js";
import { icon } from "./icons.js";

const draft = () => store.getState().draft;
const program = () => {
  const d = draft();
  return d && d.programId ? findProgram(store.getState(), d.programId) : null;
};
const hasAlt = (p) => !!p && (p.exercises.some((ex) => (ex.ladder || []).some((k) => k.alt)) || (p.checks || []).some((c) => c.alt));
const setWord = (d) => (d.layout === "circuit" ? "Tour" : "Série");

// Valeur proposée pour une série vide : la même série la dernière fois, sinon le minimum du palier.
function suggestion(state, d, e, j) {
  const last = lastPerf(state, e, d.id);
  if (last && last.sets[j] && last.sets[j].n > 0) return last.sets[j].n;
  if (last) {
    const done = last.sets.filter((x) => x.n > 0);
    if (done.length) return done[done.length - 1].n;
  }
  return e.min || 0;
}

function checkList(d, p, when) {
  const list = ((p && p.checks) || []).filter((c) => c.when === when);
  if (!list.length) return "";
  const home = d.place === "maison";
  return `<div class="block"><p class="eyebrow">${when === "before" ? "Avant" : "Après"}</p>${list
    .map((c) => `<label class="check"><input type="checkbox" data-ch="check" data-id="${esc(c.id)}" ${d.checks[c.id] ? "checked" : ""}><span class="box">${icon("check")}</span><span>${esc(home && c.alt ? c.alt : c.text)}</span></label>`)
    .join("")}</div>`;
}

function entryCard(state, d, e, i) {
  const last = lastPerf(state, e, d.id);
  const unit = unitLabel(e.unit);
  const tags = [e.home ? "maison" : "", e.tag === "extra" ? "en plus" : "", e.tag === "bonus" ? "bonus" : ""].filter(Boolean).map((t) => `<span class="tag">${t}</span>`).join(" ");
  const hint = [e.min ? `${e.min} à ${e.max} ${unit}` : "", e.tip || ""].filter(Boolean).join(" · ");
  const rows = e.sets
    .map((s, j) => {
      const sug = suggestion(state, d, e, j);
      return `<div class="set ${e.loaded ? "" : "nokg"}">
        <label for="n${i}-${j}">${setWord(d)} ${j + 1}</label>
        <div class="field"><input id="n${i}-${j}" inputmode="numeric" value="${s.n > 0 ? s.n : ""}" placeholder="${sug || "–"}" data-in="set" data-e="${i}" data-s="${j}" data-f="n"><span>${unit}</span></div>
        ${e.loaded ? `<div class="field"><input id="k${i}-${j}" inputmode="decimal" value="${s.kg ? fr(s.kg) : ""}" placeholder="0" aria-label="Charge en kilos" data-in="set" data-e="${i}" data-s="${j}" data-f="kg"><span>kg</span></div>` : ""}
        <button class="tick" data-act="tick" data-e="${i}" data-s="${j}" data-sug="${sug}" aria-pressed="${s.n > 0}" aria-label="Fait">${icon("check")}</button>
      </div>`;
    })
    .join("");
  return `<div class="block" data-entry="${i}">
    <div class="row"><div class="grow"><h2>${esc(e.name)}</h2>${tags ? `<p>${tags}</p>` : ""}${hint ? `<p class="small muted">${esc(hint)}</p>` : ""}
      ${last ? `<p class="small muted">Dernière fois (${esc(prettyDate(last.date))}) : <b>${esc(setsText(last.sets, last.loaded))}</b></p>` : ""}</div>
      <button class="iconbtn" data-act="edit" data-e="${i}" aria-label="Modifier ${esc(e.name)}">${icon("pen")}</button></div>
    ${rows}
    ${e.note ? `<p class="quote">${esc(e.note)}</p>` : ""}
    <div class="row between">
      <button class="add" data-act="addset" data-e="${i}">${icon("plus")}${d.layout === "circuit" ? "Tour" : "Série"}</button>
      ${e.sets.length > 1 ? `<button class="add muted" data-act="rmset" data-e="${i}">${icon("minus")}Retirer</button>` : ""}
    </div>
  </div>`;
}

function countChip(d) {
  const done = d.entries.filter((e) => e.sets.length && filled(e.sets) === e.sets.length).length;
  return `${done}/${d.entries.length}`;
}

export function render(root, state) {
  const d = state.draft;
  if (!d) return nav.go("today");
  const p = program();
  const a = activity(d.activity);
  root.innerHTML = `<section class="screen">
    <div class="row">
      <button class="iconbtn" data-act="go" data-to="today" aria-label="Retour">${icon("back")}</button>
      <div class="grow"><p class="eyebrow">${esc(a.label)}</p><h2>${esc(d.programName)}</h2></div>
      <span class="chip"><span class="num" id="ses-count">${countChip(d)}</span> exos</span>
    </div>
    ${d.date !== today() ? `<p class="small muted">Séance du ${esc(prettyDate(d.date))} : elle sera enregistrée à cette date.</p>` : ""}
    ${hasAlt(p) ? `<div class="seg"><button data-act="place" data-place="parc" aria-pressed="${d.place !== "maison"}">Dehors</button><button data-act="place" data-place="maison" aria-pressed="${d.place === "maison"}">Plan B maison</button></div>` : ""}
    ${checkList(d, p, "before")}
    ${p && d.layout === "circuit" ? `<p class="small muted">Circuit : enchaîne les exercices dans l'ordre, puis recommence.${p.rest ? ` ${esc(p.rest)}.` : ""}</p>` : ""}
    ${d.entries.map((e, i) => entryCard(state, d, e, i)).join("")}
    ${!d.entries.length ? `<div class="block"><p>Séance libre : ajoute tes exercices au fur et à mesure. À la fin, tu pourras la garder comme programme.</p></div>` : ""}
    <div class="row">
      <button class="btn quiet grow" data-act="addentry">${icon("plus")}Exercice</button>
      <button class="btn quiet" data-act="rest">${icon("timer")}Repos 2:00</button>
    </div>
    ${checkList(d, p, "after")}
    <button class="btn main wide" data-act="finish">Valider la séance</button>
  </section>`;
}

function parse(v) {
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const inputs = {
  // Saisie d'une série : enregistrée sans redessiner l'écran, on met juste à jour la coche et le compteur.
  set(el) {
    const { e, s, f } = el.dataset;
    const v = f === "kg" ? Math.min(parse(el.value), 999) : Math.min(Math.round(parse(el.value)), 9999);
    store.draftSet(+e, +s, f, v);
    if (f === "n") el.closest(".set").querySelector(".tick").setAttribute("aria-pressed", v > 0);
    $("#ses-count").textContent = countChip(draft());
  },
};
export const changes = {
  check: (el) => store.draftCheck(el.dataset.id, el.checked),
};

function editSheet(i) {
  const d = draft();
  const e = d.entries[i];
  const ex = e.exId ? findExercise(store.getState(), e.exId) : null;
  const ladder = ex && ex.ladder && !e.tag;
  openSheet(`<h2>${esc(e.name)}</h2><div class="menu">
    <button data-act="s-rename" data-e="${i}">${icon("pen")}<span>Renommer<small>${e.exId ? "Le nom change partout, l'historique est conservé" : "Pour cette séance"}</small></span></button>
    <button data-act="s-count" data-e="${i}">${icon("rows")}<span>Nombre de ${d.layout === "circuit" ? "tours" : "séries"}</span></button>
    <button data-act="s-note" data-e="${i}">${icon("note")}<span>${e.note ? "Modifier la note" : "Ajouter une note"}</span></button>
    ${e.exId ? `<button data-act="s-swap" data-e="${i}">${icon("swap")}<span>Remplacer pour aujourd'hui<small>Le programme ne change pas</small></span></button>` : ""}
    ${ladder ? `<button data-act="s-steps" data-e="${i}">${icon("steps")}<span>Faire aussi un autre palier</span></button>` : ""}
    <button data-act="s-remove" data-e="${i}">${icon("trash")}<span>Retirer de cette séance</span></button>
  </div><button class="btn quiet wide" data-act="close">Fermer</button>`);
}

function finish(feel) {
  const note = ($("#feel-note") || {}).value || "";
  const wasFree = !!draft().free;
  const session = store.validateDraft(feel, note.trim());
  stopRest();
  closeSheet();
  if (wasFree && session.entries.length) {
    openSheet(`<h2>Garder comme programme ?</h2><p class="small muted">Tu le retrouveras dans tes programmes, prêt à démarrer.</p>
      <input class="text" id="keep-name" value="" placeholder="Nom du programme" autofocus aria-label="Nom du programme">
      <button class="btn main wide" data-act="keep-ok" data-id="${session.id}">Enregistrer le programme</button>
      <button class="link" data-act="close">Non merci</button>`);
  }
  nav.go("today");
  const ready = store.getState().proposals.length;
  toast(ready ? "Séance validée. Un palier suivant est à portée, regarde en haut." : "Séance validée");
}

export const actions = {
  tick(el) {
    const sug = +el.dataset.sug;
    const e = draft().entries[+el.dataset.e];
    if (!(e.sets[+el.dataset.s].n > 0) && !sug) return toast("Note d'abord ce que tu as fait");
    store.draftTick(+el.dataset.e, +el.dataset.s, sug);
  },
  addset: (el) => store.draftAddSet(+el.dataset.e),
  rmset: (el) => store.draftRemoveSet(+el.dataset.e),
  rest: () => startRest(120),
  "rest-stop": () => stopRest(),
  place(el) {
    const d = draft();
    if (d.place === el.dataset.place) return;
    if (d.entries.some((e) => filled(e.sets) > 0) && !confirm("Changer de lieu efface ce que tu as noté dans cette séance. Continuer ?")) return;
    store.draftPlace(el.dataset.place);
  },
  edit: (el) => editSheet(+el.dataset.e),
  close: () => closeSheet(),

  "s-rename"(el) {
    const e = draft().entries[+el.dataset.e];
    openSheet(`<h2>Renommer</h2><input class="text" id="rename-in" value="${esc(e.name)}" autofocus aria-label="Nom de l'exercice">
      <button class="btn main wide" data-act="s-rename-ok" data-e="${el.dataset.e}" data-keep="1">Enregistrer</button>`);
  },
  "s-swap"(el) {
    openSheet(`<h2>Remplacer pour aujourd'hui</h2><p class="small muted">Le programme garde son exercice. Aujourd'hui, tu fais autre chose à la place.</p>
      <input class="text" id="rename-in" value="" placeholder="Nom du mouvement" autofocus aria-label="Nom du mouvement">
      <button class="btn main wide" data-act="s-rename-ok" data-e="${el.dataset.e}">Remplacer</button>`);
  },
  "s-rename-ok"(el) {
    const v = $("#rename-in").value.trim();
    if (!v) return toast("Donne un nom");
    store.draftRename(+el.dataset.e, v.slice(0, 80), !!el.dataset.keep);
    closeSheet();
  },
  "s-count"(el) {
    const d = draft();
    const cur = d.entries[+el.dataset.e].sets.length;
    const circuit = d.layout === "circuit" && d.entries[+el.dataset.e].exId;
    openSheet(`<h2>Nombre de ${d.layout === "circuit" ? "tours" : "séries"}</h2>
      ${circuit ? `<p class="small muted">En circuit, le nombre de tours vaut pour tout le programme à partir de la prochaine séance.</p>` : ""}
      <div class="seg">${[1, 2, 3, 4, 5, 6].map((n) => `<button data-act="s-count-ok" data-e="${el.dataset.e}" data-n="${n}" aria-pressed="${n === cur}">${n}</button>`).join("")}</div>
      <button class="btn quiet wide" data-act="close">Fermer</button>`);
  },
  "s-count-ok"(el) {
    store.draftSetCount(+el.dataset.e, +el.dataset.n, true);
    closeSheet();
  },
  "s-note"(el) {
    const e = draft().entries[+el.dataset.e];
    openSheet(`<h2>Note</h2><textarea class="text" id="note-in" rows="3" autofocus aria-label="Note" placeholder="Ex. épaule gauche raide">${esc(e.note || "")}</textarea>
      <button class="btn main wide" data-act="s-note-ok" data-e="${el.dataset.e}">Enregistrer</button>`);
  },
  "s-note-ok"(el) {
    store.draftNote(+el.dataset.e, $("#note-in").value.trim().slice(0, 300));
    closeSheet();
  },
  "s-steps"(el) {
    const state = store.getState();
    const d = draft();
    const e = d.entries[+el.dataset.e];
    const ex = findExercise(state, e.exId);
    const lvl = levelOf(state, ex);
    const taken = new Set(d.entries.filter((x) => x.exId === ex.id).map((x) => x.stepId));
    const rows = ex.ladder
      .map((k, j) => ({ k: stepView(k, d.place === "maison"), j }))
      .filter(({ k }) => !taken.has(k.id))
      .map(({ k, j }) => `<button data-act="s-steps-ok" data-ex="${ex.id}" data-level="${j}">${icon(j > lvl ? "up" : "down")}<span>${esc(k.name)}<small>${k.min} à ${k.max} ${unitLabel(k.unit)}</small></span></button>`)
      .join("");
    openSheet(`<h2>Faire aussi un autre palier</h2><div class="menu">${rows || `<p class="small muted">Tous les paliers sont déjà dans la séance.</p>`}</div><button class="btn quiet wide" data-act="close">Fermer</button>`);
  },
  "s-steps-ok"(el) {
    store.draftAddStep(el.dataset.ex, +el.dataset.level);
    closeSheet();
  },
  "s-remove"(el) {
    store.draftRemoveEntry(+el.dataset.e);
    closeSheet();
  },

  addentry() {
    const state = store.getState();
    const names = new Set();
    state.programs.forEach((p) => p.exercises.forEach((ex) => (ex.ladder ? ex.ladder.forEach((k) => names.add(k.name)) : names.add(ex.name))));
    state.sessions.forEach((s) => s.entries.forEach((e) => names.add(e.name)));
    const muscu = draft().activity === "muscu";
    openSheet(`<h2>Ajouter un exercice</h2>
      <input class="text" id="add-name" list="add-names" placeholder="Nom de l'exercice" autofocus autocomplete="off" aria-label="Nom de l'exercice">
      <datalist id="add-names">${[...names].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <div class="seg" id="add-unit"><button data-act="pick" aria-pressed="true" data-v="reps">Répétitions</button><button data-act="pick" aria-pressed="false" data-v="s">Secondes</button></div>
      <label class="check"><input type="checkbox" id="add-kg" ${muscu ? "checked" : ""}><span class="box">${icon("check")}</span><span>Avec une charge (kg)</span></label>
      <button class="btn main wide" data-act="addentry-ok">Ajouter</button>`);
  },
  // Choix exclusif dans un groupe de boutons d'une feuille.
  pick(el) {
    el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === el));
  },
  "addentry-ok"() {
    const name = $("#add-name").value.trim();
    if (!name) return toast("Donne un nom à l'exercice");
    const unit = $("#add-unit [aria-pressed=true]").dataset.v;
    store.draftAddEntry(name.slice(0, 80), unit, $("#add-kg").checked);
    closeSheet();
  },

  finish() {
    const d = draft();
    const any = d.entries.some((e) => filled(e.sets) > 0) || Object.values(d.checks).some(Boolean);
    if (!any) return toast("Note au moins une série");
    openSheet(`<h2>C'était comment ?</h2>
      <div class="feel"><button class="btn quiet" data-act="feel" data-v="easy">Facile</button><button class="btn quiet" data-act="feel" data-v="ok">Bien</button><button class="btn quiet" data-act="feel" data-v="hard">Dur</button></div>
      <textarea class="text" id="feel-note" rows="2" aria-label="Note de séance" placeholder="Une note ? (optionnel)">${esc(d.note || "")}</textarea>
      <button class="link" data-act="feel" data-v="">Valider sans répondre</button>`);
  },
  feel: (el) => finish(el.dataset.v || null),
  "keep-ok"(el) {
    const name = $("#keep-name").value.trim();
    if (!name) return toast("Donne un nom au programme");
    store.saveSessionAsProgram(el.dataset.id, name.slice(0, 60));
    closeSheet();
    toast("Programme enregistré");
  },
};
