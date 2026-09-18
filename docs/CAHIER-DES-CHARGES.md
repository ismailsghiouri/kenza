# Cahier des charges · Sujet 02 — Kenza

**ESISA × Numeos Technology · 17 — 19 septembre 2026**
Version 1.0 · #NumeosHack26

> Transcription Markdown du PDF officiel [`CAHIER-DES-CHARGES.pdf`](./CAHIER-DES-CHARGES.pdf), fournie pour la recherche texte. Le PDF fait foi en cas de divergence.

**Kenza — L'agent commercial WhatsApp qui vend vraiment.**
Un vendeur autonome qui conseille, encaisse et relance — en darija.

---

## 01 · Contexte métier

Au Maroc, une part majeure du commerce de détail se fait par messagerie. Un e-commerçant, une boutique de prêt-à-porter ou une clinique reçoit chaque jour 150 à 300 messages : « c'est combien ? », « vous livrez à Fès ? », « je veux la même en bleu », « chhal taman ? ».

Il répond quand il peut, souvent le soir. Entre-temps, le client a acheté ailleurs. Et personne ne relance jamais un panier abandonné — non par choix, mais faute de temps.

**Utilisateur cible** : le commerçant lui-même, ou son unique employé chargé des commandes. Il n'est pas technicien. Il veut voir ses ventes augmenter sans apprendre un nouvel outil.

## 02 · Le produit à construire

Un agent commercial autonome branché sur la conversation. Il qualifie le besoin, conseille un produit, vérifie le stock, calcule la livraison, crée la commande, relance les paniers abandonnés — et transfère à l'humain quand il sort de son domaine.

Côté commerçant, un tableau de bord : conversations en cours, taux de conversion, ventes réalisées par l'agent, file d'escalade.

## 03 · Parcours utilisateur

Ces récits ne remplacent pas les exigences numérotées : ils disent pourquoi elles existent, et servent de base aux tests du jury.

### User stories

- En tant que cliente, je veux demander un prix en darija et obtenir une réponse juste, afin de commander sans changer de langue.
- En tant que client, je veux que l'agent se souvienne de ma commande précédente, afin de ne pas tout réexpliquer.
- En tant que commerçant, je veux que l'agent crée la commande en base, afin de la préparer sans ressaisie.
- En tant que commerçant, je veux être alerté quand l'agent ne sait pas répondre, afin de reprendre la main avant de perdre la vente.
- En tant que commerçant, je veux que l'agent relance les paniers abandonnés, afin de récupérer des ventes que je ne relançais jamais.

### Scénarios de test

| Scénario | Ce qui se passe | Ce que le système doit faire |
|---|---|---|
| Rupture de stock | Le client demande un produit épuisé. | L'agent l'annonce, propose une variante réellement disponible, et ne promet aucun délai de réapprovisionnement. |
| Changement d'avis | Le client valide un article puis demande une autre taille. | L'agent met à jour le panier sans repartir de zéro et recalcule la livraison. |
| Demande de remise | Le client négocie le prix. | L'agent applique au maximum la remise autorisée, jamais sous le plancher, ou escalade au commerçant. |
| Question hors domaine | Le client réclame une facture au nom de sa société. | L'agent escalade au commerçant avec le contexte, sans improviser de réponse. |

## 04 · Architecture agentique attendue

Le système doit comporter des agents distincts, avec des responsabilités séparées et une orchestration explicite. **Un unique appel au modèle qui produirait tout le résultat ne satisfait pas cette exigence.** Les noms ci-dessous sont indicatifs ; la séparation des responsabilités ne l'est pas.

| Agent | Responsabilité |
|---|---|
| Conversation | Boucle stateful avec mémoire par client. Ne redemande jamais une information déjà donnée. |
| Catalogue | Outils réels : recherche produit, stock, calcul de livraison, création de commande. |
| Relance | Décide seul qui relancer, quand, et avec quel message. Autonome et planifié. |
| Garde-fou | Interdit d'inventer un prix ou un délai hors des données du catalogue. |
| Escalade | Détecte ce qu'il ne sait pas traiter et transfère au commerçant avec le contexte. |

