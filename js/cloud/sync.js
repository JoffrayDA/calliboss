// Tes données sur ton compte : une fiche par élément dans users/{uid}/data. Le compte fait foi ;
// le téléphone en garde une copie pour marcher hors ligne et envoie ses changements dès qu'il peut.
import { enabled, sdk, fail, message } from "./firebase.js";
import { getAccount, loadBackup } from "./account.js";
import { diff, firstMerge, fromDocs, merge3, sigs, toDocs } from "../core/docs.js";
import { upgrade } from "../core/migrate.js";
import * as store from "../store.js";

const KEY = "calliboss.sync"; // { uid, base: { idFiche: empreinte } } : ce que le compte avait au dernier échange
const BATCH = 400; // Firestore : 500 opérations au plus par envoi groupé
const STALE = 5 * 60 * 1000; // au retour dans l'app, on relit le compte si le dernier échange date de plus de 5 min

let meta = read();
let pulledAt = 0;
let running = null;
let again = false;
let wipeOk = false;
const listeners = [];
// state : "idle" (pas encore d'échange), "busy", "ok", "offline", "error"
export const status = { state: "idle", at: 0, error: "" };

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { uid: null, base: {} };
  } catch (e) {
    return { uid: null, base: {} };
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch (e) {}
}
function set(state, error = "") {
  Object.assign(status, { state, error }, state === "ok" ? { at: Date.now() } : {});
  listeners.forEach((fn) => fn(status));
}
export function onChange(fn) {
  listeners.push(fn);
}

// Changements de ce téléphone pas encore sur le compte.
export function pending() {
  const acc = getAccount();
  if (!acc) return 0;
  const { put, del } = diff(meta.uid === acc.uid ? meta.base : {}, toDocs(store.getState()));
  return put.length + del.length;
}

// Après « Tout effacer » : autorise l'envoi d'un téléphone vidé, qui supprime tout sur le compte.
export function allowWipe() {
  wipeOk = true;
}
// Déconnexion : ce téléphone oublie le compte.
export function forget() {
  meta = { uid: null, base: {} };
  pulledAt = 0;
  save();
  set("idle");
}

async function signedIn() {
  const acc = getAccount();
  if (!enabled || !acc) return null;
  const s = await sdk();
  if (!s.au.currentUser || s.au.currentUser.uid !== acc.uid) return null;
  return { ...s, uid: acc.uid };
}

async function pull(s) {
  const snap = await s.fs.getDocs(s.fs.collection(s.db, "users", s.uid, "data"));
  const server = {};
  snap.docs.forEach((d) => {
    const v = d.data().v;
    if (typeof v === "string") server[d.id] = v;
  });
  const onServer = sigs(server);
  // Compte encore vide : on repart de l'ancienne copie de secours s'il y en a une.
  if (!Object.keys(server).length) {
    const backup = await loadBackup().catch(() => null);
    const old = backup && upgrade(backup.data);
    if (old) Object.assign(server, toDocs(old));
  }
  // La fusion se fait sur l'état du moment, pour ne rien perdre de ce qui a été noté pendant la lecture.
  const state = store.getState();
  const local = toDocs(state);
  // `base` ne vaut que si l'état du téléphone est bien celui qui a servi au dernier échange :
  // relu du stockage, ou déjà fusionné avec le compte depuis le lancement.
  const known = meta.uid === s.uid && (store.fromDisk || pulledAt > 0);
  const merged = known ? merge3(meta.base, local, server) : firstMerge(local, server, store.isEmpty());
  meta = { uid: s.uid, base: onServer };
  save();
  pulledAt = Date.now();
  if (JSON.stringify(merged) !== JSON.stringify(local)) store.applyRemote(fromDocs(merged, state));
}

async function push(s) {
  const local = toDocs(store.getState());
  const { put, del } = diff(meta.base, local);
  if (!put.length && !del.length) return;
  // Garde-fou : un téléphone vide ne vide pas le compte, sauf après « Tout effacer ».
  if (del.length > 3 && store.isEmpty() && !wipeOk) throw fail("Envoi bloqué : ce téléphone est vide alors que ton compte a des données");
  const ops = [...put.map((id) => [id, local[id]]), ...del.map((id) => [id, null])];
  for (let i = 0; i < ops.length; i += BATCH) {
    const batch = s.fs.writeBatch(s.db);
    ops.slice(i, i + BATCH).forEach(([id, json]) => {
      const ref = s.fs.doc(s.db, "users", s.uid, "data", id);
      if (json === null) batch.delete(ref);
      else batch.set(ref, { v: json, at: Date.now() });
    });
    await batch.commit();
    ops.slice(i, i + BATCH).forEach(([id]) => {
      if (local[id] === undefined) delete meta.base[id];
    });
    Object.assign(meta.base, sigs(Object.fromEntries(ops.slice(i, i + BATCH).filter(([, j]) => j !== null))));
    save();
  }
  wipeOk = false;
}

// Échange avec le compte : relit si besoin (`fresh`, ou jamais fait, ou trop ancien), puis envoie.
// Un seul échange à la fois ; un appel pendant un échange en relance un après.
export function now(fresh = false) {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    const s = await signedIn();
    if (!s) return set("idle");
    set("busy");
    try {
      if (fresh || meta.uid !== s.uid || !pulledAt || Date.now() - pulledAt > STALE) await pull(s);
      await push(s);
      set("ok");
    } catch (e) {
      const offline = !navigator.onLine || e instanceof TypeError || (e && (e.code === "unavailable" || e.code === "auth/network-request-failed"));
      set(offline ? "offline" : "error", message(e));
    }
  })().finally(() => {
    running = null;
    if (again) {
      again = false;
      now();
    }
  });
  return running;
}
