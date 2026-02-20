import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/constants/supabase';
import type { TournamentWithDetails, TournamentDemand, TournamentMessage } from '@/types/tournament';
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
  View,
} from 'react-native';
import Avatar from '@/components/Avatar';

const { width } = Dimensions.get('window');

type Tab = 'details' | 'chat' | 'demands' | 'delete';

interface TabConfig {
  key: Tab;
  icon: string;
  title: string;
  showWhen: (status: string, isCreator: boolean) => boolean;
}

const TABS: TabConfig[] = [
  { key: 'details', icon: 'create-outline', title: 'Détails', showWhen: () => true },
  { key: 'chat', icon: 'chatbubbles-outline', title: 'Chat', showWhen: () => true },
  { key: 'demands', icon: 'notifications-outline', title: 'Demandes', showWhen: (_s, c) => c },
  { key: 'delete', icon: 'trash-outline', title: 'Supprimer', showWhen: (s, c) => s === 'searching' && c },
];

export default function MyTournamentDetailScreen() {
  const { backgroundImage } = useTheme();
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [tournament, setTournament] = useState<TournamentWithDetails | null>(null);

  // Demandes
  const [demands, setDemands] = useState<TournamentDemand[]>([]);
  const [processingDemand, setProcessingDemand] = useState<string | null>(null);

  // Chat
  const [messages, setMessages] = useState<TournamentMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const isCreator = tournament?.creator_id === currentUserId;

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    if (tab === 'chat' || tab === 'details' || tab === 'demands' || tab === 'delete') {
      setActiveTab(tab);
    }
  }, [tab]);

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setCurrentUserId(session.user.id);

      const { data: tournamentData, error } = await supabase
        .from('tournaments')
        .select(`
          *,
          creator:profiles!tournaments_creator_id_fkey(id, username, firstname, lastname, declared_level, community_level, community_level_votes, avatar_url),
          court:courts(id, name, city, address)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      setTournament({
        ...tournamentData,
        creator: tournamentData.creator || {
          id: '',
          username: 'Inconnu',
          firstname: 'Utilisateur',
          lastname: 'Inconnu',
          declared_level: 0,
          community_level: null,
          community_level_votes: 0,
          avatar_url: null,
        },
        court: tournamentData.court || null,
      });

      await Promise.all([loadDemands(), loadMessages()]);
    } catch (error) {
      console.error('Erreur:', error);
      Alert.alert('Erreur', 'Impossible de charger le tournoi');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadDemands = async () => {
    const { data } = await supabase
      .from('tournament_demands')
      .select(`
        id, tournament_id, user_id, status, created_at,
        profile:profiles!tournament_demands_user_id_fkey(username, firstname, lastname, declared_level, community_level, community_level_votes, avatar_url)
      `)
      .eq('tournament_id', id)
      .order('created_at', { ascending: true });
    setDemands((data as any) || []);
  };

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('tournament_messages')
        .select(`
          id, tournament_id, user_id, message, created_at,
          sender:profiles!tournament_messages_user_id_fkey(username, firstname, lastname, avatar_url)
        `)
        .eq('tournament_id', id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      setMessages((data as any) || []);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      console.error('Erreur chargement messages:', error);
    }
  };

  // Realtime subscription pour les messages
  useEffect(() => {
    const channel = supabase
      .channel(`tournament-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tournament_messages', filter: `tournament_id=eq.${id}` },
        async (payload) => {
          const { data, error } = await supabase
            .from('tournament_messages')
            .select(`
              id, tournament_id, user_id, message, created_at,
              sender:profiles!tournament_messages_user_id_fkey(username, firstname, lastname, avatar_url)
            `)
            .eq('id', payload.new.id)
            .single();

          if (data && !error) {
            setMessages((prev) => {
              if (prev.some((msg) => msg.id === data.id)) return prev;
              return [...prev, data as any];
            });
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sendingMessage) return;
    const messageText = newMessage.trim();
    setSendingMessage(true);
    setNewMessage('');

    try {
      const { data, error } = await supabase
        .from('tournament_messages')
        .insert({ tournament_id: id, user_id: currentUserId, message: messageText })
        .select(`
          id, tournament_id, user_id, message, created_at,
          sender:profiles!tournament_messages_user_id_fkey(username, firstname, lastname, avatar_url)
        `)
        .single();

      if (error) throw error;
      if (data) {
        setMessages((prev) => [...prev, data as any]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (error: any) {
      Alert.alert('Erreur', "Impossible d'envoyer le message");
      setNewMessage(messageText);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleAcceptDemand = async (demand: TournamentDemand) => {
    setProcessingDemand(demand.id);
    try {
      await supabase
        .from('tournament_demands')
        .update({ status: 'accepted' })
        .eq('id', demand.id);

      // Optionnel : mettre le tournoi en "partner_found"
      await supabase
        .from('tournaments')
        .update({ status: 'partner_found' })
        .eq('id', id);

      await loadData();
      Alert.alert('Succès', 'Demande acceptée');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || "Impossible d'accepter");
    } finally {
      setProcessingDemand(null);
    }
  };

  const handleRejectDemand = async (demand: TournamentDemand) => {
    setProcessingDemand(demand.id);
    try {
      await supabase
        .from('tournament_demands')
        .update({ status: 'rejected' })
        .eq('id', demand.id);

      // Si on remet le statut à searching si on rejette après avoir accepté
      if (demand.status === 'accepted') {
        const { data: otherAccepted } = await supabase
          .from('tournament_demands')
          .select('id')
          .eq('tournament_id', id)
          .eq('status', 'accepted');
        // S'il n'y a plus d'acceptés (en dehors de celui qu'on vient de rejeter)
        if (!otherAccepted || otherAccepted.length <= 1) {
          await supabase
            .from('tournaments')
            .update({ status: 'searching' })
            .eq('id', id);
        }
      }

      await loadData();
      Alert.alert('Succès', 'Demande refusée');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de refuser');
    } finally {
      setProcessingDemand(null);
    }
  };

  const handleDeleteTournament = () => {
    Alert.alert(
      'Supprimer la recherche',
      'Souhaitez-vous vraiment supprimer cette recherche de partenaire ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('tournaments').delete().eq('id', id);
              if (error) throw error;
              Alert.alert('Succès', 'Recherche supprimée');
              router.back();
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const renderLevelBadge = (declared: number, community: number | null, votes: number) => {
    if (!community || votes === 0) {
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

  // === ONGLET DÉTAILS ===
  const renderDetailsTab = () => {
    if (!tournament) return null;
    const canEdit = isCreator && tournament.status === 'searching';

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.tabTitle}>
          {canEdit ? 'Détails de la recherche' : 'Récapitulatif'}
        </Text>

        {canEdit && (
          <Pressable
            style={styles.editButton}
            onPress={() => router.push(`/edit-tournament/${tournament.id}` as any)}
          >
            <Ionicons name="create" size={20} color="#000000" />
            <Text style={styles.editButtonText}>Modifier dans l'éditeur</Text>
          </Pressable>
        )}

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>{formatDate(tournament.date)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Heure</Text>
            <Text style={styles.infoValue}>{tournament.time_slot || 'Non précisée'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="trophy" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Catégorie</Text>
            <Text style={styles.infoValue}>{tournament.category}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="people" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Type</Text>
            <Text style={styles.infoValue}>{tournament.event_type}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="person" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Âge</Text>
            <Text style={styles.infoValue}>{tournament.age_category}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="podium" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Classement min.</Text>
            <Text style={styles.infoValue}>{tournament.min_ranking}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="hand-left" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Position</Text>
            <Text style={styles.infoValue}>{tournament.player_position}</Text>
          </View>
          {tournament.court && (
            <View style={styles.infoRow}>
              <Ionicons name="location" size={20} color="#D4AF37" />
              <Text style={styles.infoLabel}>Club</Text>
              <Text style={styles.infoValue}>
                {tournament.court.name} - {tournament.court.city}
              </Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Ionicons name="flag" size={20} color="#D4AF37" />
            <Text style={styles.infoLabel}>Statut</Text>
            <Text
              style={[
                styles.infoValue,
                {
                  color:
                    tournament.status === 'partner_found'
                      ? '#44DD44'
                      : tournament.status === 'searching'
                      ? '#D4AF37'
                      : '#AAAAAA',
                },
              ]}
            >
              {tournament.status === 'searching'
                ? 'En recherche'
                : tournament.status === 'partner_found'
                ? 'Partenaire trouvé'
                : 'Annulé'}
            </Text>
          </View>
        </View>

        {/* Créateur */}
        <Text style={styles.subTitle}>Créateur</Text>
        <View style={styles.participantItem}>
          <Avatar
            imageUrl={tournament.creator.avatar_url}
            firstName={tournament.creator.firstname}
            lastName={tournament.creator.lastname}
            size={48}
          />
          <View style={styles.participantInfo}>
            <Text style={styles.participantName}>
              {tournament.creator.firstname} {tournament.creator.lastname}
            </Text>
            {renderLevelBadge(
              tournament.creator.declared_level,
              tournament.creator.community_level,
              tournament.creator.community_level_votes
            )}
          </View>
          <View style={styles.creatorTag}>
            <Ionicons name="star" size={12} color="#000000" />
          </View>
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
                  {new Date(item.created_at).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
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
          style={[
            styles.chatSendButton,
            (!newMessage.trim() || sendingMessage) && styles.chatSendButtonDisabled,
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

  // === ONGLET DEMANDES ===
  const renderDemandsTab = () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isTournamentPast = tournament ? tournament.date < todayStr : false;

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.tabTitle}>Demandes reçues</Text>
        {isTournamentPast && (
          <View style={styles.pastBanner}>
            <Ionicons name="lock-closed" size={16} color="#FF4444" />
            <Text style={styles.pastBannerText}>Tournoi terminé — les demandes ne peuvent plus être modifiées</Text>
          </View>
        )}
        {demands.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-outline" size={48} color="#D4AF37" />
            <Text style={styles.emptyText}>Aucune demande pour le moment</Text>
          </View>
        ) : (
          demands.map((demand) => (
            <View
              key={demand.id}
              style={[
                styles.requestItem,
                demand.status === 'accepted' && styles.requestItemAccepted,
                demand.status === 'rejected' && styles.requestItemRejected,
              ]}
            >
              <Avatar
                imageUrl={demand.profile?.avatar_url}
                firstName={demand.profile?.firstname || 'U'}
                lastName={demand.profile?.lastname || 'ser'}
                size={48}
              />
              <View style={styles.requestInfo}>
                <Text style={styles.requestName}>
                  {demand.profile?.firstname} {demand.profile?.lastname}
                </Text>
                <Text style={styles.requestLevel}>
                  {demand.profile?.declared_level.toFixed(1)}
                  {demand.profile?.community_level_votes > 0 &&
                  demand.profile?.community_level != null
                    ? ` / ${demand.profile.community_level.toFixed(1)}`
                    : ''}
                </Text>
                {demand.status !== 'pending' && (
                  <Text
                    style={[
                      styles.requestStatus,
                      { color: demand.status === 'accepted' ? '#44DD44' : '#FF4444' },
                    ]}
                  >
                    {demand.status === 'accepted' ? 'Accepté' : 'Refusé'}
                  </Text>
                )}
              </View>
              {!isTournamentPast && (
                processingDemand === demand.id ? (
                  <ActivityIndicator size="small" color="#D4AF37" />
                ) : (
                  <View style={styles.requestActions}>
                    <Pressable
                      style={[
                        styles.acceptButton,
                        demand.status === 'accepted' && styles.acceptButtonActive,
                      ]}
                      onPress={() => handleAcceptDemand(demand)}
                    >
                      <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                    </Pressable>
                    <Pressable
                      style={[
                        styles.rejectButton,
                        demand.status === 'rejected' && styles.rejectButtonActive,
                      ]}
                      onPress={() => handleRejectDemand(demand)}
                    >
                      <Ionicons name="close" size={24} color="#FFFFFF" />
                    </Pressable>
                  </View>
                )
              )}
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  // === ONGLET SUPPRIMER ===
  const renderDeleteTab = () => (
    <View style={[styles.tabContent, styles.centered]}>
      <Ionicons name="warning" size={64} color="#FF4444" />
      <Text style={styles.deleteTitle}>Supprimer la recherche</Text>
      <Text style={styles.deleteMessage}>
        Souhaitez-vous vraiment supprimer cette recherche de partenaire ?{'\n'}
        Cette action est irréversible.
      </Text>
      <View style={styles.deleteButtons}>
        <Pressable style={styles.secondaryButton} onPress={() => setActiveTab('details')}>
          <Text style={styles.secondaryButtonText}>Annuler</Text>
        </Pressable>
        <Pressable style={styles.deleteButton} onPress={handleDeleteTournament}>
          <Ionicons name="trash" size={20} color="#FFFFFF" />
          <Text style={styles.deleteButtonText}>Supprimer</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'details':
        return renderDetailsTab();
      case 'chat':
        return renderChatTab();
      case 'demands':
        return renderDemandsTab();
      case 'delete':
        return renderDeleteTab();
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  const visibleTabs = TABS.filter((t) => t.showWhen(tournament?.status || '', isCreator));

  return (
    <ImageBackground source={backgroundImage} resizeMode="cover" style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#D4AF37" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Recherche de partenaire</Text>
          {tournament && (
            <Text style={styles.headerSubtitle}>
              {formatDate(tournament.date)} · {tournament.category}
            </Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab bar */}
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
              color={
                activeTab === tab.key
                  ? '#000000'
                  : tab.key === 'delete'
                  ? '#FF4444'
                  : '#D4AF37'
              }
            />
          </Pressable>
        ))}
      </View>

      {renderActiveTab()}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  centered: { justifyContent: 'center', alignItems: 'center' },

  // Header
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
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#D4AF37' },
  headerSubtitle: { fontSize: 14, color: '#AAAAAA', marginTop: 4 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  tabItemActive: { backgroundColor: '#D4AF37' },

  // Tab content
  tabContent: { flex: 1, padding: 20 },
  tabTitle: { fontSize: 20, fontWeight: '700', color: '#D4AF37', marginBottom: 16 },
  subTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', marginTop: 24, marginBottom: 12 },

  // Info card
  infoCard: {
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoLabel: { flex: 1, fontSize: 14, color: '#AAAAAA' },
  infoValue: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },

  // Edit button
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D4AF37',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  editButtonText: { fontSize: 16, fontWeight: '600', color: '#000000' },

  // Participants / Creator
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 12,
  },
  participantInfo: { flex: 1 },
  participantName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  levelText: { fontSize: 14, color: '#AAAAAA', marginTop: 2 },
  creatorTag: {
    backgroundColor: '#D4AF37',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Requests/Demands
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  requestInfo: { flex: 1 },
  requestName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  requestLevel: { fontSize: 14, color: '#AAAAAA', marginTop: 4 },
  requestActions: { flexDirection: 'row', gap: 8 },
  requestItemAccepted: { borderColor: '#44DD44' },
  requestItemRejected: { borderColor: '#FF4444', opacity: 0.7 },
  requestStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  acceptButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.8,
    borderColor: '#44DD44',
  },
  acceptButtonActive: { backgroundColor: '#44DD44' },
  rejectButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.8,
    borderColor: '#FF4444',
  },
  rejectButtonActive: { backgroundColor: '#FF4444' },

  // Delete
  deleteTitle: { fontSize: 24, fontWeight: '700', color: '#FF4444', marginTop: 20, marginBottom: 12 },
  deleteMessage: {
    fontSize: 16,
    color: '#AAAAAA',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  deleteButtons: { flexDirection: 'row', gap: 16, width: '100%', paddingHorizontal: 20 },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF4444',
    borderRadius: 12,
    paddingVertical: 14,
  },
  deleteButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // Buttons
  secondaryButton: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', color: '#D4AF37' },

  // Empty
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: '#AAAAAA', textAlign: 'center' },

  // Chat
  chatMessagesList: { padding: 20 },
  chatMessageItem: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  chatOwnMessageItem: { flexDirection: 'row-reverse' },
  chatBubble: {
    maxWidth: '75%',
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 12,
  },
  chatOwnBubble: { backgroundColor: '#D4AF37', borderColor: '#D4AF37' },
  chatSenderName: { fontSize: 14, fontWeight: '600', color: '#D4AF37', marginBottom: 4 },
  chatMessageText: { fontSize: 16, color: '#FFFFFF', marginBottom: 4 },
  chatOwnMessageText: { color: '#000000' },
  chatMessageTime: { fontSize: 12, color: '#AAAAAA' },
  chatOwnMessageTime: { color: 'rgba(0, 0, 0, 0.6)' },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#D4AF37',
    gap: 12,
  },
  chatTextInput: {
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
  chatSendButton: {
    width: 44,
    height: 44,
    backgroundColor: '#D4AF37',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendButtonDisabled: { backgroundColor: '#666666' },
  pastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
    borderWidth: 0.8,
    borderColor: '#FF4444',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  pastBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#FF4444',
    fontWeight: '600',
  },
});