**À lire deux fois** — Le canal. WhatsApp Cloud API demande un compte Meta Business et peut bloquer un participant le jour J. Un simulateur de chat web est donc la voie par défaut et n'enlève aucun point — il vous est fourni dans le projet d'amorçage. Le branchement WhatsApp réel est un bonus.

## 05 · Exigences du MVP

Ces exigences sont numérotées et exigibles. Le jury les vérifie une par une, sur le jeu de données de contrôle.

| # | Exigence |
|---|---|
| EX-01 | Conversation fonctionnelle de bout en bout, du premier message jusqu'à la commande, via le simulateur web ou WhatsApp. |
| EX-02 | L'agent interroge le catalogue et le stock par des appels d'outils, jamais par des données recopiées dans le prompt. |
| EX-03 | Une commande est réellement créée en base au terme d'une conversation réussie, et visible dans le tableau de bord. |
| EX-04 | Mémoire par client : lors d'un deuxième contact, l'agent se souvient du précédent échange. |
| EX-05 | Au moins une relance automatique décidée et déclenchée par l'agent, démontrable en direct. |
| EX-06 | Escalade vers l'humain : au moins un cas déclenche un transfert explicite, avec le contexte de la conversation. |
| EX-07 | Tableau de bord commerçant : conversations, taux de conversion, commandes, file d'escalade. |
| EX-08 | L'agent comprend et répond en français, en arabe et en darija. La darija est une exigence, pas un bonus. |

### Hors périmètre

Explicitement non attendus, et non valorisés s'ils sont livrés :

- Le paiement en ligne réel — une commande enregistrée suffit.
- La gestion multi-boutiques et les rôles utilisateurs.
- L'application mobile native.
- La conformité aux politiques commerciales de Meta.

## 06 · Ce qui départage les participants

> La qualité en darija et les cas tordus : client qui change d'avis, rupture de stock, demande de remise, note vocale. Le jury testera l'agent en direct avec des messages non préparés.

Le jury testera notamment :

- Le client qui change d'avis en cours de conversation.
- Le produit en rupture : l'agent propose-t-il une alternative, ou promet-il une livraison impossible ?
- La demande de remise : l'agent négocie-t-il sans plancher ?
- Le message ambigu ou mal orthographié en darija.
- La question hors sujet : l'agent escalade-t-il, ou improvise-t-il ?

## 07 · Bonus valorisés

- Notes vocales transcrites et comprises.
- Reconnaissance d'image : « je veux ça » avec une photo.
- Négociation encadrée, avec plancher de remise infranchissable.
- A/B testing automatique des messages de relance.

## 08 · Données, stack et accès

### Données fournies

Catalogue de 80 références avec stock, 120 clients, 320 commandes historiques, grille de livraison, politique commerciale et 40 conversations en français, arabe et darija. Un jeu de contrôle non distribué est conservé par le jury.

### Stack recommandé

Un projet d'amorçage déjà câblé sur ce socle est remis le jeudi 17 septembre. Il n'est pas obligatoire, mais c'est celui que le mentorat connaît et celui sur lequel le jury sait relancer votre projet. En sortir est permis, à condition de l'assumer en soutenance.

| Couche | Technologie | Pourquoi |
|---|---|---|
| Interface | React 18 + TypeScript (Vite) | Une SPA sobre. Toute l'évaluation passe par elle : revue humaine, traçabilité, tableau de bord. |
| API et agents | Node.js 20 + TypeScript (Fastify) | Un seul langage du front aux agents. Le typage sert de contrat entre les agents. |
| Orchestration | LangGraph (@langchain/langgraph) | Le graphe rend la boucle agentique explicite : états, reprises, checkpoints. C'est ce que le jury lit en premier. |
| Base de données | PostgreSQL 16 | Source de vérité métier, et persistance des checkpoints LangGraph (checkpointer Postgres). |
| Cache et files | Redis 7 | Cache des appels LLM et OCR, état conversationnel court, file de tâches asynchrones (BullMQ). |
| Modèle | Endpoint LLM Numeos, compatible OpenAI | Une base URL et une clé par participant. Aucun code spécifique à un fournisseur. |
| Exécution | Docker Compose | Cinq services, une commande. Le jury doit pouvoir relancer votre projet sur sa machine. |

