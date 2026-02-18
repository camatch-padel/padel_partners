import { supabase } from '@/constants/supabase';
import { useNotifications } from '@/contexts/NotificationsContext';
import type { Notification } from '@/types/notification';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const NOTIF_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  match_full: 'people',
  match_player_joined: 'person-add',
  tournament_demand_new: 'trophy',
  tournament_demand_accepted: 'checkmark-circle',
  tournament_demand_rejected: 'close-circle',
  group_match_new: 'tennisball',
  nearby_match_new: 'location',
  group_tournament_new: 'trophy-outline',
};

const formatRelativeTime = (dateStr: string): string => {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `Il y a ${diffD}j`;
  const diffW = Math.floor(diffD / 7);
  return `Il y a ${diffW} sem.`;
};

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const { markAsRead, markAllAsRead, refreshUnreadCount } = useNotifications();

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [])
  );

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications((data as Notification[]) || []);
    } catch (error) {
      console.error('Erreur chargement notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePress = async (notif: Notification) => {
    if (!notif.is_read) {
      await markAsRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
    }

    if (notif.entity_type === 'match') {
      router.push(`/my-match/${notif.entity_id}` as any);
    } else {
      router.push(`/my-tournament/${notif.entity_id}` as any);
    }
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const hasUnread = notifications.some((n) => !n.is_read);

  const renderNotification = ({ item }: { item: Notification }) => {
    const iconName = NOTIF_ICONS[item.type] || 'notifications';
    const isAccepted = item.type === 'tournament_demand_accepted';
    const isRejected = item.type === 'tournament_demand_rejected';
    const iconColor = isAccepted ? '#44DD44' : isRejected ? '#FF4444' : '#D4AF37';

    return (
      <Pressable
        style={[styles.notifItem, !item.is_read && styles.notifItemUnread]}
        onPress={() => handlePress(item)}
      >
        <View style={[styles.notifIconContainer, !item.is_read && styles.notifIconContainerUnread]}>
          <Ionicons name={iconName} size={22} color={iconColor} />
        </View>
        <View style={styles.notifContent}>
          <View style={styles.notifHeader}>
            <Text style={[styles.notifTitle, !item.is_read && styles.notifTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.notifTime}>{formatRelativeTime(item.created_at)}</Text>
          </View>
          <Text style={styles.notifMessage} numberOfLines={2}>
            {item.message}
          </Text>
        </View>
        {!item.is_read && <View style={styles.unreadDot} />}
      </Pressable>
    );
  };

  return (
    <ImageBackground
      source={require('@/assets/images/piste-noire.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {hasUnread && (
          <Pressable style={styles.markAllButton} onPress={handleMarkAllAsRead}>
            <Text style={styles.markAllText}>Tout lire</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-off-outline" size={64} color="#D4AF37" />
              <Text style={styles.emptyText}>Aucune notification</Text>
              <Text style={styles.emptySubtext}>
                Vous serez notifié quand il se passe quelque chose
              </Text>
            </View>
          }
        />
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
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
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#D4AF37',
  },
  markAllButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D4AF37',
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 16 },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 0.8,
    borderColor: '#333333',
    gap: 12,
  },
  notifItemUnread: {
    borderColor: 'rgba(212, 175, 55, 0.5)',
    backgroundColor: 'rgba(212, 175, 55, 0.06)',
  },
  notifIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifIconContainerUnread: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
  },
  notifContent: { flex: 1 },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#AAAAAA',
    flex: 1,
    marginRight: 8,
  },
  notifTitleUnread: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  notifTime: {
    fontSize: 11,
    color: '#666666',
  },
  notifMessage: {
    fontSize: 13,
    color: '#AAAAAA',
    lineHeight: 18,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D4AF37',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#AAAAAA',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
