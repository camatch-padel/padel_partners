import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/constants/supabase';
import type { MatchWithDetails, MatchRequest, MatchWaitlistEntry, MatchResult, MatchMessage } from '@/types/match';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  ImageBackground,
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
const COURT_WIDTH = width - 40;
const COURT_HEIGHT = Math.round((width - 40) / 2);

type Tab = 'edit' | 'chat' | 'requests' | 'waitlist' | 'results' | 'rating' | 'delete';

interface TabConfig {
  key: Tab;
  icon: string;
  title: string;
  showWhen: (status: string, isCreator: boolean) => boolean;
}

const getRequiredPlayers = (format: unknown): number => {
  if (format === 4 || format === '4' || format === '2v2') return 4;
  return 2;
};

// === SYSTÈME DE NIVEAU ESTIMÉ ===
// Seuil de différence de poids considéré comme "même niveau"
const WEIGHT_EQUALITY_THRESHOLD = 1.0;

/**
 * Calcule le delta de niveau estimé :
 * Gagné vs plus fort (+0.3) | égal (+0.1) | plus faible (0)
 * Perdu vs plus fort (0)    | égal (-0.1) | plus faible (-0.3)
 */
const calculateLevelDelta = (myWeight: number, opponentWeight: number, won: boolean): number => {
  const diff = opponentWeight - myWeight; // positif = adversaire plus fort
  if (won) {
    if (diff > WEIGHT_EQUALITY_THRESHOLD) return 0.3;
    if (diff >= -WEIGHT_EQUALITY_THRESHOLD) return 0.1;
    return 0;
  } else {
    if (diff > WEIGHT_EQUALITY_THRESHOLD) return 0;
    if (diff >= -WEIGHT_EQUALITY_THRESHOLD) return -0.1;
    return -0.3;
  }
};

const TABS: TabConfig[] = [
  { key: 'edit', icon: 'create-outline', title: 'Éditer la partie', showWhen: () => true },
  { key: 'chat', icon: 'chatbubbles-outline', title: 'Chat', showWhen: () => true },
  { key: 'requests', icon: 'notifications-outline', title: 'Mes demandes', showWhen: (s) => s !== 'completed' },
  { key: 'waitlist', icon: 'people-outline', title: "Liste d'attente", showWhen: (s) => s !== 'completed' },
  { key: 'results', icon: 'trophy-outline', title: 'Résultat', showWhen: (s) => s === 'completed' },
  { key: 'rating', icon: 'star-outline', title: 'Notation', showWhen: (s) => s === 'completed' },
  { key: 'delete', icon: 'trash-outline', title: 'Supprimer', showWhen: (s, c) => s !== 'completed' && c },
];

