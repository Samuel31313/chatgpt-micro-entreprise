# API Agents — Création de micro-entreprise (5 €)

Permet à un agent (IA ou partenaire) **relié à un compte LegalPlace** de créer une
micro-entreprise par API. Chaque création coûte **5 €** (configurable via
`AGENT_PRICE_CENTS`), payés par Stripe. Une fois le paiement confirmé, l'instance
micro-entreprise est créée sur LegalPlace, **sur le compte LegalPlace de l'agent**.

## Flux

```
Agent ── POST /api/agent/micro-entreprise ──► commande "pending_payment" + payment_url (5 €)
      ── paiement Stripe ──► webhook checkout.session.completed ──► "paid" ──► création LegalPlace
      ── GET /api/agent/micro-entreprise/{id} ──► "created" + legalplace_uniqid + legalplace_url
```

Statuts : `pending_payment` → `paid` → `creating` → `created`
(ou `failed` si LegalPlace échoue — relançable sans repayer ; `expired` si le lien Stripe expire).

Le `GET` d'une commande revérifie le paiement auprès de Stripe : le flux fonctionne même si
le webhook arrive en retard.

## 1. Enregistrer un agent (admin)

Authentification : `Authorization: Bearer <ADMIN_API_KEY>`

```bash
curl -X POST https://VOTRE-DOMAINE/api/admin/agents \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"name": "Mon agent", "legalplace_email": "compte@legalplace-client.fr"}'
```

La réponse contient `api_key` (`lpa_...`) — **affichée une seule fois** (seul son hash est stocké).

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/api/admin/agents` | Créer un agent (`name`, `legalplace_email`) |
| `GET` | `/api/admin/agents` | Lister les agents |
| `POST` | `/api/admin/agents/{agentId}/rotate-key` | Nouvelle clé (l'ancienne est invalidée) |
| `DELETE` | `/api/admin/agents/{agentId}` | Révoquer l'agent |

## 2. Créer une micro-entreprise (agent)

Authentification : `Authorization: Bearer lpa_...`

```bash
curl -X POST https://VOTRE-DOMAINE/api/agent/micro-entreprise \
  -H "Authorization: Bearer $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jean",
    "last_name": "Dupont",
    "email": "jean.dupont@example.com",
    "activity": "Développement de sites web",
    "activity_type": "liberal",
    "date_of_birth": "1990-05-12",
    "address": "10 rue de la Paix, 75002 Paris",
    "acre": true
  }'
```

Champs requis : `first_name`, `last_name`, `email`, `activity`.
Optionnels : `phone`, `date_of_birth` (YYYY-MM-DD), `place_of_birth`, `nationality`, `address`,
`activity_type` (`commercial` | `artisanal` | `liberal`), `naf_code`, `commercial_name`,
`acre` (bool), `versement_liberatoire` (bool).

Réponse `201` :

```json
{
  "success": true,
  "order_id": "cm...",
  "status": "pending_payment",
  "amount": "5.00 €",
  "payment_url": "https://checkout.stripe.com/c/pay/..."
}
```

L'agent (ou son utilisateur) règle les 5 € via `payment_url`.

## 3. Suivre la commande

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/agent/me` | Agent + compte LegalPlace rattaché + prix |
| `GET` | `/api/agent/micro-entreprise` | Liste des commandes de l'agent |
| `GET` | `/api/agent/micro-entreprise/{orderId}` | Statut (vérifie le paiement, déclenche la création) |
| `POST` | `/api/agent/micro-entreprise/{orderId}/retry` | Relance une création `failed` (sans repayer) |

Quand `status = "created"` : `legalplace_uniqid` et `legalplace_url` pointent vers le dossier
micro-entreprise sur LegalPlace.

## Configuration

```
ADMIN_API_KEY=...        # protège /api/admin/agents
AGENT_PRICE_CENTS=500    # 5 €
```

Le webhook Stripe existant (`/webhook/stripe`, événement `checkout.session.completed`) gère
aussi les commandes agents — aucune configuration supplémentaire.

## Limite connue

Les informations du créateur sont transmises à LegalPlace dans les `metadata` de l'instance
(`creator`), et stockées dans la commande. Le pré-remplissage des champs du questionnaire
LegalPlace (`ovc`) nécessite les identifiants de champs du wizard LegalPlace, non documentés ici.
