# Guide de Déploiement — GPT "Créer ma Micro-Entreprise"

## Architecture

```
┌─────────────────────┐     API calls      ┌──────────────────────┐
│   ChatGPT (GPT)     │ ──────────────────► │   Backend Express    │
│   GPT Store         │ ◄────────────────── │   (ton serveur)      │
│                     │                     │                      │
│  - Instructions     │                     │  - /api/dossier      │
│  - Knowledge file   │                     │  - /api/document     │
│  - Actions (OpenAPI)│                     │  - /api/payment      │
│  - Conversation     │                     │  - /api/inpi         │
│    starters         │                     │  - /api/naf          │
└─────────────────────┘                     └──────────┬───────────┘
                                                       │
                                            ┌──────────┼───────────┐
                                            │          │           │
                                         Stripe     INPI       Claude
                                        (paiement) (guichet)   (Vision)
```

## Étape 1 — Déployer le Backend API

### Prérequis
- Node.js 18+
- Un serveur avec HTTPS (Railway, Render, Fly.io, VPS...)
- Comptes : Stripe, INPI (guichet unique), Anthropic

### Installation

```bash
cd chatgpt-micro-entreprise

# Installer les dépendances
npm install

# Copier et remplir le fichier d'environnement
cp .env.example .env
# Éditer .env avec vos clés API

# Initialiser la base de données
npx prisma db push
npx prisma generate

# Lancer en développement
npm run dev

# OU builder et lancer en production
npm run build
npm start
```

### Variables d'environnement à configurer

| Variable | Description | Où la trouver |
|---|---|---|
| `GPT_API_KEY` | Clé API pour sécuriser les appels du GPT | Générer vous-même (UUID ou clé aléatoire) |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe | dashboard.stripe.com → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Secret du webhook Stripe | dashboard.stripe.com → Developers → Webhooks |
| `INPI_USERNAME` | Identifiant INPI | procedures.inpi.fr → Créer un compte |
| `INPI_PASSWORD` | Mot de passe INPI | idem |
| `ANTHROPIC_API_KEY` | Clé API Anthropic | console.anthropic.com → API Keys |
| `APP_URL` | URL publique de votre serveur | Votre domaine HTTPS |

### Déploiement recommandé : Railway

```bash
# Installer Railway CLI
npm install -g @railway/cli

# Login et initialiser
railway login
railway init

# Ajouter les variables d'environnement
railway variables set GPT_API_KEY=your-key
railway variables set STRIPE_SECRET_KEY=sk_live_xxx
# ... etc

# Déployer
railway up
```

### Configurer le Webhook Stripe

1. Aller sur dashboard.stripe.com → Developers → Webhooks
2. Ajouter un endpoint : `https://votre-domaine.com/webhook/stripe`
3. Sélectionner l'événement : `checkout.session.completed`
4. Copier le Webhook Secret dans votre `.env`

## Étape 2 — Créer le Custom GPT sur ChatGPT

### 2.1 Accéder au créateur de GPT

1. Aller sur https://chatgpt.com
2. Cliquer sur **"Explore GPTs"** (menu de gauche)
3. Cliquer sur **"Create"** (en haut à droite)

### 2.2 Onglet "Create" — Configuration de base

- **Name** : `Créer ma Micro-Entreprise`
- **Description** : `Je vous guide pas à pas dans la création de votre micro-entreprise (auto-entrepreneur) en France. De A à Z : choix de l'activité, documents, paiement, soumission INPI.`
- **Instructions** : Copier-coller le contenu du fichier `gpt-instructions.md`

### 2.3 Conversation starters

Ajouter ces suggestions :
1. `Je veux créer ma micro-entreprise`
2. `Quelles sont les étapes pour devenir auto-entrepreneur ?`
3. `Je veux vérifier le statut de mon dossier`
4. `Quels documents dois-je préparer ?`

### 2.4 Knowledge (fichiers de connaissances)

Uploader le fichier :
- `knowledge/guide-micro-entreprise.md`

### 2.5 Capabilities

- [x] Web Browsing — **NON** (pas nécessaire)
- [x] DALL·E Image Generation — **NON**
- [x] Code Interpreter — **NON**

### 2.6 Actions — LA PARTIE IMPORTANTE

1. Cliquer sur **"Create new action"**
2. **Authentication** :
   - Type : **API Key**
   - Auth Type : **Bearer**
   - API Key : coller votre `GPT_API_KEY` (la même que dans votre `.env`)
3. **Schema** :
   - Copier-coller le contenu du fichier `openapi.json`
   - **IMPORTANT** : Remplacer `https://YOUR-DOMAIN.com` par l'URL réelle de votre serveur
