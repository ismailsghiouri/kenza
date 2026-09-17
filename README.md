# Kenza

Kenza est un agent e-commerce WhatsApp propulsé par Claude (Anthropic) et LangGraph. Il reçoit les messages WhatsApp d'un client via un webhook, raisonne sur le catalogue produit stocké en base Postgres (Drizzle ORM), puis répond directement sur WhatsApp.

## Stack

- **Next.js 15** (App Router) — serveur HTTP et webhook
- **Anthropic Claude** — moteur de raisonnement conversationnel
- **LangGraph** — orchestration de l'agent
- **Drizzle ORM + Postgres** — catalogue produits, clients, commandes, conversations
- **Vitest** — tests unitaires, d'intégration et e2e
- **Docker / docker-compose** — environnement local (app + Postgres)

## Structure

```
src/
  agent/       Graphe LangGraph et outils de l'agent
  app/         Routes Next.js (dont le webhook WhatsApp)
  db/          Schéma Drizzle, client et script de seed
  lib/         Clients Claude et WhatsApp
  types/       Types partagés
tests/
  unit/        Tests unitaires
  integration/ Tests d'intégration (DB, etc.)
  e2e/         Tests bout en bout
drizzle/       Migrations générées par drizzle-kit
samples/       Données d'exemple (produits, payload webhook)
```

## Démarrage

```bash
cp .env.example .env
npm install
docker-compose up -d postgres
npm run db:push
npm run db:seed
npm run dev
```

## Scripts

| Commande | Description |
| --- | --- |
| `npm run dev` | Démarre le serveur de développement |
| `npm run build` / `npm start` | Build et lancement en production |
| `npm run typecheck` | Vérification TypeScript |
| `npm run db:generate` / `db:migrate` / `db:push` | Gestion des migrations Drizzle |
| `npm run db:seed` | Seed du catalogue produit |
| `npm run test` | Lance les tests unit + integration + e2e |

## Docker

```bash
docker-compose up --build
```

## Webhook WhatsApp

Le endpoint `GET/POST /api/whatsapp/webhook` gère la vérification du webhook (Meta) et le traitement des messages entrants, en s'appuyant sur `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_API_TOKEN` et `WHATSAPP_PHONE_NUMBER_ID` définis dans `.env`.
