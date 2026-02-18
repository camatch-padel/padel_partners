export type NotificationType =
  | 'match_full'
  | 'match_player_joined'
  | 'tournament_demand_new'
  | 'tournament_demand_accepted'
  | 'tournament_demand_rejected'
  | 'group_match_new'
  | 'nearby_match_new'
  | 'group_tournament_new';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  entity_type: 'match' | 'tournament';
  entity_id: string;
  is_read: boolean;
  created_at: string;
}
