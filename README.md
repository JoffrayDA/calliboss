# Calliboss

App de suivi de calisthénie : séance du jour en checklist, progression par paliers, objectif hebdo, pesée du lundi, course + mobilité.

Web app installable (PWA). Les données restent sur le téléphone. Un compte (pseudo + code à 4 chiffres, sans mail) sert uniquement à rejoindre des groupes entre potes.

- App : https://joffrayda.github.io/calliboss/
- Programme de base dans `program.js` ; chacun peut créer le sien dans l'app (Réglages → Programme)

## V2 (dossier `v2/`)

Nouvelle version, à côté de la V1 tant qu'elle n'est pas validée : trois onglets (Aujourd'hui, Moi, Groupe), plusieurs programmes par activité, muscu avec charges, séries libres, ressenti, défi de groupe, copie de secours sur le compte.

- Adresse une fois en ligne : https://joffrayda.github.io/calliboss/v2/
- Au premier lancement, elle reprend les données de la V1 sans y toucher (clé `calliboss.v1` intacte).
- Tests : `node --test v2/tests/core.test.js`
- Avant de l'ouvrir aux groupes : coller `v2/firestore.rules` dans la console Firebase (compatibles avec la V1).
- À chaque mise en ligne : incrémenter `VERSION` dans `v2/sw.js`.

## Activer les groupes

Les groupes passent par Firebase (gratuit). Tant que `firebase-config.js` vaut `null`, l'onglet Groupe est inactif et le reste de l'app marche comme avant.

1. https://console.firebase.google.com → créer un projet (Google Analytics inutile).
2. **Authentication** → Commencer → onglet « Sign-in method » → activer **Adresse e-mail/Mot de passe** (pas le lien par e-mail). Aucun mail n'est envoyé : l'app fabrique une adresse à partir du pseudo.
3. **Authentication** → Paramètres → Domaines autorisés → ajouter `joffrayda.github.io`.
4. **Firestore Database** → Créer une base → mode production → une région en Europe. Puis onglet **Règles** : coller le contenu de `firestore.rules` et publier.
5. Paramètres du projet (roue crantée) → Vos applications → icône Web `</>` → enregistrer l'app → copier l'objet `firebaseConfig` dans `firebase-config.js`.
6. Incrémenter `VERSION` dans `sw.js`, pousser.

Ce qui part au serveur, et seulement pour les groupes rejoints : le pseudo, la semaine en cours, les 20 dernières séances et sorties, et le poids si le partage est coché. Tout le reste ne quitte pas le téléphone.
