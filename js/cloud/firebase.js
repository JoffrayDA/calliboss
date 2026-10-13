// Chargement du SDK Firebase à la demande. L'app marche sans : hors ligne, on réessaie plus tard.
// FIREBASE_CONFIG vient de firebase-config.js (script classique, valeurs publiques par nature).
const SDK = "https://www.gstatic.com/firebasejs/12.4.0/";
const config = typeof FIREBASE_CONFIG !== "undefined" ? FIREBASE_CONFIG : null;
export const enabled = !!config;

let sdkPromise = null;
export function sdk() {
  if (!sdkPromise)
    sdkPromise = (async () => {
      const [app, auth, fs] = await Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-firestore-lite.js")]);
      const a = app.initializeApp(config);
      const au = auth.getAuth(a);
      await au.authStateReady();
      return { auth, fs, au, db: fs.getFirestore(a) };
    })().catch((e) => {
      sdkPromise = null;
      throw e;
    });
  return sdkPromise;
}

// Erreur dont le message est déjà prêt à afficher.
export function fail(msg) {
  const e = new Error(msg);
  e.user = true;
  return e;
}
export function message(e) {
  if (e && e.user) return e.message;
  const code = (e && e.code) || "";
  if (code === "auth/network-request-failed" || code === "unavailable" || e instanceof TypeError) return "Pas de connexion, réessaie plus tard";
  if (code === "auth/too-many-requests") return "Trop d'essais, réessaie dans quelques minutes";
  if (code === "auth/operation-not-allowed" || code === "auth/configuration-not-found") return "La connexion par mot de passe n'est pas activée dans Firebase";
  if (code === "permission-denied") return "Accès refusé. Les règles du serveur sont peut-être à mettre à jour";
  return "Erreur : " + (code || (e && e.message) || "inconnue");
}
