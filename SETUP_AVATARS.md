# Configuration des Avatars

## Étapes à suivre dans Supabase

### 1. Exécuter la migration SQL
Dans la console SQL de Supabase, exécutez le fichier `supabase-migration-avatars.sql` :

```sql
-- Ajouter la colonne avatar_url à la table Profiles
ALTER TABLE "Profiles"
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_profiles_avatar_url ON "Profiles"(avatar_url);
```

### 2. Créer le bucket Storage

1. Dans le dashboard Supabase, allez dans **Storage**
2. Cliquez sur **Create bucket**
3. Configurez le bucket :
   - **Name**: `avatars`
   - **Public**: ✅ Cochez cette option
   - **File size limit**: 2 MB
   - **Allowed MIME types**: `image/jpeg, image/png, image/webp`

### 3. Configurer les politiques RLS du bucket

Dans l'onglet Policies du bucket `avatars`, créez ces politiques :

**Politique 1 : Permettre l'upload**
- Policy name: `Users can upload their own avatar`
- Target roles: `authenticated`
- Policy definition:
```sql
bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
```
- Allowed operation: INSERT

**Politique 2 : Permettre la lecture publique**
- Policy name: `Avatars are publicly accessible`
- Target roles: `public`
- Policy definition:
```sql
bucket_id = 'avatars'
```
- Allowed operation: SELECT

**Politique 3 : Permettre la mise à jour**
- Policy name: `Users can update their own avatar`
- Target roles: `authenticated`
- Policy definition:
```sql
bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
```
- Allowed operation: UPDATE

**Politique 4 : Permettre la suppression**
- Policy name: `Users can delete their own avatar`
- Target roles: `authenticated`
- Policy definition:
```sql
bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
```
- Allowed operation: DELETE

## Ce qui a été implémenté

✅ **Composant Avatar** (`components/Avatar.tsx`)
- Affiche la photo de profil ou les initiales
- Couleur de fond générée automatiquement selon le nom
- Taille personnalisable

✅ **Affichage dans explore.tsx**
- Avatars des participants sur chaque carte de match
- Places vides affichées avec un "?"
- Effet de superposition (avatars qui se chevauchent légèrement)

✅ **Types mis à jour**
- Interface `MatchWithDetails` inclut les champs avatar
- Chargement des profils complets des participants

## Prochaines étapes

Pour permettre l'upload de photos de profil, il faudra :

1. Ajouter un sélecteur de photo dans la page profil
2. Uploader l'image vers le bucket `avatars`
3. Mettre à jour le champ `avatar_url` dans le profil
4. Afficher l'avatar dans la page profil

Voulez-vous que j'implémente l'upload de photos maintenant ?
