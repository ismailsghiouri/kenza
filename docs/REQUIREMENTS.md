# Requirements — Hackathon Kenza (Sujet 02)

Extrait opérationnel du [cahier des charges officiel](./CAHIER-DES-CHARGES.md) ([PDF source](./CAHIER-DES-CHARGES.pdf)), à garder sous les yeux pendant le build. ESISA × Numeos Technology, #NumeosHack26.

## Exigences du MVP (EX-01 à EX-08)

Numérotées, exigibles, vérifiées une par une par le jury sur le jeu de données de contrôle.

| # | Exigence | Ce que ça implique techniquement |
|---|---|---|
| **EX-01** | Conversation fonctionnelle de bout en bout, du premier message jusqu'à la commande, via le simulateur web ou WhatsApp. | Boucle agent complète, testable en direct. |
| **EX-02** | L'agent interroge le catalogue et le stock par des appels d'outils, jamais par des données recopiées dans le prompt. | Tool calls réels vers la DB — pas de données catalogue en dur dans le system prompt. |
| **EX-03** | Une commande est réellement créée en base au terme d'une conversation réussie, et visible dans le tableau de bord. | Écriture DB effective (pas simulée) + lecture côté dashboard. |
| **EX-04** | Mémoire par client : lors d'un deuxième contact, l'agent se souvient du précédent échange. | Mémoire longue persistée (checkpointer Postgres LangGraph), indexée par client. |
| **EX-05** | Au moins une relance automatique décidée et déclenchée par l'agent, démontrable en direct. | Tâche planifiée dans une file BullMQ/Redis, exécutée par un worker — pas un `setTimeout` en mémoire. |
| **EX-06** | Escalade vers l'humain : au moins un cas déclenche un transfert explicite, avec le contexte de la conversation. | Agent "Escalade" dédié + file d'escalade visible au commerçant. |
| **EX-07** | Tableau de bord commerçant : conversations, taux de conversion, commandes, file d'escalade. | Interface React consommant l'API, données réelles. |
| **EX-08** | L'agent comprend et répond en français, en arabe et en darija. La darija est une exigence, pas un bonus. | Prompting + exemples calibrés sur les 40 conversations fournies (pas de corpus externe attendu). |

### Hors périmètre (non attendu, non valorisé)

- Paiement en ligne réel (une commande enregistrée suffit).
- Gestion multi-boutiques et rôles utilisateurs.
- Application mobile native.
- Conformité aux politiques commerciales de Meta.

### Architecture agentique attendue (condition de recevabilité)

Agents **distincts**, responsabilités séparées, orchestration explicite. Un unique appel LLM monolithique ne satisfait pas l'exigence, même s'il produit le bon résultat.

| Agent | Responsabilité |
|---|---|
| Conversation | Boucle stateful, mémoire par client, ne redemande jamais une info déjà donnée. |
| Catalogue | Outils réels : recherche produit, stock, calcul livraison, création commande. |
| Relance | Décide seul qui/quand/quoi relancer, de façon autonome et planifiée. |
| Garde-fou | Interdit d'inventer un prix ou un délai hors des données du catalogue. |
| Escalade | Détecte ce qu'il ne sait pas traiter, transfère au commerçant avec contexte. |

**Canal par défaut : simulateur de chat web** (WebSocket, fourni dans le projet d'amorçage) — ne coûte aucun point. WhatsApp Cloud API réel est un **bonus**, non requis (risque de blocage Meta le jour J).

## Grille d'évaluation

| Poids | Critère | Ce que le jury regarde |
|---|---|---|
| **30%** | Profondeur agentique | Vraie boucle : planifier, appeler des outils, mémoriser, réviser. Pas un wrapper de chat. |
| **25%** | Produit fonctionnel | Ça tourne en direct, devant le jury, sur des cas non préparés. |
| **20%** | Fiabilité et garde-fous | Traçabilité, gestion de l'échec, refus d'inventer, humain dans la boucle. |
| **15%** | Qualité technique | Code lisible, architecture assumée, README utile, projet reproductible (`docker compose up`). |
| **10%** | Pitch et vidéo | 2 minutes pour rendre le problème et la valeur évidents. |

**Ce qui départage** : qualité de la darija + cas tordus testés en direct avec messages non préparés — changement d'avis en cours de conversation, rupture de stock (alternative proposée vs délai inventé), demande de remise (négociation avec plancher), message darija ambigu/mal orthographié, question hors sujet (escalade vs improvisation).

## Stack recommandé

Non obligatoire mais attendu par défaut (projet d'amorçage fourni le 17/09, connu du mentorat et du jury). En sortir est permis à condition de l'assumer en soutenance.

| Couche | Technologie |
|---|---|
| Interface | React 18 + TypeScript (Vite) |
| API et agents | Node.js 20 + TypeScript (Fastify) |
| Orchestration | **LangGraph** (`@langchain/langgraph`) — graphe explicite : états, reprises, checkpoints |
| Base de données | **PostgreSQL 16** — source de vérité métier + checkpointer LangGraph |
| Cache et files | **Redis 7** — cache LLM/OCR, état conversationnel court, file BullMQ |
| Modèle | Endpoint LLM Numeos, compatible OpenAI (base URL + clé, aucun code fournisseur-spécifique) |
| Exécution | **Docker Compose** — 5 services (`web`, `api`, `postgres`, `redis`, `worker`), `docker compose up` doit suffire |

**Contraintes précises imposées par le sujet** (au-delà du choix de stack) :
- Redis = état conversationnel court terme.
- Checkpointer Postgres LangGraph = mémoire longue par client (EX-04).
- Relances (EX-05) = tâches planifiées BullMQ/Redis exécutées par le `worker`, jamais un `setTimeout` côté API.

## Données fournies

Catalogue 80 références (avec stock), 120 clients, 320 commandes historiques, grille de livraison, politique commerciale, 40 conversations FR/AR/darija. Un jeu de contrôle non distribué est conservé par le jury pour l'évaluation finale.

## Bonus valorisés (non requis)

- Notes vocales transcrites et comprises.
- Reconnaissance d'image (« je veux ça » + photo).
- Négociation encadrée avec plancher de remise infranchissable.
- A/B testing automatique des messages de relance.

## Livrables et deadline

- Dépôt GitHub : code complet, README (problème/architecture/lancement), historique de commits lisible.
- **Aucune clé API en clair dans le dépôt — éliminatoire.**
- Vidéo de 2 minutes : problème en 15s puis démo, montrant l'agent qui raisonne (pas seulement le résultat).

> ### ⏰ Deadline ferme : **samedi 19 septembre 2026, 00h00**
> Dernier commit et lien de la vidéo. Une minute après, c'est fermé.

---

*Source complète : [`CAHIER-DES-CHARGES.md`](./CAHIER-DES-CHARGES.md) / [`CAHIER-DES-CHARGES.pdf`](./CAHIER-DES-CHARGES.pdf). Contact organisateurs : hackathon@numeostechnology.com*
