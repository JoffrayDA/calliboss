// Mes programmes d'une activité, et l'éditeur de programme.
import { ago } from "../core/dates.js";
import { activity, instantiate, templatesOf } from "../core/catalog.js";
import { clone, findProgram, newId, programsOf } from "../core/model.js";
import * as store from "../store.js";
import { $, closeSheet, esc, nav, openSheet, plural, toast } from "./dom.js";
import { icon } from "./icons.js";

// ---------- Liste ----------
function lastDate(state, programId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) if (state.sessions[i].programId === programId) return state.sessions[i].date;
  return null;
}

export function render(root, state, params) {
  const a = activity(params.activity);
  const lastId = state.settings.lastProgram[a.id];
  const list = programsOf(state, a.id).sort((x, y) => (y.id === lastId) - (x.id === lastId));
  root.innerHTML = `<section class="screen">
    <div class="row"><button class="iconbtn" data-act="go" data-to="today" aria-label="Retour">${icon("back")}</button>
      <div class="grow"><p class="eyebrow">Mes programmes</p><h2>${esc(a.label)}</h2></div></div>
    ${list
      .map((p, i) => {
        const last = lastDate(state, p.id);
        return `<div class="block">
          <div class="row"><div class="grow"><h2>${esc(p.name)}</h2><p class="small muted">${plural(p.exercises.length, "exo")} · ${last ? `dernière fois ${esc(ago(last))}` : "jamais fait"}</p></div>
            <button class="iconbtn" data-act="p-edit" data-id="${p.id}" aria-label="Modifier ${esc(p.name)}">${icon("pen")}</button></div>
          <button class="btn ${i === 0 ? "main" : "quiet"} wide" data-act="start" data-id="${p.id}">Démarrer</button>
        </div>`;
      })
      .join("") || `<div class="block"><p>Aucun programme pour l'instant. Pars d'un modèle ou fais une séance libre.</p></div>`}
    <button class="btn quiet wide" data-act="p-new" data-activity="${a.id}">${icon("plus")}Nouveau programme</button>
  </section>`;
}

// ---------- Éditeur ----------
// Copie de travail : rien n'est appliqué avant « Enregistrer ».
let edit = null;
let isNew = false;
const blankStep = () => ({ name: "", min: 5, max: 10, unit: "reps", tip: "" });
const blankExercise = (loaded) => ({ id: newId("x"), name: "", unit: "reps", loaded, sets: 3 });

function field(path, value, { num = false, ph = "", label = "" } = {}) {
  return `<input class="text" ${num ? `inputmode="numeric" data-num` : ""} data-in="ed" data-p="${path}" value="${esc(value == null ? "" : value)}" placeholder="${esc(ph)}" aria-label="${esc(label || ph)}" autocomplete="off">`;
}
function unitSelect(path, unit) {
  return `<select class="text" data-ch="ed" data-p="${path}" aria-label="Unité"><option value="reps" ${unit === "s" ? "" : "selected"}>reps</option><option value="s" ${unit === "s" ? "selected" : ""}>secondes</option></select>`;
}
function mini(kind, i, j, count) {
  const at = `data-i="${i}"${j === null ? "" : ` data-j="${j}"`}`;
  const pos = j === null ? i : j;
  return `<div class="mini">
    <button data-act="ed-do" data-op="${kind}up" ${at} ${pos === 0 ? "disabled" : ""} aria-label="Monter">${icon("up")}</button>
    <button data-act="ed-do" data-op="${kind}down" ${at} ${pos === count - 1 ? "disabled" : ""} aria-label="Descendre">${icon("down")}</button>
    <button data-act="ed-do" data-op="rm${kind}" ${at} aria-label="Retirer">${icon("x")}</button>
  </div>`;
}
function stepFields(path, k) {
  return `${field(`${path}.name`, k.name, { ph: "Nom du mouvement" })}
    <div class="range">${field(`${path}.min`, k.min, { num: true, ph: "min", label: "Minimum" })}${field(`${path}.max`, k.max, { num: true, ph: "max", label: "Maximum" })}${unitSelect(`${path}.unit`, k.unit)}</div>
    ${field(`${path}.tip`, k.tip, { ph: "Conseil (optionnel)" })}`;
}
function exerciseBlock(ex, i) {
  const p = `exercises.${i}`;
  const ladder = ex.ladder || [];
  return `<div class="block">
    <div class="row">${field(`${p}.name`, ex.name, { ph: "Nom de l'exercice" })}${mini("ex", i, null, edit.exercises.length)}</div>
    ${ladder.length
      ? ladder
          .map((k, j) => `<div class="ed-step"><div class="row between"><b class="small">Palier ${j + 1}</b>${mini("step", i, j, ladder.length)}</div>${stepFields(`${p}.ladder.${j}`, k)}
            ${k.alt
              ? `<div class="stack sub"><div class="row between"><span class="tag">variante maison</span><button class="iconbtn" data-act="ed-do" data-op="rmalt" data-i="${i}" data-j="${j}" aria-label="Retirer la variante">${icon("x")}</button></div>${stepFields(`${p}.ladder.${j}.alt`, k.alt)}</div>`
              : `<button class="add" data-act="ed-do" data-op="addalt" data-i="${i}" data-j="${j}">${icon("plus")}Variante maison</button>`}</div>`)
          .join("") + `<button class="add" data-act="ed-do" data-op="addstep" data-i="${i}">${icon("plus")}Palier</button>`
      : `<div class="grid2">
          <label class="label">Unité${unitSelect(`${p}.unit`, ex.unit)}</label>
          ${edit.layout === "sets" ? `<label class="label">Séries${field(`${p}.sets`, ex.sets, { num: true, label: "Nombre de séries" })}</label>` : "<span></span>"}
        </div>
        <button class="add" data-act="ed-do" data-op="addstep" data-i="${i}">${icon("plus")}Ajouter des paliers (du plus facile au plus dur)</button>`}
    <label class="check"><input type="checkbox" data-ch="ed-bool" data-p="${p}.loaded" ${ex.loaded ? "checked" : ""}><span class="box">${icon("check")}</span><span>Avec une charge (kg)</span></label>
  </div>`;
}