4. **Privacy policy** : Ajouter l'URL de votre politique de confidentialité

### 2.7 Paramètres additionnels

- **Use conversation data in your GPT to improve our models** : Désactiver (données sensibles)

## Étape 3 — Tester

### 3.1 Test en mode preview

1. Dans l'éditeur de GPT, cliquer sur **"Preview"**
2. Tester le parcours complet :
   - "Je veux créer ma micro-entreprise"
   - Fournir les informations d'identité
   - Décrire l'activité
   - Tester la recherche de code NAF
   - Vérifier le récapitulatif
3. Vérifier que les actions s'exécutent correctement (vous verrez les appels API)

### 3.2 Tests à effectuer

- [ ] Sauvegarder un dossier complet (toutes les étapes)
- [ ] Recherche de code NAF fonctionne
- [ ] Upload et validation de documents
- [ ] Création du lien de paiement Stripe
- [ ] Vérification du statut de paiement
- [ ] Récapitulatif du dossier

## Étape 4 — Publier sur le GPT Store

### 4.1 Prérequis GPT Store

- Compte ChatGPT Plus ou Team
- Profil Builder configuré (nom + site web vérifié)
- Politique de confidentialité publiée

### 4.2 Publication

1. Dans l'éditeur, cliquer **"Save"**
2. Choisir **"Everyone"** pour publier sur le Store
3. Sélectionner la catégorie : **"Business"** ou **"Productivity"**
4. Ajouter des tags : `micro-entreprise, auto-entrepreneur, création entreprise, France, INPI`
5. Publier !

### 4.3 Politique de confidentialité

Vous devez héberger une page de politique de confidentialité. Voici un template minimal :

```
Politique de confidentialité — Créer ma Micro-Entreprise

Données collectées :
- Informations d'identité (nom, prénom, date de naissance)
- Informations professionnelles (activité, adresse)
- Documents d'identité et justificatifs

Utilisation :
- Création de votre micro-entreprise auprès de l'INPI
- Validation des documents par IA
- Traitement du paiement via Stripe

Conservation :
- Les données sont conservées pendant la durée de traitement du dossier
- Les documents sont supprimés 30 jours après la création effective

Contact : votre-email@domaine.com
```

## Structure du projet

```
chatgpt-micro-entreprise/
├── openapi.json              ← Schéma OpenAPI pour les GPT Actions
├── gpt-instructions.md       ← Instructions du GPT (system prompt)
├── knowledge/
│   └── guide-micro-entreprise.md  ← Fichier de connaissances
├── prisma/
│   └── schema.prisma         ← Schéma base de données
├── src/
│   ├── index.ts              ← Serveur Express principal
│   ├── config.ts             ← Configuration env vars
│   ├── middleware/
│   │   └── auth.ts           ← Authentification API Key
│   ├── routes/
│   │   ├── dossier.routes.ts ← CRUD dossiers
│   │   ├── document.routes.ts ← Upload/validation documents
│   │   ├── payment.routes.ts ← Paiement Stripe
│   │   ├── inpi.routes.ts    ← Soumission INPI
│   │   ├── naf.routes.ts     ← Recherche codes NAF
│   │   └── stripe.webhook.ts ← Webhook Stripe
│   └── services/
│       ├── inpi.service.ts        ← Intégration INPI
│       ├── stripe.service.ts      ← Intégration Stripe
│       └── document-ai.service.ts ← Validation IA documents
├── package.json
├── tsconfig.json
├── .env.example
└── SETUP.md                  ← Ce fichier
```

## FAQ

### Le GPT peut-il recevoir des fichiers (documents) ?

Oui ! Quand un utilisateur uploade un fichier dans ChatGPT, le GPT reçoit une URL temporaire. L'action `validateDocument` télécharge le fichier depuis cette URL et le valide avec Claude Vision.

### Comment fonctionne l'authentification ?

Le GPT envoie votre `GPT_API_KEY` dans le header `Authorization: Bearer <key>` à chaque appel. Le middleware `auth.ts` vérifie cette clé.

### Est-ce que ça marche avec ChatGPT gratuit ?

Non, les Custom GPTs avec Actions nécessitent **ChatGPT Plus** (20$/mois) ou **ChatGPT Team**.

### Comment changer le prix ?

Modifiez `STRIPE_PRICE_CENTS` dans votre `.env`. Par défaut : `6900` (= 69 €).

### Comment passer en production INPI ?

Changez `INPI_ENV=production` dans votre `.env`. Utilisez d'abord `INPI_ENV=demo` pour tester.
