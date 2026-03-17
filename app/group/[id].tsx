import { supabase } from '@/constants/supabase';
import type { GroupWithIcon, GroupMemberWithProfile, GroupMessage } from '@/types/group';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import Avatar from '@/components/Avatar';

const { width } = Dimensions.get('window');

type Tab = 'matches' | 'tournaments' | 'chat' | 'members' | 'delete';

interface TabConfig {
  key: Tab;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  showWhen: (isCreator: boolean) => boolean;
}

const TABS: TabConfig[] = [
  { key: 'matches', icon: 'tennisball-outline', title: 'Parties', showWhen: () => true },
  { key: 'tournaments', icon: 'trophy-outline', title: 'Tournois', showWhen: () => true },
  { key: 'chat', icon: 'chatbubbles-outline', title: 'Chat', showWhen: () => true },
  { key: 'members', icon: 'people-outline', title: 'Membres', showWhen: () => true },
  { key: 'delete', icon: 'trash-outline', title: 'Supprimer', showWhen: (isCreator) => isCreator },
];

export default function GroupDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('matches');

  // État pour le groupe
  const [group, setGroup] = useState<GroupWithIcon | null>(null);
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [groupMatches, setGroupMatches] = useState<any[]>([]);
  const [groupTournaments, setGroupTournaments] = useState<any[]>([]);
  const [expandedMatchCards, setExpandedMatchCards] = useState<Set<string>>(new Set());
  const [expandedTournamentCards, setExpandedTournamentCards] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // État pour le chat
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // État pour l'ajout de membres
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const isCreator = group?.creator_id === currentUserId;

  useEffect(() => {
    loadGroupData();
    const cleanup = setupRealtimeSubscription();
    return cleanup;
  }, [id]);

  const loadGroupData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      setCurrentUserId(session.user.id);

      // Charger le groupe
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', id)
        .single();

      if (groupError) throw groupError;
      setGroup(groupData);

      await Promise.all([loadMembers(), loadGroupMatches(), loadGroupTournaments()]);
      if (activeTab === 'chat') await loadMessages();
    } catch (error) {
      console.error('Erreur chargement:', error);
      Alert.alert('Erreur', 'Impossible de charger le groupe');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('group_members')
        .select(`
          id,
          group_id,
          user_id,
          joined_at,
          profile:profiles!group_members_user_id_fkey(
            username,
            firstname,
            lastname,
            declared_level,
            avatar_url
          )
        `)
        .eq('group_id', id);

      if (error) throw error;
      setMembers(data as any || []);
    } catch (error) {
      console.error('Erreur chargement membres:', error);
    }
  };

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('group_messages')
        .select(`
          id,
          group_id,
          user_id,
          message,
          created_at,
          sender:profiles!group_messages_user_id_fkey(
            username,
            firstname,
            lastname,
            avatar_url
          )
        `)
        .eq('group_id', id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      setMessages(data as any || []);

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Erreur chargement messages:', error);
    }
  };

  const loadGroupMatches = async () => {
    try {
      const { data: matchesData, error } = await supabase
        .from('matches')
        .select(`
          id,
          date,
          time_slot,
          status,
          format,
          level_min,
          duration_minutes,
          creator:profiles!matches_creator_id_fkey(id, username, firstname, lastname, avatar_url, declared_level, community_level),
          court:courts(name, city)
        `)
        .eq('group_id', id)
        .order('date', { ascending: true });

      if (error) throw error;
      if (!matchesData || matchesData.length === 0) {
        setGroupMatches([]);
        return;
      }

      const matchIds = matchesData.map((m: any) => m.id);

      const { data: participantsData } = await supabase
        .from('match_participants')
        .select(`
          match_id,
          user_id,
          profile:profiles!match_participants_user_id_fkey(username, firstname, lastname, avatar_url, declared_level, community_level)
        `)
        .in('match_id', matchIds);

      const { data: requestsData } = await supabase
        .from('match_requests')
        .select('match_id')
        .in('match_id', matchIds)
        .eq('status', 'pending');

      const { data: waitlistData } = await supabase
        .from('match_waitlist')
        .select('match_id')
        .in('match_id', matchIds);

      const { data: messagesData } = await supabase
        .from('match_messages')
        .select('match_id')
        .in('match_id', matchIds);

      const requestCountByMatch = new Map<string, number>();
      requestsData?.forEach((r: any) => {
        requestCountByMatch.set(r.match_id, (requestCountByMatch.get(r.match_id) || 0) + 1);
      });

      const waitlistCountByMatch = new Map<string, number>();
      waitlistData?.forEach((w: any) => {
        waitlistCountByMatch.set(w.match_id, (waitlistCountByMatch.get(w.match_id) || 0) + 1);
      });

      const messageCountByMatch = new Map<string, number>();
      messagesData?.forEach((m: any) => {
        messageCountByMatch.set(m.match_id, (messageCountByMatch.get(m.match_id) || 0) + 1);
      });

      const matchesWithDetails = matchesData.map((match: any) => {
        const participants = (participantsData || [])
          .filter((p: any) => p.match_id === match.id)
          .map((p: any) => ({
            user_id: p.user_id,
            username: p.profile?.username || '',
            firstname: p.profile?.firstname || '',
            lastname: p.profile?.lastname || '',
            avatar_url: p.profile?.avatar_url || null,
            declared_level: p.profile?.declared_level || 0,
            community_level: p.profile?.community_level || null,
          }));

        return {
          ...match,
          participants,
          request_count: requestCountByMatch.get(match.id) || 0,
          waitlist_count: waitlistCountByMatch.get(match.id) || 0,
          message_count: messageCountByMatch.get(match.id) || 0,
        };
      });

      setGroupMatches(matchesWithDetails);
    } catch (error) {
      console.error('Erreur chargement parties du groupe:', error);
    }
  };

  const loadGroupTournaments = async () => {
    try {
      const { data: tournamentsData, error } = await supabase
        .from('tournaments')
        .select(`
          id,
          date,
          time_slot,
          status,
          category,
          event_type,
          age_category,
          min_ranking,
          player_position,
          creator:profiles!tournaments_creator_id_fkey(id, username, firstname, lastname, avatar_url, declared_level, community_level),
          court:courts(name, city)
        `)
        .eq('group_id', id)
        .order('date', { ascending: true });

      if (error) throw error;
      if (!tournamentsData || tournamentsData.length === 0) {
        setGroupTournaments([]);
        return;
      }

      const tournamentIds = tournamentsData.map((t: any) => t.id);

      const { data: demandsData } = await supabase
        .from('tournament_demands')
        .select('tournament_id')
        .in('tournament_id', tournamentIds)
        .eq('status', 'pending');

      const { data: messagesData } = await supabase
        .from('tournament_messages')
        .select('tournament_id')
        .in('tournament_id', tournamentIds);

      const demandCountByTournament = new Map<string, number>();
      demandsData?.forEach((d: any) => {
        demandCountByTournament.set(d.tournament_id, (demandCountByTournament.get(d.tournament_id) || 0) + 1);
      });

      const messageCountByTournament = new Map<string, number>();
      messagesData?.forEach((m: any) => {
        messageCountByTournament.set(m.tournament_id, (messageCountByTournament.get(m.tournament_id) || 0) + 1);
      });

      setGroupTournaments(
        tournamentsData.map((tournament: any) => ({
          ...tournament,
          demand_count: demandCountByTournament.get(tournament.id) || 0,
          message_count: messageCountByTournament.get(tournament.id) || 0,
        }))
      );
    } catch (error) {
      console.error('Erreur chargement tournois du groupe:', error);
    }
  };

  const setupRealtimeSubscription = () => {
    // S'abonner aux nouveaux messages
    const channel = supabase
      .channel(`group-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${id}`,
        },
        async (payload) => {
          // Charger le message avec les infos du profil
          const { data, error } = await supabase
            .from('group_messages')
            .select(`
              id,
              group_id,
              user_id,
              message,
              created_at,
              sender:profiles!group_messages_user_id_fkey(
                username,
                firstname,
                lastname,
                avatar_url
              )
            `)
            .eq('id', payload.new.id)
            .single();

          if (data && !error) {
            // Vérifier que le message n'existe pas déjà (éviter les doublons)
            setMessages((prev) => {
              const exists = prev.some(msg => msg.id === data.id);
              if (exists) return prev;
              return [...prev, data as any];
            });

            // Scroll to bottom
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sendingMessage) return;

    const messageText = newMessage.trim();
    setSendingMessage(true);
    setNewMessage(''); // Vider l'input immédiatement

    try {
      const { data, error } = await supabase
        .from('group_messages')
        .insert({
          group_id: id,
          user_id: currentUserId,
          message: messageText,
        })
        .select(`
          id,
          group_id,
          user_id,
          message,
          created_at,
          sender:profiles!group_messages_user_id_fkey(
            username,
            firstname,
            lastname,
            avatar_url
          )
        `)
        .single();

      if (error) throw error;

      // Le message sera ajouté automatiquement par la subscription temps réel
      // Mais on peut aussi l'ajouter immédiatement pour une meilleure UX
      if (data) {
        setMessages((prev) => [...prev, data as any]);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible d\'envoyer le message');
      setNewMessage(messageText); // Restaurer le message en cas d'erreur
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSearchPlayers = async (query: string) => {
    setSearchQuery(query);

    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const memberIds = members.map(m => m.user_id);

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, firstname, lastname, declared_level, avatar_url')
        .or(`username.ilike.%${query}%,firstname.ilike.%${query}%,lastname.ilike.%${query}%`)
        .not('id', 'in', `(${memberIds.join(',')})`)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Erreur recherche:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleAddMember = async (playerId: string) => {
    try {
      const { error } = await supabase
        .from('group_members')
        .insert({
          group_id: id,
          user_id: playerId,
        });

      if (error) throw error;

      await loadMembers();
      setSearchQuery('');
      setSearchResults([]);
      setShowAddMember(false);
      Alert.alert('Succès', 'Membre ajouté au groupe');
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible d\'ajouter le membre');
    }
  };

  const handleRemoveMember = async (memberId: string, userId: string) => {
    // Ne pas permettre au créateur de se retirer lui-même
    if (userId === group?.creator_id) {
      Alert.alert('Erreur', 'Le créateur ne peut pas quitter le groupe');
      return;
    }

    Alert.alert(
      'Confirmation',
      'Voulez-vous vraiment retirer ce membre du groupe ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('group_members')
                .delete()
                .eq('id', memberId);

              if (error) throw error;

              await loadMembers();
              Alert.alert('Succès', 'Membre retiré du groupe');
            } catch (error: any) {
              Alert.alert('Erreur', 'Impossible de retirer le membre');
            }
          },
        },
      ]
    );
  };

  const handleDeleteGroup = async () => {
    if (!group || !isCreator) return;

    Alert.alert(
      'Supprimer le groupe',
      'Cette action est définitive. Voulez-vous supprimer ce groupe privé ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('groups')
                .delete()
                .eq('id', id);

              if (error) throw error;
              Alert.alert('Succès', 'Groupe supprimé', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (error: any) {
              Alert.alert('Erreur', error.message || 'Impossible de supprimer le groupe');
            }
          },
        },
      ]
    );
  };

  const renderMatchesTab = () => (
    <View style={styles.tabContent}>
      {groupMatches.length === 0 ? (
        <Text style={styles.emptyStateText}>Aucune partie dans ce groupe privé.</Text>
      ) : (
        <ScrollView style={styles.membersList} showsVerticalScrollIndicator={false}>
          {groupMatches.map((item) => {
            const otherParticipants = (item.participants || []).filter((p: any) => p.user_id !== item.creator?.id);
            const spotsLeft = (item.format || 0) - 1 - otherParticipants.length;
            const isExpanded = expandedMatchCards.has(item.id);

            return (
              <Pressable
                key={item.id}
                style={styles.groupMatchCard}
                onPress={() => {
                  setExpandedMatchCards((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  });
                }}
              >
                <View style={styles.groupMatchHeader}>
                  <View style={styles.groupMatchDateContainer}>
                    <Text style={styles.groupMatchDate}>{new Date(item.date).toLocaleDateString('fr-FR')}</Text>
                    <Text style={styles.groupMatchTime}>{(item.time_slot || '').slice(0, 5)}</Text>
                  </View>
                  <View style={styles.groupMatchSpotsContainer}>
                    <Text style={styles.groupMatchSpotsLabel}>Places restantes</Text>
                    <Text style={[styles.groupMatchSpots, spotsLeft <= 0 && styles.groupMatchSpotsFull]}>
                      {Math.max(0, spotsLeft)}/{item.format}
                    </Text>
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#D4AF37" />
                </View>

                {isExpanded && (
                  <>
                    <View style={styles.groupMatchInfo}>
                      <View style={styles.groupMatchInfoRow}>
                        <Ionicons name="location" size={18} color="#D4AF37" style={styles.groupMatchInfoIcon} />
                        <Text style={styles.groupMatchInfoText}>
                          {item.court ? `${item.court.name} - ${item.court.city}` : 'Lieu non spécifié'}
                        </Text>
                      </View>

                      <View style={styles.groupMatchInfoRow}>
                        <Ionicons name="star" size={18} color="#D4AF37" style={styles.groupMatchInfoIcon} />
                        <Text style={styles.groupMatchInfoText}>
                          Niveau mini {Number(item.level_min || 0).toFixed(1)}
                        </Text>
                      </View>

                      <View style={styles.groupMatchInfoRow}>
                        <Ionicons name="time" size={18} color="#D4AF37" style={styles.groupMatchInfoIcon} />
                        <Text style={styles.groupMatchInfoText}>
                          {item.duration_minutes || 90} min · {item.format} joueurs
                        </Text>
                      </View>

                      <View style={styles.groupMatchInfoRow}>
                        <Ionicons name="person" size={18} color="#D4AF37" style={styles.groupMatchInfoIcon} />
                        <Text style={styles.groupMatchInfoText}>
                          Organisé par {item.creator?.username || 'Utilisateur'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.groupParticipantsSection}>
                      <Text style={styles.groupParticipantsLabel}>
                        Participants ({1 + otherParticipants.length}/{item.format})
                      </Text>
                      <View style={styles.groupParticipantsAvatars}>
                        <View style={styles.groupAvatarWithInfo}>
                          <Avatar
                            imageUrl={item.creator?.avatar_url}
                            firstName={item.creator?.firstname || 'U'}
                            lastName={item.creator?.lastname || 'ser'}
                            size={60}
                          />
                          <Text style={styles.groupAvatarName} numberOfLines={1}>
                            {item.creator?.firstname || 'Créateur'}
                          </Text>
                        </View>

                        {otherParticipants.map((participant: any) => (
                          <View key={participant.user_id} style={styles.groupAvatarWithInfo}>
                            <Avatar
                              imageUrl={participant.avatar_url}
                              firstName={participant.firstname || 'U'}
                              lastName={participant.lastname || 'ser'}
                              size={60}
                            />
                            <Text style={styles.groupAvatarName} numberOfLines={1}>
                              {participant.firstname || 'Joueur'}
                            </Text>
                          </View>
                        ))}

                        {Array.from({ length: Math.max(0, spotsLeft) }).map((_, index) => (
                          <View key={`empty-${item.id}-${index}`} style={styles.groupAvatarWithInfo}>
                            <View style={styles.groupEmptyAvatar}>
                              <Text style={styles.groupEmptyAvatarText}>?</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>

                    <View style={styles.groupMatchFooter}>
                      <View style={styles.groupFooterBadges}>
                        <Pressable
                          style={styles.groupChatButton}
                          onPress={() => router.push(`/match/${item.id}` as any)}
                        >
                          <Ionicons
                            name={(item.message_count || 0) > 0 ? 'chatbubbles' : 'chatbubbles-outline'}
                            size={20}
                            color="#D4AF37"
                          />
                        </Pressable>

                        {(item.request_count || 0) > 0 && (
                          <View style={styles.groupBadgeButton}>
                            <Ionicons name="hand-left" size={16} color="#D4AF37" />
                            <Text style={styles.groupBadgeCount}>{item.request_count}</Text>
                            <Text style={styles.groupBadgeLabel}>Demandes</Text>
                          </View>
                        )}

                        {(item.waitlist_count || 0) > 0 && (
                          <View style={styles.groupBadgeButton}>
                            <Ionicons name="hourglass" size={16} color="#D4AF37" />
                            <Text style={styles.groupBadgeCount}>{item.waitlist_count}</Text>
                            <Text style={styles.groupBadgeLabel}>File</Text>
                          </View>
                        )}
                      </View>

                      <Pressable
                        style={styles.groupJoinButton}
                        onPress={() => router.push(`/match/${item.id}` as any)}
                      >
                        <Text style={styles.groupJoinButtonText}>Voir</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const renderTournamentsTab = () => (
    <View style={styles.tabContent}>
      {groupTournaments.length === 0 ? (
        <Text style={styles.emptyStateText}>Aucun tournoi dans ce groupe privé.</Text>
      ) : (
        <ScrollView style={styles.membersList} showsVerticalScrollIndicator={false}>
          {groupTournaments.map((item) => {
            const isExpanded = expandedTournamentCards.has(item.id);
            return (
              <Pressable
                key={item.id}
                style={styles.groupTournamentCard}
                onPress={() => {
                  setExpandedTournamentCards((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  });
                }}
              >
                <View style={styles.groupTournamentHeader}>
                  <View style={styles.groupTournamentDateContainer}>
                    <Text style={styles.groupTournamentDate}>{new Date(item.date).toLocaleDateString('fr-FR')}</Text>
                    <Text style={styles.groupTournamentTime}>{(item.time_slot || '').slice(0, 5) || 'Heure libre'}</Text>
                  </View>
                  <View style={styles.groupTournamentBadges}>
                    <View style={styles.groupTournamentCategoryBadge}>
                      <Text style={styles.groupTournamentCategoryBadgeText}>{item.category}</Text>
                    </View>
                    <View style={styles.groupTournamentEventBadge}>
                      <Text style={styles.groupTournamentEventBadgeText}>{item.event_type}</Text>
                    </View>
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#D4AF37" />
                </View>

                {isExpanded && (
                  <>
                    <View style={styles.groupTournamentInfo}>
                      <View style={styles.groupTournamentCreatorSection}>
                        <View style={styles.groupAvatarWithInfo}>
                          <Avatar
                            imageUrl={item.creator?.avatar_url}
                            firstName={item.creator?.firstname || 'U'}
                            lastName={item.creator?.lastname || 'ser'}
                            size={60}
                          />
                          <Text style={styles.groupAvatarName} numberOfLines={1}>
                            {item.creator?.firstname || 'Créateur'}
                          </Text>
                        </View>
                        <View style={styles.groupTournamentCreatorDetails}>
                          <Text style={styles.groupTournamentCreatorName}>
                            {item.creator?.firstname} {item.creator?.lastname}
                          </Text>
                          <Text style={styles.groupTournamentCreatorUsername}>
                            @{item.creator?.username}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.groupTournamentInfoRow}>
                        <Ionicons name="location" size={18} color="#D4AF37" style={styles.groupTournamentInfoIcon} />
                        <Text style={styles.groupTournamentInfoText}>
                          {item.court ? `${item.court.name} - ${item.court.city}` : 'Lieu non spécifié'}
                        </Text>
                      </View>
                      <View style={styles.groupTournamentInfoRow}>
                        <Ionicons name="person" size={18} color="#D4AF37" style={styles.groupTournamentInfoIcon} />
                        <Text style={styles.groupTournamentInfoText}>Âge : {item.age_category}</Text>
                      </View>
                      <View style={styles.groupTournamentInfoRow}>
                        <Ionicons name="podium" size={18} color="#D4AF37" style={styles.groupTournamentInfoIcon} />
                        <Text style={styles.groupTournamentInfoText}>Classement min. : {item.min_ranking}</Text>
                      </View>
                      <View style={styles.groupTournamentInfoRow}>
                        <Ionicons name="swap-horizontal" size={18} color="#D4AF37" style={styles.groupTournamentInfoIcon} />
                        <Text style={styles.groupTournamentInfoText}>Côté : {item.player_position || 'Peu importe'}</Text>
                      </View>
                    </View>

                    <View style={styles.groupTournamentFooter}>
                      <View style={styles.groupFooterBadges}>
                        <Pressable
                          style={styles.groupChatButton}
                          onPress={(event) => {
                            event.stopPropagation();
                            router.push(`/my-tournament/${item.id}?tab=chat` as any);
                          }}
                        >
                          <Ionicons
                            name={(item.message_count || 0) > 0 ? 'chatbubbles' : 'chatbubbles-outline'}
                            size={20}
                            color="#D4AF37"
                          />
                        </Pressable>
                        {(item.demand_count || 0) > 0 && (
                          <View style={styles.groupBadgeButton}>
                            <Ionicons name="hand-left" size={16} color="#D4AF37" />
                            <Text style={styles.groupBadgeCount}>{item.demand_count}</Text>
                            <Text style={styles.groupBadgeLabel}>Demandes</Text>
                          </View>
                        )}
                      </View>
                      <Pressable
                        style={styles.groupJoinButton}
                        onPress={() => router.push(`/my-tournament/${item.id}` as any)}
                      >
                        <Text style={styles.groupJoinButtonText}>Voir</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const renderDeleteTab = () => (
    <View style={[styles.tabContent, styles.deleteTab]}>
      <Ionicons name="trash" size={54} color="#FF4444" />
      <Text style={styles.deleteTitle}>Supprimer ce groupe</Text>
      <Text style={styles.deleteMessage}>
        Le groupe, ses membres et le chat seront supprimés.
      </Text>
      <Pressable style={styles.deleteButton} onPress={handleDeleteGroup}>
        <Ionicons name="trash" size={18} color="#FFFFFF" />
        <Text style={styles.deleteButtonText}>Supprimer le groupe</Text>
      </Pressable>
    </View>
  );

  const renderMembersTab = () => (
    <View style={styles.tabContent}>
      {/* Bouton ajouter membre */}
      {group?.creator_id === currentUserId && (
        <Pressable
          style={styles.addMemberButton}
          onPress={() => setShowAddMember(!showAddMember)}
        >
          <Ionicons name="person-add" size={20} color="#000000" style={{ marginRight: 8 }} />
          <Text style={styles.addMemberButtonText}>Ajouter un membre</Text>
        </Pressable>
      )}

      {/* Interface d'ajout de membre */}
      {showAddMember && (
        <View style={styles.addMemberSection}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#D4AF37" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Chercher un joueur..."
              placeholderTextColor="#666666"
              value={searchQuery}
              onChangeText={handleSearchPlayers}
            />
            {searching && <ActivityIndicator size="small" color="#D4AF37" />}
          </View>

          {searchResults.length > 0 && (
            <View style={styles.searchResults}>
              {searchResults.map((player) => (
                <Pressable
                  key={player.id}
                  style={styles.searchResultItem}
                  onPress={() => handleAddMember(player.id)}
                >
                  <Avatar
                    imageUrl={player.avatar_url}
                    firstName={player.firstname}
                    lastName={player.lastname}
                    size={40}
                  />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>
                      {player.firstname} {player.lastname}
                    </Text>
                    <Text style={styles.playerDetails}>
                      @{player.username} · Niv. {player.declared_level.toFixed(1)}
                    </Text>
                  </View>
                  <Ionicons name="add-circle" size={24} color="#D4AF37" />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Liste des membres */}
      <ScrollView style={styles.membersList} showsVerticalScrollIndicator={false}>
        {members.map((member) => (
          <View key={member.id} style={styles.memberItem}>
            <Avatar
              imageUrl={member.profile?.avatar_url}
              firstName={member.profile?.firstname || 'U'}
              lastName={member.profile?.lastname || 'ser'}
              size={56}
            />
            <View style={styles.memberInfo}>
              <View style={styles.memberNameRow}>
                <Text style={styles.memberName}>
                  {member.profile?.firstname} {member.profile?.lastname}
                </Text>
                {member.user_id === group?.creator_id && (
                  <View style={styles.creatorBadge}>
                    <Ionicons name="star" size={12} color="#000000" />
                    <Text style={styles.creatorBadgeText}>Créateur</Text>
                  </View>
                )}
              </View>
              <Text style={styles.memberDetails}>
                @{member.profile?.username}
              </Text>
              <Text style={styles.memberLevel}>
                Niveau {member.profile?.declared_level.toFixed(1)}
              </Text>
            </View>

            {/* Bouton retirer (seulement pour le créateur et pas sur lui-même) */}
            {group?.creator_id === currentUserId && member.user_id !== group.creator_id && (
              <Pressable onPress={() => handleRemoveMember(member.id, member.user_id)}>
                <Ionicons name="close-circle" size={24} color="#FF4444" />
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );

  const renderChatTab = () => (
    <KeyboardAvoidingView
      style={styles.chatContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        renderItem={({ item }) => {
          const isOwnMessage = item.user_id === currentUserId;

          return (
            <View style={[
              styles.messageItem,
              isOwnMessage && styles.ownMessageItem
            ]}>
              {!isOwnMessage && (
                <Avatar
                  imageUrl={item.sender?.avatar_url}
                  firstName={item.sender?.firstname || 'U'}
                  lastName={item.sender?.lastname || 'ser'}
                  size={32}
                />
              )}
              <View style={[
                styles.messageBubble,
                isOwnMessage && styles.ownMessageBubble
              ]}>
                {!isOwnMessage && (
                  <Text style={styles.messageSender}>
                    {item.sender?.firstname} {item.sender?.lastname}
                  </Text>
                )}
                <Text style={[
                  styles.messageText,
                  isOwnMessage && styles.ownMessageText
                ]}>
                  {item.message}
                </Text>
                <Text style={[
                  styles.messageTime,
                  isOwnMessage && styles.ownMessageTime
                ]}>
                  {new Date(item.created_at).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </Text>
              </View>
            </View>
          );
        }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Input de message */}
      <View style={styles.messageInput}>
        <TextInput
          style={styles.messageTextInput}
          placeholder="Écrire un message..."
          placeholderTextColor="#666666"
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={500}
        />
        <Pressable
          style={[
            styles.sendButton,
            (!newMessage.trim() || sendingMessage) && styles.sendButtonDisabled
          ]}
          onPress={handleSendMessage}
          disabled={!newMessage.trim() || sendingMessage}
        >
          {sendingMessage ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <Ionicons name="send" size={20} color="#000000" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#D4AF37" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Ionicons name={group?.icon as any || 'people'} size={24} color="#D4AF37" />
          <Text style={styles.headerTitle}>{group?.name}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.filter((tab) => tab.showWhen(!!isCreator)).map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
            onPress={() => {
              setActiveTab(tab.key);
              if (tab.key === 'members') loadMembers();
              if (tab.key === 'chat') loadMessages();
              if (tab.key === 'matches') loadGroupMatches();
              if (tab.key === 'tournaments') loadGroupTournaments();
            }}
          >
            <Ionicons
              name={tab.icon}
              size={22}
              color={activeTab === tab.key ? '#000000' : tab.key === 'delete' ? '#FF4444' : '#D4AF37'}
            />
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'matches' && renderMatchesTab()}
      {activeTab === 'tournaments' && renderTournamentsTab()}
      {activeTab === 'members' && renderMembersTab()}
      {activeTab === 'chat' && renderChatTab()}
      {activeTab === 'delete' && renderDeleteTab()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#D4AF37',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
  },
  tabItemActive: {
    backgroundColor: '#D4AF37',
  },
  tabContent: {
    flex: 1,
    padding: 20,
  },
  addMemberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D4AF37',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  addMemberButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  addMemberSection: {
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  searchResults: {
    marginTop: 8,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 8,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
  },
  playerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  playerDetails: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  membersList: {
    flex: 1,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  memberName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  creatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  creatorBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000000',
  },
  memberDetails: {
    fontSize: 14,
    color: '#AAAAAA',
    marginBottom: 4,
  },
  memberLevel: {
    fontSize: 14,
    color: '#D4AF37',
    fontWeight: '600',
  },
  // Chat styles
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 20,
  },
  messageItem: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  ownMessageItem: {
    flexDirection: 'row-reverse',
  },
  messageBubble: {
    maxWidth: '75%',
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 12,
  },
  ownMessageBubble: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  messageSender: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D4AF37',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  ownMessageText: {
    color: '#000000',
  },
  messageTime: {
    fontSize: 12,
    color: '#AAAAAA',
  },
  ownMessageTime: {
    color: 'rgba(0, 0, 0, 0.6)',
  },
  messageInput: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#D4AF37',
    gap: 12,
  },
  messageTextInput: {
    flex: 1,
    backgroundColor: '#000000',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    backgroundColor: '#D4AF37',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#666666',
  },
  emptyStateText: {
    fontSize: 15,
    color: '#AAAAAA',
    textAlign: 'center',
    marginTop: 20,
  },
  groupMatchCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  groupMatchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  groupMatchDateContainer: {
    flex: 1,
  },
  groupMatchDate: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  groupMatchTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
  },
  groupMatchSpotsContainer: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  groupMatchSpotsLabel: {
    fontSize: 12,
    color: '#AAAAAA',
    marginBottom: 4,
  },
  groupMatchSpots: {
    fontSize: 24,
    fontWeight: '700',
    color: '#D4AF37',
  },
  groupMatchSpotsFull: {
    color: '#FF4444',
  },
  groupMatchInfo: {
    marginBottom: 16,
  },
  groupMatchInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupMatchInfoIcon: {
    marginRight: 8,
    width: 24,
  },
  groupMatchInfoText: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
  groupParticipantsSection: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#D4AF37',
  },
  groupParticipantsLabel: {
    fontSize: 12,
    color: '#AAAAAA',
    marginBottom: 10,
  },
  groupParticipantsAvatars: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
  },
  groupAvatarWithInfo: {
    alignItems: 'center',
    gap: 2,
    width: 70,
  },
  groupAvatarName: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  groupEmptyAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(212, 175, 55,0.1)',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupEmptyAvatarText: {
    fontSize: 20,
    color: '#D4AF37',
    fontWeight: '600',
  },
  groupMatchFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupFooterBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupBadgeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  groupBadgeCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D4AF37',
  },
  groupBadgeLabel: {
    fontSize: 10,
    color: '#AAAAAA',
  },
  groupChatButton: {
    width: 44,
    height: 44,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupJoinButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  groupJoinButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  groupTournamentCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  groupTournamentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupTournamentDateContainer: {
    flex: 1,
  },
  groupTournamentDate: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  groupTournamentTime: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  groupTournamentBadges: {
    flexDirection: 'row',
    gap: 8,
    marginRight: 8,
  },
  groupTournamentCategoryBadge: {
    backgroundColor: '#D4AF37',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  groupTournamentCategoryBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  groupTournamentEventBadge: {
    backgroundColor: 'rgba(212, 175, 55,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  groupTournamentEventBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D4AF37',
  },
  groupTournamentInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#D4AF37',
  },
  groupTournamentCreatorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 175, 55,0.3)',
  },
  groupTournamentCreatorDetails: {
    flex: 1,
  },
  groupTournamentCreatorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  groupTournamentCreatorUsername: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  groupTournamentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupTournamentInfoIcon: {
    marginRight: 8,
    width: 24,
  },
  groupTournamentInfoText: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
  groupTournamentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#D4AF37',
  },
  itemCard: {
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 10,
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  itemStatus: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D4AF37',
  },
  statusCompleted: {
    color: '#D4AF37',
  },
  itemMeta: {
    fontSize: 13,
    color: '#AAAAAA',
    marginTop: 2,
  },
  deleteTab: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  deleteTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FF4444',
    marginTop: 6,
  },
  deleteMessage: {
    fontSize: 15,
    color: '#AAAAAA',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 14,
    paddingHorizontal: 18,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FF4444',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});


