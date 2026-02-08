import { supabase } from '@/constants/supabase';
import type { MatchWithDetails } from '@/types/match';
import Avatar from '@/components/Avatar';
import RangeSlider from 'rn-range-slider';
import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

const { width } = Dimensions.get('window');

interface MatchWithDistance extends MatchWithDetails {
  distance?: number; // Distance en km depuis la ville de l'utilisateur
}

export default function ExploreScreen() {
  const [matches, setMatches] = useState<MatchWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [userCity, setUserCity] = useState<string>('');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Filtres
  const [levelMin, setLevelMin] = useState(1.0);
  const [levelMax, setLevelMax] = useState(10.0);
  const [maxDistance, setMaxDistance] = useState(50); // km
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'full' | 'completed'>('open');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadUserCity();
  }, []);

  useEffect(() => {
    if (userCoords) {
      loadMatches();
    }
  }, [levelMin, levelMax, maxDistance, statusFilter, userCoords]);

  const loadUserCity = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('Profiles')
          .select('city')
          .eq('id', session.user.id)
          .single();

        if (profile?.city) {
          setUserCity(profile.city);

          // Récupérer les coordonnées de la ville depuis la table cities
          const { data: cityData } = await supabase
            .from('cities')
            .select('latitude, longitude')
            .ilike('name', profile.city)
            .single();

          if (cityData) {
            setUserCoords({
              lat: Number(cityData.latitude),
              lng: Number(cityData.longitude)
            });
          } else {
            // Si la ville n'est pas dans la table, charger quand même les matchs sans filtre de distance
            setUserCoords({ lat: 0, lng: 0 });
          }
        } else {
          // Pas de ville définie, charger les matchs sans filtre
          setUserCoords({ lat: 0, lng: 0 });
        }
      }
    } catch (error) {
      console.error('Erreur chargement ville:', error);
      setUserCoords({ lat: 0, lng: 0 });
    }
  };

  // Fonction pour calculer la distance entre deux points (formule de Haversine)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const loadMatches = async () => {
    try {
      setLoading(true);

      // DEBUG: Log des filtres actifs
      console.log(`[DEBUG] Filtres actifs: Niveau ${levelMin}-${levelMax}, Distance max ${maxDistance}km, Status: ${statusFilter}`);

      // Récupérer les parties avec les coordonnées des courts
      let query = supabase
        .from('matches')
        .select(`
          *,
          creator:Profiles!matches_creator_id_fkey(id, username, firstname, lastname, declared_level, avatar_url),
          court:courts(id, name, city, address, latitude, longitude)
        `)
        .gte('level_max', levelMin)
        .lte('level_min', levelMax)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('time_slot', { ascending: true });

      // Filtrer par statut si ce n'est pas "all"
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: matchesData, error: matchesError } = await query;

      if (matchesError) {
        console.error('Erreur chargement parties:', matchesError);
        return;
      }

      if (!matchesData) {
        setMatches([]);
        return;
      }

      // DEBUG: Log tous les matches récupérés
      console.log(`[DEBUG] ${matchesData.length} matches chargés depuis DB`);
      matchesData.forEach(m => {
        console.log(`  - Format ${m.format}, Niveau ${m.level_min}-${m.level_max}, Status ${m.status}`);
      });

      // Récupérer les participants avec leurs profils complets
      const matchIds = matchesData.map(m => m.id);
      const { data: participantsData } = await supabase
        .from('match_participants')
        .select(`
          match_id,
          user_id,
          profile:Profiles!match_participants_user_id_fkey(username, firstname, lastname, avatar_url, declared_level)
        `)
        .in('match_id', matchIds);

      // Construire les objets MatchWithDistance et calculer les distances
      const matchesWithDetails: MatchWithDistance[] = matchesData.map(match => {
        // Récupérer les participants pour ce match
        const matchParticipants = participantsData
          ?.filter((p: any) => p.match_id === match.id)
          .map((p: any) => ({
            user_id: p.user_id,
            username: p.profile?.username || 'Inconnu',
            firstname: p.profile?.firstname || '',
            lastname: p.profile?.lastname || '',
            declared_level: p.profile?.declared_level || 0,
            avatar_url: p.profile?.avatar_url || null,
          })) || [];

        const participants_count = matchParticipants.length;

        // Calculer la distance si les coordonnées sont disponibles
        let distance: number | undefined;
        if (userCoords && userCoords.lat !== 0 && match.court?.latitude && match.court?.longitude) {
          distance = calculateDistance(
            userCoords.lat,
            userCoords.lng,
            Number(match.court.latitude),
            Number(match.court.longitude)
          );
        }

        return {
          ...match,
          creator: match.creator || {
            id: '',
            username: 'Inconnu',
            firstname: 'Utilisateur',
            lastname: 'Inconnu',
            declared_level: 0,
            avatar_url: null
          },
          court: match.court || null,
          group: null,
          participants: matchParticipants,
          participants_count,
          distance
        };
      });

      // Filtrer par distance si disponible
      const filteredMatches = matchesWithDetails.filter(match => {
        // Si pas de distance calculée, garder le match
        if (match.distance === undefined) return true;
        // Sinon, filtrer par distance maximale
        return match.distance <= maxDistance;
      });

      // DEBUG: Log filtre distance
      console.log(`[DEBUG] Après filtre distance (max ${maxDistance}km): ${filteredMatches.length} matches`);
      filteredMatches.forEach(m => {
        console.log(`  - Format ${m.format}, Distance: ${m.distance?.toFixed(1) || 'N/A'}km`);
      });

      // Trier par distance (les plus proches en premier)
      filteredMatches.sort((a, b) => {
        if (a.distance === undefined) return 1;
        if (b.distance === undefined) return -1;
        return a.distance - b.distance;
      });

      setMatches(filteredMatches);
    } catch (error) {
      console.error('Exception:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];

    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const handleJoinMatch = async (match: MatchWithDistance) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Erreur', 'Vous devez être connecté');
        return;
      }

      // Vérifier si l'utilisateur est déjà participant
      const isAlreadyParticipant =
        match.creator.id === session.user.id ||
        match.participants.some(p => p.user_id === session.user.id);

      if (isAlreadyParticipant) {
        Alert.alert('Info', 'Vous participez déjà à cette partie');
        return;
      }

      // Vérifier s'il reste des places
      const totalParticipants = 1 + match.participants.filter(p => p.user_id !== match.creator.id).length;
      if (totalParticipants >= match.format) {
        Alert.alert('Info', 'Cette partie est complète');
        return;
      }

      // Ajouter l'utilisateur comme participant
      const { error } = await supabase
        .from('match_participants')
        .insert({
          match_id: match.id,
          user_id: session.user.id,
        });

      if (error) {
        Alert.alert('Erreur', error.message);
      } else {
        // Vérifier si la partie est maintenant complète
        const newTotalParticipants = totalParticipants + 1;
        if (newTotalParticipants >= match.format) {
          // Mettre à jour le statut à 'full'
          await supabase
            .from('matches')
            .update({ status: 'full' })
            .eq('id', match.id);
        }

        Alert.alert('Succès', 'Vous avez rejoint la partie !');
        // Recharger les matches
        loadMatches();
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de rejoindre la partie');
    }
  };

  const renderMatch = ({ item }: { item: MatchWithDistance }) => {
    // Calculer les participants autres que le créateur
    const otherParticipants = item.participants.filter(p => p.user_id !== item.creator.id);
    // Places restantes = format - 1 (créateur) - participants affichés
    const spotsLeft = item.format - 1 - otherParticipants.length;

    return (
      <Pressable style={styles.matchCard}>
        <View style={styles.matchHeader}>
          <View style={styles.matchDateContainer}>
            <Text style={styles.matchDate}>{formatDate(item.date)}</Text>
            <Text style={styles.matchTime}>{item.time_slot}</Text>
          </View>
          <View style={styles.matchSpotsContainer}>
            <Text style={styles.matchSpotsLabel}>Places restantes</Text>
            <Text style={[
              styles.matchSpots,
              spotsLeft === 0 && styles.matchSpotsFull
            ]}>
              {spotsLeft}/{item.format}
            </Text>
          </View>
        </View>

        <View style={styles.matchInfo}>
          <View style={styles.matchInfoRow}>
            <Text style={styles.matchInfoIcon}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.matchInfoText}>
                {item.court ? `${item.court.name} - ${item.court.city}` : 'Lieu non spécifié'}
              </Text>
              {item.distance !== undefined && (
                <Text style={styles.matchDistance}>
                  À {item.distance.toFixed(1)} km
                </Text>
              )}
            </View>
          </View>

          <View style={styles.matchInfoRow}>
            <Text style={styles.matchInfoIcon}>⭐</Text>
            <Text style={styles.matchInfoText}>
              Niveau {item.level_min.toFixed(1)} - {item.level_max.toFixed(1)}
            </Text>
          </View>

          <View style={styles.matchInfoRow}>
            <Text style={styles.matchInfoIcon}>⏱️</Text>
            <Text style={styles.matchInfoText}>
              {item.duration_minutes} min · {item.format} joueurs
            </Text>
          </View>

          <View style={styles.matchInfoRow}>
            <Text style={styles.matchInfoIcon}>👤</Text>
            <Text style={styles.matchInfoText}>
              Organisé par {item.creator.username}
            </Text>
          </View>
        </View>

        {/* Avatars des participants */}
        <View style={styles.participantsSection}>
          <Text style={styles.participantsLabel}>
            Participants ({1 + otherParticipants.length}/{item.format})
          </Text>
          <View style={styles.participantsAvatars}>
            {/* Créateur toujours en premier */}
            <View style={styles.avatarWrapper}>
              <Avatar
                imageUrl={item.creator.avatar_url}
                firstName={item.creator.firstname || 'U'}
                lastName={item.creator.lastname || 'ser'}
                size={48}
              />
            </View>

            {/* Autres participants (sauf le créateur pour éviter doublon) */}
            {otherParticipants.map((participant) => (
                <View key={participant.user_id} style={styles.avatarWrapper}>
                  <Avatar
                    imageUrl={participant.avatar_url}
                    firstName={participant.firstname || 'U'}
                    lastName={participant.lastname || 'ser'}
                    size={48}
                  />
                </View>
              ))}

            {/* Places vides */}
            {Array.from({ length: spotsLeft }).map((_, index) => (
              <View
                key={`empty-${index}`}
                style={[styles.avatarWrapper, styles.emptyAvatar]}
              >
                <Text style={styles.emptyAvatarText}>?</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.matchFooter}>
          <Pressable
            style={styles.joinButton}
            onPress={() => handleJoinMatch(item)}
          >
            <Text style={styles.joinButtonText}>Rejoindre</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  };

  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Niveau requis</Text>
        <View style={styles.rangeValueContainer}>
          <View style={styles.rangeValueBox}>
            <Text style={styles.rangeValueLabel}>Min</Text>
            <Text style={styles.rangeValue}>{levelMin.toFixed(1)}</Text>
          </View>
          <Text style={styles.rangeValueSeparator}>-</Text>
          <View style={styles.rangeValueBox}>
            <Text style={styles.rangeValueLabel}>Max</Text>
            <Text style={styles.rangeValue}>{levelMax.toFixed(1)}</Text>
          </View>
        </View>

        <RangeSlider
          style={styles.rangeSlider}
          min={1}
          max={10}
          step={0.1}
          low={levelMin}
          high={levelMax}
          renderThumb={() => <View style={styles.thumb} />}
          renderRail={() => <View style={styles.rail} />}
          renderRailSelected={() => <View style={styles.railSelected} />}
          onValueChanged={(low, high) => {
            const newMin = Math.round(low * 10) / 10;
            const newMax = Math.round(high * 10) / 10;
            if (newMin !== levelMin || newMax !== levelMax) {
              setLevelMin(newMin);
              setLevelMax(newMax);
            }
          }}
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>Débutant (1)</Text>
          <Text style={styles.sliderLabel}>Expert (10)</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Distance maximale</Text>
        <View style={styles.distanceValueContainer}>
          <Text style={styles.distanceValue}>{maxDistance} km</Text>
          {userCity && (
            <Text style={styles.distanceSubtext}>depuis {userCity}</Text>
          )}
        </View>

        <Slider
          style={styles.slider}
          minimumValue={5}
          maximumValue={200}
          step={5}
          value={maxDistance}
          onValueChange={(value) => setMaxDistance(value)}
          minimumTrackTintColor="#0066FF"
          maximumTrackTintColor="rgba(255,255,255,0.3)"
          thumbTintColor="#0066FF"
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>5 km</Text>
          <Text style={styles.sliderLabel}>200 km</Text>
        </View>

        {userCoords && userCoords.lat === 0 && (
          <View style={styles.distanceNote}>
            <Text style={styles.distanceNoteText}>
              ℹ️ Votre ville n'est pas encore dans notre base. Les distances ne seront pas calculées.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Statut des parties</Text>
        <View style={styles.statusButtonsContainer}>
          <Pressable
            style={[styles.statusButton, statusFilter === 'all' && styles.statusButtonActive]}
            onPress={() => setStatusFilter('all')}
          >
            <Text style={[styles.statusButtonText, statusFilter === 'all' && styles.statusButtonTextActive]}>
              Toutes
            </Text>
          </Pressable>
          <Pressable
            style={[styles.statusButton, statusFilter === 'open' && styles.statusButtonActive]}
            onPress={() => setStatusFilter('open')}
          >
            <Text style={[styles.statusButtonText, statusFilter === 'open' && styles.statusButtonTextActive]}>
              Ouvertes
            </Text>
          </Pressable>
          <Pressable
            style={[styles.statusButton, statusFilter === 'full' && styles.statusButtonActive]}
            onPress={() => setStatusFilter('full')}
          >
            <Text style={[styles.statusButtonText, statusFilter === 'full' && styles.statusButtonTextActive]}>
              Complètes
            </Text>
          </Pressable>
          <Pressable
            style={[styles.statusButton, statusFilter === 'completed' && styles.statusButtonActive]}
            onPress={() => setStatusFilter('completed')}
          >
            <Text style={[styles.statusButtonText, statusFilter === 'completed' && styles.statusButtonTextActive]}>
              Terminées
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔍 Chercher une partie</Text>
        <Pressable
          style={styles.filterToggle}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Text style={styles.filterToggleText}>
            {showFilters ? 'Masquer filtres' : 'Filtres'}
          </Text>
        </Pressable>
      </View>

      {showFilters && renderFilters()}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066FF" />
        </View>
      ) : (
        <FlatList
          data={matches}
          renderItem={renderMatch}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Aucune partie disponible</Text>
              <Text style={styles.emptySubtext}>
                Essayez d'ajuster vos filtres ou créez une nouvelle partie
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },
  filterToggle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,102,255,0.2)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#0066FF',
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066FF',
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  filterSection: {
    marginBottom: 24,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 16,
  },
  rangeValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 20,
  },
  rangeValueBox: {
    alignItems: 'center',
  },
  rangeValueLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  rangeValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#00D9C0',
  },
  rangeValueSeparator: {
    fontSize: 24,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
  },
  rangeSlider: {
    width: width - 80,
    height: 40,
    alignSelf: 'center',
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0066FF',
    borderWidth: 2,
    borderColor: 'white',
  },
  rail: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  railSelected: {
    height: 4,
    backgroundColor: '#00D9C0',
    borderRadius: 2,
  },
  slider: {
    width: width - 80,
    height: 40,
    alignSelf: 'center',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: width - 80,
    marginTop: 8,
    alignSelf: 'center',
  },
  sliderLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  distanceValueContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  distanceValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0066FF',
  },
  distanceSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  distanceNote: {
    backgroundColor: 'rgba(0,102,255,0.1)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,102,255,0.3)',
  },
  distanceNoteText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  statusButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  statusButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  statusButtonTextActive: {
    color: 'white',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 20,
  },
  matchCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  matchDateContainer: {
    flex: 1,
  },
  matchDate: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
    marginBottom: 4,
  },
  matchTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0066FF',
  },
  matchSpotsContainer: {
    alignItems: 'flex-end',
  },
  matchSpotsLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  matchSpots: {
    fontSize: 24,
    fontWeight: '700',
    color: '#00D9C0',
  },
  matchSpotsFull: {
    color: '#FF4444',
  },
  matchInfo: {
    marginBottom: 16,
  },
  matchInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  matchInfoIcon: {
    fontSize: 16,
    marginRight: 8,
    width: 20,
  },
  matchInfoText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    flex: 1,
  },
  matchDistance: {
    fontSize: 12,
    color: '#00D9C0',
    marginTop: 2,
    fontWeight: '600',
  },
  participantsSection: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  participantsLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 10,
  },
  participantsAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarWrapper: {
    position: 'relative',
  },
  emptyAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'white',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyAvatarText: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
  },
  matchFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  joinButton: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
});
