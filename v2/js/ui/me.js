// Onglet Moi : chiffres clés, progrès par paliers, faits marquants, poids, historique.
import { addDays, mondayOf, parseYmd, prettyDate, shortDate, today, ymd } from "../core/dates.js";
import { activity } from "../core/catalog.js";
import { hasLadder, levelOf } from "../core/model.js";
import { datesOf, deltas, exercisePoints, keyFigures, milestones, setsText } from "../core/stats.js";
import { fmtKm, fmtPace, paceOf } from "../core/run.js";
import { AVATAR_MAX } from "../core/share.js";
import * as store from "../store.js";
import { getAccount } from "../cloud/account.js";
import { $, avatar, esc, fr, nav, plural, shrinkImage, toast, unitLabel } from "./dom.js";
import { icon, kindIcon } from "./icons.js";
import { lineChart, sparkline } from "./charts.js";

const FEEL = { easy: "Facile", ok: "Bien", hard: "Dur" };
const open = new Set(); // exercices dépliés dans Progrès

// ---------- Progrès ----------
function ladderRow(state, ex) {
  const lvl = levelOf(state, ex);
  const pr = state.progress[ex.id] || {};
  const path = ex.ladder.map((_, k) => `${k ? `<u class="${k <= lvl ? "done" : ""}"></u>` : ""}<b class="${k < lvl ? "done" : k === lvl ? "here" : ""}"></b>`).join("");
  let detail = "";
  if (open.has(ex.id)) {
    const next = ex.ladder[lvl + 1];
    const pts = exercisePoints(state, ex.id);
    const last = state.sessions
      .flatMap((s) => s.entries.filter((e) => e.exId === ex.id).map((e) => ({ date: s.date, e })))
      .slice(-4)
      .reverse();
    detail = `<div class="steps">${ex.ladder.map((k, i) => `<span class="${i < lvl ? "past" : i === lvl ? "on" : ""}">${i + 1}. ${esc(k.name)} · ${k.min} à ${k.max} ${unitLabel(k.unit)}${i === lvl ? " · tu es ici" : ""}</span>`).join("")}</div>
      <div class="pair">
        <button class="btn quiet" data-act="m-step" data-ex="${ex.id}" data-d="-1" ${lvl === 0 ? "disabled" : ""}>Reculer d'un pas</button>
        <button class="btn quiet" data-act="m-step" data-ex="${ex.id}" data-d="1" ${!next ? "disabled" : ""}>Avancer d'un pas</button>
      </div>
      ${next
        ? pr.transition
          ? `<p class="small muted">En transition vers ${esc(next.name)} depuis le ${esc(prettyDate(pr.transition))} : ajouté en plus à chaque séance.</p><button class="link" data-act="m-trans" data-ex="${ex.id}" data-on="">Arrêter la transition</button>`
          : `<button class="link" data-act="m-trans" data-ex="${ex.id}" data-on="1">Commencer ${esc(next.name)} progressivement</button>`
        : ""}
      ${pts.length > 1 ? `<p class="small muted">Total par séance</p>${lineChart(pts, { label: `Total par séance, ${ex.name}` })}` : ""}
      ${last.length ? `<div>${last.map(({ date, e }) => `<div class="item"><span class="when">${esc(shortDate(date))}</span><span class="grow muted">${esc(e.name)}</span><b class="num">${esc(setsText(e.sets, e.loaded))}</b></div>`).join("")}</div>` : ""}`;
  }
  return `<div class="prog"><button class="prog-head row" data-act="m-open" data-ex="${ex.id}" aria-expanded="${open.has(ex.id)}">
      <span class="grow"><b>${esc(ex.name)}</b><br><span class="small muted">${esc(ex.ladder[lvl].name)} · palier ${lvl + 1} sur ${ex.ladder.length}</span></span>
      <span class="path">${path}</span></button>${detail}</div>`;
}
function plainRow(state, ex) {
  const pts = exercisePoints(state, ex.id);
  if (!pts.length) return "";
  const last = pts[pts.length - 1];
  const unit = ex.loaded ? "kg" : unitLabel(ex.unit);
  return `<div class="prog"><button class="prog-head row" data-act="m-open" data-ex="${ex.id}" aria-expanded="${open.has(ex.id)}">
      <span class="grow"><b>${esc(ex.name)}</b><br><span class="small muted">${ex.loaded ? "Charge la plus lourde" : "Total par séance"}</span></span>
      <span class="num" style="font-size:22px">${fr(last.y)} <small class="muted" style="font-size:14px">${unit}</small></span></button>
    ${open.has(ex.id) && pts.length > 1 ? lineChart(pts, { label: ex.name }) : ""}</div>`;
}
function progressBlock(state) {
  const rows = state.programs
    .filter((p) => state.settings.activities.includes(p.activity))
    .flatMap((p) => p.exercises)
    .map((ex) => (hasLadder(ex) ? ladderRow(state, ex) : plainRow(state, ex)))
    .join("");
  if (!rows) return "";
  return `<div class="block"><div class="row between"><h2>Progrès</h2><span class="small muted">Touche un exercice</span></div><div>${rows}</div></div>`;
}

