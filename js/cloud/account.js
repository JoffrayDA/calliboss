// Compte : pseudo + code secret, sans mail. Les données du compte passent par sync.js.
import { enabled, sdk, fail } from "./firebase.js";

// Même clé que la V1 : connecté dans l'une, connecté dans l'autre.
const ACCOUNT_KEY = "calliboss.account";

// Compte connu de ce téléphone : { uid, pseudo, groups: [{ code, name }], sent2, sentFeed }
let account = null;
try {
  account = JSON.parse(localStorage.getItem(ACCOUNT_KEY));
} catch (e) {}
export function keep() {
  try {
    if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch (e) {}
}
export function getAccount() {
  return account;
}

export async function groupNames(codes) {
  const { fs, db } = await sdk();
  const snaps = await Promise.all(codes.map((c) => fs.getDoc(fs.doc(db, "groups", c))));
  return snaps.filter((s) => s.exists()).map((s) => ({ code: s.id, name: String(s.data().name || s.id) }));
}

// Un seul formulaire : se connecte si le pseudo existe avec ce code, sinon propose de le créer.
// Firebase Auth veut un e-mail et un mot de passe : on les fabrique à partir du pseudo et du code.
// Les comptes V1 ont un code à 4 chiffres ; un nouveau compte en demande 6, car il protège la copie de secours.
export async function login(pseudo, pin, confirmCreate) {
  const display = pseudo.trim();
  const id = display.toLowerCase();
  if (!/^[a-z0-9_-]{3,20}$/.test(id)) throw fail("Pseudo : 3 à 20 caractères, lettres sans accent, chiffres, - ou _");
  if (!/^\d{4,8}$/.test(pin)) throw fail("Le code secret fait 4 à 8 chiffres");
  const { auth, fs, au, db } = await sdk();
  const email = `${id}@calliboss.invalid`;
  const password = `calliboss-${pin}`;
  let cred;
  try {
    cred = await auth.signInWithEmailAndPassword(au, email, password);
  } catch (e) {
    if (e.code === "auth/wrong-password") throw fail("Code incorrect pour ce pseudo");
    if (!["auth/invalid-credential", "auth/invalid-login-credentials", "auth/user-not-found"].includes(e.code)) throw e;
    if (pin.length < 6) throw fail("Pas de compte avec ce pseudo et ce code. Pour en créer un, choisis un code d'au moins 6 chiffres");
    if (!confirmCreate(display)) return null;
    try {
      cred = await auth.createUserWithEmailAndPassword(au, email, password);
    } catch (e2) {
      if (e2.code === "auth/email-already-in-use") throw fail("Ce pseudo existe déjà et le code ne correspond pas");
      throw e2;
    }
  }
  const uid = cred.user.uid;
  const ref = fs.doc(db, "users", uid);
  const snap = await fs.getDoc(ref);
  let name = display, codes = [];
  if (snap.exists()) {
    name = snap.data().pseudo || display;
    codes = snap.data().groups || [];
  } else await fs.setDoc(ref, { pseudo: display, groups: [] });
  account = { uid, pseudo: name, groups: [], sent2: "", sentFeed: [] };
  account.groups = await groupNames(codes);
  keep();
  return account;
}

// Les séances restent sur le téléphone ; le compte reste membre de ses groupes.
export async function logout() {
  account = null;
  keep();
  const { auth, au } = await sdk();
  await auth.signOut(au);
}

// Au démarrage : vérifie que la session est toujours valide et relit la liste des groupes.
export async function sync() {
  if (!enabled || !account) return;
  const { fs, au, db } = await sdk();
  if (!au.currentUser || au.currentUser.uid !== account.uid) {
    account = null;
    keep();
    return;
  }
  const snap = await fs.getDoc(fs.doc(db, "users", account.uid));
  if (!snap.exists()) return;
  account.groups = await groupNames(snap.data().groups || []);
  keep();
}

async function signedIn() {
  const s = await sdk();
  if (!account || !s.au.currentUser || s.au.currentUser.uid !== account.uid) return null;
  return s;
}

// Ancienne copie de secours (avant les fiches de sync.js), relue une fois pour remplir un compte vide.
// Renvoie { data, savedAt } ou null s'il n'y a pas de copie.
export async function loadBackup() {
  const s = await signedIn();
  if (!s) throw fail("Connecte-toi d'abord");
  const snap = await s.fs.getDoc(s.fs.doc(s.db, "users", account.uid, "private", "backup"));
  if (!snap.exists()) return null;
  try {
    return { data: JSON.parse(snap.data().state), savedAt: +snap.data().savedAt || 0 };
  } catch (e) {
    return null;
  }
}
