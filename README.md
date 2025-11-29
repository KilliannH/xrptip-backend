# xrpTip Backend API

Backend API pour xrpTip - Plateforme de tips en XRP

## 🚀 Installation

### Prérequis

- Node.js (v18 ou supérieur)
- MongoDB (local ou MongoDB Atlas)
- npm ou yarn

### Étapes d'installation

1. **Installer les dépendances**

```bash
npm install
```

2. **Configuration de l'environnement**

Copier le fichier `.env.example` vers `.env` et configurer les variables :

```bash
cp .env.example .env
```

Éditer `.env` avec vos valeurs :

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/xrptip
JWT_SECRET=votre-secret-jwt-super-securise
CLIENT_URL=http://localhost:5173
```

3. **Démarrer MongoDB**

Si vous utilisez MongoDB en local :

```bash
mongod
```

Ou utilisez MongoDB Atlas (cloud) en mettant à jour `MONGODB_URI` dans `.env`

4. **Démarrer le serveur**

Mode développement (avec rechargement automatique) :

```bash
npm run dev
```

Mode production :

```bash
npm start
```

Le serveur démarrera sur `http://localhost:5000`

## 📡 Endpoints API

### Health Check

```
GET /api/health
```

### Creators

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/creators` | Liste tous les créateurs |
| GET | `/api/creators/:username` | Récupère un créateur par username |
| GET | `/api/creators/check-username/:username` | Vérifie disponibilité username |
| POST | `/api/creators` | Crée un nouveau créateur |
| PUT | `/api/creators/:username` | Met à jour un créateur |
| DELETE | `/api/creators/:username` | Supprime un créateur (soft delete) |

### Tips

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/tips` | Crée un nouveau tip |
| GET | `/api/tips/creator/:username` | Liste les tips d'un créateur |
| GET | `/api/tips/stats/:username` | Statistiques des tips |
| PUT | `/api/tips/:tipId/confirm` | Confirme un tip |

## 📝 Exemples de requêtes

### Créer un créateur

```bash
POST /api/creators
Content-Type: application/json

{
  "username": "cryptoartist",
  "displayName": "CryptoArtist",
  "bio": "Illustrateur digital & créateur de NFT sur XRPL.",
  "xrpAddress": "rN7n7otQDd6FczFgLdlqtyMVrn3HMzve9t",
  "links": {
    "twitter": "https://x.com/cryptoartist",
    "twitch": "https://twitch.tv/cryptoartist"
  }
}
```

### Récupérer un créateur

```bash
GET /api/creators/cryptoartist
```

### Créer un tip

```bash
POST /api/tips
Content-Type: application/json

{
  "creatorUsername": "cryptoartist",
  "amount": 5.0,
  "senderAddress": "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY",
  "message": "Super contenu, continue !"
}
```

### Confirmer un tip

```bash
PUT /api/tips/TIPID/confirm
Content-Type: application/json

{
  "transactionHash": "ABC123DEF456...",
  "ledgerIndex": 12345678
}
```

## 📂 Structure du projet

```
backend/
├── config/
│   └── database.js       # Configuration MongoDB
├── controllers/
│   ├── creatorController.js
│   └── tipController.js
├── models/
│   ├── Creator.js
│   └── Tip.js
├── routes/
│   ├── creators.js
│   └── tips.js
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js             # Point d'entrée
```

## 🔧 Technologies utilisées

- **Express.js** - Framework web
- **MongoDB** - Base de données NoSQL
- **Mongoose** - ODM pour MongoDB
- **express-validator** - Validation des données
- **helmet** - Sécurité HTTP headers
- **cors** - Gestion CORS
- **morgan** - Logging des requêtes
- **dotenv** - Variables d'environnement

## 🛡️ Sécurité

- Helmet pour les headers HTTP sécurisés
- Validation des entrées avec express-validator
- CORS configuré pour autoriser uniquement le frontend
- Soft delete pour les créateurs
- Validation des adresses XRP

## 🚧 TODO

- [ ] Ajouter authentification JWT
- [ ] Ajouter middleware d'autorisation
- [ ] Intégrer XRPL pour vérifier les transactions
- [ ] Ajouter rate limiting
- [ ] Ajouter tests unitaires
- [ ] Ajouter webhooks XRPL
- [ ] Ajouter système de notifications
- [ ] Ajouter upload d'avatars (S3 ou Cloudinary)

## 📄 License

MIT