// ---------- Faits marquants ----------
function marksBlock(state) {
  const all = milestones(state);
  if (!all.length) return "";
  const monday = mondayOf(today());
  const week = all.filter((m) => m.date >= monday);
  const count = (k) => week.filter((m) => m.kind === k).length;
  const parts = [count("first") ? plural(count("first"), "première") + " fois" : "", count("step") ? plural(count("step"), "palier") : "", count("record") ? plural(count("record"), "record") : ""].filter(Boolean);
  return `<div class="block"><h2>Faits marquants</h2>
    <p class="small muted">Cette semaine : ${parts.length ? parts.join(", ") : "rien de nouveau pour l'instant"}.</p>
    <div>${all.slice(0, 3).map(markItem).join("")}</div>
    ${all.length > 3 ? `<button class="link" data-act="go" data-to="marks">Voir tout (${all.length})</button>` : ""}</div>`;
}
function markItem(m) {
  return `<div class="item"><span class="when">${esc(shortDate(m.date))}</span>${kindIcon(m.kind)}<span class="grow">${esc(m.text)}</span></div>`;
}
export function renderMarks(root, state) {
  const all = milestones(state);
  const weeks = [];
  all.forEach((m) => {
    const monday = mondayOf(m.date);
    const w = weeks[weeks.length - 1];
    if (w && w.monday === monday) w.items.push(m);
    else weeks.push({ monday, items: [m] });
  });
  root.innerHTML = `<section class="screen">
    <div class="row"><button class="iconbtn" data-act="go" data-to="me" aria-label="Retour">${icon("back")}</button><h2 class="grow">Faits marquants</h2></div>
    ${weeks.map((w) => `<div class="block"><p class="eyebrow">Semaine du ${esc(shortDate(w.monday))}</p><div>${w.items.map(markItem).join("")}</div></div>`).join("") || `<div class="block"><p class="muted">Tes premières fois apparaîtront ici.</p></div>`}
  </section>`;
}

