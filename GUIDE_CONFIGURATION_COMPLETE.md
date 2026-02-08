# Guide de Configuration Complète - Avatars et Profils

## 🎯 Résumé des fonctionnalités implémentées

✅ **Composant Avatar réutilisable**
- Affiche la photo ou les initiales (prénom + nom)
- Couleur de fond automatique basée sur le nom
- Utilisé dans explore.tsx pour afficher les participants

✅ **Page Profil améliorée**
- Affichage de l'avatar avec taille 120px
- Bouton "Ajouter/Changer la photo"
- Champs Prénom et Nom ajoutés
- Design moderne avec ScrollView
- Upload d'images vers Supabase Storage

✅ **Affichage dans la recherche de parties**
- Avatars des participants sur chaque carte de match
- Places vides affichées avec "?"
- Effet de superposition visuelle

---

## 📝 Étapes de configuration dans Supabase

### 1. Exécuter les migrations SQL

Dans la console SQL de Supabase, exécutez dans l'ordre:

#### Migration 1: Ajouter les colonnes de noms
```sql
-- Ajouter firstname et lastname
ALTER TABLE "Profiles"
ADD COLUMN IF NOT EXISTS firstname TEXT,
ADD COLUMN IF NOT EXISTS lastname TEXT;
```

#### Migration 2: Ajouter la colonne avatar_url
```sql
-- Ajouter avatar_url et index
ALTER TABLE "Profiles"
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_avatar_url ON "Profiles"(avatar_url);
```

### 2. Créer le bucket Storage "avatars"

1. Dans le dashboard Supabase: **Storage** → **Create bucket**
2. Configuration:
   - **Name**: `avatars`
   - **Public**: ✅ OUI (cochez la case)
   - **File size limit**: 2 MB
   - **Allowed MIME types**: image/jpeg, image/png, image/webp

### 3. Configurer les politiques RLS du bucket

Dans l'onglet **Policies** du bucket `avatars`:

#### Politique 1: Upload (INSERT)
```sql
-- Name: Users can upload their own avatar
-- Target roles: authenticated
-- Policy definition:
bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
```

#### Politique 2: Lecture publique (SELECT)
```sql
-- Name: Avatars are publicly accessible  
-- Target roles: public
-- Policy definition:
bucket_id = 'avatars'
```

#### Politique 3: Mise à jour (UPDATE)
```sql
-- Name: Users can update their own avatar
-- Target roles: authenticated
-- Policy definition:
bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
```

#### Politique 4: Suppression (DELETE)
```sql
-- Name: Users can delete their own avatar
-- Target roles: authenticated
-- Policy definition:
bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
```

---

## 🧪 Tester l'application

### 1. Mettre à jour votre profil
1. Allez dans l'onglet **Profil**
2. Remplissez tous les champs (Prénom, Nom, Pseudo, Ville, Niveau)
3. Cliquez sur "Ajouter une photo"
4. Sélectionnez une image dans votre galerie
5. Attendez l'upload (quelques secondes)
6. Cliquez sur "Mettre à jour"

### 2. Créer une partie de test
1. Allez sur l'accueil
2. Cliquez sur "Créer une partie"
3. Remplissez les informations
4. Créez la partie

### 3. Rejoindre une partie (à implémenter)
Pour voir les avatars, il faudra:
1. Implémenter le bouton "Rejoindre" dans explore.tsx
2. Ajouter l'utilisateur à la table match_participants
3. Les avatars apparaîtront automatiquement

### 4. Vérifier l'affichage
1. Allez dans l'onglet "Chercher"
2. Vous devriez voir les parties avec:
   - Les avatars des participants inscrits
   - Les places vides avec "?"
   - L'effet de superposition

---

## 📁 Fichiers modifiés/créés

### Nouveaux fichiers
- ✅ `components/Avatar.tsx` - Composant réutilisable
- ✅ `supabase-migration-avatars.sql` - Migration avatar_url
- ✅ `supabase-add-names.sql` - Migration firstname/lastname
- ✅ `SETUP_AVATARS.md` - Guide initial
- ✅ `GUIDE_CONFIGURATION_COMPLETE.md` - Ce guide

### Fichiers modifiés
- ✅ `app/(tabs)/profile.tsx` - Upload de photo + champs noms
- ✅ `app/(tabs)/explore.tsx` - Affichage des avatars
- ✅ `types/match.ts` - Types mis à jour

### Dépendances ajoutées
- ✅ `expo-image-picker` - Sélection d'images
- ✅ `base64-arraybuffer` - Conversion pour upload

---

## 🔧 Fonctionnalités à venir (optionnel)

### 1. Implémenter le bouton "Rejoindre"
- Ajouter l'utilisateur à match_participants
- Mettre à jour le statut du match si complet
- Recharger la liste

### 2. Afficher l'avatar sur la page d'accueil
- Utiliser le composant Avatar dans l'header
- Afficher "Bonjour, [Prénom]" avec l'avatar

### 3. Notifications
- Notifier quand quelqu'un rejoint votre partie
- Notifier quand une partie est complète

---

## ❓ FAQ

**Q: Les avatars ne s'affichent pas**
R: Vérifiez que:
1. Le bucket `avatars` est bien **public**
2. Les politiques RLS sont correctement configurées
3. Les migrations SQL ont été exécutées

**Q: L'upload échoue avec une erreur 401**
R: Le bucket n'est pas public ou les politiques sont mal configurées.

**Q: Les initiales ne s'affichent pas**
R: Vérifiez que les champs `firstname` et `lastname` sont bien remplis dans le profil.

**Q: Je veux changer la taille des avatars**
R: Dans explore.tsx ligne 276, changez `size={36}` pour la taille souhaitée.

---

## 🚀 Prêt à démarrer !

Une fois toutes les étapes complétées, votre application aura:
- ✨ Des photos de profil personnalisées
- 👥 L'affichage des participants avec leurs avatars
- 🎨 Des initiales colorées quand pas de photo
- 📱 Une interface moderne et professionnelle

Bon développement ! 🎾
