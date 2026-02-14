# Plan : Recherche de Partenaire de Tournoi

## Contexte
L'app permet de chercher/créer des parties de padel. L'utilisateur veut ajouter une fonctionnalité similaire pour **chercher un partenaire de tournoi**. Sur la page d'accueil, une 2e ligne de blocs ("Rechercher un partenaire de tournoi" + "Créer une demande") + une section "Mes tournois". Écrans de création, recherche, détail, édition — mêmes patterns que les parties existantes.

---

## Étape 1 : Migration SQL — `supabase-migration-tournaments.sql`

3 tables :

**tournaments** : `id` (UUID PK), `creator_id` (FK Profiles), `date` (DATE), `time_slot` (TEXT nullable), `category` (TEXT: P25/P50/P100/P200/P500/P1000/P2000), `event_type` (TEXT: Mixte/Femme/Homme), `age_category` (TEXT: Senior/-18ans/-14ans/-12ans/-10ans/-8ans), `min_ranking` (INTEGER 0-999999), `player_position` (TEXT: Droite/Gauche/Peu importe), `court_id` (FK courts nullable), `status` (TEXT: searching/partner_found/cancelled, default 'searching'), `created_at`, `updated_at`

**tournament_demands** : `id` (UUID PK), `tournament_id` (FK tournaments CASCADE), `user_id` (FK Profiles), `status` (TEXT: pending/accepted/rejected, default 'pending'), `created_at`. UNIQUE(tournament_id, user_id)

**tournament_messages** : `id` (UUID PK), `tournament_id` (FK tournaments CASCADE), `user_id` (FK Profiles), `message` (TEXT), `created_at`

RLS : SELECT public pour tournaments (status='searching'), INSERT/UPDATE/DELETE propres. Demands : visibles par créateur + demandeur. Messages : visibles par créateur + utilisateurs avec demande.

---

## Étape 2 : Types — `types/tournament.ts`

Calqué sur `types/match.ts` :
- `TournamentFormData` (champs du formulaire)
- `Tournament` (record DB)
- `TournamentWithDetails` (avec creator profile + court jointé)
- `TournamentWithDistance` (avec distance calculée + demand_count + message_count)
- `TournamentDemand` (avec profil du demandeur)
- `TournamentMessage` (avec profil de l'envoyeur)

---

## Étape 3 : Constantes — `constants/tournament-constants.ts`

- `TOURNAMENT_CATEGORIES` : P25 → P2000
- `EVENT_TYPES` : Mixte, Femme, Homme
- `AGE_CATEGORIES` : Senior, -18ans, -14ans, -12ans, -10ans, -8ans
- `PLAYER_POSITIONS` : Droite, Gauche, Peu importe
- `TOURNAMENT_STEP_TITLES` : titres des 9 étapes du wizard

---

## Étape 4 : Création — `app/create-tournament.tsx`

**Pattern de** : `app/create-match.tsx` (wizard multi-étapes)

9 étapes :
0. Date (DatePicker)
1. Heure (optionnelle — grille TIME_SLOTS + bouton "Pas d'heure précise")
2. Club (liste courts cherchable)
3. Catégorie (grille boutons P25-P2000)
4. Type d'événement (3 boutons Mixte/Femme/Homme)
5. Catégorie d'âge (liste boutons)
6. Classement minimum (TextInput number-pad, 0-999999)
7. Position du joueur (3 boutons)
8. Récapitulatif + bouton soumettre

Insert dans `tournaments` avec status `searching`.

---

## Étape 5 : Recherche — `app/tournament/explore.tsx`

**Pattern de** : `app/(tabs)/explore.tsx`

- GPS via expo-location (même loadUserLocation + fallback ville)
- Filtres : distance (Slider), catégorie, type événement, âge
- Debounce 400ms sur changement de filtres
- FlatList avec cartes extensibles (Set<string> pour expandedCards)
- Carte compacte : date, catégorie, type, distance
- Carte étendue : + créateur (avatar/nom/niveau), club, âge, classement min, position, boutons Chat/Demander
- Bouton "Demander" : vérifie pas propre tournoi, pas déjà demandé → insert tournament_demands
- Distance Haversine client-side

---

## Étape 6 : Détail — `app/my-tournament/[id].tsx`

**Pattern de** : `app/my-match/[id].tsx` (onglets)

4 onglets :
1. **Détails** : infos complètes + bouton "Modifier" → `/edit-tournament/[id]`
2. **Chat** : messages temps réel (Supabase channel), même UI que match chat
3. **Demandes** (créateur seulement) : liste demandes avec Accept/Reject, profil + niveau
4. **Supprimer** (créateur seulement, si status=searching) : confirmation + delete cascade

Visibilité onglets selon rôle (créateur vs demandeur) et status.

---

## Étape 7 : Édition — `app/edit-tournament/[id].tsx`

**Pattern de** : `app/edit-match/[id].tsx`

Même wizard 9 étapes que create-tournament, mais :
- Charge données existantes au mount
- Pré-remplit tous les champs
- UPDATE au lieu d'INSERT

---

## Étape 8 : Page d'accueil — `app/(tabs)/index.tsx`

Modifications :

1. **Nouveau state** : `myTournaments` + `loadMyTournaments()`
2. **2e ligne de blocs** après les blocs parties :
   - "Rechercher un partenaire" → `/tournament/explore`
   - "Créer une demande" → `/create-tournament`
3. **Section "Mes tournois"** : ScrollView horizontal avec cartes (même style que "Mes parties") :
   - Date, catégorie, type, club, status badge, nombre de demandes
   - Tap → `/my-tournament/[id]`
4. **Charger** dans useFocusEffect

---

## Fichiers critiques à consulter pendant l'implémentation

| Fichier source (pattern) | Nouveau fichier |
|---|---|
| `app/create-match.tsx` | `app/create-tournament.tsx` |
| `app/(tabs)/explore.tsx` | `app/tournament/explore.tsx` |
| `app/my-match/[id].tsx` | `app/my-tournament/[id].tsx` |
| `app/edit-match/[id].tsx` | `app/edit-tournament/[id].tsx` |
| `types/match.ts` | `types/tournament.ts` |
| `constants/match-constants.ts` | `constants/tournament-constants.ts` |

---

## Vérification

- Créer un tournoi avec tous les champs → visible dans "Mes tournois"
- Rechercher : filtres distance/catégorie fonctionnent, cartes extensibles
- Demander un partenaire → demande visible côté créateur
- Accepter/rejeter une demande
- Chat temps réel entre créateur et demandeur
- Modifier un tournoi existant
- Supprimer un tournoi (cascade demands + messages)
- Page d'accueil : 2e ligne de blocs + section "Mes tournois" affichée
