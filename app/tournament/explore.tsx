import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/constants/supabase';
import Avatar from '@/components/Avatar';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { TournamentWithDistance } from '@/types/tournament';
import {
  TOURNAMENT_CATEGORIES,
  EVENT_TYPES,
  PLAYER_POSITIONS,
} from '@/constants/tournament-constants';

export default function TournamentExploreScreen() {
  const { backgroundImage, theme } = useTheme();
  const isDark = theme === 'dark';
  const [tournaments, setTournaments] = useState<TournamentWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationSource, setLocationSource] = useState<'gps' | 'club' | 'none'>('none');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Filtres
  const [maxDistance, setMaxDistance] = useState(50);
  const [sliderDistance, setSliderDistance] = useState(50);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [minRankingFilter, setMinRankingFilter] = useState(0);
  const [minRankingText, setMinRankingText] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadUserLocation();
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userCoords) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      loadTournaments();
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [maxDistance, categoryFilter, eventTypeFilter, minRankingFilter, positionFilter, userCoords]);

  const loadUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserCoords({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
        setLocationSource('gps');
        return;
      }

      // Fallback : coordonnées du club du profil
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('court_id')
          .eq('id', session.user.id)
          .single();

        if (profile?.court_id) {
          const { data: courtData } = await supabase
            .from('courts')
            .select('latitude, longitude')
            .eq('id', profile.court_id)
            .single();

          if (courtData?.latitude && courtData?.longitude) {
            setUserCoords({
              lat: Number(courtData.latitude),
              lng: Number(courtData.longitude),
            });
            setLocationSource('club');
            return;
          }
        }
      }

      setUserCoords({ lat: 0, lng: 0 });
      setLocationSource('none');
    } catch (error) {
      console.error('Erreur géolocalisation:', error);
      setUserCoords({ lat: 0, lng: 0 });
      setLocationSource('none');
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const loadTournaments = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('tournaments')
        .select(
          `
          *,
          creator:profiles!tournaments_creator_id_fkey(id, username, firstname, lastname, declared_level, community_level, avatar_url),
          court:courts(id, name, city, address, latitude, longitude)
        `
        )
        .eq('status', 'searching')
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (categoryFilter.length > 0) {
        query = query.in('category', categoryFilter);
      }
      if (eventTypeFilter !== 'all') {
        query = query.eq('event_type', eventTypeFilter);
      }
      if (minRankingFilter > 0) {
        query = query.gte('min_ranking', minRankingFilter);
      }
      if (positionFilter !== 'all') {
        query = query.eq('player_position', positionFilter);
      }

      const { data: tournamentsData, error } = await query;

      if (error) {
        console.error('Erreur chargement tournois:', error);
        return;
      }

      if (!tournamentsData) {
        setTournaments([]);
        return;
      }

      // Récupérer le nombre de demandes et messages
      const tournamentIds = tournamentsData.map((t) => t.id);

      const { data: demandsData } = await supabase
        .from('tournament_demands')
        .select('tournament_id')
        .in('tournament_id', tournamentIds)
        .eq('status', 'pending');

      const demandCountByTournament = new Map<string, number>();
      demandsData?.forEach((d: any) => {
        const count = demandCountByTournament.get(d.tournament_id) || 0;
        demandCountByTournament.set(d.tournament_id, count + 1);
      });

      const { data: messagesData } = await supabase
        .from('tournament_messages')
        .select('tournament_id')
        .in('tournament_id', tournamentIds);

      const messageCountByTournament = new Map<string, number>();
      messagesData?.forEach((m: any) => {
        const count = messageCountByTournament.get(m.tournament_id) || 0;
        messageCountByTournament.set(m.tournament_id, count + 1);
      });

      const tournamentsWithDetails: TournamentWithDistance[] = tournamentsData.map(
        (tournament) => {
          let distance: number | undefined;
          if (
            userCoords &&
            userCoords.lat !== 0 &&
            tournament.court?.latitude &&
            tournament.court?.longitude
          ) {
            distance = calculateDistance(
              userCoords.lat,
              userCoords.lng,
              Number(tournament.court.latitude),
              Number(tournament.court.longitude)
            );
          }

          return {
            ...tournament,
            creator: tournament.creator || {
              id: '',
              username: 'Inconnu',
              firstname: 'Utilisateur',
              lastname: 'Inconnu',
              declared_level: 0,
              community_level: null,
              avatar_url: null,
            },
            court: tournament.court || null,
            distance,
            demand_count: demandCountByTournament.get(tournament.id) || 0,
            message_count: messageCountByTournament.get(tournament.id) || 0,
          };
        }
      );

      // Filtrer par distance
      const filtered = tournamentsWithDetails.filter((t) => {
        if (t.distance === undefined) return true;
        return t.distance <= maxDistance;
      });

      // Trier par distance
      filtered.sort((a, b) => {
        if (a.distance === undefined) return 1;
        if (b.distance === undefined) return -1;
        return a.distance - b.distance;
      });

      setTournaments(filtered);
    } catch (error) {
      console.error('Exception:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = [
      'jan', 'fév', 'mar', 'avr', 'mai', 'juin',
      'juil', 'aoû', 'sep', 'oct', 'nov', 'déc',
    ];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const handleDemand = async (tournament: TournamentWithDistance) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Erreur', 'Vous devez être connecté');
        return;
      }

      if (tournament.creator.id === session.user.id) {
        Alert.alert('Info', 'C\'est votre propre recherche de partenaire');
        return;
      }

      const { error } = await supabase.from('tournament_demands').insert({
        tournament_id: tournament.id,
        user_id: session.user.id,
      });

      if (error) {
        if (error.code === '23505') {
          Alert.alert('Info', 'Vous avez déjà fait une demande pour ce tournoi');
        } else {
          throw error;
        }
      } else {
        Alert.alert('Succès', 'Votre demande a été envoyée !');
        loadTournaments();
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d\'envoyer la demande');
    }
  };

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const commitMinRankingFilter = () => {
    const numeric = Math.min(parseInt(minRankingText || '0', 10) || 0, 999999);
    setMinRankingFilter(numeric);
    setMinRankingText(numeric === 0 ? '' : String(numeric));
  };

  const renderLevelText = (
    declared: number,
    communityLevel: number | null
  ) => {
    if (communityLevel == null) {
      return <Text style={styles.avatarLevel}>{declared.toFixed(1)}</Text>;
    }
    const isLower = communityLevel < declared;
    return (
      <Text style={styles.avatarLevel}>
        {declared.toFixed(1)}
        <Text style={{ color: isLower ? '#FF4444' : '#44DD44' }}>
          {' / '}
          {communityLevel.toFixed(1)}
        </Text>
      </Text>
    );
  };

  const renderTournament = ({ item }: { item: TournamentWithDistance }) => {
    const isExpanded = expandedCards.has(item.id);

    return (
      <Pressable style={[styles.card, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]} onPress={() => toggleCard(item.id)}>
        {/* Header toujours visible */}
        <View style={styles.cardHeader}>
          <View style={styles.cardDateContainer}>
            <Text style={[styles.cardDate, !isDark && { color: '#111111' }]}>{formatDate(item.date)}</Text>
            <Text style={styles.cardTime}>
              {item.time_slot || 'Heure non précisée'}
            </Text>
          </View>
          <View style={styles.cardBadges}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{item.category}</Text>
            </View>
            <View style={styles.eventBadge}>
              <Text style={styles.eventBadgeText}>{item.event_type}</Text>
            </View>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#D4AF37"
            style={{ marginLeft: 8 }}
          />
        </View>

        {/* Contenu déplié */}
        {isExpanded && (
          <>
            <View style={styles.cardInfo}>
              {/* Créateur */}
              <View style={styles.creatorSection}>
                <View style={styles.avatarWithInfo}>
                  <Avatar
                    imageUrl={item.creator.avatar_url}
                    firstName={item.creator.firstname || 'U'}
                    lastName={item.creator.lastname || 'ser'}
                    size={60}
                  />
                  <Text style={styles.avatarName} numberOfLines={1}>
                    {item.creator.firstname}
                  </Text>
                  {renderLevelText(
                    item.creator.declared_level,
                    item.creator.community_level
                  )}
                </View>
                <View style={styles.creatorDetails}>
                  <Text style={styles.creatorName}>
                    {item.creator.firstname} {item.creator.lastname}
                  </Text>
                  <Text style={styles.creatorUsername}>@{item.creator.username}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons
                  name="location"
                  size={18}
                  color="#D4AF37"
                  style={styles.infoIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoText, !isDark && { color: '#111111' }]}>
                    {item.court
                      ? `${item.court.name} - ${item.court.city}`
                      : 'Club non spécifié'}
                  </Text>
                  {item.distance !== undefined && (
                    <Text style={styles.distanceText}>
                      À {item.distance.toFixed(1)} km
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons
                  name="person"
                  size={18}
                  color="#D4AF37"
                  style={styles.infoIcon}
                />
                <Text style={styles.infoText}>Âge : {item.age_category}</Text>
              </View>

              <View style={styles.infoRow}>
                <Ionicons
                  name="podium"
                  size={18}
                  color="#D4AF37"
                  style={styles.infoIcon}
                />
                <Text style={styles.infoText}>
                  Classement min. : {item.min_ranking}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Ionicons
                  name="hand-left"
                  size={18}
                  color="#D4AF37"
                  style={styles.infoIcon}
                />
                <Text style={styles.infoText}>
                  Position : {item.player_position}
                </Text>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <View style={styles.footerBadges}>
                <Pressable
                  style={[styles.chatButton, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]}
                  onPress={() =>
                    router.push(`/my-tournament/${item.id}` as any)
                  }
                >
                  <Ionicons
                    name={
                      (item.message_count || 0) > 0
                        ? 'chatbubbles'
                        : 'chatbubbles-outline'
                    }
                    size={20}
                    color="#D4AF37"
                  />
                </Pressable>

                {(item.demand_count || 0) > 0 && (
                  <View style={styles.badgeButton}>
                    <Ionicons name="hand-left" size={16} color="#D4AF37" />
                    <Text style={styles.badgeCount}>{item.demand_count}</Text>
                    <Text style={styles.badgeLabel}>Demandes</Text>
                  </View>
                )}
              </View>

              <Pressable
                style={styles.demandButton}
                onPress={() => handleDemand(item)}
              >
                <Text style={styles.demandButtonText}>Demander</Text>
              </Pressable>
            </View>
          </>
        )}
      </Pressable>
    );
  };

  const renderFilters = () => (
    <View style={[styles.filtersContainer, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Distance maximale</Text>
        <View style={styles.distanceValueContainer}>
          <Text style={styles.distanceValue}>{sliderDistance} km</Text>
          {locationSource === 'gps' && (
            <Text style={styles.distanceSubtext}>depuis votre position</Text>
          )}
          {locationSource === 'club' && (
            <Text style={styles.distanceSubtext}>depuis votre club</Text>
          )}
        </View>

        <Slider
          style={styles.slider}
          minimumValue={5}
          maximumValue={200}
          step={5}
          value={maxDistance}
          onValueChange={(value) => setSliderDistance(value)}
          onSlidingComplete={(value) => setMaxDistance(value)}
          minimumTrackTintColor="#D4AF37"
          maximumTrackTintColor="#666666"
          thumbTintColor="#D4AF37"
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>5 km</Text>
          <Text style={styles.sliderLabel}>200 km</Text>
        </View>

        {locationSource === 'none' && (
          <View style={styles.distanceNote}>
            <Ionicons
              name="information-circle"
              size={16}
              color="#D4AF37"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.distanceNoteText}>
              Activez la geolocalisation pour filtrer par distance.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Categorie</Text>
        <View style={styles.filterButtonsContainer}>
          <Pressable
            style={[
              styles.filterButton,
              categoryFilter.length === 0 && styles.filterButtonActive,
              !isDark && categoryFilter.length !== 0 && { backgroundColor: 'rgba(255,255,255,0.9)' },
            ]}
            onPress={() => setCategoryFilter([])}
          >
            <Text
              style={[
                styles.filterButtonText,
                categoryFilter.length === 0 && styles.filterButtonTextActive,
              ]}
            >
              Toutes
            </Text>
          </Pressable>
          {TOURNAMENT_CATEGORIES.map((cat) => {
            const isSelected = categoryFilter.includes(cat.value);
            return (
              <Pressable
                key={cat.value}
                style={[
                  styles.filterButton,
                  isSelected && styles.filterButtonActive,
                  !isDark && !isSelected && { backgroundColor: 'rgba(255,255,255,0.9)' },
                ]}
                onPress={() => {
                  setCategoryFilter((prev) =>
                    isSelected ? prev.filter((c) => c !== cat.value) : [...prev, cat.value]
                  );
                }}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    isSelected && styles.filterButtonTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Classement minimum requis</Text>
        <View style={styles.rankingInputContainer}>
          <TextInput
            style={styles.rankingInput}
            value={minRankingText}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '');
              const next = cleaned.replace(/^0+(?=\d)/, '');
              setMinRankingText(next);
            }}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={commitMinRankingFilter}
            onEndEditing={commitMinRankingFilter}
            maxLength={6}
            placeholder="0"
            placeholderTextColor="#666666"
          />
        </View>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Type d'epreuve</Text>
        <View style={styles.filterButtonsContainer}>
          <Pressable
            style={[
              styles.filterButton,
              eventTypeFilter === 'all' && styles.filterButtonActive,
              !isDark && eventTypeFilter !== 'all' && { backgroundColor: 'rgba(255,255,255,0.9)' },
            ]}
            onPress={() => setEventTypeFilter('all')}
          >
            <Text
              style={[
                styles.filterButtonText,
                eventTypeFilter === 'all' && styles.filterButtonTextActive,
              ]}
            >
              Tous
            </Text>
          </Pressable>
          {EVENT_TYPES.map((type) => (
            <Pressable
              key={type.value}
              style={[
                styles.filterButton,
                eventTypeFilter === type.value && styles.filterButtonActive,
                !isDark && eventTypeFilter !== type.value && { backgroundColor: 'rgba(255,255,255,0.9)' },
              ]}
              onPress={() => setEventTypeFilter(type.value)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  eventTypeFilter === type.value && styles.filterButtonTextActive,
                ]}
              >
                {type.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Cote recherche</Text>
        <View style={styles.filterButtonsContainer}>
          <Pressable
            style={[
              styles.filterButton,
              positionFilter === 'all' && styles.filterButtonActive,
              !isDark && positionFilter !== 'all' && { backgroundColor: 'rgba(255,255,255,0.9)' },
            ]}
            onPress={() => setPositionFilter('all')}
          >
            <Text
              style={[
                styles.filterButtonText,
                positionFilter === 'all' && styles.filterButtonTextActive,
              ]}
            >
              Tous
            </Text>
          </Pressable>
          {PLAYER_POSITIONS.map((pos) => (
            <Pressable
              key={pos.value}
              style={[
                styles.filterButton,
                positionFilter === pos.value && styles.filterButtonActive,
                !isDark && positionFilter !== pos.value && { backgroundColor: 'rgba(255,255,255,0.9)' },
              ]}
              onPress={() => setPositionFilter(pos.value)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  positionFilter === pos.value && styles.filterButtonTextActive,
                ]}
              >
                {pos.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <ImageBackground
      source={backgroundImage}
      style={styles.container}
      resizeMode="cover"
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#D4AF37" />
          </Pressable>
          <View style={styles.titleContainer}>
            <Ionicons name="trophy" size={28} color="#D4AF37" />
            <Text style={styles.title}>Partenaire de tournoi</Text>
          </View>
        </View>
        <Pressable
          style={[styles.filterToggle, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons
            name="filter"
            size={20}
            color="#D4AF37"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.filterToggleText}>
            {showFilters ? 'Masquer' : 'Filtres'}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
        </View>
      ) : (
        <FlatList
          data={tournaments}
          renderItem={renderTournament}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={showFilters ? renderFilters() : null}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="trophy-outline"
                size={64}
                color="#D4AF37"
                style={{ marginBottom: 16 }}
              />
              <Text style={styles.emptyText}>
                Aucune recherche de partenaire
              </Text>
              <Text style={styles.emptySubtext}>
                Essayez d'ajuster vos filtres ou créez une nouvelle demande
              </Text>
            </View>
          }
        />
      )}
    </ImageBackground>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D4AF37',
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  filterSection: {
    marginBottom: 24,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
    marginBottom: 16,
  },
  distanceValueContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  distanceValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#D4AF37',
  },
  distanceSubtext: {
    fontSize: 14,
    color: '#AAAAAA',
    marginTop: 4,
  },
  distanceNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55,0.1)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55,0.3)',
    marginTop: 8,
  },
  distanceNoteText: {
    fontSize: 13,
    color: '#AAAAAA',
    flex: 1,
  },
  slider: {
    width: '100%',
    height: 40,
    alignSelf: 'stretch',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
    alignSelf: 'stretch',
  },
  sliderLabel: {
    fontSize: 12,
    color: '#AAAAAA',
  },
  filterButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  filterButtonActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  filterButtonTextActive: {
    color: '#000000',
  },
  rankingInputContainer: {
    alignItems: 'center',
  },
  rankingInput: {
    width: '100%',
    fontSize: 24,
    fontWeight: '700',
    color: '#D4AF37',
    textAlign: 'center',
    backgroundColor: '#111216',
    borderRadius: 12,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 20,
  },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDateContainer: {
    flex: 1,
  },
  cardDate: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardTime: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  cardBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryBadge: {
    backgroundColor: '#D4AF37',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  eventBadge: {
    backgroundColor: 'rgba(212, 175, 55,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  eventBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D4AF37',
  },
  cardInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#D4AF37',
  },
  creatorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 175, 55,0.3)',
  },
  avatarWithInfo: {
    alignItems: 'center',
    gap: 2,
    width: 70,
  },
  avatarName: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  avatarLevel: {
    fontSize: 10,
    color: '#AAAAAA',
    textAlign: 'center',
  },
  creatorDetails: {
    flex: 1,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  creatorUsername: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoIcon: {
    marginRight: 8,
    width: 24,
  },
  infoText: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
  distanceText: {
    fontSize: 12,
    color: '#D4AF37',
    marginTop: 2,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#D4AF37',
  },
  footerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatButton: {
    width: 44,
    height: 44,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeButton: {
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
  badgeCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D4AF37',
  },
  badgeLabel: {
    fontSize: 10,
    color: '#AAAAAA',
  },
  demandButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  demandButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
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
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#AAAAAA',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});




