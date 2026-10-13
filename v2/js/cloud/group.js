// Groupes : membres, résumé partagé, fil, applaudissements, photo et défi.
// Un document = un seul auteur (voir firestore.rules).
import { enabled, sdk, fail } from "./firebase.js";
import { getAccount, keep } from "./account.js";
import { hash } from "../core/share.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O ni 1/I

function memberRef(fs, db, code) {
  return fs.doc(db, "groups", code, "members", getAccount().uid);
}
function memberDoc(data) {
  return { pseudo: getAccount().pseudo, updated: Date.now(), data };
}

export async function joinGroup(code, data) {
  const account = getAccount();
  // Le code s'affiche espacé : on tolère les espaces et tirets recopiés avec.
  code = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{6}$/.test(code)) throw fail("Le code d'un groupe fait 6 caractères");
  if (account.groups.some((g) => g.code === code)) throw fail("Tu es déjà dans ce groupe");
  const { fs, db } = await sdk();
  const snap = await fs.getDoc(fs.doc(db, "groups", code));
  if (!snap.exists()) throw fail("Aucun groupe avec ce code");
  await fs.setDoc(memberRef(fs, db, code), memberDoc(data));
  await fs.setDoc(fs.doc(db, "users", account.uid), { groups: fs.arrayUnion(code) }, { merge: true });
  const group = { code, name: String(snap.data().name || code) };
  account.groups.push(group);
  account.sentFeed = [];
  keep();
  return group;
}

export async function createGroup(name, data) {
  name = name.trim();
  if (!name || name.length > 40) throw fail("Donne un nom au groupe (40 caractères max)");
  const { fs, db } = await sdk();
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  const code = Array.from(rnd, (n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
  // Refusé par les règles si le code existe déjà.
  await fs.setDoc(fs.doc(db, "groups", code), { name, owner: getAccount().uid, created: Date.now() });
  return joinGroup(code, data);
}

export async function leaveGroup(code) {
  const account = getAccount();
  const { fs, db } = await sdk();
  await fs.deleteDoc(memberRef(fs, db, code));
  await fs.setDoc(fs.doc(db, "users", account.uid), { groups: fs.arrayRemove(code) }, { merge: true });
  account.groups = account.groups.filter((g) => g.code !== code);
  keep();
}

// Fiche du groupe : { name, owner, photo, challenge }.
export async function groupInfo(code) {
  const { fs, db } = await sdk();
  const snap = await fs.getDoc(fs.doc(db, "groups", code));
  if (!snap.exists()) throw fail("Ce groupe n'existe plus");
  const d = snap.data();
  return { name: String(d.name || code), owner: String(d.owner || ""), photo: typeof d.photo === "string" ? d.photo : "", challenge: +d.challenge || 0 };
}
// Réservé au propriétaire : photo et objectif du défi.
export async function updateGroup(code, patch) {
  const { fs, db } = await sdk();
  await fs.setDoc(fs.doc(db, "groups", code), patch, { merge: true });
}

// Membres : [{ uid, pseudo, updated, data }]. `data` vient des autres : à lire avec readMember, jamais affiché sans échappement.
export async function members(code) {
  const { fs, db } = await sdk();
  const snap = await fs.getDocs(fs.collection(db, "groups", code, "members"));
  return snap.docs.map((d) => {
    const v = d.data();
    let data = {};
    try {
      data = JSON.parse(v.data) || {};
    } catch (e) {}
    return { uid: d.id, pseudo: String(v.pseudo || "?"), updated: +v.updated || 0, data };
  });
}

// Envoie le résumé (s'il a changé) et les événements du fil pas encore envoyés, à chaque groupe.
export async function publish(summaryJson, events) {
  const account = getAccount();
  if (!enabled || !account || !account.groups.length) return false;
  const h = hash(summaryJson) + "." + summaryJson.length;
  const sentFeed = new Set(account.sentFeed || []);
  const fresh = events.filter((e) => !sentFeed.has(`${e.type}_${e.key}`));
  if (account.sent2 === h && !fresh.length) return false;
  const { fs, au, db } = await sdk();
  if (!au.currentUser || au.currentUser.uid !== account.uid) return false;
  const writes = [];
  account.groups.forEach((g) => {
    if (account.sent2 !== h) writes.push(fs.setDoc(memberRef(fs, db, g.code), memberDoc(summaryJson)));
    fresh.forEach((e) => {
      // Identifiant rejouable : renvoyer le même événement ne crée pas de doublon. Jamais de champ `claps` ici.
      const id = `${account.uid}_${e.type}_${e.key}`.replace(/[^A-Za-z0-9_-]/g, "");
      const ts = Math.min(Date.now(), new Date(e.date + "T23:59:00").getTime());
      writes.push(fs.setDoc(fs.doc(db, "groups", g.code, "feed", id), { uid: account.uid, pseudo: account.pseudo, type: e.type, text: e.text, date: e.date, ts }, { merge: true }));
    });
  });
  await Promise.all(writes);
  account.sent2 = h;
  account.sentFeed = [...sentFeed, ...fresh.map((e) => `${e.type}_${e.key}`)].slice(-80);
  keep();
  return true;
}

// Fil du groupe, du plus récent au plus ancien : [{ id, uid, pseudo, type, text, date, claps: [uid] }].
export async function feed(code) {
  const { fs, db } = await sdk();
  const q = fs.query(fs.collection(db, "groups", code, "feed"), fs.orderBy("ts", "desc"), fs.limit(25));
  const snap = await fs.getDocs(q);
  return snap.docs.map((d) => {
    const v = d.data();
    const claps = v.claps && typeof v.claps === "object" ? Object.keys(v.claps) : [];
    return { id: d.id, uid: String(v.uid || ""), pseudo: String(v.pseudo || "?"), type: String(v.type || ""), text: String(v.text || ""), date: String(v.date || ""), claps };
  });
}
// Chacun n'écrit que sa propre clé dans `claps`.
export async function clap(code, id, on) {
  const { fs, db } = await sdk();
  await fs.updateDoc(fs.doc(db, "groups", code, "feed", id), { [`claps.${getAccount().uid}`]: on ? true : fs.deleteField() });
}
