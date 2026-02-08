# 🚀 Quick Start - Configuration Environnements

## ✅ Ce qui est déjà configuré

- ✅ Fichiers `.env.example`, `.env.development`, `.env.production` créés
- ✅ `.gitignore` mis à jour pour protéger vos clés
- ✅ `supabase.js` modifié pour utiliser les variables d'environnement
- ✅ `eas.json` créé pour les builds différents
- ✅ Code actuel sauvegardé dans Git (commit 7529582)

## 📋 Prochaines Étapes

### 1. Créer la branche develop (maintenant)

```bash
git checkout -b develop
git push -u origin develop
```

### 2. Créer le projet Supabase Production (quand vous serez prêt)

1. Aller sur https://supabase.com/dashboard
2. Créer un **nouveau projet** nommé "linkerra-production"
3. Noter l'URL et l'Anon Key
4. Mettre à jour `.env.production` avec ces valeurs

### 3. Utiliser les environnements

#### Pour développer localement (utilise staging)

```bash
# Copier .env.development vers .env
cp .env.development .env

# Lancer l'app
npm start
```

#### Pour tester en mode production localement

```bash
# Copier .env.production vers .env
cp .env.production .env

# Lancer l'app
npm start
```

### 4. Synchroniser la Database Production

Quand vous créez votre projet production, exécutez les migrations:

1. Ouvrir Supabase Dashboard du projet production
2. Aller dans SQL Editor
3. Exécuter dans l'ordre:
   - `supabase-migrations.sql`
   - `supabase-migration-avatars.sql`
   - `supabase-migration-geolocation.sql`
   - `supabase-migration-level-minmax.sql`
   - `supabase-import-all-cities.sql`
   - `supabase-add-names.sql`

4. Configurer le Storage:
   - Créer le bucket `avatars`
   - Rendre public: `avatars`
   - Copier les policies RLS depuis staging

---

## 🔄 Workflow Quotidien

### Développer une nouvelle fonctionnalité

```bash
# 1. Partir de develop
git checkout develop
git pull

# 2. Créer une branche feature
git checkout -b feature/nom-feature

# 3. Développer
# ... vos modifications ...

# 4. Committer
git add .
git commit -m "feat: description"

# 5. Pousser
git push -u origin feature/nom-feature

# 6. Merger dans develop
git checkout develop
git merge feature/nom-feature
git push

# 7. Tester en staging
npm start

# 8. Si OK, merger dans main
git checkout main
git merge develop
git push
```

---

## 🎯 Commandes Utiles

### Git

```bash
# Voir le statut
git status

# Voir les branches
git branch -a

# Changer de branche
git checkout nom-branche

# Voir l'historique
git log --oneline --graph --all

# Créer un tag de version
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0
```

### Expo

```bash
# Démarrer l'app
npm start

# Nettoyer le cache
npx expo start -c

# Build preview (internal testing)
npx eas build --platform android --profile preview

# Build production
npx eas build --platform android --profile production
```

---

## ⚠️ Important

### À NE JAMAIS faire

- ❌ Committer les fichiers `.env.development` ou `.env.production` (déjà dans .gitignore)
- ❌ Pousser directement sur `main` (toujours passer par `develop`)
- ❌ Modifier la production sans tests en staging
- ❌ Oublier de faire un backup avant migration DB production

### À TOUJOURS faire

- ✅ Tester en staging avant production
- ✅ Faire des commits réguliers avec messages clairs
- ✅ Créer un backup avant chaque migration production
- ✅ Vérifier `git status` avant chaque commit
- ✅ Pull avant push (`git pull` puis `git push`)

---

## 📞 Aide

- [Guide Complet](./DEPLOYMENT_GUIDE.md) - Toute la documentation détaillée
- [Expo Docs](https://docs.expo.dev)
- [Supabase Docs](https://supabase.com/docs)

---

## ✨ Votre Setup Actuel

```
📁 padel-partners/
├── 🔴 main (production - à créer)
├── 🟡 develop (staging - à créer)
└── 🟢 feature/* (développement)

🗄️ Supabase:
├── Projet actuel → devient STAGING
└── Nouveau projet → PRODUCTION (à créer)
```

**Prochaine action recommandée:**
```bash
git checkout -b develop
git push -u origin develop
```
