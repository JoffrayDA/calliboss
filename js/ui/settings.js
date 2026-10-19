// Réglages : mes activités, mes objectifs, mon compte, mes données.
import { shortDate, today } from "../core/dates.js";
import { ACTIVITIES } from "../core/catalog.js";
import { goalOf } from "../core/stats.js";
import * as store from "../store.js";
import { enabled } from "../cloud/firebase.js";
import * as Account from "../cloud/account.js";
import * as Sync from "../cloud/sync.js";
import { esc, nav, toast } from "./dom.js";
import { icon } from "./icons.js";

// Où en sont tes données : sur le compte, en attente, ou bloquées (avec la raison).
function syncLine() {
  const n = Sync.pending();
  const wait = n ? `${n} modification${n > 1 ? "s" : ""} pas encore sur ton compte.` : "";
  const st = Sync.status;
  if (st.state === "busy") return `<p class="small muted">Synchronisation…</p>`;
  if (st.state === "error") return `<p class="small bad">Échec de l'envoi : ${esc(st.error)}. ${wait} Elles restent sur ce téléphone en attendant.</p>`;
  if (st.state === "offline") return `<p class="small muted">Hors ligne. ${wait || "Rien en attente."} Envoi au retour du réseau.</p>`;
  if (n) return `<p class="small muted">${wait}</p>`;
  if (st.state === "ok") {
    const t = new Date(st.at);
    return `<p class="small muted">Tout est sur ton compte. Dernier échange à ${t.getHours()}h${String(t.getMinutes()).padStart(2, "0")}.</p>`;
  }
  return `<p class="small muted">Pas encore d'échange avec ton compte depuis l'ouverture de l'app.</p>`;
}

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
           ${syncLine()}
           <label class="check"><input type="checkbox" data-ch="set-sharew" ${state.settings.shareWeight ? "checked" : ""}><span class="box">${icon("check")}</span><span>Partager mon poids avec mes groupes</span></label>
           <div class="row wrap"><button class="btn quiet sm" data-act="set-sync">Synchroniser</button><button class="btn quiet sm" data-act="set-logout">Se déconnecter</button></div>`
        : `<p class="small bad">Sans compte, tes données ne sont que sur ce téléphone : elles disparaissent si l'app est supprimée.</p><button class="btn quiet sm" data-act="tab" data-tab="group">Se connecter</button>`}</div>
    <div class="block"><h2>Mes données</h2>
      <p class="small muted">${acc ? "Pas nécessaire avec un compte. Un fichier si tu veux une copie à toi." : `Fichier à garder hors du téléphone. ${state.settings.lastExport ? `Dernier export : ${esc(shortDate(state.settings.lastExport))}.` : "Jamais exporté."}`}</p>
      <div class="row wrap"><button class="btn quiet sm" data-act="set-export">Exporter</button><label class="btn quiet sm file">Importer<input type="file" accept="application/json,.json" data-ch="set-import"></label></div>
      <button class="link bad" data-act="set-reset">${acc ? "Tout effacer, sur ce téléphone et sur mon compte" : "Tout effacer sur ce téléphone"}</button></div>
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
    const acc = Account.getAccount();
    const what = acc ? "sur ce téléphone et sur ton compte" : "de ce téléphone";
    if (!confirm(`Effacer toutes tes données ${what} (séances, sorties, paliers, poids, programmes) ? Impossible à annuler.`)) return;
    if (acc) Sync.allowWipe();
    store.resetAll();
    toast("Données effacées");
  },
  async "set-sync"() {
    await Sync.now(true);
    toast(Sync.status.state === "ok" ? "Tout est sur ton compte" : "Échange impossible pour l'instant");
  },
  async "set-logout"() {
    toast("Un instant…");
    await Sync.now();
    const n = Sync.pending();
    const msg = n
      ? `${n} modification${n > 1 ? "s" : ""} pas encore envoyée${n > 1 ? "s" : ""} sur ton compte ser${n > 1 ? "ont" : "a"} perdue${n > 1 ? "s" : ""}. Te déconnecter quand même ?`
      : "Te déconnecter ? Tes données restent sur ton compte et quittent ce téléphone. Tu restes membre de tes groupes.";
    if (!confirm(msg)) return;
    try {
      await Account.logout();
    } catch (e) {}
    Sync.forget();
    store.resetAll();
    nav.go("today");
  },
};