export default function MyMatchDetailScreen() {
  const { backgroundImage } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('edit');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [match, setMatch] = useState<MatchWithDetails | null>(null);

  // Onglet Demandes
  const [requests, setRequests] = useState<MatchRequest[]>([]);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);

  // Onglet Waitlist
  const [waitlist, setWaitlist] = useState<MatchWaitlistEntry[]>([]);

  // Onglet Résultats
  const [result, setResult] = useState<MatchResult | null>(null);
  const [resultStep, setResultStep] = useState<'placement' | 'score'>('placement');
  const [teamPlacements, setTeamPlacements] = useState<{
    team1: { player1: string | null; player1Pos: 'left' | 'right' | null; player2: string | null; player2Pos: 'left' | 'right' | null };
    team2: { player1: string | null; player1Pos: 'left' | 'right' | null; player2: string | null; player2Pos: 'left' | 'right' | null };
  }>({
    team1: { player1: null, player1Pos: null, player2: null, player2Pos: null },
    team2: { player1: null, player1Pos: null, player2: null, player2Pos: null },
  });
  const [sets, setSets] = useState<[number, number][]>([[0, 0]]);
  const [savingResult, setSavingResult] = useState(false);

  // Onglet Chat
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Sélection de zone pour placement joueurs (compatible web)
  const [selectingZone, setSelectingZone] = useState<string | null>(null);

  const isCreator = match?.creator_id === currentUserId;
  const isCompleted = match?.status === 'completed';

  useEffect(() => {
    loadData();
  }, [id]);

  // Charger le brouillon de placement depuis AsyncStorage
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(`@placement_draft_${id}`).then((raw) => {
      if (!raw) return;
      try {
        const draft = JSON.parse(raw);
        if (draft.teamPlacements) setTeamPlacements(draft.teamPlacements);
        if (draft.resultStep) setResultStep(draft.resultStep);
        if (draft.sets) setSets(draft.sets);
      } catch {}
    });
  }, [id]);

  // Sauvegarder le brouillon de placement dans AsyncStorage à chaque changement
  useEffect(() => {
    if (!id) return;
    AsyncStorage.setItem(
      `@placement_draft_${id}`,
      JSON.stringify({ teamPlacements, resultStep, sets })
    );
  }, [id, teamPlacements, resultStep, sets]);

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setCurrentUserId(session.user.id);

      // Charger le match avec détails
      const { data: matchData, error } = await supabase
        .from('matches')
        .select(`
          *,
          creator:profiles!matches_creator_id_fkey(id, username, firstname, lastname, declared_level, community_level, community_level_votes, avatar_url),
          court:courts(id, name, city, address)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      // Gérer les parties passées : supprimer si non complète, compléter si pleine
      if (matchData && (matchData.status === 'open' || matchData.status === 'full')) {
        const now = new Date();
        const dateStr = (matchData.date || '').split('T')[0];
        const timeStr = matchData.time_slot.length === 5 ? `${matchData.time_slot}:00` : matchData.time_slot;
        const matchEnd = new Date(`${dateStr}T${timeStr}`);
        matchEnd.setMinutes(matchEnd.getMinutes() + (matchData.duration_minutes || 90));
        if (!isNaN(matchEnd.getTime()) && now > matchEnd) {
          const { count } = await supabase
            .from('match_participants')
            .select('*', { count: 'exact', head: true })
            .eq('match_id', id);

          const requiredPlayers = getRequiredPlayers(matchData.format);
          const currentPlayers = count || 0;

          if (currentPlayers < requiredPlayers) {
            await supabase.from('matches').delete().eq('id', id);
            router.back();
            return;
          }

          await supabase.from('matches').update({ status: 'completed' }).eq('id', id);
          matchData.status = 'completed';
        }
      }

      // Charger les participants
      const { data: participantsData } = await supabase
        .from('match_participants')
        .select(`
          user_id,
          profile:profiles!match_participants_user_id_fkey(username, firstname, lastname, declared_level, community_level, community_level_votes, avatar_url)
        `)
        .eq('match_id', id);

      const participants = participantsData?.map((p: any) => ({
        user_id: p.user_id,
        username: p.profile?.username || '',
        firstname: p.profile?.firstname || '',
        lastname: p.profile?.lastname || '',
        declared_level: p.profile?.declared_level || 0,
        community_level: p.profile?.community_level || null,
        community_level_votes: p.profile?.community_level_votes || 0,
        avatar_url: p.profile?.avatar_url || null,
      })) || [];

      if (matchData && matchData.status !== 'completed') {
        const requiredPlayers = getRequiredPlayers(matchData.format);
        const normalizedStatus = participants.length >= requiredPlayers ? 'full' : 'open';
        if (matchData.status !== normalizedStatus) {
          await supabase.from('matches').update({ status: normalizedStatus }).eq('id', id);
          matchData.status = normalizedStatus as any;
        }
      }

      setMatch({
        ...matchData,
        participants,
        participants_count: participants.length,
        group: null,
      });

      // Charger les données additionnelles
      await Promise.all([
        loadRequests(),
        loadWaitlist(),
        loadResult(),
        loadMessages(),
      ]);
    } catch (error) {
      console.error('Erreur:', error);
      Alert.alert('Erreur', 'Impossible de charger la partie');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    const { data } = await supabase
      .from('match_requests')
      .select(`
        id, match_id, user_id, status, created_at,
        profile:profiles!match_requests_user_id_fkey(username, firstname, lastname, declared_level, community_level, community_level_votes, avatar_url)
      `)
      .eq('match_id', id)
      .order('created_at', { ascending: true });
    setRequests((data as any) || []);
  };

  const loadWaitlist = async () => {
    const { data } = await supabase
      .from('match_waitlist')
      .select(`
        id, match_id, user_id, position, created_at,
        profile:profiles!match_waitlist_user_id_fkey(username, firstname, lastname, declared_level, community_level, avatar_url)
      `)
      .eq('match_id', id)
      .order('position', { ascending: true });
    setWaitlist((data as any) || []);
  };

  const loadResult = async () => {
    const { data } = await supabase
      .from('match_results')
      .select('*')
      .eq('match_id', id)
      .single();
    if (data) {
      setResult(data);
      setSets(data.sets || [[0, 0]]);
      // Restaurer les placements depuis le résultat enregistré
      setTeamPlacements({
        team1: {
          player1: data.team1_player1_id || null,
          player1Pos: data.team1_player1_position || null,
          player2: data.team1_player2_id || null,
          player2Pos: data.team1_player2_position || null,
        },
        team2: {
          player1: data.team2_player1_id || null,
          player1Pos: data.team2_player1_position || null,
          player2: data.team2_player2_id || null,
          player2Pos: data.team2_player2_position || null,
        },
      });
    }
  };

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('match_messages')
        .select(`
          id, match_id, user_id, message, created_at,
          sender:profiles!match_messages_user_id_fkey(username, firstname, lastname, avatar_url)
        `)
        .eq('match_id', id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      setMessages(data as any || []);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      console.error('Erreur chargement messages:', error);
    }
  };

  // Realtime subscription pour les messages
  useEffect(() => {
    const channel = supabase
      .channel(`my-match-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_messages', filter: `match_id=eq.${id}` },
        async (payload) => {
          const { data, error } = await supabase
            .from('match_messages')
            .select(`
              id, match_id, user_id, message, created_at,
              sender:profiles!match_messages_user_id_fkey(username, firstname, lastname, avatar_url)
            `)
            .eq('id', payload.new.id)
            .single();

          if (data && !error) {
            setMessages((prev) => {
              if (prev.some(msg => msg.id === data.id)) return prev;
              return [...prev, data as any];
            });
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sendingMessage) return;
    const messageText = newMessage.trim();
    setSendingMessage(true);
    setNewMessage('');

    try {
      const { data, error } = await supabase
        .from('match_messages')
        .insert({ match_id: id, user_id: currentUserId, message: messageText })
        .select(`
          id, match_id, user_id, message, created_at,
          sender:profiles!match_messages_user_id_fkey(username, firstname, lastname, avatar_url)
        `)
        .single();

      if (error) throw error;
      if (data) {
        setMessages((prev) => [...prev, data as any]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible d\'envoyer le message');
      setNewMessage(messageText);
    } finally {
      setSendingMessage(false);
    }
  };

  // === HANDLERS ===

  const handleAcceptRequest = async (request: MatchRequest) => {
    setProcessingRequest(request.id);
    try {
      // Vérifier si déjà participant (en cas de ré-acceptation)
      const { data: existing } = await supabase
        .from('match_participants')
        .select('id')
        .eq('match_id', id)
        .eq('user_id', request.user_id)
        .single();

      if (!existing) {
        // Ajouter comme participant
        const { error: joinError } = await supabase
          .from('match_participants')
          .insert({ match_id: id, user_id: request.user_id });
        if (joinError) throw joinError;
      }

      // Mettre à jour le statut de la demande
      await supabase
        .from('match_requests')
        .update({ status: 'accepted' })
        .eq('id', request.id);

      // Vérifier si la partie est pleine
      const { data: participants } = await supabase
        .from('match_participants')
        .select('id')
        .eq('match_id', id);
      if (participants && match && participants.length >= match.format) {
        await supabase.from('matches').update({ status: 'full' }).eq('id', id);
      }

      await loadData();
      Alert.alert('Succès', 'Joueur accepté');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d\'accepter');
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleRejectRequest = async (request: MatchRequest) => {
    setProcessingRequest(request.id);
    try {
      // Si le joueur était déjà accepté, le retirer des participants
      if (request.status === 'accepted') {
        await supabase
          .from('match_participants')
          .delete()
          .eq('match_id', id)
          .eq('user_id', request.user_id);

        // Remettre le statut de la partie à 'open' si elle était 'full'
        if (match?.status === 'full') {
          await supabase.from('matches').update({ status: 'open' }).eq('id', id);
        }
      }

      await supabase
        .from('match_requests')
        .update({ status: 'rejected' })
        .eq('id', request.id);

      await loadData();
      Alert.alert('Succès', 'Demande refusée');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de refuser');
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleRemoveFromWaitlist = async (entryId: string) => {
    Alert.alert('Confirmation', 'Retirer ce joueur de la liste d\'attente ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('match_waitlist').delete().eq('id', entryId);
          await loadWaitlist();
        },
      },
    ]);
  };

  const handleDeleteMatch = () => {
    Alert.alert(
      'Supprimer la partie',
      'Souhaitez-vous vraiment supprimer cette partie ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('matches').delete().eq('id', id);
              if (error) throw error;
              Alert.alert('Succès', 'Partie supprimée');
              router.back();
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            }
          },
        },
      ]
    );
  };

  // === Terrain Placement ===
  const getAvailablePlayers = () => {
    if (!match) return [];
    const placed = [
      teamPlacements.team1.player1, teamPlacements.team1.player2,
      teamPlacements.team2.player1, teamPlacements.team2.player2,
    ].filter(Boolean);
    return match.participants.filter(p => !placed.includes(p.user_id));
  };

  const handlePlacePlayer = (zone: string) => {
    const available = getAvailablePlayers();
    if (available.length === 0) return;
    setSelectingZone(zone);
  };

  const handleSelectPlayerForZone = (playerId: string) => {
    if (!selectingZone) return;
    const newPlacements = { ...teamPlacements };
    if (selectingZone === 't1_left') { newPlacements.team1.player1 = playerId; newPlacements.team1.player1Pos = 'left'; }
    else if (selectingZone === 't1_right') { newPlacements.team1.player2 = playerId; newPlacements.team1.player2Pos = 'right'; }
    else if (selectingZone === 't2_left') { newPlacements.team2.player1 = playerId; newPlacements.team2.player1Pos = 'left'; }
    else if (selectingZone === 't2_right') { newPlacements.team2.player2 = playerId; newPlacements.team2.player2Pos = 'right'; }
    setTeamPlacements(newPlacements);
    setSelectingZone(null);
  };

  const getPlayerById = (playerId: string | null) => {
    if (!playerId || !match) return null;
    return match.participants.find(p => p.user_id === playerId) || null;
  };

  const handleSaveResult = async () => {
    if (!match) return;
    setSavingResult(true);
    try {
      // Calculer le gagnant
      let team1Wins = 0, team2Wins = 0;
      sets.forEach(([s1, s2]) => {
        if (s1 > s2) team1Wins++;
        else if (s2 > s1) team2Wins++;
      });
      const winner = team1Wins > team2Wins ? 1 : team2Wins > team1Wins ? 2 : null;

      const resultData = {
        match_id: id,
        team1_player1_id: teamPlacements.team1.player1!,
        team1_player1_position: teamPlacements.team1.player1Pos,
        team1_player2_id: match.format === 4 ? teamPlacements.team1.player2 : null,
        team1_player2_position: match.format === 4 ? teamPlacements.team1.player2Pos : null,
        team2_player1_id: teamPlacements.team2.player1!,
        team2_player1_position: teamPlacements.team2.player1Pos,
        team2_player2_id: match.format === 4 ? teamPlacements.team2.player2 : null,
        team2_player2_position: match.format === 4 ? teamPlacements.team2.player2Pos : null,
        sets,
        winner_team: winner,
      };

      let savedResultId: string;
      if (result) {
        await supabase.from('match_results').update(resultData).eq('id', result.id);
        savedResultId = result.id;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('match_results')
          .insert(resultData)
          .select('id')
          .single();
        if (insertError) throw insertError;
        savedResultId = inserted.id;
      }

      // Appliquer les deltas via la fonction SQL SECURITY DEFINER
      // (bypass RLS pour mettre à jour les profils de tous les joueurs)
      // La fonction vérifie elle-même level_delta_applied pour éviter la double application
      if (winner) {
        const { error: rpcError } = await supabase.rpc('apply_match_level_deltas', {
          p_match_result_id: savedResultId,
        });
        if (rpcError) throw new Error(`Niveau estimé : ${rpcError.message}`);
      }

      await loadResult();
      await AsyncStorage.removeItem(`@placement_draft_${id}`);
      Alert.alert('Succès', 'Résultat enregistré');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d\'enregistrer');
    } finally {
      setSavingResult(false);
    }
  };


  // === RENDER HELPERS ===

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const renderLevelBadge = (declared: number, community: number | null) => {
    if (community == null) {
      return <Text style={styles.levelText}>{declared.toFixed(1)}</Text>;
    }
    const isLower = community < declared;
    return (
      <Text style={styles.levelText}>
        {declared.toFixed(1)}/
        <Text style={{ color: isLower ? '#FF4444' : '#44DD44' }}>{community.toFixed(1)}</Text>
      </Text>
    );
  };

  // === ONGLET 1 : ÉDITER / RÉCAP ===
  const renderEditTab = () => {
    if (!match) return null;
    const canEdit = isCreator && !isCompleted;

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.tabTitle}>{isCompleted ? 'Récapitulatif' : canEdit ? 'Éditer la partie' : 'Détails de la partie'}</Text>

        {canEdit && (
          <Pressable
            style={styles.editButton}
            onPress={() => router.push(`/edit-match/${match.id}` as any)}
          >
            <Ionicons name="create" size={20} color="#000000" />
            <Text style={styles.editButtonText}>Modifier dans l'éditeur</Text>
          </Pressable>
        )}

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>{formatDate(match.date)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Heure</Text>
            <Text style={styles.infoValue}>{match.time_slot}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="hourglass" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Durée</Text>
            <Text style={styles.infoValue}>{match.duration_minutes} min</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="people" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Format</Text>
            <Text style={styles.infoValue}>{match.format} joueurs</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="star" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Niveau</Text>
            <Text style={styles.infoValue}>{match.level_min.toFixed(1)} - {match.level_max.toFixed(1)}</Text>
          </View>
          {match.court && (
            <View style={styles.infoRow}>
              <Ionicons name="location" size={20} color="#D4AF37" />
              <Text style={styles.infoLabel}>Lieu</Text>
              <Text style={styles.infoValue}>{match.court.name} - {match.court.city}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Ionicons name={match.visibility === 'private' ? 'lock-closed' : 'globe'} size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Visibilité</Text>
            <Text style={styles.infoValue}>{match.visibility === 'private' ? 'Privée' : 'Publique'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="flag" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Statut</Text>
            <Text style={[styles.infoValue, { color: isCompleted ? '#AAAAAA' : match.status === 'full' ? '#FF4444' : '#44DD44' }]}>
              {match.status === 'open' ? 'Ouverte' : match.status === 'full' ? 'Complète' : match.status === 'completed' ? 'Terminée' : 'Annulée'}
            </Text>
          </View>
        </View>

        {/* Participants */}
        <Text style={styles.subTitle}>Participants ({match.participants_count}/{match.format})</Text>
        <View style={styles.participantsList}>
          {match.participants.map((p) => (
            <View key={p.user_id} style={styles.participantItem}>
              <Avatar imageUrl={p.avatar_url} firstName={p.firstname} lastName={p.lastname} size={48} />
              <View style={styles.participantInfo}>
                <Text style={styles.participantName}>{p.firstname} {p.lastname}</Text>
                {renderLevelBadge(p.declared_level, p.community_level)}
              </View>
              {p.user_id === match.creator_id && (
                <View style={styles.creatorTag}>
                  <Ionicons name="star" size={12} color="#000000" />
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  // === ONGLET CHAT ===
  const renderChatTab = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatMessagesList}
        renderItem={({ item }) => {
          const isOwn = item.user_id === currentUserId;
          return (
            <View style={[styles.chatMessageItem, isOwn && styles.chatOwnMessageItem]}>
              {!isOwn && (
                <Avatar
                  imageUrl={item.sender?.avatar_url}
                  firstName={item.sender?.firstname || 'U'}
                  lastName={item.sender?.lastname || 'ser'}
                  size={32}
                />
              )}
              <View style={[styles.chatBubble, isOwn && styles.chatOwnBubble]}>
                {!isOwn && (
                  <Text style={styles.chatSenderName}>
                    {item.sender?.firstname} {item.sender?.lastname}
                  </Text>
                )}
                <Text style={[styles.chatMessageText, isOwn && styles.chatOwnMessageText]}>
                  {item.message}
                </Text>
                <Text style={[styles.chatMessageTime, isOwn && styles.chatOwnMessageTime]}>
                  {new Date(item.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color="#D4AF37" />
            <Text style={styles.emptyText}>Aucun message</Text>
          </View>
        }
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />
      <View style={styles.chatInputContainer}>
        <TextInput
          style={styles.chatTextInput}
          placeholder="Écrire un message..."
          placeholderTextColor="#666666"
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={500}
        />
        <Pressable
          style={[styles.chatSendButton, (!newMessage.trim() || sendingMessage) && styles.chatSendButtonDisabled]}
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

  // === ONGLET 2 : DEMANDES ===
  const renderRequestsTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.tabTitle}>Mes demandes</Text>
      {!isCreator ? (
        <Text style={styles.emptyText}>Seul le créateur peut gérer les demandes</Text>
      ) : requests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#D4AF37" />
          <Text style={styles.emptyText}>Aucune demande</Text>
        </View>
      ) : (
        requests.map((req) => (
          <View key={req.id} style={[
            styles.requestItem,
            req.status === 'accepted' && styles.requestItemAccepted,
            req.status === 'rejected' && styles.requestItemRejected,
          ]}>
            <Avatar imageUrl={req.profile?.avatar_url} firstName={req.profile?.firstname || 'U'} lastName={req.profile?.lastname || 'ser'} size={48} />
            <View style={styles.requestInfo}>
              <Text style={styles.requestName}>{req.profile?.firstname} {req.profile?.lastname}</Text>
              <Text style={styles.requestLevel}>
                {req.profile?.declared_level.toFixed(1)}
                {req.profile?.community_level != null
                  ? ` / ${req.profile.community_level.toFixed(1)}`
                  : ''}
              </Text>
              {req.status !== 'pending' && (
                <Text style={[
                  styles.requestStatus,
                  { color: req.status === 'accepted' ? '#44DD44' : '#FF4444' }
                ]}>
                  {req.status === 'accepted' ? 'Accepté' : 'Refusé'}
                </Text>
              )}
            </View>
            {processingRequest === req.id ? (
              <ActivityIndicator size="small" color="#D4AF37" />
            ) : (
              <View style={styles.requestActions}>
                <Pressable
                  style={[styles.acceptButton, req.status === 'accepted' && styles.acceptButtonActive]}
                  onPress={() => handleAcceptRequest(req)}
                >
                  <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                </Pressable>
                <Pressable
                  style={[styles.rejectButton, req.status === 'rejected' && styles.rejectButtonActive]}
                  onPress={() => handleRejectRequest(req)}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );

  // === ONGLET 3 : LISTE D'ATTENTE ===
  const renderWaitlistTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.tabTitle}>Liste d'attente</Text>
      {waitlist.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="hourglass-outline" size={48} color="#D4AF37" />
          <Text style={styles.emptyText}>Aucun joueur en attente</Text>
        </View>
      ) : (
        waitlist.map((entry) => (
          <View key={entry.id} style={styles.waitlistItem}>
            <View style={styles.positionBadge}>
              <Text style={styles.positionText}>#{entry.position}</Text>
            </View>
            <Avatar imageUrl={entry.profile?.avatar_url} firstName={entry.profile?.firstname || 'U'} lastName={entry.profile?.lastname || 'ser'} size={48} />
            <View style={styles.waitlistInfo}>
              <Text style={styles.waitlistName}>{entry.profile?.firstname} {entry.profile?.lastname}</Text>
              <Text style={styles.waitlistLevel}>Niveau {entry.profile?.declared_level.toFixed(1)}</Text>
            </View>
            {isCreator && (
              <Pressable onPress={() => handleRemoveFromWaitlist(entry.id)}>
                <Ionicons name="close-circle" size={24} color="#FF4444" />
              </Pressable>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );

  // === ONGLET 4 : RÉSULTATS ===
  const renderResultsTab = () => {
    if (!match) return null;
    const isFormat4 = match.format === 4;

    // Poids des équipes (somme des niveaux déclarés)
    const team1Weight =
      (getPlayerById(teamPlacements.team1.player1)?.declared_level || 0) +
      (isFormat4 ? (getPlayerById(teamPlacements.team1.player2)?.declared_level || 0) : 0);
    const team2Weight =
      (getPlayerById(teamPlacements.team2.player1)?.declared_level || 0) +
      (isFormat4 ? (getPlayerById(teamPlacements.team2.player2)?.declared_level || 0) : 0);

    // Calcul gagnant depuis les sets actuels
    let t1Wins = 0, t2Wins = 0;
    sets.forEach(([s1, s2]) => { if (s1 > s2) t1Wins++; else if (s2 > s1) t2Wins++; });
    const winnerTeamNum = t1Wins > t2Wins ? 1 : t2Wins > t1Wins ? 2 : 0;
    const winnerPlayerIds = winnerTeamNum === 1
      ? [teamPlacements.team1.player1, teamPlacements.team1.player2]
      : winnerTeamNum === 2
      ? [teamPlacements.team2.player1, teamPlacements.team2.player2]
      : [];

    // JSX terrain (partagé entre vue unifiée et étape placement)
    const courtJSX = (
      <>
        <View style={styles.courtContainer}>
          <View style={styles.courtInner}>
            {/* Demi-terrain gauche (Équipe 1) */}
            <View style={styles.courtHalf}>
              <View style={styles.courtServiceLineLeft} />
              <View pointerEvents="none" style={styles.courtCenterLineOverlayLeft} />
              <View style={styles.courtSide}>
                <Pressable
                  style={[styles.courtZone, teamPlacements.team1.player1 && styles.courtZoneFilled, selectingZone === 't1_left' && styles.courtZoneSelecting]}
                  onPress={() => handlePlacePlayer('t1_left')}
                >
                  {teamPlacements.team1.player1 ? (
                    <View style={styles.courtPlayer}>
                      <Avatar imageUrl={getPlayerById(teamPlacements.team1.player1)?.avatar_url || null} firstName={getPlayerById(teamPlacements.team1.player1)?.firstname || ''} lastName={getPlayerById(teamPlacements.team1.player1)?.lastname || ''} size={36} />
                      <Text style={styles.courtPlayerName}>{getPlayerById(teamPlacements.team1.player1)?.firstname}</Text>
                    </View>
                  ) : (
                    <Text style={styles.courtPlaceholder}>{isFormat4 ? 'G' : '?'}</Text>
                  )}
                </Pressable>
                {isFormat4 && (
                  <Pressable
                    style={[styles.courtZone, teamPlacements.team1.player2 && styles.courtZoneFilled, selectingZone === 't1_right' && styles.courtZoneSelecting]}
                    onPress={() => handlePlacePlayer('t1_right')}
                  >
                    {teamPlacements.team1.player2 ? (
                      <View style={styles.courtPlayer}>
                        <Avatar imageUrl={getPlayerById(teamPlacements.team1.player2)?.avatar_url || null} firstName={getPlayerById(teamPlacements.team1.player2)?.firstname || ''} lastName={getPlayerById(teamPlacements.team1.player2)?.lastname || ''} size={36} />
                        <Text style={styles.courtPlayerName}>{getPlayerById(teamPlacements.team1.player2)?.firstname}</Text>
                      </View>
                    ) : (
                      <Text style={styles.courtPlaceholder}>D</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </View>

            {/* Filet vertical */}
            <View style={styles.courtNet} />

            {/* Demi-terrain droit (Équipe 2) */}
            <View style={styles.courtHalf}>
              <View pointerEvents="none" style={styles.courtCenterLineOverlayRight} />
              <View style={styles.courtSide}>
                {isFormat4 && (
                  <Pressable
                    style={[styles.courtZone, teamPlacements.team2.player2 && styles.courtZoneFilled, selectingZone === 't2_right' && styles.courtZoneSelecting]}
                    onPress={() => handlePlacePlayer('t2_right')}
                  >
                    {teamPlacements.team2.player2 ? (
                      <View style={styles.courtPlayer}>
                        <Avatar imageUrl={getPlayerById(teamPlacements.team2.player2)?.avatar_url || null} firstName={getPlayerById(teamPlacements.team2.player2)?.firstname || ''} lastName={getPlayerById(teamPlacements.team2.player2)?.lastname || ''} size={36} />
                        <Text style={styles.courtPlayerName}>{getPlayerById(teamPlacements.team2.player2)?.firstname}</Text>
                      </View>
                    ) : (
                      <Text style={styles.courtPlaceholder}>D</Text>
                    )}
                  </Pressable>
                )}
                <Pressable
                  style={[styles.courtZone, teamPlacements.team2.player1 && styles.courtZoneFilled, selectingZone === 't2_left' && styles.courtZoneSelecting]}
                  onPress={() => handlePlacePlayer('t2_left')}
                >
                  {teamPlacements.team2.player1 ? (
                    <View style={styles.courtPlayer}>
                      <Avatar imageUrl={getPlayerById(teamPlacements.team2.player1)?.avatar_url || null} firstName={getPlayerById(teamPlacements.team2.player1)?.firstname || ''} lastName={getPlayerById(teamPlacements.team2.player1)?.lastname || ''} size={36} />
                      <Text style={styles.courtPlayerName}>{getPlayerById(teamPlacements.team2.player1)?.firstname}</Text>
                    </View>
                  ) : (
                    <Text style={styles.courtPlaceholder}>{isFormat4 ? 'G' : '?'}</Text>
                  )}
                </Pressable>
              </View>
              <View style={styles.courtServiceLineRight} />
            </View>
          </View>
        </View>

        {/* Labels équipes + poids */}
        <View style={styles.courtTeamLabels}>
          <View style={styles.teamLabelCol}>
            <Text style={styles.teamLabel}>Équipe 1</Text>
            {team1Weight > 0 && <Text style={styles.teamWeight}>Poids : {team1Weight.toFixed(1)}</Text>}
          </View>
          <View style={styles.teamLabelCol}>
            <Text style={styles.teamLabel}>Équipe 2</Text>
            {team2Weight > 0 && <Text style={styles.teamWeight}>Poids : {team2Weight.toFixed(1)}</Text>}
          </View>
        </View>
      </>
    );

    // JSX sélection de joueur (compatible web)
    const playerSelectionJSX = selectingZone ? (
      <View style={styles.playerSelectionContainer}>
        <Text style={styles.playerSelectionTitle}>Choisir un joueur</Text>
        <View style={styles.playerSelectionRow}>
          {getAvailablePlayers().map(p => (
            <Pressable key={p.user_id} style={styles.playerSelectionCard} onPress={() => handleSelectPlayerForZone(p.user_id)}>
              <Avatar imageUrl={p.avatar_url} firstName={p.firstname} lastName={p.lastname} size={48} />
              <Text style={styles.playerSelectionName}>{p.firstname}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.playerSelectionCancel} onPress={() => setSelectingZone(null)}>
          <Text style={styles.playerSelectionCancelText}>Annuler</Text>
        </Pressable>
      </View>
    ) : null;

    // JSX scores (inputs)
    const scoreJSX = (
      <>
        {sets.map((set, index) => (
          <View key={index} style={styles.setRow}>
            <Text style={styles.setRowLabel}>Set {index + 1}</Text>
            <View style={styles.setInputs}>
              <TextInput
                style={[styles.scoreInput, set[0] > set[1] && styles.scoreInputWinner]}
                value={set[0] > 0 ? String(set[0]) : ''}
                onChangeText={(v) => {
                  const val = Math.min(10, Math.max(0, parseInt(v) || 0));
                  const newSets = [...sets] as [number, number][];
                  newSets[index] = [val, set[1]];
                  setSets(newSets);
                }}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor="#666"
              />
              <Text style={styles.setDash}>-</Text>
              <TextInput
                style={[styles.scoreInput, set[1] > set[0] && styles.scoreInputWinner]}
                value={set[1] > 0 ? String(set[1]) : ''}
                onChangeText={(v) => {
                  const val = Math.min(10, Math.max(0, parseInt(v) || 0));
                  const newSets = [...sets] as [number, number][];
                  newSets[index] = [set[0], val];
                  setSets(newSets);
                }}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor="#666"
              />
              {sets.length > 1 && (
                <Pressable onPress={() => setSets(sets.filter((_, i) => i !== index))}>
                  <Ionicons name="close-circle" size={24} color="#FF4444" />
                </Pressable>
              )}
            </View>
          </View>
        ))}
        {sets.length < 5 && (
          <Pressable style={styles.addSetButton} onPress={() => setSets([...sets, [0, 0]])}>
            <Ionicons name="add-circle" size={24} color="#D4AF37" />
            <Text style={styles.addSetText}>Ajouter un set</Text>
          </Pressable>
        )}
      </>
    );

    // === VUE UNIFIÉE (résultat déjà enregistré) ===
    if (result) {
      return (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.tabTitle}>Résultat</Text>

          {/* 1. Équipe gagnante */}
          {winnerTeamNum > 0 && (
            <View style={styles.winnerSection}>
              <Ionicons name="trophy" size={32} color="#D4AF37" />
              <Text style={styles.winnerTitle}>Gagnants</Text>
              <View style={styles.winnerAvatars}>
                {winnerPlayerIds.filter(Boolean).map(pid => {
                  const p = getPlayerById(pid!);
                  return p ? (
                    <View key={p.user_id} style={styles.winnerPlayer}>
                      <Avatar imageUrl={p.avatar_url} firstName={p.firstname} lastName={p.lastname} size={48} />
                      <Text style={styles.winnerName}>{p.firstname}</Text>
                    </View>
                  ) : null;
                })}
              </View>
            </View>
          )}

          {/* 2. Terrain + poids */}
          {courtJSX}
          {playerSelectionJSX}

          {/* 3. Score */}
          <Text style={styles.resultSectionTitle}>Score</Text>
          {scoreJSX}

          {/* Enregistrer */}
          <Pressable
            style={[styles.primaryButton, { marginTop: 16, marginBottom: 32 }, savingResult && styles.buttonDisabled]}
            onPress={handleSaveResult}
            disabled={savingResult}
          >
            {savingResult ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.primaryButtonText}>Enregistrer</Text>}
          </Pressable>
        </ScrollView>
      );
    }

    // === ÉTAPE 1 : PLACEMENT (pas encore de résultat) ===
    if (resultStep === 'placement') {
      return (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.tabTitle}>Placement des joueurs</Text>
          <Text style={styles.helpText}>Appuyez sur une zone du terrain pour y placer un joueur</Text>

          {courtJSX}
          {playerSelectionJSX}

          {/* Joueurs non placés */}
          {!selectingZone && getAvailablePlayers().length > 0 && (
            <View style={styles.availablePlayers}>
              <Text style={styles.availableTitle}>Joueurs à placer</Text>
              <View style={styles.availableRow}>
                {getAvailablePlayers().map(p => (
                  <View key={p.user_id} style={styles.availablePlayer}>
                    <Avatar imageUrl={p.avatar_url} firstName={p.firstname} lastName={p.lastname} size={40} />
                    <Text style={styles.availablePlayerName}>{p.firstname}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Pressable
            style={[styles.primaryButton, getAvailablePlayers().length > 0 && styles.buttonDisabled]}
            onPress={() => setResultStep('score')}
            disabled={getAvailablePlayers().length > 0}
          >
            <Text style={styles.primaryButtonText}>Passer aux scores</Text>
          </Pressable>
        </ScrollView>
      );
    }

    // === ÉTAPE 2 : SCORE (pas encore de résultat) ===
    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.tabTitle}>Score</Text>

        {/* Miniatures équipes */}
        <View style={styles.teamsSummary}>
          <View style={styles.teamSummaryCol}>
            <Text style={styles.teamSummaryLabel}>Équipe 1</Text>
            <View style={styles.teamSummaryAvatars}>
              {[teamPlacements.team1.player1, teamPlacements.team1.player2].filter(Boolean).map(pid => {
                const p = getPlayerById(pid!);
                return p ? <Avatar key={p.user_id} imageUrl={p.avatar_url} firstName={p.firstname} lastName={p.lastname} size={32} /> : null;
              })}
            </View>
          </View>
          <Text style={styles.vsText}>VS</Text>
          <View style={styles.teamSummaryCol}>
            <Text style={styles.teamSummaryLabel}>Équipe 2</Text>
            <View style={styles.teamSummaryAvatars}>
              {[teamPlacements.team2.player1, teamPlacements.team2.player2].filter(Boolean).map(pid => {
                const p = getPlayerById(pid!);
                return p ? <Avatar key={p.user_id} imageUrl={p.avatar_url} firstName={p.firstname} lastName={p.lastname} size={32} /> : null;
              })}
            </View>
          </View>
        </View>

        {scoreJSX}

        {/* Aperçu gagnant */}
        {winnerTeamNum > 0 && (
          <View style={styles.winnerBanner}>
            <Ionicons name="trophy" size={24} color="#D4AF37" />
            <Text style={styles.winnerBannerText}>Équipe {winnerTeamNum} gagne !</Text>
            {winnerPlayerIds.filter(Boolean).map(pid => {
              const p = getPlayerById(pid!);
              return p ? <Avatar key={p.user_id} imageUrl={p.avatar_url} firstName={p.firstname} lastName={p.lastname} size={32} /> : null;
            })}
          </View>
        )}

        <View style={styles.resultButtons}>
          <Pressable style={styles.secondaryButton} onPress={() => setResultStep('placement')}>
            <Text style={styles.secondaryButtonText}>Retour placement</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, savingResult && styles.buttonDisabled]}
            onPress={handleSaveResult}
            disabled={savingResult}
          >
            {savingResult ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.primaryButtonText}>Enregistrer</Text>}
          </Pressable>
        </View>
      </ScrollView>
    );
  };

  // === ONGLET 5 : NIVEAU ESTIMÉ ===
  const renderRatingTab = () => {
    if (!match) return null;

    // Pas encore de résultat enregistré
    if (!result) {
      return (
        <View style={[styles.tabContent, styles.centered]}>
          <Ionicons name="hourglass-outline" size={56} color="#D4AF37" />
          <Text style={styles.ratingNoResultTitle}>Résultat en attente</Text>
          <Text style={styles.ratingNoResultText}>
            Le résultat de cette partie n'a pas encore été enregistré.{'\n'}
            Rendez-vous dans l'onglet Résultat pour le saisir.
          </Text>
        </View>
      );
    }

    // Vérifier que l'utilisateur est participant
    const isInTeam1 = [result.team1_player1_id, result.team1_player2_id].includes(currentUserId);
    const isInTeam2 = [result.team2_player1_id, result.team2_player2_id].includes(currentUserId);
    if (!isInTeam1 && !isInTeam2) {
      return (
        <View style={[styles.tabContent, styles.centered]}>
          <Text style={styles.ratingNoResultText}>Vous ne participez pas à cette partie.</Text>
        </View>
      );
    }

    const myTeam = isInTeam1 ? 1 : 2;

    // Calcul des poids de paires
    const t1p1 = getPlayerById(result.team1_player1_id);
    const t1p2 = getPlayerById(result.team1_player2_id);
    const t2p1 = getPlayerById(result.team2_player1_id);
    const t2p2 = getPlayerById(result.team2_player2_id);
    const team1Weight = (t1p1?.declared_level || 0) + (t1p2?.declared_level || 0);
    const team2Weight = (t2p1?.declared_level || 0) + (t2p2?.declared_level || 0);
    const myWeight = myTeam === 1 ? team1Weight : team2Weight;
    const opponentWeight = myTeam === 1 ? team2Weight : team1Weight;

    const iWon = result.winner_team === myTeam;
    const delta = calculateLevelDelta(myWeight, opponentWeight, iWon);

    // Libellé de la force adverse
    const diff = opponentWeight - myWeight;
    const opponentStrengthLabel =
      diff > WEIGHT_EQUALITY_THRESHOLD ? 'plus forte' :
      diff < -WEIGHT_EQUALITY_THRESHOLD ? 'plus faible' : 'de même niveau';

    // Construction du message
    let headline = '';
    let detail = '';
    const deltaColor = delta > 0 ? '#44DD44' : delta < 0 ? '#FF4444' : '#AAAAAA';
    const iconName = iWon ? 'trophy' : 'close-circle-outline';
    const iconColor = iWon ? '#D4AF37' : '#FF4444';

    if (iWon) {
      if (delta > 0) {
        headline = `Bravo ! +${delta} point${delta > 1 ? 's' : ''} sur ton niveau estimé`;
        detail = `Tu as battu une paire ${opponentStrengthLabel} que la tienne (poids ${opponentWeight.toFixed(1)} vs ${myWeight.toFixed(1)}). Bien joué !`;
      } else {
        headline = 'Victoire sans bonus';
        detail = `Tu as gagné, mais contre une paire ${opponentStrengthLabel} (poids ${opponentWeight.toFixed(1)} vs ${myWeight.toFixed(1)}). Aucun point gagné sur ton niveau estimé.`;
      }
    } else {
      if (delta < 0) {
        headline = `${delta} point${Math.abs(delta) > 1 ? 's' : ''} sur ton niveau estimé`;
        detail = `Tu as perdu contre une paire ${opponentStrengthLabel} (poids ${opponentWeight.toFixed(1)} vs ${myWeight.toFixed(1)}).`;
      } else {
        headline = 'Défaite sans pénalité';
        detail = `Tu as perdu, mais contre une paire ${opponentStrengthLabel} (poids ${opponentWeight.toFixed(1)} vs ${myWeight.toFixed(1)}). Ton niveau estimé reste inchangé.`;
      }
    }

    // Joueurs de ma paire et de l'équipe adverse
    const myPlayers = myTeam === 1
      ? [t1p1, t1p2].filter(Boolean)
      : [t2p1, t2p2].filter(Boolean);
    const opponentPlayers = myTeam === 1
      ? [t2p1, t2p2].filter(Boolean)
      : [t1p1, t1p2].filter(Boolean);

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.tabTitle}>Niveau estimé</Text>

        {/* Carte résultat principal */}
        <View style={styles.ratingResultCard}>
          <Ionicons name={iconName as any} size={52} color={iconColor} />
          <Text style={[styles.ratingDelta, { color: deltaColor }]}>
            {delta > 0 ? `+${delta}` : delta === 0 ? '±0' : `${delta}`}
          </Text>
          <Text style={styles.ratingDeltaLabel}>point{Math.abs(delta) > 1 ? 's' : ''} sur ton niveau estimé</Text>
          <Text style={styles.ratingHeadline}>{headline}</Text>
          <Text style={styles.ratingDetail}>{detail}</Text>
        </View>

        {/* Comparaison des paires */}
        <View style={styles.ratingWeightComparison}>
          <View style={styles.ratingWeightCol}>
            <Text style={styles.ratingWeightLabel}>Ta paire</Text>
            <View style={styles.ratingWeightAvatars}>
              {myPlayers.map(p => (
                <Avatar key={p!.user_id} imageUrl={p!.avatar_url} firstName={p!.firstname} lastName={p!.lastname} size={36} />
              ))}
            </View>
            <Text style={styles.ratingWeightValue}>{myWeight.toFixed(1)}</Text>
          </View>
          <View style={styles.ratingWeightVsCol}>
            <Text style={styles.ratingWeightVs}>VS</Text>
          </View>
          <View style={styles.ratingWeightCol}>
            <Text style={styles.ratingWeightLabel}>Adversaires</Text>
            <View style={styles.ratingWeightAvatars}>
              {opponentPlayers.map(p => (
                <Avatar key={p!.user_id} imageUrl={p!.avatar_url} firstName={p!.firstname} lastName={p!.lastname} size={36} />
              ))}
            </View>
            <Text style={styles.ratingWeightValue}>{opponentWeight.toFixed(1)}</Text>
          </View>
        </View>

        {/* Règles du système */}
        <View style={styles.ratingRulesCard}>
          <Text style={styles.ratingRulesTitle}>Règles du niveau estimé</Text>
          {[
            { label: 'Gagné vs paire plus forte', value: '+0.3', color: '#44DD44' },
            { label: 'Gagné vs paire de même niveau', value: '+0.1', color: '#44DD44' },
            { label: 'Gagné vs paire plus faible', value: '±0', color: '#AAAAAA' },
            { label: 'Perdu vs paire plus forte', value: '±0', color: '#AAAAAA' },
            { label: 'Perdu vs paire de même niveau', value: '-0.1', color: '#FF8844' },
            { label: 'Perdu vs paire plus faible', value: '-0.3', color: '#FF4444' },
          ].map((rule, i) => (
            <View key={i} style={styles.ratingRuleRow}>
              <Text style={styles.ratingRuleLabel}>{rule.label}</Text>
              <Text style={[styles.ratingRuleValue, { color: rule.color }]}>{rule.value}</Text>
            </View>
          ))}
          <Text style={styles.ratingRulesNote}>Niveau max : 10 · Même poids = différence ≤ {WEIGHT_EQUALITY_THRESHOLD}</Text>
        </View>
      </ScrollView>
    );
  };

  // === ONGLET 6 : SUPPRIMER ===
  const renderDeleteTab = () => (
    <View style={[styles.tabContent, styles.centered]}>
      <Ionicons name="warning" size={64} color="#FF4444" />
      <Text style={styles.deleteTitle}>Supprimer la partie</Text>
      <Text style={styles.deleteMessage}>
        Souhaitez-vous vraiment supprimer cette partie ?{'\n'}
        Cette action est irréversible.
      </Text>
      <View style={styles.deleteButtons}>
        <Pressable style={styles.secondaryButton} onPress={() => setActiveTab('edit')}>
          <Text style={styles.secondaryButtonText}>Annuler</Text>
        </Pressable>
        <Pressable style={styles.deleteButton} onPress={handleDeleteMatch}>
          <Ionicons name="trash" size={20} color="#FFFFFF" />
          <Text style={styles.deleteButtonText}>Supprimer</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'edit': return renderEditTab();
      case 'chat': return renderChatTab();
      case 'requests': return renderRequestsTab();
      case 'waitlist': return renderWaitlistTab();
      case 'results': return renderResultsTab();
      case 'rating': return renderRatingTab();
      case 'delete': return renderDeleteTab();
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  const visibleTabs = TABS.filter(t => t.showWhen(match?.status || '', isCreator));

  return (
    <ImageBackground source={backgroundImage} resizeMode="cover" style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#D4AF37" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Détails de la partie</Text>
          {match && <Text style={styles.headerSubtitle}>{formatDate(match.date)} · {match.time_slot}</Text>}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Barre d'onglets */}
      <View style={styles.tabBar}>
        {visibleTabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon as any}
              size={24}
              color={activeTab === tab.key ? '#000000' : tab.key === 'delete' ? '#FF4444' : '#D4AF37'}
            />
          </Pressable>
        ))}
      </View>

      {/* Contenu de l'onglet */}
      {renderActiveTab()}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  centered: { justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#D4AF37',
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#D4AF37' },
  headerSubtitle: { fontSize: 14, color: '#AAAAAA', marginTop: 4 },

  // Tab bar
  tabBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#333',
  },
  tabItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#1A1A1A', borderWidth: 0.8, borderColor: '#D4AF37',
  },
  tabItemActive: { backgroundColor: '#D4AF37' },

  // Tab content
  tabContent: { flex: 1, padding: 20 },
  tabTitle: { fontSize: 20, fontWeight: '700', color: '#D4AF37', marginBottom: 16 },
  subTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', marginTop: 24, marginBottom: 12 },
  helpText: { fontSize: 14, color: '#AAAAAA', marginBottom: 16 },

  // Info card
  infoCard: {
    backgroundColor: '#1A1A1A', borderWidth: 0.8, borderColor: '#D4AF37',
    borderRadius: 12, padding: 16, gap: 12,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoLabel: { flex: 1, fontSize: 14, color: '#AAAAAA' },
  infoValue: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },

  // Edit button
  editButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#D4AF37', borderRadius: 12, paddingVertical: 12, marginBottom: 16,
  },
  editButtonText: { fontSize: 16, fontWeight: '600', color: '#000000' },

  // Participants
  participantsList: { gap: 8 },
  participantItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1A1A1A', borderWidth: 0.8, borderColor: '#D4AF37',
    borderRadius: 12, padding: 12,
  },
  participantInfo: { flex: 1 },
  participantName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  levelText: { fontSize: 14, color: '#AAAAAA', marginTop: 2 },
  creatorTag: {
    backgroundColor: '#D4AF37', borderRadius: 12, width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
  },

  // Requests
  requestItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1A1A1A', borderWidth: 0.8, borderColor: '#D4AF37',
    borderRadius: 12, padding: 16, marginBottom: 12,
  },
  requestInfo: { flex: 1 },
  requestName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  requestLevel: { fontSize: 14, color: '#AAAAAA', marginTop: 4 },
  requestActions: { flexDirection: 'row', gap: 8 },
  requestItemAccepted: { borderColor: '#44DD44' },
  requestItemRejected: { borderColor: '#FF4444', opacity: 0.7 },
  requestStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  acceptButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#333333',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 0.8, borderColor: '#44DD44',
  },
  acceptButtonActive: {
    backgroundColor: '#44DD44',
  },
  rejectButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#333333',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 0.8, borderColor: '#FF4444',
  },
  rejectButtonActive: {
    backgroundColor: '#FF4444',
  },

  // Waitlist
  waitlistItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1A1A1A', borderWidth: 0.8, borderColor: '#D4AF37',
    borderRadius: 12, padding: 16, marginBottom: 12,
  },
  positionBadge: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#D4AF37',
    alignItems: 'center', justifyContent: 'center',
  },
  positionText: { fontSize: 14, fontWeight: '700', color: '#000000' },
  waitlistInfo: { flex: 1 },
  waitlistName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  waitlistLevel: { fontSize: 14, color: '#AAAAAA', marginTop: 2 },

  // Court (layout horizontal)
  courtContainer: {
    width: COURT_WIDTH,
    height: COURT_HEIGHT,
    alignSelf: 'center',
    backgroundColor: '#2A2A2A',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  courtInner: {
    flex: 1, flexDirection: 'row',
  },
  courtHalf: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 6,
    position: 'relative',
  },
  teamLabel: { fontSize: 13, fontWeight: '700', color: '#AAAAAA', textAlign: 'center', paddingVertical: 4 },
  teamLabelCol: { alignItems: 'center' },
  teamWeight: { fontSize: 12, color: '#D4AF37', fontWeight: '600', textAlign: 'center' },
  courtTeamLabels: {
    flexDirection: 'row',
    width: COURT_WIDTH,
    alignSelf: 'center',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  resultSectionTitle: { fontSize: 16, fontWeight: '700', color: '#D4AF37', marginBottom: 12, marginTop: 4 },
  courtServiceLineLeft: {
    position: 'absolute',
    top: 8, bottom: 8,
    left: '30%',
    width: 1.2,
    backgroundColor: '#FFFFFF',
  },
  courtServiceLineRight: {
    position: 'absolute',
    top: 8, bottom: 8,
    right: '30%',
    width: 1.2,
    backgroundColor: '#FFFFFF',
  },
  courtCenterLineOverlayLeft: {
    position: 'absolute',
    left: '30%', right: 0,
    top: '50%',
    height: 1.2, marginTop: -0.6,
    backgroundColor: '#FFFFFF',
  },
  courtCenterLineOverlayRight: {
    position: 'absolute',
    left: 0, right: '30%',
    top: '50%',
    height: 1.2, marginTop: -0.6,
    backgroundColor: '#FFFFFF',
  },
  courtSide: { flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'stretch' },
  courtZone: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  courtZoneFilled: { backgroundColor: 'rgba(212, 175, 55,0.12)' },
  courtZoneSelecting: { backgroundColor: 'rgba(212, 175, 55,0.25)', borderWidth: 0.8, borderColor: '#D4AF37', borderStyle: 'dashed' },
  courtPlayer: { alignItems: 'center', gap: 4 },
  courtPlayerName: { fontSize: 11, color: '#FFFFFF', fontWeight: '600' },
  courtPlaceholder: { fontSize: 24, color: 'rgba(255,255,255,0.3)', fontWeight: '700' },
  courtNet: {
    width: 4, backgroundColor: '#D4AF37',
  },

  // Player selection (inline, web-compatible)
  playerSelectionContainer: {
    backgroundColor: '#1A1A1A', borderWidth: 0.8, borderColor: '#D4AF37',
    borderRadius: 12, padding: 16, marginBottom: 20,
  },
  playerSelectionTitle: { fontSize: 16, fontWeight: '700', color: '#D4AF37', textAlign: 'center', marginBottom: 12 },
  playerSelectionRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, flexWrap: 'wrap' },
  playerSelectionCard: {
    alignItems: 'center', gap: 6, padding: 12,
    backgroundColor: '#000000', borderWidth: 0.8, borderColor: '#D4AF37',
    borderRadius: 12, minWidth: 80,
  },
  playerSelectionName: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  playerSelectionCancel: { alignItems: 'center', marginTop: 12, paddingVertical: 8 },
  playerSelectionCancelText: { fontSize: 14, color: '#AAAAAA' },

  // Available players
  availablePlayers: { marginBottom: 20 },
  availableTitle: { fontSize: 14, color: '#AAAAAA', marginBottom: 8 },
  availableRow: { flexDirection: 'row', gap: 16 },
  availablePlayer: { alignItems: 'center', gap: 4 },
  availablePlayerName: { fontSize: 12, color: '#FFFFFF' },

  // Scores
  teamsSummary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 16, marginBottom: 24,
  },
  teamSummaryCol: { alignItems: 'center' },
  teamSummaryLabel: { fontSize: 14, fontWeight: '600', color: '#D4AF37', marginBottom: 8 },
  teamSummaryAvatars: { flexDirection: 'row', gap: 4 },
  vsText: { fontSize: 18, fontWeight: '700', color: '#D4AF37' },

  setRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12,
  },
  setRowLabel: { fontSize: 16, fontWeight: '600', color: '#AAAAAA', width: 50 },
  setInputs: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreInput: {
    width: 56, height: 48, backgroundColor: '#1A1A1A', borderWidth: 0.8,
    borderColor: '#D4AF37', borderRadius: 12, textAlign: 'center',
    fontSize: 20, fontWeight: '700', color: '#FFFFFF',
  },
  scoreInputWinner: { backgroundColor: '#2D5A27' },
  setDash: { fontSize: 20, color: '#D4AF37', fontWeight: '700' },

  addSetButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, marginBottom: 16,
  },
  addSetText: { fontSize: 16, color: '#D4AF37', fontWeight: '600' },

  // Winner
  winnerSection: {
    alignItems: 'center', backgroundColor: '#1A1A1A', borderWidth: 0.8,
    borderColor: '#D4AF37', borderRadius: 12, padding: 20, marginBottom: 20,
  },
  winnerTitle: { fontSize: 18, fontWeight: '700', color: '#D4AF37', marginTop: 8, marginBottom: 12 },
  winnerAvatars: { flexDirection: 'row', gap: 16 },
  winnerPlayer: { alignItems: 'center', gap: 4 },
  winnerName: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },

  winnerBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1A1A1A', borderWidth: 0.8, borderColor: '#D4AF37',
    borderRadius: 12, padding: 12, marginTop: 16, marginBottom: 16,
  },
  winnerBannerText: { fontSize: 16, fontWeight: '700', color: '#D4AF37' },

  scoresSection: {
    backgroundColor: '#1A1A1A', borderWidth: 0.8, borderColor: '#D4AF37',
    borderRadius: 12, padding: 16, marginBottom: 20,
  },
  scoreRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingVertical: 8,
  },
  setLabel: { fontSize: 14, color: '#AAAAAA', width: 50 },
  scoreValue: { fontSize: 24, fontWeight: '700', color: '#FFFFFF', width: 30, textAlign: 'center' },
  scoreWinner: { color: '#D4AF37' },
  scoreSep: { fontSize: 20, color: '#666' },

  editResultButton: {
    alignItems: 'center', paddingVertical: 12,
  },
  editResultText: { fontSize: 16, color: '#D4AF37', fontWeight: '600' },

  // Niveau estimé (onglet étoile)
  ratingNoResultTitle: { fontSize: 18, fontWeight: '700', color: '#D4AF37', marginTop: 16, marginBottom: 8 },
  ratingNoResultText: { fontSize: 14, color: '#AAAAAA', textAlign: 'center', lineHeight: 22 },

  ratingResultCard: {
    alignItems: 'center', backgroundColor: '#1A1A1A', borderWidth: 0.8,
    borderColor: '#D4AF37', borderRadius: 16, padding: 24, marginBottom: 20, gap: 6,
  },
  ratingDelta: { fontSize: 48, fontWeight: '900', lineHeight: 56 },
  ratingDeltaLabel: { fontSize: 13, color: '#AAAAAA' },
  ratingHeadline: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', marginTop: 4 },
  ratingDetail: { fontSize: 13, color: '#AAAAAA', textAlign: 'center', lineHeight: 20, marginTop: 4 },

  ratingWeightComparison: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1A1A1A', borderWidth: 0.8, borderColor: '#333',
    borderRadius: 16, padding: 16, marginBottom: 20,
  },
  ratingWeightCol: { flex: 1, alignItems: 'center', gap: 8 },
  ratingWeightVsCol: { paddingHorizontal: 12 },
  ratingWeightLabel: { fontSize: 12, color: '#AAAAAA', fontWeight: '600' },
  ratingWeightAvatars: { flexDirection: 'row', gap: 4 },
  ratingWeightValue: { fontSize: 22, fontWeight: '800', color: '#D4AF37' },
  ratingWeightVs: { fontSize: 18, fontWeight: '700', color: '#D4AF37' },

  ratingRulesCard: {
    backgroundColor: '#1A1A1A', borderWidth: 0.8, borderColor: '#333',
    borderRadius: 16, padding: 16, marginBottom: 32, gap: 8,
  },
  ratingRulesTitle: { fontSize: 14, fontWeight: '700', color: '#D4AF37', marginBottom: 4 },
  ratingRuleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ratingRuleLabel: { fontSize: 13, color: '#AAAAAA', flex: 1 },
  ratingRuleValue: { fontSize: 14, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  ratingRulesNote: { fontSize: 11, color: '#555555', marginTop: 8 },

  // Delete
  deleteTitle: { fontSize: 24, fontWeight: '700', color: '#FF4444', marginTop: 20, marginBottom: 12 },
  deleteMessage: { fontSize: 16, color: '#AAAAAA', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  deleteButtons: { flexDirection: 'row', gap: 16, width: '100%', paddingHorizontal: 20 },
  deleteButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FF4444', borderRadius: 12, paddingVertical: 14,
  },
  deleteButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // Buttons
  primaryButton: {
    backgroundColor: '#D4AF37', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#000000' },
  secondaryButton: {
    flex: 1, backgroundColor: '#1A1A1A', borderWidth: 0.8, borderColor: '#D4AF37',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', color: '#D4AF37' },
  buttonDisabled: { opacity: 0.4 },

  resultButtons: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 32 },

  // Empty
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: '#AAAAAA', textAlign: 'center' },

  // Chat
  chatMessagesList: { padding: 20 },
  chatMessageItem: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  chatOwnMessageItem: { flexDirection: 'row-reverse' },
  chatBubble: {
    maxWidth: '75%', backgroundColor: '#1A1A1A', borderWidth: 0.8,
    borderColor: '#D4AF37', borderRadius: 12, padding: 12,
  },
  chatOwnBubble: { backgroundColor: '#D4AF37', borderColor: '#D4AF37' },
  chatSenderName: { fontSize: 14, fontWeight: '600', color: '#D4AF37', marginBottom: 4 },
  chatMessageText: { fontSize: 16, color: '#FFFFFF', marginBottom: 4 },
  chatOwnMessageText: { color: '#000000' },
  chatMessageTime: { fontSize: 12, color: '#AAAAAA' },
  chatOwnMessageTime: { color: 'rgba(0, 0, 0, 0.6)' },
  chatInputContainer: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12,
    backgroundColor: '#1A1A1A', borderTopWidth: 1, borderTopColor: '#D4AF37', gap: 12,
  },
  chatTextInput: {
    flex: 1, backgroundColor: '#000000', borderWidth: 0.8, borderColor: '#D4AF37',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 16, color: '#FFFFFF', maxHeight: 100,
  },
  chatSendButton: {
    width: 44, height: 44, backgroundColor: '#D4AF37', borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  chatSendButtonDisabled: { backgroundColor: '#666666' },
});

