import { supabase } from '@/constants/supabase';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

const { width } = Dimensions.get('window');

interface MyMatch {
  id: string;
  date: string;
  time_slot: string;
  format: number;
  level_min: number;
  level_max: number;
  status: string;
  participants_count: number;
  court: { name: string; city: string } | null;
}

export default function HomeScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myMatches, setMyMatches] = useState<MyMatch[]>([]);

  useEffect(() => {
    loadProfile();
  }, []);

  // Recharger les matches quand on revient sur cette page
  useFocusEffect(
    useCallback(() => {
      loadMyMatches();
    }, [])
  );

  const loadProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase
          .from('Profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setProfile(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMyMatches = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Récupérer les matches créés par l'utilisateur
      const { data: matchesData } = await supabase
        .from('matches')
        .select(`
          *,
          court:courts(name, city)
        `)
        .eq('creator_id', session.user.id)
        .in('status', ['open', 'full'])
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('time_slot', { ascending: true })
        .limit(10);

      if (matchesData) {
        // Récupérer le nombre de participants pour chaque match
        const matchIds = matchesData.map(m => m.id);
        const { data: participantsData } = await supabase
          .from('match_participants')
          .select('match_id')
          .in('match_id', matchIds);

        const matchesWithCount = matchesData.map(match => ({
          ...match,
          participants_count: participantsData?.filter(p => p.match_id === match.id).length || 0
        }));

        setMyMatches(matchesWithCount);
      }
    } catch (error) {
      console.error('Erreur chargement matches:', error);
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

  const handleDeleteMatch = (matchId: string, matchDate: string) => {
    Alert.alert(
      'Supprimer la partie',
      `Voulez-vous vraiment supprimer la partie du ${matchDate} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('matches')
                .delete()
                .eq('id', matchId);

              if (error) throw error;

              // Recharger la liste
              loadMyMatches();
              Alert.alert('Succès', 'Partie supprimée');
            } catch (error: any) {
              Alert.alert('Erreur', error.message || 'Impossible de supprimer la partie');
            }
          }
        }
      ]
    );
  };

  const handleMatchPress = (match: MyMatch) => {
    Alert.alert(
      'Gérer la partie',
      `Partie du ${formatDate(match.date)} à ${match.time_slot}`,
      [
        {
          text: 'Éditer',
          onPress: () => router.push(`/edit-match/${match.id}`)
        },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => handleDeleteMatch(match.id, formatDate(match.date))
        },
        { text: 'Annuler', style: 'cancel' }
      ]
    );
  };

  if (loading) return <ActivityIndicator size="large" style={styles.loader} />;

  // Si pas de profil, rediriger vers la création de profil
  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>🏓 Bienvenue !</Text>
        <Text style={styles.subtitle}>Créez votre profil pour commencer</Text>
        <Pressable style={styles.createProfileButton} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={styles.createProfileButtonText}>Créer mon profil</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header avec logo */}
      <View style={styles.header}>
        <View style={styles.logoSmall}>
          <Svg width="30" height="40" viewBox="0 0 45 60" fill="none">
            <Path 
              d="M22.5 0C10.08 0 0 10.08 0 22.5C0 35.625 22.5 60 22.5 60C22.5 60 45 35.625 45 22.5C45 10.08 34.92 0 22.5 0Z" 
              fill="#0066FF"
            />
            <Circle cx="22.5" cy="22.5" r="10" fill="white"/>
            <Circle cx="22.5" cy="22.5" r="6" fill="#00D9C0"/>
          </Svg>
          <Text style={styles.logoTextSmall}>Linkerra</Text>
        </View>
        <Text style={styles.welcomeText}>Bonjour, {profile.username} 👋</Text>
      </View>

      {/* Bloc principal - Chercher une partie */}
      <Pressable style={styles.mainBlock} onPress={() => router.push('/(tabs)/explore')}>
        <View style={styles.mainBlockContent}>
          <Text style={styles.mainBlockIcon}>🔍</Text>
          <View>
            <Text style={styles.mainBlockTitle}>Chercher une partie</Text>
            <Text style={styles.mainBlockSubtitle}>Trouvez des matchs près de chez vous</Text>
          </View>
        </View>
      </Pressable>

      {/* Grille de blocs d'actions */}
      <View style={styles.actionsGrid}>
        {/* Créer une partie */}
        <Pressable
          style={styles.actionBlock}
          onPress={() => router.push('/create-match')}
        >
          <View style={styles.actionBlockOverlay} />
          <View style={styles.greenBorder} />
          <Text style={styles.actionBlockIcon}>➕</Text>
          <Text style={styles.actionBlockTitle}>Créer une partie</Text>
        </Pressable>

        {/* Mes statistiques */}
        <Pressable
          style={styles.actionBlock}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <View style={styles.actionBlockOverlay} />
          <View style={styles.greenBorder} />
          <Text style={styles.actionBlockIcon}>📊</Text>
          <Text style={styles.actionBlockTitle}>Mes statistiques</Text>
        </Pressable>
      </View>

      {/* Carrousel des groupes privés */}
      <View style={styles.groupsSection}>
        <Text style={styles.sectionTitle}>Groupes privés</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.groupsCarousel}
        >
          {/* Exemple de groupes - à remplacer par vos vraies données */}
          <View style={styles.groupCard}>
            <View style={styles.groupCardBorder} />
            <Text style={styles.groupCardIcon}>🎾</Text>
            <Text style={styles.groupCardName}>Padel Paris 15</Text>
            <Text style={styles.groupCardMembers}>12 membres</Text>
          </View>

          <View style={styles.groupCard}>
            <View style={styles.groupCardBorder} />
            <Text style={styles.groupCardIcon}>⭐</Text>
            <Text style={styles.groupCardName}>Les Pros</Text>
            <Text style={styles.groupCardMembers}>8 membres</Text>
          </View>

          <View style={styles.groupCard}>
            <View style={styles.groupCardBorder} />
            <Text style={styles.groupCardIcon}>🏆</Text>
            <Text style={styles.groupCardName}>Tournoi Hebdo</Text>
            <Text style={styles.groupCardMembers}>24 membres</Text>
          </View>

          <Pressable style={[styles.groupCard, styles.addGroupCard]}>
            <View style={styles.groupCardBorder} />
            <Text style={styles.addGroupIcon}>+</Text>
            <Text style={styles.addGroupText}>Créer un groupe</Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Carrousel des parties créées */}
      {myMatches.length > 0 && (
        <View style={styles.matchesSection}>
          <Text style={styles.sectionTitle}>Mes parties ({myMatches.length})</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.matchesCarousel}
          >
            {myMatches.map((match) => (
              <Pressable
                key={match.id}
                style={styles.matchCard}
                onPress={() => handleMatchPress(match)}
              >
                <View style={styles.matchCardBorder} />

                {/* Date et heure */}
                <View style={styles.matchCardHeader}>
                  <Text style={styles.matchCardDate}>{formatDate(match.date)}</Text>
                  <Text style={styles.matchCardTime}>{match.time_slot}</Text>
                </View>

                {/* Lieu */}
                {match.court && (
                  <View style={styles.matchCardLocation}>
                    <Text style={styles.matchCardLocationIcon}>📍</Text>
                    <Text style={styles.matchCardLocationText} numberOfLines={1}>
                      {match.court.city}
                    </Text>
                  </View>
                )}

                {/* Niveau */}
                <View style={styles.matchCardInfo}>
                  <Text style={styles.matchCardInfoIcon}>⭐</Text>
                  <Text style={styles.matchCardInfoText}>
                    {match.level_min.toFixed(1)} - {match.level_max.toFixed(1)}
                  </Text>
                </View>

                {/* Participants */}
                <View style={styles.matchCardFooter}>
                  <View style={styles.matchCardParticipants}>
                    <Text style={styles.matchCardParticipantsIcon}>👥</Text>
                    <Text style={styles.matchCardParticipantsText}>
                      {match.participants_count}/{match.format}
                    </Text>
                  </View>
                  {match.status === 'full' && (
                    <View style={styles.matchCardFullBadge}>
                      <Text style={styles.matchCardFullText}>Complet</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loader: {
    flex: 1,
    backgroundColor: '#000000',
  },
  
  // Header
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  logoSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 15,
  },
  logoTextSmall: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
  },
  logoPadelSmall: {
    color: '#0066FF',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },

  // Bloc principal
  mainBlock: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#00D9C0',
    shadowColor: '#00D9C0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  mainBlockContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  mainBlockIcon: {
    fontSize: 40,
  },
  mainBlockTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  mainBlockSubtitle: {
    fontSize: 14,
    color: '#666',
  },

  // Grille d'actions
  actionsGrid: {
    flexDirection: 'row',
    gap: 15,
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  actionBlock: {
    flex: 1,
    height: 160,
    borderRadius: 16,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  actionBlockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  greenBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    backgroundColor: '#00D9C0',
  },
  actionBlockIcon: {
    fontSize: 36,
    marginBottom: 12,
    zIndex: 1,
  },
  actionBlockTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    zIndex: 1,
  },

  // Section groupes
  groupsSection: {
    paddingBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  groupsCarousel: {
    paddingHorizontal: 20,
    gap: 15,
  },
  groupCard: {
    width: 140,
    height: 140,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  groupCardBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    backgroundColor: '#00D9C0',
  },
  groupCardIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  groupCardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    marginBottom: 4,
  },
  groupCardMembers: {
    fontSize: 12,
    color: '#666',
  },
  addGroupCard: {
    borderWidth: 2,
    borderColor: '#00D9C0',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0, 217, 192, 0.1)',
  },
  addGroupIcon: {
    fontSize: 40,
    color: '#00D9C0',
    marginBottom: 8,
  },
  addGroupText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00D9C0',
    textAlign: 'center',
  },

  // Bouton créer profil (fallback)
  createProfileButton: {
    backgroundColor: '#0066FF',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    marginTop: 20,
  },
  createProfileButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
  },

  // Section matches
  matchesSection: {
    paddingBottom: 30,
  },
  matchesCarousel: {
    paddingHorizontal: 20,
    gap: 15,
  },
  matchCard: {
    width: 180,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
    gap: 12,
  },
  matchCardBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: 4,
    backgroundColor: '#0066FF',
  },
  matchCardHeader: {
    gap: 4,
  },
  matchCardDate: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  matchCardTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066FF',
  },
  matchCardLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchCardLocationIcon: {
    fontSize: 14,
  },
  matchCardLocationText: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  matchCardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchCardInfoIcon: {
    fontSize: 14,
  },
  matchCardInfoText: {
    fontSize: 13,
    color: '#666',
  },
  matchCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  matchCardParticipants: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchCardParticipantsIcon: {
    fontSize: 14,
  },
  matchCardParticipantsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  matchCardFullBadge: {
    backgroundColor: '#00D9C0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  matchCardFullText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
  },
});