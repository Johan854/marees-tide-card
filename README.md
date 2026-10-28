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

## Apparence : nuance de couleur

Dans l'éditeur visuel, à côté du thème :

| Option | Valeurs |
|---|---|
| `nuance` | `theme` (par défaut), `braise`, `ocean`, `lagon`, `foret`, `lavande`, `framboise`, `ambre`, `ardoise`, `perso` |
| `nuance_perso` | Couleur au choix (sélecteur de couleur), utilisée avec `nuance: perso` |
| `intensite` | De `0` (neutre) à `2` (très coloré), `1` par défaut |

La nuance teinte le dégradé de fond (et la couleur d'accent quand la carte en a une). Les couleurs d'état (vert, orange, rouge…) ne changent pas.

**Une seule nuance pour toutes les cartes Johan854** : laisse `nuance: theme` et ajoute à ton thème Home Assistant :

```yaml
carte-nuance: "#2f8fd8"
```

Sans cette ligne, `nuance: theme` garde les couleurs d'origine de la carte.

## Historique des versions

- **1.1.0** : nuance de couleur au choix (8 nuances, couleur personnalisée, intensité, ou nuance commune via `carte-nuance` dans le thème).
