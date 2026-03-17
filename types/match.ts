// Types pour la création et gestion des parties

export interface MatchFormData {
  date: Date;
  timeSlot: string; // "09:00", "09:30", etc.
  duration: number; // 60, 90, ou 120 (minutes)
  format: 2 | 4; // 2 ou 4 joueurs
  levelMin: number; // Niveau minimum requis (1.0 à 10.0)
  clubId: string | null; // UUID du terrain, optionnel
  visibility: 'tous' | 'private'; // Visibilité de la partie
  groupId: string | null; // UUID du groupe si visibilité private
}

export interface Match {
  id: string;
  creator_id: string;
  date: string; // Format ISO date "YYYY-MM-DD"
  time_slot: string; // Format "HH:MM"
  duration_minutes: number;
  format: 2 | 4;
  level_min: number; // Niveau minimum requis (1.0 à 10.0)
  court_id: string | null;
  visibility: 'tous' | 'private';
  group_id: string | null;
  status: 'open' | 'full' | 'cancelled' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface Court {
  id: string;
  name: string;
  city: string;
  address: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  creator_id: string;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface MatchParticipant {
  id: string;
  match_id: string;
  user_id: string;
  joined_at: string;
}

export interface ParticipantProfile {
  user_id: string;
  username: string;
  firstname: string;
  lastname: string;
  declared_level: number;
  community_level: number | null;
  avatar_url: string | null;
}

export interface MatchWithDetails extends Match {
  creator: {
    id: string;
    username: string;
    firstname: string;
    lastname: string;
    declared_level: number;
    community_level: number | null;
    avatar_url: string | null;
  };
  court: Court | null;
  group: Group | null;
  participants: ParticipantProfile[];
  participants_count: number;
}

export interface MatchRequest {
  id: string;
  match_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  profile: {
    username: string;
    firstname: string;
    lastname: string;
    declared_level: number;
    community_level: number | null;
    avatar_url: string | null;
  };
}

export interface MatchWaitlistEntry {
  id: string;
  match_id: string;
  user_id: string;
  position: number;
  created_at: string;
  profile: {
    username: string;
    firstname: string;
    lastname: string;
    declared_level: number;
    community_level: number | null;
    avatar_url: string | null;
  };
}

export interface MatchResult {
  id: string;
  match_id: string;
  team1_player1_id: string;
  team1_player1_position: 'left' | 'right' | null;
  team1_player2_id: string | null;
  team1_player2_position: 'left' | 'right' | null;
  team2_player1_id: string;
  team2_player1_position: 'left' | 'right' | null;
  team2_player2_id: string | null;
  team2_player2_position: 'left' | 'right' | null;
  sets: [number, number][];
  winner_team: 1 | 2 | null;
  created_at: string;
}

export interface MatchRating {
  id: string;
  match_id: string;
  rater_id: string;
  rated_id: string;
  rating: number;
  created_at: string;
}

export interface MatchMessage {
  id: string;
  match_id: string;
  user_id: string;
  message: string;
  created_at: string;
  sender: {
    username: string;
    firstname: string;
    lastname: string;
    avatar_url: string | null;
  };
}
