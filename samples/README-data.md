# Données Kenza — guide de référence

Ce document décrit le jeu de données réel du hackathon utilisé pour seed la
base de données de l'agent Kenza (boutique WhatsApp). Les fichiers sources
vivent dans [samples/data/](data/) et les règles métier dans
[samples/docs/](docs/).

## 1. Vue d'ensemble

| Domaine | Fichier source | Volume | Table Drizzle |
|---|---|---|---|
| Produits | `catalogue.csv` | 80 produits | `products` |
| Clients | `clients.csv` | 120 clients | `customers` |
| Commandes | `commandes.csv` | 320 commandes | `orders` |
| Lignes de commande | `commandes-lignes.csv` | 449 lignes | `order_items` |
| Livraison | `livraison.csv` | 12 villes | `delivery_zones` |
| Promotions | `promotions.csv` | 12 promotions actives | `promotions` |
| Conversations | — (générées au runtime) | 0 en base au seed | `conversations` / `messages` |

Le seed est piloté par [src/db/seed.ts](../src/db/seed.ts) via
`npm run db:seed`, qui parse les 6 CSV avec
[src/db/parsers.ts](../src/db/parsers.ts) et insère dans l'ordre :
`delivery_zones → products → customers → orders → order_items → promotions`
(cet ordre respecte les clés étrangères).

> **Note conversations** : les tables `conversations` et `messages`
> (schema.ts) ne sont **pas** alimentées par un CSV — elles se remplissent au
> fil des échanges WhatsApp gérés par le graphe LangGraph
> ([src/graph/](../src/graph/)). Il n'existe pas de `conversations.csv` dans
> `samples/data/` ; toute conversation « de démo » doit être générée en
> faisant tourner l'agent (ou insérée manuellement pour des tests).

## 2. Détail des fichiers CSV

### 2.1 `catalogue.csv` → table `products`

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `ref` | text | **PK** | Référence produit, ex. `REF-0001` |
| `modele` | text | NOT NULL | Nom du modèle, ex. « Foulard bordeaux » |
| `famille` | text | NOT NULL | Catégorie (Foulard, Sac à main, Ceinture, Veste, Robe, Caftan, Chaussures, Pantalon, Blouson…) |
| `genre` | enum | NOT NULL | `femme` \| `homme` \| `mixte` |
| `couleur` | text | NOT NULL | Couleur du variant |
| `taille` | text | NOT NULL | Taille (`unique`, `S`/`M`/`L`, pointures, tour de taille…) |
| `matiere` | text | NOT NULL | Matière (cuir, denim, laine, coton…) |
| `saison` | text | NOT NULL | `été`, `hiver`, `toute saison`… |
| `prix_mad` | integer | NOT NULL | Prix ferme en dirhams (MAD) |
| `stock` | integer | NOT NULL, défaut 0 | Quantité disponible |
| `delai_reassort_jours` | integer | nullable | Délai de réassort indicatif — **jamais promis au client** (voir règles métier §3) |
| `code_barre` | text | **UNIQUE**, NOT NULL | Code-barres |
| `poids_g` | integer | NOT NULL | Poids en grammes (utile pour la livraison) |

Une ligne = un variant (ref/taille/couleur), pas un produit générique.

### 2.2 `clients.csv` → table `customers`

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `client_id` | text | **PK** | Ex. `CLI-0001` |
| `nom` | text | NOT NULL | Nom complet |
| `telephone` | text | **UNIQUE**, NOT NULL | Format marocain `+212[5-7]XXXXXXXX` (voir `isValidMoroccanPhoneNumber`) |
| `ville` | text | NOT NULL | Ville du client |
| `langue_preferee` | enum | NOT NULL | `fr` \| `darija` \| `ar` |
| `premier_achat` | date | NOT NULL | Date du premier achat |
| `nb_commandes` | integer | NOT NULL, défaut 0 | Nombre de commandes passées |
| `segment` | enum | NOT NULL | `nouveau` \| `régulier` \| `fidèle` |

### 2.3 `commandes.csv` → table `orders`

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `commande_id` | text | **PK** | Ex. `CMD-00001` |
| `client_id` | text | **FK** → `customers.client_id` | |
| `date` | date | NOT NULL | Date de commande |
| `canal` | enum | NOT NULL | `whatsapp` \| `instagram` \| `boutique` |
| `statut` | enum | NOT NULL | `en préparation` \| `livrée` \| `annulée` \| `retournée` \| `panier abandonné` |
| `total_articles_mad` | integer | NOT NULL | Sous-total articles |
| `frais_livraison_mad` | integer | NOT NULL | Frais de port appliqués |
| `total_mad` | integer | NOT NULL | `total_articles_mad + frais_livraison_mad` |
| `ville_livraison` | text | NOT NULL | Doit exister dans `livraison.csv` |
| `paiement` | enum | NOT NULL | `à la livraison` \| `carte` \| `virement` |

