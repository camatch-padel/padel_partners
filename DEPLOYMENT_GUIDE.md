# Guide de Déploiement - Linkerra

## 🎯 Stratégie de Versionnement et Environnements

### Structure Git Recommandée

```
main (production)
  ↑
develop (staging)
  ↑
feature/* (développement)
```

### Branches Git

1. **main** - Code en production (stable)
2. **develop** - Code en staging (testing)
3. **feature/nom-feature** - Développement de nouvelles fonctionnalités

---

## 📦 Setup Initial

### 1. Créer la branche develop

```bash
git checkout -b develop
git push -u origin develop
```

### 2. Configuration des Environnements Supabase

Vous aurez besoin de **2 projets Supabase** :

#### Projet Staging
- URL: `https://[project-id-staging].supabase.co`
- Anon Key: `eyJhbG...staging`
- Pour les tests et validations

#### Projet Production
- URL: `https://[project-id-prod].supabase.co`
- Anon Key: `eyJhbG...prod`
- Pour les utilisateurs finaux

### 3. Créer les Fichiers de Configuration

#### `.env.development` (pour develop/staging)
```
EXPO_PUBLIC_SUPABASE_URL=https://[project-id-staging].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...staging
```

#### `.env.production` (pour main/prod)
```
EXPO_PUBLIC_SUPABASE_URL=https://[project-id-prod].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...prod
```

#### Ajouter au `.gitignore`
```
# Environment files
.env
.env.local
.env.development
.env.production
.env.*.local
```

---

## 🔄 Workflow de Développement

### Créer une nouvelle fonctionnalité

```bash
# 1. Partir de develop
git checkout develop
git pull origin develop

# 2. Créer une branche feature
git checkout -b feature/nom-de-la-feature

# 3. Développer et tester localement
# ... faire vos modifications ...

# 4. Committer régulièrement
git add .
git commit -m "feat: description de la fonctionnalité"

# 5. Pusher la branche
git push -u origin feature/nom-de-la-feature

# 6. Merger dans develop (après tests)
git checkout develop
git merge feature/nom-de-la-feature
git push origin develop

# 7. Tester en staging
# ... tests utilisateurs ...

# 8. Si OK, merger dans main
git checkout main
git merge develop
git push origin main
```

---

## 🚀 Déploiement

### 1. Build pour Staging

```bash
# Utiliser l'environnement de develop
npx expo build:android --profile development
npx expo build:ios --profile development
```

### 2. Build pour Production

```bash
# Utiliser l'environnement de production
npx expo build:android --profile production
npx expo build:ios --profile production
```

### 3. Configuration des Profils (app.json ou eas.json)

Si vous utilisez EAS Build, créer `eas.json`:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "https://[staging].supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "staging-key"
      }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "https://[prod].supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "prod-key"
      }
    }
  }
}
```

---

## 🗄️ Synchronisation Database

### Workflow Database

1. **Développement Local**
   - Tester les migrations sur staging d'abord
   - Sauvegarder toutes les migrations SQL dans `supabase/migrations/`

2. **Appliquer en Staging**
   ```sql
   -- Exécuter dans Supabase Studio (projet staging)
   -- Tester avec données de test
   ```

3. **Appliquer en Production**
   ```sql
   -- Exécuter dans Supabase Studio (projet production)
   -- TOUJOURS faire un backup avant
   ```

### Backup Production

Avant chaque déploiement majeur:
1. Aller dans Supabase Dashboard → Database → Backups
2. Créer un backup manuel
3. Attendre confirmation

---

## 📋 Checklist de Déploiement

### Avant chaque release en production

- [ ] Code mergé et testé dans develop
- [ ] Tests fonctionnels validés en staging
- [ ] Backup database production créé
- [ ] Migrations SQL testées en staging
- [ ] Variables d'environnement vérifiées
- [ ] Version incrémentée dans app.json
- [ ] Notes de release écrites
- [ ] Build production générée et testée
- [ ] Merge develop → main effectué
- [ ] Tag Git créé (ex: v1.2.0)

### Commandes Utiles

```bash
# Créer un tag pour une release
git tag -a v1.0.0 -m "Release 1.0.0 - Match creation and filtering"
git push origin v1.0.0

# Voir les différences entre branches
git diff develop main

# Annuler des changements (ATTENTION: destructif)
git reset --hard HEAD~1

# Voir l'historique
git log --oneline --graph --all
```

---

## 🔐 Sécurité

### Ne JAMAIS committer

- [ ] Fichiers `.env` avec clés réelles
- [ ] Tokens d'accès Supabase
- [ ] Mots de passe ou secrets
- [ ] Données utilisateurs réelles

### Toujours vérifier

```bash
# Avant de committer
git status
git diff

# Vérifier qu'aucun secret n'est exposé
grep -r "eyJhbG" . --exclude-dir=node_modules
```

---

## 📊 Monitoring Post-Déploiement

### Après chaque release

1. **Supabase Dashboard**
   - Vérifier les logs d'erreurs
   - Monitorer les requêtes lentes
   - Vérifier l'utilisation du stockage

2. **Tests Utilisateurs**
   - Créer une partie
   - Rejoindre une partie
   - Modifier son profil
   - Upload d'avatar

3. **Métriques**
   - Temps de chargement
   - Taux d'erreur
   - Nombre d'utilisateurs actifs

---

## 🆘 Rollback d'Urgence

Si problème critique en production:

```bash
# 1. Revenir au dernier commit stable
git checkout main
git reset --hard <commit-hash-stable>
git push --force origin main

# 2. Rebuild et redéployer
npx expo build:android --profile production

# 3. Si problème DB, restaurer le backup
# (via Supabase Dashboard → Database → Backups)
```

---

## 📞 Support

- Documentation Expo: https://docs.expo.dev
- Documentation Supabase: https://supabase.com/docs
- React Native: https://reactnative.dev

---

## 🎯 Prochaines Étapes Recommandées

1. **Maintenant**
   - Créer le projet Supabase staging
   - Configurer les fichiers .env
   - Créer la branche develop

2. **Cette semaine**
   - Tester le workflow develop → main
   - Faire un premier build de test
   - Configurer EAS Build si nécessaire

3. **À moyen terme**
   - Mettre en place CI/CD (GitHub Actions)
   - Automatiser les tests
   - Monitoring et analytics
