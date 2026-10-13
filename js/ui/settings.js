// Réglages : mes activités, mes objectifs, mon compte, mes données.
import { shortDate, today, ymd } from "../core/dates.js";
import { ACTIVITIES } from "../core/catalog.js";
import { goalOf } from "../core/stats.js";
import * as store from "../store.js";
import { enabled, message } from "../cloud/firebase.js";
import * as Account from "../cloud/account.js";
import { esc, nav, toast } from "./dom.js";
import { icon } from "./icons.js";

export function render(root, state) {
  const acc = Account.getAccount();
  const on = state.settings.activities;
  root.innerHTML = `<section class="screen">
    <div class="row"><button class="iconbtn" data-act="go" data-to="me" aria-label="Retour">${icon("back")}</button><h2 class="grow">Réglages</h2></div>
    <div class="block"><h2>Mes activités</h2><p class="small muted">Seules celles que tu coches apparaissent dans l'app.</p>
      ${ACTIVITIES.map((a) => `<label class="check"><input type="checkbox" data-ch="set-act" data-id="${a.id}" ${on.includes(a.id) ? "checked" : ""}><span class="box">${icon("check")}</span><span>${esc(a.label)}</span></label>`).join("")}</div>
    <div class="block"><h2>Objectif par semaine</h2>
      ${ACTIVITIES.filter((a) => on.includes(a.id)).map((a) => `<div class="row between"><span>${esc(a.label)}</span><div class="stepper"><button data-act="set-goal" data-id="${a.id}" data-d="-1" aria-label="Moins">${icon("minus")}</button><span class="num">${goalOf(state, a.id)}</span><button data-act="set-goal" data-id="${a.id}" data-d="1" aria-label="Plus">${icon("plus")}</button></div></div>`).join("")}
      <p class="small muted">Rappel : règle une alarme récurrente dans l'app Horloge de ton téléphone, nommée « Calliboss ».</p></div>
    <div class="block"><h2>Compte</h2>
      ${!enabled
        ? `<p class="small muted">Les comptes ne sont pas activés sur cette version.</p>`
        : acc
        ? `<p>Connecté : <b>${esc(acc.pseudo)}</b></p>
           <p class="small muted">Copie de secours automatique : ${acc.backupAt ? `dernière le ${esc(shortDate(ymd(new Date(acc.backupAt))))}` : "pas encore envoyée"}. Toi seul peux la lire.</p>
           <label class="check"><input type="checkbox" data-ch="set-sharew" ${state.settings.shareWeight ? "checked" : ""}><span class="box">${icon("check")}</span><span>Partager mon poids avec mes groupes</span></label>
           <div class="row wrap"><button class="btn quiet sm" data-act="set-restore">Récupérer ma copie</button><button class="btn quiet sm" data-act="set-logout">Se déconnecter</button></div>`
        : `<p class="small muted">Sans compte, tes données ne sont que sur ce téléphone. Avec un compte, une copie de secours est gardée pour toi seul.</p><button class="btn quiet sm" data-act="tab" data-tab="group">Créer mon compte</button>`}</div>
    <div class="block"><h2>Mes données</h2>
      <p class="small muted">Fichier à garder hors du téléphone. ${state.settings.lastExport ? `Dernier export : ${esc(shortDate(state.settings.lastExport))}.` : "Jamais exporté."}</p>
      <div class="row wrap"><button class="btn quiet sm" data-act="set-export">Exporter</button><label class="btn quiet sm file">Importer<input type="file" accept="application/json,.json" data-ch="set-import"></label></div>
      <button class="link bad" data-act="set-reset">Tout effacer sur ce téléphone</button></div>
  </section>`;
}

export const changes = {
  "set-act"(el) {
    const cur = store.getState().settings.activities;
    const next = ACTIVITIES.map((a) => a.id).filter((id) => (id === el.dataset.id ? el.checked : cur.includes(id)));
    if (!next.length) {
      el.checked = true;
      return toast("Garde au moins une activité");
    }
    store.setActivities(next);
  },
  "set-sharew": (el) => store.setShareWeight(el.checked),
  async "set-import"(el) {
    const file = el.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm("Remplacer les données de ce téléphone par ce fichier ?")) return;
      if (!store.replaceAll(data)) throw new Error();
      toast("Données importées");
    } catch (e) {
      toast("Fichier illisible");
    }
  },
};

export const actions = {
  "set-goal"(el) {
    const id = el.dataset.id;
    store.setGoal(id, Math.max(1, Math.min(7, goalOf(store.getState(), id) + +el.dataset.d)));
  },
  "set-export"() {
    const blob = new Blob([JSON.stringify(store.getState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `calliboss-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    store.markExported();
    toast("Fichier exporté : garde-le hors du téléphone");
  },
  "set-reset"() {
    if (!confirm("Effacer toutes les données de ce téléphone (séances, paliers, poids, programmes) ? La copie sur ton compte, si tu en as une, n'est pas effacée tout de suite : elle sera remplacée au prochain enregistrement.")) return;
    store.resetAll();
    toast("Données effacées");
  },
  async "set-restore"() {
    try {
      toast("Un instant…");
      const backup = await Account.loadBackup();
      if (!backup) return toast("Aucune copie sur ton compte");
      if (!confirm(`Remplacer les données de ce téléphone par la copie du ${shortDate(ymd(new Date(backup.savedAt)))} ?`)) return;
      toast(store.replaceAll(backup.data) ? "Données récupérées" : "Copie illisible");
    } catch (e) {
      toast(message(e));
    }
  },
  async "set-logout"() {
    if (!confirm("Te déconnecter ? Tes séances restent sur ce téléphone et tu restes membre de tes groupes.")) return;
    try {
      await Account.logout();
    } catch (e) {}
    nav.redraw();
  },
};
