# Marées France — Tide Card (FR)

Carte Home Assistant pour l'intégration **Marées France** (données SHOM), dans un style verre avec thème clair/sombre automatique, éditeur visuel et textes en français.

- Marée en cours : montante ou descendante, heure et durée avant la prochaine pleine ou basse mer, hauteur, coefficient et température de l'eau.
- Courbe de la hauteur d'eau avec curseur, marqueurs des marées, repère de l'heure actuelle et zone de faible profondeur.
- Boutons pour choisir le jour (3 à 10 jours) et liste des marées du jour avec leur coefficient.
- Onglet **Coefficients** : calendrier mensuel coloré (faible, moyenne, forte, très forte).
- Type de carte complète ou condensée.

## Prérequis
L'intégration [marees_france](https://github.com/Johan854/marees_france) doit être installée (la carte utilise ses commandes websocket).

## Installation (HACS)
1. HACS → ⋮ → *Dépôts personnalisés* → `https://github.com/Johan854/marees-tide-card`, catégorie **Tableau de bord**.
2. Installer, puis recharger le navigateur.

## Exemple
```yaml
type: custom:marees-tide-card
device_id: 2e179a69b8f419cc3d1187d70739b3f6   # appareil « Marées France » de ton port
title: ""             # facultatif
theme: auto           # auto | light | dark
card_type: full       # full | condensed
days: 7
show_temperature: true
show_min_depth: true
show_coefficients: true
```
