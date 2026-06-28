# Brief de construction — habits-tracker (PWA de pilotage de vie)

> Document de référence pour Claude Code. À lire en entier avant d'écrire la moindre ligne.
> L'utilisateur s'appelle **Ethan**. Le projet est en **français**. Il est le **seul utilisateur**.

---

## 0. Comment utiliser ce brief

1. Lis ce document en entier.
2. Ouvre les **3 fichiers de maquette** fournis (voir §12) — ils sont la **source de vérité visuelle**. Tu dois reproduire leur rendu, leurs animations et leurs interactions le plus fidèlement possible.
3. Le **schéma Supabase est déjà créé et en production** (16 tables, RLS activé). Tu ne touches PAS au schéma ; tu écris du code qui lit/écrit dedans.
4. Construis dans l'ordre recommandé (§14), un module de bout en bout à la fois.
5. **Demande validation humaine avant tout `git push` en production.** Propose les diffs, n'auto-pushe pas.

---

## 1. Ce qu'est l'app

Une PWA installable sur iPhone (ajout à l'écran d'accueil), outil personnel de pilotage de vie d'Ethan, jeune entrepreneur. Elle centralise 8 modules + un onboarding :

Accueil (tableau de bord) · Habitudes · Nutrition · Agenda · Sport · Sommeil · Business (CRM) · Devoirs & Notes.

Déjà en place : repo GitHub `habits-tracker` (compte `ethanraccah2010-cmyk`), auto-déploiement Vercel, projet Supabase rattaché.

---

## 2. Stack & contraintes techniques