### Exécution locale

Tout tourne en local, dans Docker : un service `web` (React), un service `api` (Node et agents LangGraph), `postgres`, `redis`, et un `worker` pour les tâches de fond. Le dépôt contient un `docker-compose.yml` et un `.env.example` ; `docker compose up` doit suffire à démarrer le projet sur une machine vierge. Un projet qui ne démarre pas chez le jury est évalué sur ce qu'il montre, pas sur ce qu'il prétend.

### Ce que le sujet impose en plus

Le simulateur de chat web fourni est une page React branchée en WebSocket sur l'API. Redis porte l'état de la conversation en cours ; le checkpointer Postgres de LangGraph porte la mémoire longue par client, celle qui permet à l'agent de se souvenir d'un échange de la veille. Les relances de EX-05 sont des tâches planifiées dans une file BullMQ sur Redis, exécutées par le worker — pas un `setTimeout` dans l'API, qui disparaît au redémarrage.

### Accès et règles

- Un endpoint LLM et une clé API personnelle, fournis par Numeos. Quota suivi, aucun frais pour le participant.
- L'endpoint est compatible OpenAI : une base URL et une clé, rien d'autre à changer dans le code.
- Toute librairie ou framework public est autorisé, assistants de code compris.
- Aucun service payant n'est requis. Si vous en ajoutez un, il doit fonctionner le jour de la démonstration, à vos frais.

## 09 · Livraison et évaluation

### Ce que vous déposez

- Dépôt GitHub : code complet, README (problème, architecture, lancement), historique de commits lisible.
- **Aucune clé API en clair dans le dépôt — c'est éliminatoire.**
- Vidéo de 2 minutes : le problème en quinze secondes, puis la démonstration. Montrez l'agent qui raisonne, pas seulement le résultat.

**Deadline ferme : samedi 19 septembre 2026, 00h00.** Dernier commit et lien de la vidéo. Une minute après, c'est fermé.

### Grille d'évaluation

| Poids | Critère | Ce que le jury regarde |
|---|---|---|
| 30% | Profondeur agentique | Une vraie boucle : planifier, appeler des outils, mémoriser, réviser. Pas un wrapper de chat. |
| 25% | Produit fonctionnel | Ça tourne en direct, devant le jury, sur des cas qui n'ont pas été préparés. |
| 20% | Fiabilité et garde-fous | Traçabilité, gestion de l'échec, refus d'inventer, humain dans la boucle. |
| 15% | Qualité technique | Code lisible, architecture assumée, README utile, projet reproductible. |
| 10% | Pitch et vidéo | Deux minutes pour rendre le problème et la valeur évidents. |

## 10 · Questions fréquentes

**Le stack imposé est-il obligatoire ?**
Non, mais c'est celui du projet d'amorçage, celui que les mentors connaissent, et celui que le jury sait relancer. En changer coûte des heures que vous n'avez pas, et vous devrez le justifier.

**Pourquoi LangGraph plutôt qu'une boucle maison ?**
Parce que la profondeur agentique pèse 30% de la note et qu'un graphe la rend lisible : états, reprises sur échec, checkpoints persistés. Une boucle maison est acceptée si elle fait la même chose, explicitement.

**Faut-il vraiment Docker ?**
Oui. « Ça marche sur ma machine » ne s'évalue pas. Le jury clone, fait `docker compose up`, et teste.

**Dois-je vraiment brancher WhatsApp ?**
Non. Le simulateur web est la voie par défaut et ne coûte aucun point.

**Comment gérer la darija sans corpus ?**
Les 40 conversations fournies servent de base. La qualité de vos prompts et de vos exemples fait le reste — c'est précisément l'exercice.

**L'agent peut-il accorder une remise ?**
Seulement si vous implémentez un plancher que le modèle ne peut pas franchir. Un agent qui brade sans limite est un défaut, pas une fonctionnalité.

**Puis-je utiliser un modèle vocal externe ?**
Oui, à vos frais, et à condition que la démo fonctionne sans connexion instable.

---

Contact : hackathon@numeostechnology.com · numeostechnology.com · #NumeosHack26