### 2.4 `commandes-lignes.csv` → table `order_items`

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `id` | uuid | **PK** (généré, absent du CSV) | Ajouté car le CSV n'a pas de clé naturelle |
| `commande_id` | text | **FK** → `orders.commande_id` | |
| `ref` | text | **FK** → `products.ref` | |
| `modele` | text | NOT NULL | Dénormalisé pour lecture rapide |
| `taille` | text | NOT NULL | Taille commandée |
| `quantite` | integer | NOT NULL | Quantité |
| `prix_unitaire_mad` | integer | NOT NULL | Prix unitaire au moment de la commande (peut différer du prix catalogue actuel) |

Relation : une commande (`orders`) a plusieurs lignes (`order_items`), 1-N.

### 2.5 `livraison.csv` → table `delivery_zones`

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `ville` | text | **PK** | Ville desservie |
| `frais_mad` | integer | NOT NULL | Frais de livraison |
| `delai_heures` | integer | NOT NULL | Délai de livraison en heures |
| `paiement_a_la_livraison` | boolean | NOT NULL | `oui`/`non` → converti en booléen |
| `retrait_boutique` | boolean | NOT NULL | Retrait possible en boutique |

**12 villes couvertes** : Casablanca, Rabat, Fès, Marrakech, Tanger, Agadir,
Meknès, Oujda, Kénitra, Tétouan, Salé, Mohammedia. Toute ville hors de cette
liste **doit déclencher une escalade**, jamais une estimation (voir §3).

### 2.6 `promotions.csv` → table `promotions`

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `id` | uuid | **PK** (généré, absent du CSV) | |
| `ref` | text | **FK** → `products.ref` | |
| `modele` | text | NOT NULL | Dénormalisé |
| `prix_normal_mad` | integer | NOT NULL | Prix catalogue |
| `prix_promo_mad` | integer | NOT NULL | Prix promotionnel |
| `debut` / `fin` | date | NOT NULL | Période de validité |
| `condition` | text | nullable | Ex. « dans la limite des stocks disponibles » |

Une promotion prime sur le prix catalogue **uniquement** pendant sa période
de validité (`debut ≤ aujourd'hui ≤ fin`).

## 3. Règles métier (`samples/docs/politique-commerciale.md`)

Ces règles sont parsées et typées par
[src/db/knowledge-base.ts](../src/db/knowledge-base.ts) et injectées dans le
contexte de l'agent — elles ne sont **pas** de simples suggestions.

- **Prix fermes** : l'agent ne peut jamais annoncer un prix absent de
  `catalogue.csv`.
- **Remise maximale sans validation humaine : 10 %.** En dessous de ce
  plancher (remise plus importante demandée), escalade obligatoire vers le
  commerçant — l'agent ne négocie jamais au-delà.
- Les promotions actives (`promotions.csv`) priment sur le prix normal
  pendant leur période de validité.
- **Stock zéro = indisponible**, sans exception ; l'agent propose une
  alternative réellement en stock.
- **Aucune date de réassort n'est jamais promise**, même si
  `delai_reassort_jours` est renseigné — cette valeur reste indicative et
  relève du commerçant.
- **Livraison** : frais et délais viennent exclusivement de
  `livraison.csv`. Une ville absente de cette grille = escalade, jamais une
  estimation. Le paiement à la livraison n'est proposé que là où la grille
  l'autorise (`paiement_a_la_livraison = oui`).
- **Retours/échanges** : sous 7 jours, article non porté, étiquette en
  place. Le remboursement en espèces n'est jamais accordé directement par
  l'agent → escalade.
- **Escalade obligatoire** dans tous les cas suivants : facturation au nom
  d'une société, réclamation, litige, demande hors catalogue, ville hors
  grille de livraison, remise sous le plancher de 10 %. L'escalade doit
  transmettre le **contexte complet** de la conversation — le client ne doit
  jamais avoir à se répéter.

Voir aussi [samples/docs/faq-boutique.md](docs/faq-boutique.md) pour les
horaires (lun-sam 10h-20h), moyens de paiement, retrait boutique (Fès et
Casablanca sous 24h) et garantie fabricant (30 jours).

