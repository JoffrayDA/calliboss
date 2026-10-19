// Démarrage, navigation, et un seul écouteur pour tous les gestes (attributs data-act / data-in / data-ch).
import * as store from "./store.js";
import { streak } from "./core/stats.js";
import { enabled } from "./cloud/firebase.js";
import * as Account from "./cloud/account.js";
import { $, closeSheet, nav } from "./ui/dom.js";
import { flame, icon } from "./ui/icons.js";
import * as today from "./ui/today.js";
import * as session from "./ui/session.js";
import * as programs from "./ui/programs.js";
import * as run from "./ui/run.js";
import * as me from "./ui/me.js";
import * as group from "./ui/group.js";
import * as settings from "./ui/settings.js";

// Écran → fonction de dessin, et l'onglet allumé quand on y est.
const SCREENS = {
  today: { render: today.render, tab: "today" },
  session: { render: session.render, tab: "today" },
  programs: { render: programs.render, tab: "today" },
  editor: { render: programs.renderEditor, tab: "today" },
  run: { render: run.render, tab: "today" },
  me: { render: me.render, tab: "me" },
  marks: { render: me.renderMarks, tab: "me" },
  weight: { render: me.renderWeight, tab: "me" },
  history: { render: me.renderHistory, tab: "me" },
  settings: { render: settings.render, tab: "me" },
  group: { render: group.render, tab: "group" },
};
const TABS = [
  { id: "today", label: "Aujourd'hui", icon: "today" },
  { id: "me", label: "Moi", icon: "me" },
  { id: "group", label: "Groupe", icon: "group" },
];

const modules = [today, session, programs, run, me, group, settings];
const actions = Object.assign({}, ...modules.map((m) => m.actions || {}));
const inputs = Object.assign({}, ...modules.map((m) => m.inputs || {}));
const changes = Object.assign({}, ...modules.map((m) => m.changes || {}));
actions.tab = (el) => nav.go(el.dataset.tab);

let route = { name: "today", params: {} };

function draw() {
  const state = store.getState();
  const screen = SCREENS[route.name] || SCREENS.today;
  const n = streak(state);
  $("#streak").innerHTML = n > 0 ? `${flame()}<b>${n}</b> sem. d'affilée` : "";
  $("#tabs").innerHTML = TABS.map((t) => `<button data-act="tab" data-tab="${t.id}" ${screen.tab === t.id ? `aria-current="page"` : ""}>${icon(t.icon)}${t.label}</button>`).join("");
  screen.render($("#view"), state, route.params);
}

nav.go = (name, params = {}) => {
  const moved = name !== route.name;
  route = { name, params };
  draw();
  if (moved) window.scrollTo(0, 0);
};
nav.redraw = draw;

document.addEventListener("click", (e) => {
  if (e.target === $("#scrim")) return closeSheet();
  const el = e.target.closest("[data-act]");
  if (el && !el.disabled && actions[el.dataset.act]) actions[el.dataset.act](el, e);
});
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.in && inputs[el.dataset.in]) inputs[el.dataset.in](el, e);
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.ch && changes[el.dataset.ch]) changes[el.dataset.ch](el, e);
});

// Envoi au groupe et copie de secours : en différé, jamais bloquants, réessayés au prochain enregistrement.
let syncTimer = null;
function scheduleSync() {
  // Téléphone vide : on n'écrase pas la copie de secours avec rien.
  if (!enabled || !Account.getAccount() || store.isEmpty()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    group.publishNow();
    Account.saveBackup(JSON.stringify(store.getState())).catch(() => {});
  }, 2500);
}

store.subscribe((state, silent) => {
  scheduleSync();
  if (!silent) draw();
});

// Retour dans l'app (après minuit, ou depuis une autre app) : on redessine, sauf si une saisie est en cours.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  scheduleSync();
  const typing = document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
  if (!typing && $("#scrim").hidden && route.name !== "editor") draw();
});

// Session du compte : vérifiée en arrière-plan, sans bloquer l'app ni exiger de réseau.
if (enabled && Account.getAccount())
  Account.sync()
    .then(() => {
      scheduleSync();
      if (route.name === "group") draw();
    })
    .catch(() => {});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  // Nouvelle version installée pendant que l'app est ouverte : on recharge pour ne pas mélanger
  // ancien et nouveau code. La séance en cours est déjà enregistrée à chaque saisie.
  if (navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener("controllerchange", () => location.reload());
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

draw();
