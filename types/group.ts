// Types étendus pour la gestion des groupes

export interface GroupWithIcon {
  id: string;
  name: string;
  description: string | null;
  icon: string; // Nom de l'icône Ionicons
  creator_id: string;
  created_at: string;
  updated_at?: string;
}

export interface GroupMemberWithProfile {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
  profile: {
    username: string;
    firstname: string;
    lastname: string;
    declared_level: number;
    avatar_url: string | null;
  };
}

export interface GroupMessage {
  id: string;
  group_id: string;
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

export interface GroupFormData {
  name: string;
  description: string;
  icon: string;
  memberIds: string[];
}

// Liste des icônes disponibles pour les groupes
export const GROUP_ICONS = [
  'people',
  'tennisball',
  'trophy',
  'star',
  'flash',
  'rocket',
  'shield',
  'heart',
  'flame',
  'basketball',
  'football',
  'american-football',
  'baseball',
  'golf',
  'ice-cream',
  'pizza',
  'beer',
  'café',
  'game-controller',
  'headset',
] as const;

export type GroupIcon = typeof GROUP_ICONS[number];
