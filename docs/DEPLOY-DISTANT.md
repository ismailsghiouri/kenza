# Déploiement distant — Kenza

Guide pour déployer Kenza sur une plateforme cloud (Render ou Railway), avec
base de données PostgreSQL managée. Les deux plateformes proposent un tier
gratuit suffisant pour une démo ou un environnement de test.

Fichiers concernés :
- [`render.yaml`](../render.yaml) — Blueprint Render (Infrastructure as Code)
- [`railway.json`](../railway.json) — Config de build/déploiement Railway

---

## Option A — Render

### 1. Prérequis

- Compte [Render](https://render.com) (connexion via GitHub recommandée)
- Repo poussé sur GitHub avec `render.yaml` à la racine

### 2. Déploiement via Blueprint

1. Aller sur [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**
2. Sélectionner le repo `kenza`
3. Render détecte `render.yaml` et propose de créer :
   - `kenza-db` : base PostgreSQL (plan free, région `frankfurt`)
   - `kenza-app` : service web buildé depuis le `Dockerfile`
4. Cliquer **Apply** — le premier déploiement démarre (build + provisioning DB)

### 3. Variables d'environnement à saisir manuellement

`render.yaml` marque certaines clés `sync: false` : elles ne sont **jamais
commitées** et doivent être saisies dans le Dashboard Render après le premier
déploiement (`kenza-app` → **Environment**) :

| Variable | Obligatoire | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Oui | Clé API Claude |
| `WHATSAPP_API_TOKEN` | Selon usage | WhatsApp Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | Selon usage | |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Selon usage | |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Selon usage | À utiliser lors de la config du webhook Meta |
| `GROQ_API_KEY`, `OPENAI_API_KEY`, `TWILIO_*` | Non | Optionnel selon les fonctionnalités activées |

`DATABASE_URL` et `NEXTAUTH_SECRET` sont générés/injectés automatiquement par
le Blueprint — rien à faire.

### 4. Migrations de la base de données

Render ne lance pas `db:migrate` automatiquement. Après le premier déploiement,
depuis un shell local (avec `DATABASE_URL` pointant vers la base Render — visible
dans `kenza-db` → **Connect** → **External Database URL**) :

```bash
DATABASE_URL="<external-database-url-render>" npm run db:migrate
```

Ou via le Shell intégré du service `kenza-app` dans le Dashboard Render
(**Shell** tab) :

```bash
npm run db:migrate
```

Si vous utilisez des colonnes `vector` (pgvector), l'extension est disponible
sur les bases Render mais doit être activée une fois :

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 5. Vérification

```bash
curl https://kenza-app.onrender.com/api/health
curl https://kenza-app.onrender.com/api/readiness
```

### Limites du tier gratuit Render

- Le service web **se met en veille après 15 min d'inactivité** (le premier
  appel après veille prend ~30-50s pour redémarrer)
- La base PostgreSQL free **expire après 30 jours** (à recréer ou upgrader)
- 750h/mois gratuites au total sur les services web

---

## Option B — Railway

### 1. Prérequis

- Compte [Railway](https://railway.app)
- CLI Railway (optionnel) : `npm install -g @railway/cli`

### 2. Créer le projet et les services

Railway ne supporte pas la définition de plugins/variables dans un fichier
JSON unique (contrairement à Render) — `railway.json` ne configure que le
build/déploiement du service applicatif ; la base et les variables se
configurent dans le Dashboard ou via CLI.

**Via Dashboard :**

1. [railway.app/new](https://railway.app/new) → **Deploy from GitHub repo** → sélectionner `kenza`
2. Railway détecte `railway.json` (build Docker via `Dockerfile`, healthcheck `/api/health`)
3. Dans le même projet : **+ New** → **Database** → **Add PostgreSQL**
   (crée un service Postgres géré, plugin natif Railway)

**Via CLI (équivalent) :**

```bash
railway login
railway init
railway add --plugin postgresql
railway up
```

### 3. Variables d'environnement

Sur le service applicatif (`kenza` ou nom du repo) → **Variables** :

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}      # référence auto au plugin Postgres
NEXTAUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
NEXTAUTH_SECRET=<générer une valeur aléatoire>
ANTHROPIC_API_KEY=<votre clé>
CHECKPOINT_STORAGE=postgresql
LOG_LEVEL=info
# Optionnel selon les fonctionnalités :
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
```

`${{Postgres.DATABASE_URL}}` et `${{RAILWAY_PUBLIC_DOMAIN}}` sont des
[référence variables Railway](https://docs.railway.com/guides/variables#reference-variables) :
elles se résolvent automatiquement vers le service Postgres et le domaine
public généré par Railway.

### 4. Migrations de la base de données

Depuis la CLI, connectée au projet Railway :

```bash
railway run npm run db:migrate
```

(exécute la commande dans l'environnement Railway, avec `DATABASE_URL` injecté)

### 5. Vérification

```bash
curl https://<votre-service>.up.railway.app/api/health
curl https://<votre-service>.up.railway.app/api/readiness
```

### Limites du tier gratuit Railway

- Plan **Trial** : 5$ de crédit unique (pas de renouvellement mensuel), puis
  passage obligatoire au plan **Hobby** (5$/mois, inclut 5$ d'usage)
- Pas de mise en veille automatique comme Render — l'app reste active tant
  que le crédit n'est pas épuisé

---

## Coût estimé

| | Render (free) | Railway (Hobby) |
|---|---|---|
| Service web | Gratuit (750h/mois, veille après 15 min) | ~5$/mois (inclus dans l'abonnement) |
| PostgreSQL | Gratuit (expire après 30 jours) | Inclus dans l'usage du plan |
| Total démo/test | **0 $/mois** | **5 $/mois** après crédit d'essai |
| Recommandation | Idéal pour démo, hackathon, POC | Idéal si besoin de disponibilité continue |

Pour un usage production réel (pas de veille, DB persistante), compter :
- Render : plan **Starter** web (~7$/mois) + Postgres **Starter** (~7$/mois) ≈ 14$/mois
- Railway : plan **Hobby** (5$/mois) avec usage réel généralement 10-15$/mois

## Liens utiles

- Render Blueprint spec : https://render.com/docs/blueprint-spec
- Render PostgreSQL : https://render.com/docs/postgresql
- Render pgvector : https://render.com/docs/postgresql-extensions
- Railway config-as-code : https://docs.railway.com/guides/config-as-code
- Railway variables & references : https://docs.railway.com/guides/variables
- Railway CLI : https://docs.railway.com/guides/cli
- Guide de déploiement local (Docker) : [DEPLOY-LOCAL.md](./DEPLOY-LOCAL.md)
