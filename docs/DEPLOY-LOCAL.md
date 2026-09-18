# Déploiement local — Kenza

Guide pour lancer Kenza en local avec Docker.

## 1. Prérequis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installé et démarré
- Docker Compose v2+ (inclus avec Docker Desktop)
- Ports disponibles sur la machine :
  - `3000` (app Next.js)
  - `5433` (PostgreSQL, exposé sur l'hôte — le conteneur écoute en interne sur `5432`)

## 2. Quick Start (5 min)

```bash
git clone https://github.com/ismailsghiouri/kenza.git
cd kenza
cp .env.example .env
nano .env   # remplir au minimum ANTHROPIC_API_KEY
docker compose up --build
```

Attendre ~30 secondes que Postgres et l'app soient prêts (healthchecks), puis vérifier :

```bash
curl http://localhost:3000/api/health
```

Ouvrir ensuite [http://localhost:3000](http://localhost:3000).

> Variables minimales à renseigner dans `.env` : `ANTHROPIC_API_KEY` (obligatoire pour l'agent Claude). Les autres clés (`WHATSAPP_*`, `TWILIO_*`, etc.) sont optionnelles selon les fonctionnalités testées.

## 3. Commandes essentielles

```bash
docker compose up -d                              # Démarre en arrière-plan
docker compose down                                # Arrête les conteneurs
docker compose logs -f                             # Logs en direct
docker compose exec app npm run test:e2e            # Lance les tests E2E
docker compose exec postgres psql -U kenza -d kenza_db   # Accès direct à la DB
```

## 4. Troubleshooting

| Symptôme | Solution |
|---|---|
| `Connection refused` sur le port 3000 | L'app démarre après le healthcheck Postgres (~30s). Attendre puis réessayer. |
| `database is locked` / erreurs de connexion DB | `docker compose down && docker compose up` pour repartir sur un état propre. |
| `Permission denied` (Linux) | Lancer avec `sudo docker compose up`, ou ajouter son utilisateur au groupe `docker` (`sudo usermod -aG docker $USER`, puis relancer la session). |

## 5. Architecture

- **PostgreSQL** (image `pgvector/pgvector:pg16`) : accessible depuis l'hôte sur `localhost:5433`, et depuis le conteneur `app` sur `postgres:5432`.
- **Next.js / API** : servi sur `localhost:3000`, healthcheck sur `/api/health`.
- **Volume persistant** : `postgres_data` (données Postgres, survit aux redémarrages ; supprimé uniquement via `docker compose down -v`).