- **Front** : HTML / CSS / JavaScript **vanilla**. Pas de framework (ni React, ni Vue). C'est la stack actuelle, on la garde.
- **Backend** : Supabase (PostgreSQL + API auto-générée + Auth + Storage). Client JS Supabase via CDN.
- **Déploiement** : Vercel (auto-deploy depuis GitHub `main`).
- **PWA** : manifest + service worker, installable iPhone, fonctionne hors-ligne en lecture autant que possible.
- **Polices** (identiques aux maquettes) : **Inter** (corps), **Space Grotesk** (titres/chiffres). Chargées via Google Fonts.
- ⚠️ N'introduis PAS d'autres polices (pas d'Instrument Serif, pas d'IBM Plex Mono — c'est une ancienne direction abandonnée).

---

## 3. Périmètre v1 — STRICTEMENT manuel

**v1 = saisie 100 % manuelle.** Aucun pont automatique.

**Inclus en v1 :** tous les modules en saisie/édition manuelle dans l'app + l'onboarding.

**Explicitement HORS v1 (ne pas implémenter, ne pas câbler, ne pas préparer d'UI pour) :**
- ❌ Pont Raccourci iOS (pas, sommeil)
- ❌ Estimation calorique par photo (vision IA)
- ❌ Intégration Pronote
- ❌ Intégration vocale / agent Nox
- ❌ Import Sleep Cycle
- ❌ Temps d'écran (abandonné durablement — aucun pont viable)

Le sommeil, le poids, les repas, les séances, les notes : tout est tapé à la main en v1. Les champs comme `photo_url` (repas) existent en base mais ne sont pas utilisés côté UI en v1.

---

## 4. Architecture & principes non négociables

1. **Shell mono-page (SPA légère).** Une seule `index.html` avec une **tab bar persistante** et des vues échangées en JS. Raison : la tab bar doit être **identique partout** — depuis Sport, on doit pouvoir atteindre Habitudes en un tap. (Ne refais pas l'erreur des maquettes où les pages 1-4 et 5-8 avaient des tab bars différentes.)
2. **Supabase est l'unique source de vérité.** Aucune donnée persistée ailleurs.
3. **Calculer à la lecture, ne jamais stocker un dérivé.** Le 1RM, les moyennes, le score, l'heure de coucher : calculés à la volée depuis les données brutes. On ne crée pas de colonne "1RM" ou "moyenne" figée qui se désynchroniserait.
4. **Sécurité :**
   - Côté client : uniquement l'**URL du projet** + la clé **`anon`** (publique). C'est OK car le RLS protège.
   - **JAMAIS** la clé `service_role` dans le code front / le repo / Vercel exposé au client.
   - Le RLS est déjà en place et filtre par `auth.uid()`.
5. **Pas de localStorage pour les données métier** (juste éventuellement la session Supabase, qu'elle gère elle-même). La donnée vit dans Supabase.

---

## 5. Authentification (point technique critique)

Les policies RLS filtrent par `auth.uid()`. **Sans utilisateur authentifié, `auth.uid()` est nul → l'app ne peut RIEN lire ni écrire.** Donc même si Ethan est seul :

- Mets en place **Supabase Auth** (email + mot de passe, ou magic link).
- Écran de login minimal au premier lancement ; session persistée ensuite (l'app ne redemande pas le login à chaque ouverture).
- Toutes les requêtes se font en tant qu'utilisateur connecté.
- Le `user_id` des insertions = `auth.uid()` (à passer explicitement ou via `default auth.uid()` si tu ajustes — mais NE modifie pas le schéma sans le signaler).

---

## 6. Design system

Reproduis fidèlement les tokens des maquettes :

```
--bg:#08090c  --card:#13151b  --card2:#1a1d25
--line:#ffffff12  --ink:#EDEFF3  --dim:#8b909c
```
Fond noir, cartes arrondies (rayon ~16–20px), texte clair, beaucoup de respiration.

### Couleur d'accent PAR PAGE (`--accent`)

Chaque module a sa couleur, pilotée par une variable `--accent` posée sur le conteneur de la page :

| Page | Couleur "officielle" | Valeur d'accent à utiliser pour texte/glow* |
|---|---|---|
| Accueil | `#8b7bff` (violet) | `#8b7bff` |
| Habitudes | `#1c9b66` (vert) | `#1c9b66` |
| Nutrition | `#69ddad` (vert clair) | `#3fb88a` |
| Agenda | `#006bbd` (bleu) | `#1f8fe0` |
| Sport | `#df2020` (rouge) | `#ff4d4d` |
| Sommeil | `#8accff` (bleu clair) | `#8accff` |
| Business | `#ff6b9d` (rose) | `#ff6b9d` |
| Devoirs & Notes | `#f5ebcc` (crème) | `#f5ebcc` |

*Sur fond quasi-noir, certaines couleurs officielles sont trop sombres (Agenda, Sport) ou bavent en glow (Nutrition) pour du texte fin. Les maquettes utilisent les valeurs ajustées de la 3ᵉ colonne pour l'accent réel, tout en gardant la couleur officielle comme identité. Reproduis ce choix. (Décision de réglage de lisibilité validée.)*

### Variantes de composants FINALISÉES (à respecter, pas à réinventer)

1. Anneau de score → **Néon** (glow sur le tracé + text-shadow sur le chiffre)
2. Stat pill → **Néon**
3. Progression/échéance → **Lueur** (barre avec glow + point pulsant en bout)
4. Bar chart → **Pic surligné** (barres ternes, la sélectionnée en accent + glow)
5. Line chart → **Hybride** : tracé néon + dégradé d'aire dessous
6. Badge de série → **Carte flamme** (🔥 + chiffre)
7. Ligne d'habitude → **Classique + lueur** sur la case quand cochée
8. Contrôle segmenté → **Plein lueur** (onglet actif en accent + glow)
9. Chips → **Contour**
10. FAB → **Solide**
11. Gemme coach → **Gemme + bulle**, précédée d'1 s d'animation « en train d'écrire »
12. Carte repas → **Compacte**, clic = **pop-up** (photo, nom, 1 grand cercle = part des kcal du jour, 3 petits = part P/G/L)
13. Carte pipeline → **Compacte**, clic = **fiche complète** + bouton **Modifier** → édition au style fiche complète

La mascotte « gemme » est un SVG facetté (voir maquettes), teinté par `--accent`.

---

## 7. Navigation (VALIDÉE)

Tab bar fixe, identique sur toute l'app, 5 emplacements :

**Accueil · Habitudes · ＋ (FAB contextuel) · Nutrition · Agenda**

Plus un onglet/écran **« Plus »** listant : **Sport, Sommeil, Business, Devoirs & Notes**.

Le **＋ central** est l'action d'ajout contextuelle de la page courante (ajouter un repas sur Nutrition, un événement sur Agenda, etc.) — ouvre une feuille de saisie.

---

## 8. Mapping module → tables Supabase (déjà créées)

| Module | Tables |
|---|---|
| Réglages onboarding | `profile_settings`, `sleep_targets` |
| Habitudes | `habits`, `habit_logs` |
| Poids | `weight_logs` |
| Nutrition | `meals` |
| Sommeil | `sleep_logs` (+ `sleep_targets` pour l'objectif) |
| Sport | `workout_templates`, `template_exercises`, `workout_sessions`, `session_exercises`, `exercise_sets` |
| Business | `prospects` |
| Devoirs & Notes | `subjects`, `grades`, `homework` |
| Agenda | `events` |

Schéma de référence : voir le fichier `schema-supabase.sql` fourni (NE PAS le ré-exécuter, il est déjà en prod ; sers-t'en pour connaître colonnes et relations).

Points de schéma importants :
- `exercise_sets` porte chaque **série individuelle** (`reps`, `kg`). C'est la table-clé du sport.
- `sleep_targets` : un objectif **par jour de semaine** (`day_of_week` 0=lundi…6=dimanche).
- `grades.coefficient` = pondération **dans** la matière. `grades.class_average` = moyenne de classe.
- `prospects.status` ∈ {Prospect, Négociation, Gagné, Perdu}.

---

## 9. Spécification écran par écran

> Pour chaque écran, le rendu visuel exact = la maquette correspondante. Ci-dessous : la donnée et le comportement.

### 9.0 Onboarding (au premier lancement)
Réf. visuelle : `onboarding.html`. 8 étapes. Ethan configure tout lui-même.
1. Bienvenue.
2. **Poids de départ** → `weight_logs` (date du jour).
3. **Sommeil par jour** : 7 jours, réveil + durée visée par jour, individualisables (sélection multiple = raccourci de saisie groupée, pas une contrainte). L'heure de coucher est calculée et affichée. → `sleep_targets` (une ligne par jour).
4. **Objectifs caloriques** (kcal + P/G/L, saisie manuelle) → `profile_settings`.
5. **Habitudes de départ** (toggles + ajout libre) → `habits`.
6. **Programme sport par jour** : par jour, 0/1/plusieurs séances ; chaque séance = titre + exos (nom, séries cible, reps cible) → `workout_templates` + `template_exercises`.
7. **Matières + objectif /20** → `subjects` (`target_average`).
8. Récapitulatif → à la validation, tout est écrit en base.

Tout reste **modifiable plus tard** dans les réglages de chaque module (pas seulement à l'onboarding).

### 9.1 Accueil
Réf. : maquette pages 1-4, page 1. Accent violet.
- **Coach (gemme + bulle)** : 1 s d'animation « en train d'écrire », puis un message **choisi par priorité** parmi plusieurs signaux (déficit calorique du jour, heure de coucher proche, événement important imminent…) — n'affiche QUE le plus urgent. Implémente une petite fonction de priorité (chaque signal a une urgence, on prend le max).
- **Anneau de score (néon)** : voir §10 pour la formule. Ne hardcode pas 78.
- **Badge de série (carte flamme)** : plus longue série d'habitudes en cours.
- **Line chart hybride** : évolution du score, sélecteur de période (1S/2S/1M/3M).
- **Tuiles** : calories du jour (depuis `meals`), heure de coucher ce soir (depuis `sleep_targets` du jour).
- **Prochain événement** (depuis `events`).

### 9.2 Habitudes
Réf. : pages 1-4, page 2. Accent vert.
- **Zone haute STATIQUE** : bar chart « pic surligné » (habitudes complétées par jour, période 1S/2S/1M/3M ; barre **du jour = la dernière, surlignée par défaut** ; clic sur une barre = sélection unique) + barre de progression « lueur » (X/N habitudes du jour) + petit badge de série.
- **Zone basse SCROLLABLE** : seulement la liste des habitudes (le haut reste fixe quand on scrolle).
- Cocher une habitude → écrit dans `habit_logs` (date du jour, unique par habitude/jour) ; la progression et le compteur se mettent à jour en direct.

### 9.3 Nutrition
Réf. : pages 1-4, page 3. Accent vert clair. **Segment Repas | Poids.**
- **Repas** : grande stat pill néon (calories vs objectif), 3 mini-anneaux macros (P/G/L), chips contour (filtres), liste scrollable des repas du jour (haut statique). Repas en carte **compacte** ; clic = **pop-up** (photo, nom, 1 grand cercle = part des kcal de l'objectif du jour, 3 petits cercles = part de P/G/L de l'objectif). Données : `meals`, objectifs : `profile_settings`. (Pas de saisie photo en v1 : ajout manuel nom + kcal + macros.)
- **Poids** : saisie du poids du matin (→ `weight_logs`, une par jour), poids actuel + gain depuis le début, **courbe d'évolution en escalier** (périodes 1M/3M/6M/1an). ⚠️ Voir §15 : on recommande aussi de prévoir une moyenne lissée, mais l'escalier est ce qui est demandé pour l'instant.

### 9.4 Agenda
Réf. : pages 1-4, page 4. Accent bleu.
- Liste d'événements à venir, **groupés par jour** (Aujourd'hui / Demain / date). Données : `events`.
- Ajout via le ＋ contextuel.

### 9.5 Sport
Réf. : pages 5-8, page 5. Accent rouge. **Règles métier : voir §10.**
- Séance du jour (depuis `workout_sessions` du jour, ou pré-remplie depuis le `workout_template` du jour de semaine — voir §15 pour la mécanique gabarit).
- Exos en **carte compacte**. Clic sur un exo = **pop-up de saisie** : pour chaque **série**, `reps` + `kg` ; boutons **＋/− pour ajouter/enlever une série** ; nombre de séries par défaut = celui de la dernière séance (pas l'objectif figé). Le pop-up calcule en direct le **1RM estimé (Epley)** et le **volume**. « Enregistrer » → écrit les `exercise_sets`.
- Bouton 📈 par exo → **pop-up graphique** : évolution du **1RM estimé** dans le temps (1S/1M/6M/1an) + verdict ▲ hausse / ■ stable / ▼ baisse.

### 9.6 Sommeil
Réf. : pages 5-8, page 6. Accent bleu clair.
- Heure de coucher conseillée pour ce soir (calculée depuis `sleep_targets` du jour : `réveil − durée visée`).
- Moyenne 7 j + dette de sommeil (depuis `sleep_logs`).
- Hypnogramme de la nuit (en v1, saisie manuelle simplifiée ; sélecteur des 6 dernières nuits en **gros boutons datés** cliquables).
- Temps de sommeil en **line chart** (périodes 1S/2S/1M/3M).
- Saisie manuelle d'une nuit → `sleep_logs`.

### 9.7 Business
Réf. : pages 5-8, page 7. Accent rose.
- Liste de prospects en **carte compacte** (entreprise, secteur, statut, prochaine action).
- Clic = **fiche complète** (tous les champs : entreprise, gérant, tél/mail, secteur, démo envoyée (lien), date contact, statut, prochaine action) + bouton **Modifier** → passage en mode édition au style fiche → « Enregistrer ». Données : `prospects`.

### 9.8 Devoirs & Notes
Réf. : pages 5-8, page 8. Accent crème. **Segment Devoirs | Notes** (en haut).
- **Devoirs** : cartes avec matière, chapitre, importance (Léger/Moyen/Important), **date d'échéance mise en évidence** (bloc date type calendrier, J-n, couleur d'urgence), prochaine révision. Données : `homework` (+ `subjects`).
- **Notes** : segment secondaire **Dernières notes** (toutes les notes récentes) | **Par matière** (moyenne par matière pondérée par coefficient + objectif ; clic sur une matière = **pop-up** listant ses notes avec moyenne de classe par note ; **moyenne générale** affichée en bas — moyenne simple des moyennes de matières, car coef égal entre matières). Données : `grades`, `subjects`.

---

## 10. Règles métier transverses

### Sport — progression (VALIDÉ, critique)
- Chaque série loggée = `reps` + `kg` individuels.
- **1RM estimé par série (Epley)** : `1RM = kg × (1 + reps/30)`.
- **Métrique d'évolution d'un exo = le MEILLEUR 1RM estimé de la séance** (la meilleure série). C'est ce qui trace la courbe.
- ❌ Le **nombre de séries n'entre JAMAIS** dans le calcul de progression (faire 3 séries au lieu de 4 = contrainte de temps, pas une baisse de forme).
- ❌ Le **volume total** (Σ reps×kg) n'est **pas** un juge de progression (il bouge avec le nombre de séries). On l'affiche seulement comme info de charge de travail.
- ⚠️ Epley est fiable surtout **sous ~12 reps**. Au-delà, signale visuellement que le 1RM est approximatif (les séries longues type 15+ reps).

### Notes — moyennes
- Moyenne **d'une matière** = moyenne **pondérée par `coefficient`** de ses notes (ramenées sur 20 via `out_of`).
- Moyenne **générale** = **moyenne simple** des moyennes de matières (coef égal entre matières, validé par Ethan).

### Sommeil — heure de coucher
`coucher = réveil − durée visée` (du jour, depuis `sleep_targets`). Arithmétique simple, fiable.

### Score du jour (PROVISOIRE — à isoler)
- Combine : **sommeil** (durée vs objectif + qualité) + **habitudes** (% complété). Les **pas sont exclus en v1** (pas de pont — voir §3). Ne verrouille pas la formule en dur partout.
- Implémente une **fonction pure isolée** `computeDailyScore({sleep, habits})` avec des **poids configurables en un seul endroit**, pour qu'on ajoute les pas facilement en v2 sans refactor.
- Suggestion de départ (à ajuster) : `score = 0.5 × tauxHabitudes + 0.3 × ratioDuréeSommeil(plafonné à 1) + 0.2 × qualitéSommeilNormalisée`, ramené sur 100.

---

## 11. PWA
- `manifest.json` : nom, icônes (toutes tailles iOS), `display: standalone`, couleur de thème sombre.
- Service worker : cache de l'app shell, fonctionnement hors-ligne en lecture quand possible.
- Métas iOS (`apple-mobile-web-app-capable`, etc.) pour un rendu plein écran propre une fois ajouté à l'écran d'accueil.

---

## 12. Fichiers de référence (source de vérité visuelle)
Place-les dans un dossier `/design-reference` du repo et ouvre-les pour reproduire le rendu exactement :
- `maquettes-pages-1-4.html` — Accueil, Habitudes, Nutrition, Agenda
- `maquettes-pages-5-8.html` — Sport, Sommeil, Business, Devoirs & Notes
- `onboarding.html` — l'onboarding 8 étapes
- `schema-supabase.sql` — référence du schéma (déjà en prod, ne pas ré-exécuter)

Ces maquettes contiennent le CSS, les animations et la logique JS d'interaction à reproduire. Tu peux réutiliser/adapter leur code directement.

---

## 13. Ce qu'il ne faut PAS faire
- ❌ Mettre la clé `service_role` côté client / dans le repo.
- ❌ Implémenter un quelconque pont automatique en v1 (§3).
- ❌ Stocker des métriques dérivées (1RM, moyennes, score) en base — calcule-les à la lecture.
- ❌ Utiliser le nombre de séries ou le volume comme juge de progression sport.
- ❌ Verrouiller la formule du score sur des données indisponibles (les pas).
- ❌ Des tab bars différentes selon les pages — une seule, persistante.
- ❌ Réintroduire l'ancienne typo (Instrument Serif / IBM Plex Mono) ou l'ancienne DA « Nocturne Émeraude ».
- ❌ `git push` en prod sans validation humaine explicite.
- ❌ Utiliser localStorage pour la donnée métier.

---

## 14. Ordre de construction recommandé
1. **Socle** : shell mono-page + tab bar + routeur de vues + client Supabase + **auth** (login).
2. **Habitudes** de bout en bout (le plus simple : valider le cycle saisie → Supabase → relecture → affichage).
3. **Poids** + **Nutrition** (segment Repas/Poids).
4. **Sport** (saisie séries + 1RM + graphique).
5. **Sommeil** (saisie + heure de coucher).
6. **Agenda**, **Business**, **Devoirs & Notes**.
7. **Onboarding** branché sur les vraies tables.
8. **Accueil** en dernier (il agrège tout : score, coach, tuiles) + **PWA** (manifest/SW) + install iPhone.

Construis et teste un module complet avant de passer au suivant.

---

## 15. Décisions encore ouvertes (à confirmer avec Ethan avant de coder la partie concernée)
1. **Mécanique du gabarit sport** : quand on logge un jour, l'app **pré-remplit-elle automatiquement** la séance depuis le `workout_template` du jour de semaine (proposé par défaut, le plus pratique), ou Ethan **duplique-t-il manuellement** ? Défaut recommandé : pré-remplissage auto depuis le gabarit, la séance réelle restant indépendante (modifiable sans toucher au gabarit). À confirmer.
2. **Courbe de poids** : escalier (demandé) vs moyenne mobile lissée 7 j (recommandé, standard du suivi de poids). Implémente l'escalier, mais prévois la structure pour ajouter le lissage facilement.
3. **UI de réglages** : page de réglages dédiée pour ré-éditer les objectifs (sommeil, nutrition, matières), ou édition directement dans chaque module ? À trancher.
4. **Poids du score** : valider/ajuster les poids de `computeDailyScore` une fois des vraies données saisies.
```
