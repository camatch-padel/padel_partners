# Migrations SQL - CaMatch

## Nouveau projet Supabase (production)

Exécuter **uniquement** ce fichier dans le SQL Editor :

```
PRODUCTION-COMPLETE.sql
```

Contient l'intégralité du schéma final : tables, RLS, fonctions, triggers, realtime, courts de seed.

---

## Patcher une base existante

Si la base existe déjà (dev), appliquer ces fichiers dans l'ordre :

| Fichier | Description |
|---|---|
| `supabase-migration-cleanup-unused.sql` | Supprime colonnes/tables obsolètes (match_ratings, community_level_votes, match_played) |
| `supabase-migration-remove-level-max.sql` | Supprime la colonne level_max des matches |
| `supabase-migration-fix-handle-new-user.sql` | Corrige le trigger handle_new_user (search_path) |
| `supabase-migration-fix-profiles-capital-p.sql` | Corrige les fonctions qui référençaient "Profiles" (P majuscule) |
| `supabase-migration-fix-notification-functions-profiles.sql` | Corrige les fonctions de notification |
| `supabase-migration-match-level-system.sql` | Système de niveaux (apply_match_level_deltas) |
| `supabase-migration-match-ratings-privacy.sql` | Paramètres de confidentialité des notes |
| `supabase-migration-group-message-notification.sql` | Notifications pour messages de groupe |

---

## Configuration Storage (Avatars)

Après la migration, configurer le bucket dans le Dashboard :

1. Storage → New bucket → `avatars` → Public
2. Les policies RLS sont déjà incluses dans PRODUCTION-COMPLETE.sql

---

## Backup avant migration

**Toujours faire un backup avant d'exécuter des migrations en production !**

1. Supabase Dashboard → Database → Backups → Create backup
2. Attendre la confirmation avant d'exécuter les migrations
