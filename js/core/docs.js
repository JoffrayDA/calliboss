// L'état découpé en fiches pour le compte : une par séance, sortie, pesée et programme,
// plus une pour les réglages et paliers et une pour le profil. La séance en cours reste sur le téléphone.
// Fonctions pures : { idFiche: JSON } dans les deux sens, et fusion des changements.
import { emptyState } from "./model.js";
import { hash } from "./share.js";

const key = (kind, id) => `${kind}_${String(id).replace(/[^A-Za-z0-9_-]/g, "-")}`;

export function toDocs(state) {
  const d = {};
  const put = (id, v) => (d[id] = JSON.stringify(v));
  put("meta", { settings: state.settings, progress: state.progress, progressLog: state.progressLog, proposals: state.proposals, order: state.programs.map((p) => p.id) });
  put("profile", state.profile);
  state.programs.forEach((p) => put(key("prg", p.id), p));
  state.sessions.forEach((s) => put(key("ses", s.id), s));
  state.runs.forEach((r) => put(key("run", r.date), r));
  state.weights.forEach((w) => put(key("wgt", w.date), w));
  return d;
}

// Fiches → état complet. `local` fournit la séance en cours, qui ne passe pas par le compte.
export function fromDocs(docs, local) {
  const s = emptyState();
  const get = (id) => {
    try {
      return JSON.parse(docs[id]);
    } catch (e) {
      return null;
    }
  };
  const meta = get("meta") || {};
  if (meta.settings) s.settings = meta.settings;
  if (meta.progress) s.progress = meta.progress;
  if (Array.isArray(meta.progressLog)) s.progressLog = meta.progressLog;
  if (Array.isArray(meta.proposals)) s.proposals = meta.proposals;
  s.profile = get("profile") || s.profile;
  const list = { prg: s.programs, ses: s.sessions, run: s.runs, wgt: s.weights };
  Object.keys(docs).forEach((id) => {
    const into = list[id.slice(0, 3)];
    const v = into && id[3] === "_" ? get(id) : null;
    if (v && typeof v === "object") into.push(v);
  });
  const order = Array.isArray(meta.order) ? meta.order : [];
  const rank = (p) => (order.includes(p.id) ? order.indexOf(p.id) : order.length);
  s.programs.sort((a, b) => rank(a) - rank(b));
  const byDate = (a, b) => String(a.date).localeCompare(String(b.date));
  [s.sessions, s.runs, s.weights].forEach((a) => a.sort(byDate));
  if (local) {
    s.draft = local.draft || null;
    s.runDraft = local.runDraft || s.runDraft;
  }
  return s;
}

// Empreinte d'une fiche, pour savoir si elle a changé sans la garder en entier.
export function sig(json) {
  return hash(json) + "." + json.length;
}
export function sigs(docs) {
  const out = {};
  Object.keys(docs).forEach((id) => (out[id] = sig(docs[id])));
  return out;
}

// Fusion à trois : `base` est ce que le compte avait au dernier échange (empreintes).
// Fiche modifiée sur ce téléphone : elle gagne. Sinon c'est la version du compte qui compte,
// y compris quand elle y a été supprimée depuis un autre appareil.
// Supprimée ici mais modifiée ailleurs entre-temps : on la garde.
export function merge3(base, local, server) {
  const out = {};
  const ids = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(server)]);
  ids.forEach((id) => {
    const b = base[id];
    const l = local[id] !== undefined ? sig(local[id]) : undefined;
    const sv = server[id] !== undefined ? sig(server[id]) : undefined;
    if (l !== b) {
      if (local[id] !== undefined) out[id] = local[id];
      else if (sv !== undefined && sv !== b) out[id] = server[id];
    } else if (server[id] !== undefined) out[id] = server[id];
  });
  return out;
}

// Premier échange de ce téléphone avec ce compte : rien n'est supprimé.
// Téléphone neuf : tout vient du compte. Sinon on additionne, le compte gagne en cas de doublon.
export function firstMerge(local, server, phoneEmpty) {
  if (!Object.keys(server).length) return { ...local };
  if (phoneEmpty) return { ...server };
  return { ...local, ...server };
}

// Ce qu'il faut envoyer : fiches nouvelles ou modifiées, et fiches supprimées ici.
export function diff(base, local) {
  const put = Object.keys(local).filter((id) => sig(local[id]) !== base[id]);
  const del = Object.keys(base).filter((id) => local[id] === undefined);
  return { put, del };
}
