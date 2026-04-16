# AntiKOM Bot

Bot personnel pour annoter automatiquement tes activités **compatibles avec Strava**.

## Ce que fait le bot

À chaque scan, le bot récupère tes activités récentes et met à jour la description de l'activité avec :

- `AntiKOM : "nom du segment" à xx secondes du KOM`
- `AntiPR : "nom du segment" à xx secondes de ton PR`

## Important : limitation réelle côté API

### AntiPR
Oui, c'est faisable automatiquement avec l'API officielle.

Le bot récupère les `segment_efforts` de l'activité puis charge les segments concernés pour lire le `pr_elapsed_time` de ton profil sur chaque segment.

### AntiKOM
Pas de façon fiable et 100 % officielle via l'API publique.

La raison : l'API Strava publique ne fournit pas un accès simple et stable au temps exact du KOM actuel pour un segment arbitraire.

**Solution intégrée dans ce repo :**
- mode **AntiPR automatique**
- mode **AntiKOM manuel optionnel** via `data/manual-koms.json`

Concrètement, si tu renseignes toi-même certains temps KOM, le bot peut calculer automatiquement le pire écart AntiKOM parmi les segments de l'activité.

---

## Pourquoi cette architecture est la meilleure pour du gratuit

### Option recommandée : TrueNAS
- zéro coût d'hébergement
- stockage persistant local
- pas besoin de Render
- pas besoin de webhook public
- Docker Compose simple

Le bot utilise un **polling léger** sur tes activités récentes, ce qui suffit largement pour un usage perso.

### Option Render
Le repo contient un `render.yaml` pour test rapide, mais ce n'est **pas recommandé** pour un usage durable gratuit car le filesystem local d'une instance free n'est pas persistant.

---

## Prérequis

1. Un compte Strava
2. Une application API Strava créée dans `https://www.strava.com/settings/api`
3. GitHub
4. Un TrueNAS avec Docker / Docker Compose

---

## Variables nécessaires

Copie `.env.example` vers `.env`.

### Obligatoires
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`

### Où trouver ces infos
Dans la page de ton application Strava.

> Le bot utilise le refresh token pour renouveler automatiquement les access tokens courts.

---

## Installation sur TrueNAS

### 1. Cloner le repo
```bash
git clone <ton-repo-github>
cd antikom-bot
cp .env.example .env
```

### 2. Remplir `.env`
Exemple :
```env
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=xxxxxxxx
STRAVA_REFRESH_TOKEN=xxxxxxxx
ADMIN_TOKEN=un-secret-local
POLL_INTERVAL_MS=300000
DRY_RUN=false
ENABLE_ANTIKOM=true
ENABLE_ANTIPR=true
```

### 3. Démarrer
```bash
docker compose up -d --build
```

### 4. Vérifier
```bash
curl http://IP_DU_TRUENAS:3000/health
```

---

## Mode AntiKOM manuel

Créer un fichier :

`data/manual-koms.json`

Exemple :
```json
{
  "673683": {
    "name": "Tunnel Rd.",
    "elapsed_time": 1500
  },
  "229781": {
    "name": "Hawk Hill",
    "elapsed_time": 430
  }
}
```

Clé = `segment_id`

Valeurs :
- `name` : purement informatif
- `elapsed_time` : temps du KOM en secondes

Ensuite, si une activité contient un de ces segments, le bot cherchera celui avec le plus grand écart sur l'activité et ajoutera la ligne `AntiKOM`.

---

## Mode AntiPR automatique

Aucune configuration supplémentaire.

Le bot :
1. récupère les segments de l'activité
2. charge les segments concernés
3. lit ton `pr_elapsed_time`
4. calcule l'écart `effort - PR`
5. garde le segment au plus grand delta
6. injecte la ligne `AntiPR`

---

## Format de description

Le bot supprime les anciennes lignes commençant par `AntiKOM:` ou `AntiPR:` puis réécrit les nouvelles.

Exemple :
```text
AntiKOM : "Hawk Hill" à 48 secondes du KOM
AntiPR : "Tunnel Rd." à 31 secondes de ton PR

Sortie endurance Z2, bon vent, jambes moyennes.
```

---

## Déclenchement manuel

### Scanner les dernières activités
```bash
curl -X POST "http://IP_DU_TRUENAS:3000/admin/scan?token=TON_ADMIN_TOKEN"
```

### Forcer une activité précise
```bash
curl -X POST "http://IP_DU_TRUENAS:3000/admin/scan/123456789?token=TON_ADMIN_TOKEN"
```

---

## Endpoints

- `GET /` : page texte simple
- `GET /health` : état du service
- `POST /admin/scan` : scan manuel
- `POST /admin/scan/:activityId` : scan d'une activité

---

## Conseils pratiques

### Intervalle de scan conseillé
- `300000` ms = 5 minutes

C'est un bon compromis entre fraîcheur et consommation API.

### DRY_RUN
Au début, mets :
```env
DRY_RUN=true
```

Le bot calculera tout sans modifier les activités. Une fois validé, passe en `false`.

---

## Déploiement GitHub

```bash
git init
git add .
git commit -m "Initial AntiKOM bot"
git remote add origin <ton-repo>
git push -u origin main
```

---

## Améliorations possibles

- interface web légère pour éditer `manual-koms.json`
- blacklist de segments
- whitelist par type d'activité
- ajout d'un seuil minimum avant annotation
- formatage différent selon Ride / Run
- envoi de logs dans Discord / Telegram

---

## Structure du projet

```text
.
├── data/
│   └── manual-koms.example.json
├── src/
│   ├── config.js
│   ├── index.js
│   ├── logger.js
│   ├── logic.js
│   ├── store.js
│   └── strava.js
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
└── render.yaml
```


## Déploiement simplifié TrueNAS + GitHub Container Registry (recommandé pour débuter)

Cette méthode évite de construire l'image directement sur TrueNAS.

### Étapes
1. Pousse le projet sur GitHub.
2. Le workflow GitHub Actions `publish-ghcr.yml` construit et publie automatiquement l'image Docker sur `ghcr.io`.
3. Sur TrueNAS 24.10+ ou 25.04+, crée une app personnalisée et fais-la pointer vers l'image `ghcr.io/<ton-user-github>/antikom-bot:latest`.

### Fichiers ajoutés
- `.github/workflows/publish-ghcr.yml` : build + publication automatique sur GHCR
- `deploy/truenas-compose-ghcr.yml` : compose prêt à coller dans TrueNAS après remplacement de `TON_USER_GITHUB`
