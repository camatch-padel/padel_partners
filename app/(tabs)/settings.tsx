import { useTheme } from '@/contexts/ThemeContext';
import { useNotificationPrefs } from '@/contexts/NotificationPrefsContext';
import { Ionicons } from '@expo/vector-icons';
import {
  ImageBackground,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import type { NotificationType } from '@/types/notification';

const NOTIF_LABELS: Record<NotificationType, string> = {
  match_full: 'Match complet',
  match_player_joined: 'Joueur rejoint mon match',
  tournament_demand_new: 'Nouvelle demande de tournoi',
  tournament_demand_accepted: 'Demande de tournoi acceptée',
  tournament_demand_rejected: 'Demande de tournoi refusée',
  group_match_new: 'Nouveau match dans mon groupe',
  nearby_match_new: 'Match à proximité',
  group_tournament_new: 'Nouveau tournoi dans mon groupe',
  group_message_new: 'Nouveau message dans mon groupe',
};

const NOTIF_ICONS: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  match_full: 'people',
  match_player_joined: 'person-add',
  tournament_demand_new: 'trophy',
  tournament_demand_accepted: 'checkmark-circle',
  tournament_demand_rejected: 'close-circle',
  group_match_new: 'tennisball',
  nearby_match_new: 'location',
  group_tournament_new: 'trophy-outline',
  group_message_new: 'chatbubble',
};

export default function SettingsScreen() {
  const { backgroundImage } = useTheme();
  const { prefs, setPref, setAllPrefs, allEnabled } = useNotificationPrefs();

  return (
    <ImageBackground source={backgroundImage} style={styles.container} resizeMode="cover">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Paramètres</Text>

        {/* === NOTIFICATIONS === */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          {/* Toggle global */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="notifications" size={20} color="#D4AF37" />
              <Text style={styles.rowLabel}>Toutes les notifications</Text>
            </View>
            <Switch
              value={allEnabled}
              onValueChange={setAllPrefs}
              trackColor={{ false: '#333', true: '#D4AF37' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.separator} />

          {/* Toggles individuels */}
          {(Object.keys(NOTIF_LABELS) as NotificationType[]).map((type, index, arr) => (
            <View key={type}>
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Ionicons name={NOTIF_ICONS[type]} size={18} color="#888" />
                  <Text style={styles.rowLabelSmall}>{NOTIF_LABELS[type]}</Text>
                </View>
                <Switch
                  value={prefs[type]}
                  onValueChange={(v) => setPref(type, v)}
                  trackColor={{ false: '#333', true: '#D4AF37' }}
                  thumbColor="#fff"
                  style={styles.switchSmall}
                />
              </View>
              {index < arr.length - 1 && <View style={styles.rowDivider} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#D4AF37',
    textAlign: 'center',
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D4AF37',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    borderWidth: 0.8,
    borderColor: 'rgba(212,175,55,0.3)',
    marginBottom: 28,
    overflow: 'hidden',
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  themeOptionActive: {
    backgroundColor: '#D4AF37',
  },
  themeOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
  },
  themeOptionTextActive: {
    color: '#000',
  },
  checkmark: {
    marginLeft: 'auto',
  },
  themeDivider: {
    height: 0.8,
    backgroundColor: 'rgba(212,175,55,0.3)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  rowLabelSmall: {
    fontSize: 14,
    color: '#CCC',
    flex: 1,
  },
  separator: {
    height: 0.8,
    backgroundColor: 'rgba(212,175,55,0.4)',
    marginVertical: 4,
  },
  rowDivider: {
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 16,
  },
  switchSmall: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
});