## 4. Exemples de requêtes SQL

Ces requêtes ciblent le schéma Postgres généré par Drizzle
([src/db/schema.ts](../src/db/schema.ts)).

**Top 5 produits les plus vendus (en quantité)**
```sql
SELECT p.ref, p.modele, SUM(oi.quantite) AS total_vendu
FROM order_items oi
JOIN products p ON p.ref = oi.ref
GROUP BY p.ref, p.modele
ORDER BY total_vendu DESC
LIMIT 5;
```

**Top 10 clients par montant total dépensé (commandes livrées uniquement)**
```sql
SELECT c.client_id, c.nom, c.segment, SUM(o.total_mad) AS total_depense
FROM orders o
JOIN customers c ON c.client_id = o.client_id
WHERE o.statut = 'livrée'
GROUP BY c.client_id, c.nom, c.segment
ORDER BY total_depense DESC
LIMIT 10;
```

**Taux de conversion global (commandes livrées / total des commandes, hors paniers abandonnés)**
```sql
SELECT
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE statut = 'livrée')
    / NULLIF(COUNT(*) FILTER (WHERE statut != 'panier abandonné'), 0),
    1
  ) AS taux_conversion_pct
FROM orders;
```

**Taux d'abandon de panier par canal**
```sql
SELECT
  canal,
  COUNT(*) FILTER (WHERE statut = 'panier abandonné') AS abandons,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE statut = 'panier abandonné') / COUNT(*), 1) AS taux_abandon_pct
FROM orders
GROUP BY canal
ORDER BY taux_abandon_pct DESC;
```

**Chiffre d'affaires par ville de livraison**
```sql
SELECT ville_livraison, SUM(total_mad) AS ca_total, COUNT(*) AS nb_commandes
FROM orders
WHERE statut = 'livrée'
GROUP BY ville_livraison
ORDER BY ca_total DESC;
```

**Produits en rupture de stock avec une promotion active**
```sql
SELECT p.ref, p.modele, p.stock, pr.prix_promo_mad
FROM products p
JOIN promotions pr ON pr.ref = p.ref
WHERE p.stock = 0
  AND CURRENT_DATE BETWEEN pr.debut AND pr.fin;
```

## 5. How-to

### Ajouter un produit

1. Ajouter une ligne dans `samples/data/catalogue.csv` avec un `ref` unique
   (ex. `REF-0081`) et un `code_barre` unique. Respecter les valeurs d'enum
   pour `genre` (`femme`/`homme`/`mixte`).
2. Si la base est déjà seedée, `db:seed` ne réinsère rien (il détecte des
   produits existants et s'arrête — voir [seed.ts](../src/db/seed.ts)). Pour
   ajouter un produit isolé, soit :
   - repartir d'une base vide et relancer `npm run db:seed`, soit
   - insérer directement via Drizzle : `db.insert(products).values({ ref: "REF-0081", ... })`,
     en respectant le schema `InsertProductSchema` (Zod) pour la validation.

### Ajouter un client

1. Ajouter une ligne dans `samples/data/clients.csv` avec un `client_id`
   unique (ex. `CLI-0121`) et un `telephone` unique au format
   `+212[5-7]XXXXXXXX` (validé par `isValidMoroccanPhoneNumber` dans
   [src/domain/eligibility.ts](../src/domain/eligibility.ts)).
2. Même remarque que ci-dessus pour le seed : insertion directe via
   `db.insert(customers).values({...})` validée par `InsertCustomerSchema`
   si la base est déjà peuplée.

### Créer une commande

1. Insérer une ligne dans `orders` avec un `commande_id` unique, un
   `client_id` existant, et une `ville_livraison` présente dans
   `delivery_zones` (sinon la contrainte métier d'escalade s'applique côté
   agent, même si la FK SQL ne la bloque pas techniquement).
2. Insérer une ou plusieurs lignes dans `order_items` référençant cette
   commande (`commande_id`) et des produits existants (`ref`), avec un
   `prix_unitaire_mad` figé au moment de la commande.
3. Vérifier la cohérence : `total_mad = total_articles_mad + frais_livraison_mad`,
   et `frais_livraison_mad` doit correspondre à `delivery_zones.frais_mad`
   pour la ville concernée.
4. Avant de valider côté agent, utiliser
   [checkStockAvailability](../src/domain/eligibility.ts) pour vérifier que
   le stock couvre les quantités demandées.
