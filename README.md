# Calliboss

App de suivi de calisthénie, course et muscu : la séance du jour, la progression par paliers, les objectifs de la semaine, le poids, et un groupe entre potes.

Web app installable (PWA), utilisable hors ligne. Les données vivent sur le téléphone. Un compte facultatif (pseudo + code secret, sans mail) garde une copie de secours privée et permet de rejoindre des groupes.

- App : https://joffrayda.github.io/calliboss/

## Versions

La V2 est l'app en ligne, à la racine : trois onglets (Aujourd'hui, Moi, Groupe), plusieurs programmes par activité, muscu avec charges, séries libres, ressenti, défi de groupe, copie de secours sur le compte.

- Au premier lancement, elle reprend les données de la V1 sans y toucher (clé `calliboss.v1` intacte).
- L'ancienne version reste consultable : https://joffrayda.github.io/calliboss/v1/
- Code : `js/core` (calculs, sans écran ni réseau), `js/store.js` (état), `js/cloud` (Firebase), `js/ui` (écrans).
- Tests : `node --test tests/core.test.js`
- Règles serveur : coller `firestore.rules` dans la console Firebase.
- À chaque mise en ligne : incrémenter `VERSION` dans `sw.js`.

## Activer les groupes

Les groupes passent par Firebase (gratuit). Tant que `firebase-config.js` vaut `null`, l'onglet Groupe est inactif et le reste de l'app marche comme avant.

1. https://console.firebase.google.com → créer un projet (Google Analytics inutile).
2. **Authentication** → Commencer → onglet « Sign-in method » → activer **Adresse e-mail/Mot de passe** (pas le lien par e-mail). Aucun mail n'est envoyé : l'app fabrique une adresse à partir du pseudo.
3. **Authentication** → Paramètres → Domaines autorisés → ajouter `joffrayda.github.io`.
4. **Firestore Database** → Créer une base → mode production → une région en Europe. Puis onglet **Règles** : coller le contenu de `firestore.rules` et publier.
5. Paramètres du projet (roue crantée) → Vos applications → icône Web `</>` → enregistrer l'app → copier l'objet `firebaseConfig` dans `firebase-config.js`.
6. Incrémenter `VERSION` dans `sw.js`, pousser.

Ce qui part au serveur, avec un compte : une copie de secours complète, lisible par son propriétaire seulement ; et, pour les groupes rejoints, le pseudo, la photo de profil, la semaine en cours, les 20 dernières séances et sorties, les programmes, et le poids si le partage est coché.
