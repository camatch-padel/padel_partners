# Migrations SQL - Linkerra

## Ordre d'Exécution pour Nouveau Projet

Lors de la création d'un nouveau projet Supabase (production), exécutez les migrations dans cet ordre:

### 1. Structure de Base
```sql
-- Créer les tables principales
supabase-migrations.sql
```

### 2. Profils et Avatars
```sql
-- Ajouter colonnes avatar, firstname, lastname à profiles
supabase-migration-avatars.sql
```

### 3. Géolocalisation
```sql
-- Ajouter latitude/longitude aux courts
supabase-migration-geolocation.sql
```

### 4. Niveaux Min/Max
```sql
-- Ajouter level_min et level_max aux matches
supabase-migration-level-minmax.sql
```

### 5. Données - Villes
```sql
-- Importer toutes les villes françaises
supabase-import-all-cities.sql
```

### 6. Données - Noms
```sql
-- Ajouter des noms aux profils existants (optionnel, dev only)
supabase-add-names.sql
```

---

## Configuration Storage (Avatars)

Après les migrations, configurer le storage:

1. **Créer le bucket `avatars`**
   ```sql
   INSERT INTO storage.buckets (id, name, public)
   VALUES ('avatars', 'avatars', true);
   ```

2. **Policy: Lecture publique**
   ```sql
   CREATE POLICY "Anyone authenticated can view avatars"
   ON storage.objects
   FOR SELECT
   TO authenticated
   USING (bucket_id = 'avatars');
   ```

3. **Policy: Upload pour utilisateurs authentifiés**
   ```sql
   CREATE POLICY "Users can upload their own avatar"
   ON storage.objects
   FOR INSERT
   TO authenticated
   WITH CHECK (
     bucket_id = 'avatars' AND
     (storage.foldername(name))[1] = auth.uid()::text
   );
   ```

4. **Policy: Update pour utilisateurs authentifiés**
   ```sql
   CREATE POLICY "Users can update their own avatar"
   ON storage.objects
   FOR UPDATE
   TO authenticated
   USING (
     bucket_id = 'avatars' AND
     (storage.foldername(name))[1] = auth.uid()::text
   );
   ```

---

## Row Level Security Policies

### profiles
```sql
-- Lecture: tout le monde peut voir tous les profils
CREATE POLICY "Users can view all profiles"
ON profiles
FOR SELECT
TO authenticated
USING (true);

-- Update: seulement son propre profil
CREATE POLICY "Users can update own profile"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id);
```

### Matches
```sql
-- Lecture: matches publics ou matches privés de groupes dont on est membre
CREATE POLICY "Users can view public matches"
ON matches
FOR SELECT
TO authenticated
USING (
  visibility = 'tous' OR
  (visibility = 'private' AND group_id IN (
    SELECT group_id FROM group_members WHERE user_id = auth.uid()
  ))
);

-- Insert: tout utilisateur authentifié peut créer une partie
CREATE POLICY "Users can create matches"
ON matches
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = creator_id);

-- Update: seulement le créateur peut modifier sa partie
CREATE POLICY "Creators can update their matches"
ON matches
FOR UPDATE
TO authenticated
USING (auth.uid() = creator_id);
```

### Match Participants
```sql
-- Lecture: tout le monde peut voir les participants
CREATE POLICY "Users can view participants"
ON match_participants
FOR SELECT
TO authenticated
USING (true);

-- Insert: tout utilisateur peut rejoindre une partie
CREATE POLICY "Users can join matches"
ON match_participants
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
```

---

## Fichiers de Migration

- `supabase-migrations.sql` - Tables principales (courts, groups, matches, etc.)
- `supabase-migration-avatars.sql` - Ajout colonnes avatar aux profils
- `supabase-migration-geolocation.sql` - Ajout lat/long aux courts
- `supabase-migration-level-minmax.sql` - Ajout level_min/max aux matches
- `supabase-import-all-cities.sql` - Import des villes françaises
- `supabase-add-names.sql` - Ajout noms aux profils (dev only)
- `debug-2player-match.sql` - Requête debug pour parties 2 joueurs
- `fix-cities-unique-constraint.sql` - Fix contrainte unique sur cities

---

## Backup Avant Migration

**TOUJOURS faire un backup avant d'exécuter des migrations en production!**

1. Supabase Dashboard → Database → Backups
2. Créer un backup manuel
3. Attendre la confirmation
4. Noter l'ID du backup
5. Puis exécuter les migrations

