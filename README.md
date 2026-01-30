# Electro Terrain — V1 (PWA offline)

PWA "application de terrain" pour iPhone, hébergée sur GitHub Pages.

## Installation (iPhone)
1. Ouvre l'URL GitHub Pages dans Safari
2. Bouton Partager → "Sur l’écran d’accueil"

## Offline
L'app fonctionne hors-ligne (service worker + cache) et stocke les données en local via IndexedDB.

## Sauvegarde
Dans l'app : bouton ⤓ (en haut) ou Réglages → Exporter/Importer.

## Déploiement GitHub Pages
- Settings → Pages
- Branch: `main` ; Folder: `/ (root)`


## V2 — Électrique
- Convertisseurs
- Loi d'Ohm & puissance
- Mono/Tri (P/I)
- Chute de tension + section (mode rapide)

## V3 — Moteur & Protections
- Courant moteur (kW → A) avec cosφ + rendement
- Aide sélection disjoncteur / fusibles (mode terrain)

## V3.1 — UX outils
- Électrique: choix de l’outil avant affichage (menu)

## V4 — Mécanique
- Pas ISO: choix M + pas (standard/fin) + perçage taraudage (approx)
- Roulements: base editable (recherche + ajout/suppression)
- Conversions: Nm ↔ daN·m

## V5 — Automatisme
- Menu Automatisme (PLC Siemens + Variateurs SEW)
- Base défauts offline, recherche + ajout + édition + suppression

## V5.1 — Fix affichage
- Correction d'un await dans un handler non-async (bloquait tout le JS)

## V6 — Fix elec + table pas ISO
- Électrique: boutons Calculer remplissent aussi les champs U/I/R/P et P/I
- Mécanique: pas ISO en tableau avec filtre

## V6.3 — Fix IndexedDB upgrade
- onupgradeneeded idempotent (stores/indexes créés seulement si absents)
- DB_VERSION bumped to 4
