// Types pour la recherche de partenaire de tournoi

import { Court } from './match';

export interface TournamentFormData {
  date: Date;
  timeSlot: string; // "09:00", "09:30", etc. ou '' si pas d'heure
  category: string; // P25, P50, P100, P250, P500, P1000, P2000
  eventType: string; // Mixte, Femme, Homme
  ageCategory: string; // Senior, -18ans, -14ans, -12ans, -10ans, -8ans
  minRanking: number; // 0-999999
  playerPosition: string; // Droite, Gauche, Peu importe
  clubId: string | null; // UUID du terrain
  visibility?: 'tous' | 'private';
  groupId?: string | null;
}

export interface Tournament {
  id: string;
  creator_id: string;
  date: string; // Format ISO date "YYYY-MM-DD"
  time_slot: string | null; // Format "HH:MM" ou null
  category: string;
  event_type: string;
  age_category: string;
  min_ranking: number;
  player_position: string;
  court_id: string | null;
  visibility?: 'tous' | 'private';
  group_id?: string | null;
  status: 'searching' | 'partner_found' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface TournamentWithDetails extends Tournament {
  creator: {
    id: string;
    username: string;
    firstname: string;
    lastname: string;
    declared_level: number;
    community_level: number | null;
    community_level_votes: number;
    avatar_url: string | null;
  };
  court: Court | null;
}

export interface TournamentWithDistance extends TournamentWithDetails {
  distance?: number;
  demand_count?: number;
  message_count?: number;
}

export interface TournamentDemand {
  id: string;
  tournament_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  profile: {
    username: string;
    firstname: string;
    lastname: string;
    declared_level: number;
    community_level: number | null;
    community_level_votes: number;
    avatar_url: string | null;
  };
}

export interface TournamentMessage {
  id: string;
  tournament_id: string;
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