export function renderEditor(root, state, params) {
  if (!edit || edit.id !== params.id) {
    const p = findProgram(state, params.id);
    if (!p) return nav.go("today");
    edit = clone(p);
    isNew = !!params.fresh;
  }
  const p = edit;
  root.innerHTML = `<section class="screen">
    <div class="row"><button class="iconbtn" data-act="ed-cancel" aria-label="Retour">${icon("back")}</button>
      <div class="grow"><p class="eyebrow">${esc(activity(p.activity).label)}</p><h2>Mon programme</h2></div></div>
    <div class="block">
      <label class="label">Nom${field("name", p.name, { ph: "Nom du programme" })}</label>
      <div class="seg"><button data-act="ed-layout" data-v="sets" aria-pressed="${p.layout === "sets"}">Séries par exercice</button><button data-act="ed-layout" data-v="circuit" aria-pressed="${p.layout === "circuit"}">Circuit en tours</button></div>
      ${p.layout === "circuit"
        ? `<div class="row between"><span>Tours du circuit</span><div class="stepper"><button data-act="ed-rounds" data-d="-1" aria-label="Moins">${icon("minus")}</button><span class="num">${p.rounds}</span><button data-act="ed-rounds" data-d="1" aria-label="Plus">${icon("plus")}</button></div></div>
           <label class="label">Repos entre les tours${field("rest", p.rest, { ph: "Ex. 1 min 30 entre chaque tour" })}</label>`
        : `<p class="small muted">Tu fais toutes les séries d'un exercice avant de passer au suivant.</p>`}
    </div>
    ${p.exercises.map(exerciseBlock).join("")}
    <button class="btn quiet wide" data-act="ed-do" data-op="addex">${icon("plus")}Exercice</button>
    ${(p.checks || []).length
      ? `<div class="block"><p class="eyebrow">Avant et après la séance</p>${p.checks
          .map((c, i) => `<div class="stack">${field(`checks.${i}.text`, c.text, { ph: c.when === "after" ? "Retour au calme" : "Échauffement" })}${c.alt !== undefined ? field(`checks.${i}.alt`, c.alt, { ph: "Variante maison" }) : ""}</div>`)
          .join("")}</div>`
      : ""}
    <button class="btn main wide" data-act="ed-save">Enregistrer le programme</button>
    <div class="row wrap">
      <button class="btn quiet sm" data-act="ed-cancel">Annuler</button>
      ${isNew ? "" : `<button class="btn quiet sm" data-act="ed-dup">Dupliquer</button><button class="btn quiet sm danger" data-act="ed-delete">Supprimer</button>`}
    </div>
  </section>`;
}

// Première erreur de saisie, ou "" si tout est bon.
function programError(p) {
  if (!p.name.trim()) return "Donne un nom au programme";
  if (!p.exercises.length) return "Ajoute au moins un exercice";
  for (let i = 0; i < p.exercises.length; i++) {
    const ex = p.exercises[i];
    if (!ex.name.trim()) return `Exercice ${i + 1} : donne-lui un nom`;
    for (let j = 0; j < (ex.ladder || []).length; j++)
      for (const [k, where] of [[ex.ladder[j], ""], [ex.ladder[j].alt, " (variante maison)"]]) {
        if (!k) continue;
        const at = `${ex.name.trim()}, palier ${j + 1}${where}`;
        if (!k.name.trim()) return `${at} : nom du mouvement manquant`;
        if (!(k.min >= 1)) return `${at} : le minimum doit être au moins 1`;
        if (!(k.max >= k.min)) return `${at} : le maximum doit être au moins égal au minimum`;
      }
  }
  return "";
}

function leave() {
  const act = edit.activity;
  const discard = isNew ? edit.id : null;
  edit = null;
  if (discard) store.deleteProgram(discard);
  nav.go("programs", { activity: act });
}

const swap = (a, i, j) => ([a[i], a[j]] = [a[j], a[i]]);
const OPS = {
  addex: () => edit.exercises.push(blankExercise(edit.activity === "muscu")),
  rmex: (i) => confirm("Retirer cet exercice du programme ? Son historique reste visible.") && edit.exercises.splice(i, 1),
  exup: (i) => swap(edit.exercises, i, i - 1),
  exdown: (i) => swap(edit.exercises, i, i + 1),
  addstep: (i) => (edit.exercises[i].ladder = edit.exercises[i].ladder || []).push({ id: newId("k"), ...blankStep(), name: edit.exercises[i].ladder && edit.exercises[i].ladder.length ? "" : edit.exercises[i].name }),
  rmstep: (i, j) => edit.exercises[i].ladder.splice(j, 1),
  stepup: (i, j) => swap(edit.exercises[i].ladder, j, j - 1),
  stepdown: (i, j) => swap(edit.exercises[i].ladder, j, j + 1),
  addalt: (i, j) => (edit.exercises[i].ladder[j].alt = blankStep()),
  rmalt: (i, j) => delete edit.exercises[i].ladder[j].alt,
};

function setPath(path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, k) => o[k], edit)[last] = value;
}

export const inputs = {
  ed: (el) => setPath(el.dataset.p, el.dataset.num !== undefined ? parseInt(el.value, 10) || 0 : el.value),
};
export const changes = {
  ed: (el) => setPath(el.dataset.p, el.value),
  "ed-bool": (el) => setPath(el.dataset.p, el.checked),
};

export const actions = {
  "p-edit": (el) => nav.go("editor", { id: el.dataset.id }),
  "p-new"(el) {
    const act = el.dataset.activity;
    const mine = programsOf(store.getState(), act);
    openSheet(`<h2>Nouveau programme</h2><div class="menu">
      ${templatesOf(act).map((t, i) => `<button data-act="p-tpl" data-activity="${act}" data-i="${i}">${icon("rows")}<span>Modèle : ${esc(t.name)}<small>${esc(t.blurb || "")}</small></span></button>`).join("")}
      ${mine.map((p) => `<button data-act="p-copy" data-id="${p.id}">${icon("copy")}<span>Copier « ${esc(p.name)} »</span></button>`).join("")}
      <button data-act="p-free" data-activity="${act}">${icon("bolt")}<span>Séance libre<small>Tu ajoutes les exercices en t'entraînant, et tu la gardes si elle te plaît</small></span></button>
      <button data-act="p-blank" data-activity="${act}">${icon("pen")}<span>Programme vide<small>Tu écris tout toi-même</small></span></button>
    </div><button class="btn quiet wide" data-act="close">Fermer</button>`);
  },
  "p-tpl"(el) {
    const p = store.addProgram(instantiate(templatesOf(el.dataset.activity)[+el.dataset.i]));
    closeSheet();
    toast(`« ${p.name} » ajouté à tes programmes`);
  },
  "p-copy"(el) {
    const p = store.duplicateProgram(el.dataset.id);
    closeSheet();
    if (p) nav.go("editor", { id: p.id });
  },
  "p-free"(el) {
    if (store.getState().draft && !confirm("Une séance est déjà en cours. La remplacer ?")) return;
    store.startFree(el.dataset.activity);
    closeSheet();
    nav.go("session");
  },
  "p-blank"(el) {
    const act = el.dataset.activity;
    const p = store.addProgram({ id: newId("p"), activity: act, name: "", layout: "sets", rounds: 3, rest: "", checks: [], exercises: [blankExercise(act === "muscu")] });
    closeSheet();
    nav.go("editor", { id: p.id, fresh: true });
  },

  "ed-layout"(el) {
    edit.layout = el.dataset.v;
    nav.redraw();
  },
  "ed-rounds"(el) {
    edit.rounds = Math.max(1, Math.min(10, (edit.rounds || 3) + +el.dataset.d));
    nav.redraw();
  },
  "ed-do"(el) {
    OPS[el.dataset.op](+el.dataset.i, +el.dataset.j);
    nav.redraw();
  },
  "ed-save"() {
    const err = programError(edit);
    if (err) return toast(err);
    edit.name = edit.name.trim().slice(0, 60);
    edit.exercises.forEach((ex) => {
      ex.name = ex.name.trim().slice(0, 80);
      ex.sets = Math.max(1, Math.min(12, ex.sets || 3));
      if (ex.ladder && ex.ladder.length) ex.unit = ex.ladder[0].unit;
    });
    const p = edit;
    edit = null;
    isNew = false;
    store.saveProgram(p);
    nav.go("programs", { activity: p.activity });
    toast("Programme enregistré");
  },
  "ed-cancel": () => leave(),
  "ed-dup"() {
    const p = store.duplicateProgram(edit.id);
    edit = null;
    if (p) nav.go("editor", { id: p.id });
  },
  "ed-delete"() {
    if (!confirm(`Supprimer « ${edit.name} » ? L'historique de tes séances reste.`)) return;
    const { id, activity: act } = edit;
    edit = null;
    store.deleteProgram(id);
    nav.go("programs", { activity: act });
  },
};