// ---------- Poids ----------
function weightBlock(state) {
  const w = state.weights;
  if (!w.length) return `<div class="block"><h2>Poids</h2><p class="small muted">Une pesée par semaine, le lundi matin, suffit pour voir la tendance.</p><button class="btn quiet sm" data-act="go" data-to="weight">Noter mon poids</button></div>`;
  const first = w[0], last = w[w.length - 1];
  const d = Math.round((last.kg - first.kg) * 10) / 10;
  return `<button class="block" data-act="go" data-to="weight">
    <div class="row between"><h2>Poids</h2><span class="small muted">depuis le ${esc(shortDate(first.date))}</span></div>
    <div class="row between" style="align-items:baseline"><div class="num" style="font-size:40px;line-height:.95">${fr(last.kg.toFixed(1))} <small class="muted" style="font-size:20px">kg</small></div>
      ${w.length > 1 ? `<div class="num" style="font-size:22px;color:var(--sky)">${d > 0 ? "+" : d < 0 ? "−" : ""}${fr(Math.abs(d).toFixed(1))} kg</div>` : ""}</div>
    ${sparkline(w.map((x) => ({ date: x.date, y: x.kg })), "sky", `Poids de ${fr(first.kg)} à ${fr(last.kg)} kg`)}
  </button>`;
}
export function renderWeight(root, state) {
  const t = today();
  const w = state.weights;
  const rows = w
    .map((x, i) => ({ x, d: i ? x.kg - w[i - 1].kg : null }))
    .reverse()
    .map(({ x, d }) => `<div class="item"><span class="when">${esc(prettyDate(x.date))}</span><b class="num grow" style="font-size:18px">${fr(x.kg.toFixed(1))} kg</b>
      <span class="delta ${d === null ? "" : d <= 0 ? "down" : "up"}">${d === null ? "départ" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${fr(Math.abs(d).toFixed(1))}`}</span>
      <button class="iconbtn" data-act="w-del" data-date="${x.date}" aria-label="Supprimer la pesée du ${esc(prettyDate(x.date))}">${icon("x")}</button></div>`)
    .join("");
  root.innerHTML = `<section class="screen">
    <div class="row"><button class="iconbtn" data-act="go" data-to="me" aria-label="Retour">${icon("back")}</button><h2 class="grow">Poids</h2></div>
    ${w.length > 1 ? `<div class="block">${lineChart(w.map((x) => ({ date: x.date, y: x.kg })), { tone: "sky", fmt: (v) => fr(v.toFixed(1)), label: "Évolution du poids" })}</div>` : ""}
    <div class="block"><p class="eyebrow">Nouvelle pesée</p>
      <div class="grid2"><label class="label">Poids (kg)<input class="text" inputmode="decimal" id="wkg" placeholder="78,4"></label><label class="label">Date<input class="text" type="date" id="wdate" value="${t}"></label></div>
      <button class="btn main wide" data-act="w-add">Enregistrer</button>
      <p class="small muted">Chaque lundi matin, dans les mêmes conditions. Le poids bouge aussi avec ce que tu manges.</p></div>
    <div class="block"><p class="eyebrow">Pesées</p><div>${rows || `<p class="small muted">Pas encore de pesée.</p>`}</div></div>
  </section>`;
}

// ---------- Historique ----------
function deltaCell(d) {
  if (!d) return `<span class="delta"></span>`;
  if (d.d === 0) return `<span class="delta">=</span>`;
  return `<span class="delta ${d.d > 0 ? "up" : "down"}">${d.d > 0 ? "+" : "−"}${fr(Math.abs(d.d))}${d.unit === "kg" ? " kg" : ""}</span>`;
}
export function sessionCard(state, s, withActions) {
  const ds = deltas(state, s);
  const hasPrev = ds.some(Boolean);
  return `<div class="block">
    <div class="row between"><div class="grow"><h2>${esc(s.programName)}</h2><p class="small muted">${esc(prettyDate(s.date))} · ${esc(activity(s.activity).label)}${s.place === "maison" ? " · maison" : ""}${s.complete ? "" : " · partielle"}</p></div>
      ${s.feel ? `<span class="chip"><i class="dot ${s.feel === "hard" ? "" : "s"}"></i>${FEEL[s.feel]}</span>` : ""}</div>
    <div>${s.entries
      .map((e, i) => `<div class="line ${hasPrev ? "" : "nodelta"}"><span>${esc(e.name)}${e.home ? ` <span class="tag">maison</span>` : ""}${e.tag === "bonus" ? ` <span class="tag">bonus</span>` : ""}${e.note ? `<br><span class="small muted">${esc(e.note)}</span>` : ""}</span><span class="num">${esc(setsText(e.sets, e.loaded))}${e.unit === "s" ? " s" : ""}</span>${hasPrev ? deltaCell(ds[i]) : ""}</div>`)
      .join("") || `<p class="small muted">Aucune série notée.</p>`}</div>
    ${hasPrev ? `<p class="small muted">À droite : écart avec la séance d'avant du même programme.</p>` : ""}
    ${s.note ? `<p class="quote">${esc(s.note)}</p>` : ""}
    ${withActions ? `<div class="row"><button class="btn quiet sm" data-act="h-edit" data-id="${s.id}">Modifier</button><button class="btn quiet sm danger" data-act="h-del" data-id="${s.id}">Supprimer</button></div>` : ""}
  </div>`;
}
function runCardHtml(state, r) {
  const i = state.runs.indexOf(r);
  const prev = i > 0 ? state.runs[i - 1] : null;
  const dk = prev ? Math.round((r.km - prev.km) * 100) / 100 : null;
  return `<div class="block">
    <div class="row between"><div class="grow"><h2>Course</h2><p class="small muted">${esc(prettyDate(r.date))}</p></div>
      ${r.feel ? `<span class="chip"><i class="dot ${r.feel === "hard" ? "" : "s"}"></i>${FEEL[r.feel]}</span>` : r.rpe != null ? `<span class="chip">Effort ${r.rpe}/10</span>` : ""}</div>
    <div>
      <div class="line"><span>Distance</span><span class="num">${fmtKm(r.km)} km</span>${dk === null ? `<span class="delta"></span>` : `<span class="delta ${dk > 0 ? "up" : dk < 0 ? "down" : ""}">${dk === 0 ? "=" : `${dk > 0 ? "+" : "−"}${fmtKm(Math.abs(dk))}`}</span>`}</div>
      <div class="line"><span>Allure</span><span class="num">${fmtPace(paceOf(r))} /km</span><span class="delta"></span></div>
      <div class="line"><span>Durée</span><span class="num">${fmtPace(r.sec)}</span><span class="delta"></span></div>
    </div>
    ${r.note ? `<p class="quote">${esc(r.note)}</p>` : ""}
  </div>`;
}
function calendar(state) {
  const t = today();
  const first = parseYmd(t);
  first.setDate(1);
  const start = ymd(first);
  const pad = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const sets = state.settings.activities.map((a) => ({ tone: activity(a).tone, dates: datesOf(state, a) }));
  let cells = Array.from({ length: pad }, () => `<span class="pad"></span>`).join("");
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const tones = new Set(sets.filter((x) => x.dates.has(d)).map((x) => x.tone));
    cells += `<span class="${[...tones].join(" ")} ${d === t ? "now" : ""}">${i + 1}</span>`;
  }
  return `<div class="block"><p class="eyebrow">${esc(first.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))}</p><div class="cal">${cells}</div></div>`;
}
export function renderHistory(root, state) {
  const all = [...state.sessions.map((s) => ({ date: s.date, s })), ...state.runs.map((r) => ({ date: r.date, r }))].sort((a, b) => b.date.localeCompare(a.date));
  root.innerHTML = `<section class="screen">
    <div class="row"><button class="iconbtn" data-act="go" data-to="me" aria-label="Retour">${icon("back")}</button><h2 class="grow">Historique</h2></div>
    ${calendar(state)}
    ${all.map((x) => (x.s ? sessionCard(state, x.s, true) : runCardHtml(state, x.r))).join("") || `<div class="block"><p class="muted">Rien pour l'instant. La première, c'est la plus dure.</p></div>`}
  </section>`;
}

// ---------- Écran principal ----------
export function render(root, state) {
  const acc = getAccount();
  const k = keyFigures(state);
  const dates = [...state.sessions.map((s) => s.date), ...state.runs.map((r) => r.date)].sort();
  const lastSession = state.sessions[state.sessions.length - 1];
  root.innerHTML = `<section class="screen">
    <div class="row">
      <label class="file" aria-label="Changer ma photo">${avatar(state.profile.avatar, acc ? acc.pseudo : "Moi", "big o")}<input type="file" accept="image/*" data-ch="m-avatar"></label>
      <div class="grow"><h2>${esc(acc ? acc.pseudo : "Moi")}</h2><p class="small muted">${dates.length ? `Depuis le ${esc(prettyDate(dates[0]))}` : "Bienvenue"} · touche la photo pour la changer</p></div>
      <button class="iconbtn" data-act="go" data-to="settings" aria-label="Réglages">${icon("gear")}</button>
    </div>
    <div class="block"><div class="stats">
      <div class="stat"><div class="num">${k.sessions}</div><span>séance${k.sessions > 1 ? "s" : ""}</span></div>
      <div class="stat"><div class="num">${k.streak}</div><span>sem. d'affilée</span></div>
      <div class="stat"><div class="num">${k.records}</div><span>palier${k.records > 1 ? "s" : ""} et record${k.records > 1 ? "s" : ""}</span></div>
    </div></div>
    ${progressBlock(state)}
    ${marksBlock(state)}
    ${weightBlock(state)}
    ${lastSession ? `<p class="eyebrow">Dernière séance</p>${sessionCard(state, lastSession, false)}` : ""}
    <button class="btn quiet wide" data-act="go" data-to="history">Tout l'historique</button>
  </section>`;
}

export const changes = {
  async "m-avatar"(el) {
    const file = el.files[0];
    if (!file) return;
    try {
      store.setAvatar(await shrinkImage(file, 128, 128, AVATAR_MAX));
      toast("Photo enregistrée");
    } catch (e) {
      toast(e.message);
    }
  },
};

export const actions = {
  "m-open"(el) {
    const id = el.dataset.ex;
    if (open.has(id)) open.delete(id);
    else open.add(id);
    nav.redraw();
  },
  "m-step"(el) {
    const step = store.stepMove(el.dataset.ex, +el.dataset.d);
    if (step) toast(`Palier : ${step.name}`);
  },
  "m-trans"(el) {
    store.setTransition(el.dataset.ex, !!el.dataset.on);
    toast(el.dataset.on ? "Ajouté en plus à chaque séance" : "Transition arrêtée");
  },
  "w-add"() {
    const kg = parseFloat(($("#wkg").value || "").replace(",", "."));
    const date = $("#wdate").value || today();
    if (!(kg > 20 && kg < 400)) return toast("Poids invalide");
    if (date > today()) return toast("Cette date est dans le futur");
    store.addWeight(date, Math.round(kg * 10) / 10);
    toast("Pesée enregistrée");
  },
  "w-del"(el) {
    if (!confirm("Supprimer cette pesée ?")) return;
    store.deleteWeight(el.dataset.date);
  },
  "h-edit"(el) {
    if (store.getState().draft && !confirm("Une séance est déjà en cours. La remplacer par celle-ci ?")) return;
    store.reopenSession(el.dataset.id);
    nav.go("session");
  },
  "h-del"(el) {
    if (!confirm("Supprimer cette séance ? Les paliers ne changent pas.")) return;
    store.deleteSession(el.dataset.id);
  },
};
