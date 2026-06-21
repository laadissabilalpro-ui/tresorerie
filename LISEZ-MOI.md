# 💶 Trésorerie — PWA synchronisée (perso)

App de gestion de trésorerie au quotidien : ventes, soldes par compte, résumé pour le mentor.
Même principe que **Mon Temps** et **L'Appel** : hébergée en ligne, **synchronisée** (Supabase, projet `lpvuklsxnrqliarwvmst`) et **utilisable hors-ligne**.
Données **distinctes** des autres apps (tables `treso_*` dédiées) → zéro interférence.

## Mise en route (3 étapes)

**1. Créer les tables (une seule fois).**
Dans Supabase → SQL Editor → colle tout `treso-tables.sql` → Run.
C'est additif et idempotent : aucun impact sur Mon Temps / L'Appel.

**2. Déployer (comme tes autres apps).**
Nouveau dépôt GitHub (ex. `tresorerie`) avec ces fichiers **à la racine** :
`index.html`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`.
Active GitHub Pages (branche `main`, dossier racine).
→ URL attendue : `https://laadissabilalpro-ui.github.io/tresorerie/`
(adapte si tu choisis un autre nom de dépôt, et mets à jour `Ouvrir-Tresorerie.html`).

**3. Premier lancement.**
Ouvre l'URL sur le téléphone → « Ajouter à l'écran d'accueil ».
Saisis un **code de synchro** perso (ex. un nombre à toi). Le **même code** sur un autre
appareil = tu retrouves tes données. Puis remplis les réglages (fond de caisse, soldes de départ).

## Au quotidien
- Bouton **+** central : ajouter une vente / remise / achat / charge / retrait.
- Sur l'accueil : raccourcis **Vente espèces / CB / Revolut** pour saisir en 2 touches.
- **Hors-ligne** : tout fonctionne ; les écritures partent automatiquement dès que le réseau revient (pastille de synchro en haut à droite).

## Résumé pour le mentor
Onglet **Résumé** → bouton **Copier le résumé**, au format exact :

```
CA du jour — 21/06/2026
Espèces : 418 €
CB Crédit Agricole : 75 €
Revolut : 506,25 €
Total : 999,25 €
Sorties du jour
Achat stock (Espèces) : 50 €
Charge (Revolut) : 6,10 € — carburant
Total sorties : 56,10 €
Solde Crédit Agricole : 47,43 + 75 = 122,43 €
Solde Revolut : 506,25 €
Espèces disponibles : 418 - 50 (fond de caisse) = 368 €
```

(S'il n'y a pas de dépense, la section affiche « Sorties du jour / Aucune sortie. »)

Plus une **version courte** (WhatsApp) copiable séparément.

## Partager avec ton mentor (lecture seule)

Pour que ton mentor **voie** ton suivi sans rien pouvoir saisir ni modifier, envoie-lui ce lien
(remplace `CODE` par ton code de synchro) :

```
https://laadissabilalpro-ui.github.io/tresorerie/?vue=CODE
```

Exemple si ton code est `4280` → `https://laadissabilalpro-ui.github.io/tresorerie/?vue=4280`.

En ouvrant ce lien, son téléphone passe en **mode consultation** :
- Elle voit **Accueil, Mouvements, Résumé, Historique** en temps réel (badge « Consultation » en haut).
- **Pas de bouton +**, pas de modification/suppression, **pas d'accès aux réglages** : elle ne peut rien entrer.
- Le mode reste actif même après « Ajouter à l'écran d'accueil » (à faire depuis ce lien).

Toi, sur ton téléphone, tu ouvres l'app par l'adresse **sans** `?vue` → tu gardes tous les droits.
(Astuce : le mode consultation empêche la saisie côté écran ; garde quand même ton code de synchro pour toi.)

## Fichiers
- `index.html` — l'app complète (tout est dedans).
- `treso-tables.sql` — schéma Supabase (à exécuter une fois).
- `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png` — PWA (installation + hors-ligne).
- `Ouvrir-Tresorerie.html` — raccourci local vers l'app en ligne.

> Règles respectées : seules les **ventes** comptent dans le CA ; la **remise** est un transfert
> (Espèces → Crédit Agricole), hors CA et sans impact sur le total ; **aucune TVA** (franchise en base) ;
> calculs en centimes (zéro erreur de virgule flottante).

---
La version artefact React autonome (`Tresorerie.jsx`, sans synchro) reste dans le dossier parent si tu en as besoin.
