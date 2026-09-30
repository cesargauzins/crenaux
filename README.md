# Créneaux

Petit site pour organiser des créneaux : on choisit une plage horaire, un nombre de créneaux et un nombre de personnes par créneau, puis on partage un lien. Chacun s'inscrit sur un créneau libre avec son prénom et son nom, et le créateur voit la liste des inscrits depuis son lien de gestion.

En ligne sur **https://creneaux.sudoo.fr**

## Fonctionnement

- **`/`** : création des créneaux (titre, date, plage horaire, nombre de créneaux, personnes par créneau).
- **`/?e=<id>`** : le lien à partager. On voit les créneaux et les places restantes, mais pas les noms.
- **`/?a=<clé>`** : le lien de gestion du créateur, avec les inscrits par créneau, la possibilité de retirer quelqu'un et l'export CSV.

## Stack

- Front statique (HTML, CSS, JS, sans build) hébergé sur GitHub Pages.
- Données dans [Supabase](https://supabase.com) (Postgres). Le navigateur n'a accès à aucune table : il n'appelle que les fonctions de [`supabase/schema.sql`](supabase/schema.sql). Le nombre de places est vérifié côté serveur, sous verrou, donc un créneau ne peut pas dépasser sa capacité même si deux personnes valident en même temps.

## Installation

1. Créer un projet sur supabase.com (offre gratuite).
2. Dans **SQL Editor**, coller le contenu de `supabase/schema.sql` et cliquer sur **Run**.
3. Dans **Project Settings → API**, copier l'URL du projet et la clé publique (`anon` ou `publishable`), puis les coller dans `js/config.js`.
4. Dans GitHub, **Settings → Pages** : choisir la source *Deploy from a branch*, puis `main` / `root`. Le domaine personnalisé est lu depuis le fichier `CNAME`.
5. Chez le registrar de sudoo.fr, ajouter un enregistrement DNS `CNAME` : `creneaux` → `<utilisateur-github>.github.io`.

## En local

N'importe quel serveur statique fait l'affaire, par exemple :

```sh
npx serve .
```

Tant que `js/config.js` est vide, le site affiche un message indiquant qu'il n'est pas relié à sa base de données.
