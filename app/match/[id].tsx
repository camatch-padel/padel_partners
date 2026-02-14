import { supabase } from '@/constants/supabase';
import type { MatchMessage, MatchWithDetails } from '@/types/match';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import Avatar from '@/components/Avatar';

export default function MatchChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [match, setMatch] = useState<MatchWithDetails | null>(null);
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadMatchData();
    setupRealtimeSubscription();
  }, [id]);

  const loadMatchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      setCurrentUserId(session.user.id);

      // Charger les infos du match
      const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .select(`
          *,
          creator:Profiles!matches_creator_id_fkey(
            id,
            username,
            firstname,
            lastname,
            declared_level,
            avatar_url
          ),
          court:courts(
            id,
            name,
            city,
            address
          ),
          participants:match_participants(
            user_id,
            profile:Profiles!match_participants_user_id_fkey(
              username,
              firstname,
              lastname,
              declared_level,
              avatar_url
            )
          )
        `)
        .eq('id', id)
        .single();

      if (matchError) throw matchError;

      // Compter les participants
      const { data: participantsData } = await supabase
        .from('match_participants')
        .select('id')
        .eq('match_id', id);

      const matchWithDetails: MatchWithDetails = {
        ...matchData,
        participants_count: participantsData?.length || 0,
      };

      setMatch(matchWithDetails);

      // Charger les messages
      await loadMessages();
    } catch (error) {
      console.error('Erreur chargement:', error);
      Alert.alert('Erreur', 'Impossible de charger la partie');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('match_messages')
        .select(`
          id,
          match_id,
          user_id,
          message,
          created_at,
          sender:Profiles!match_messages_user_id_fkey(
            username,
            firstname,
            lastname,
            avatar_url
          )
        `)
        .eq('match_id', id)
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

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel(`match-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_messages',
          filter: `match_id=eq.${id}`,
        },
        async (payload) => {
          // Charger le message avec les infos du profil
          const { data, error } = await supabase
            .from('match_messages')
            .select(`
              id,
              match_id,
              user_id,
              message,
              created_at,
              sender:Profiles!match_messages_user_id_fkey(
                username,
                firstname,
                lastname,
                avatar_url
              )
            `)
            .eq('id', payload.new.id)
            .single();

          if (data && !error) {
            setMessages((prev) => {
              const exists = prev.some(msg => msg.id === data.id);
              if (exists) return prev;
              return [...prev, data as any];
            });

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
    setNewMessage('');

    try {
      const { data, error } = await supabase
        .from('match_messages')
        .insert({
          match_id: id,
          user_id: currentUserId,
          message: messageText,
        })
        .select(`
          id,
          match_id,
          user_id,
          message,
          created_at,
          sender:Profiles!match_messages_user_id_fkey(
            username,
            firstname,
            lastname,
            avatar_url
          )
        `)
        .single();

      if (error) throw error;

      if (data) {
        setMessages((prev) => [...prev, data as any]);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible d\'envoyer le message');
      setNewMessage(messageText);
    } finally {
      setSendingMessage(false);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const day = days[date.getDay()];
    const dayNum = date.getDate();
    const month = date.getMonth() + 1;
    return `${day} ${dayNum}/${month}`;
  };

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
          <View>
            <Text style={styles.headerTitle}>Chat de la partie</Text>
            <Text style={styles.headerSubtitle}>
              {formatDate(match?.date || '')} · {match?.time_slot} · {match?.court?.city}
            </Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Info visibilité */}
      <View style={styles.visibilityBanner}>
        <Ionicons
          name={match?.visibility === 'private' ? 'lock-closed' : 'globe'}
          size={16}
          color="#D4AF37"
        />
        <Text style={styles.visibilityText}>
          {match?.visibility === 'private'
            ? 'Chat privé - Réservé aux membres du groupe'
            : 'Chat public - Ouvert à tous'}
        </Text>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
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
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#D4AF37',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#AAAAAA',
    marginTop: 4,
    textAlign: 'center',
  },
  visibilityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  visibilityText: {
    fontSize: 13,
    color: '#D4AF37',
    fontWeight: '500',
  },
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
    borderWidth: 2,
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
    borderWidth: 2,
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
});


