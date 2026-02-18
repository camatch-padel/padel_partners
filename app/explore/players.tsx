import { supabase } from '@/constants/supabase';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

interface Player {
  id: string;
  firstname: string;
  lastname: string;
  declared_level: number;
  community_level: number | null;
  community_level_votes: number;
  court_name: string | null;
  court_latitude: number | null;
  court_longitude: number | null;
  distance?: number;
}

export default function ExplorePlayersScreen() {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [levelMin, setLevelMin] = useState(1.0);
  const [levelMax, setLevelMax] = useState(10.0);
  const [maxDistance, setMaxDistance] = useState(200);
  const [sliderDistance, setSliderDistance] = useState(200);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationSource, setLocationSource] = useState<'gps' | 'club' | 'none'>('none');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadUserLocation();
  }, []);

  useEffect(() => {
    if (userCoords) loadPlayers();
  }, [userCoords]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      applyFilters();
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, levelMin, levelMax, maxDistance, allPlayers]);

  const loadUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserCoords({ lat: location.coords.latitude, lng: location.coords.longitude });
        setLocationSource('gps');
        return;
      }

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
            setUserCoords({ lat: Number(courtData.latitude), lng: Number(courtData.longitude) });
            setLocationSource('club');
            return;
          }
        }
      }

      setUserCoords({ lat: 0, lng: 0 });
      setLocationSource('none');
    } catch {
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

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, firstname, lastname, declared_level, community_level, community_level_votes,
          court:courts(name, latitude, longitude)
        `)
        .order('declared_level', { ascending: false });

      if (error) throw error;

      const playersList: Player[] = (data || []).map((p: any) => {
        let distance: number | undefined;
        if (
          userCoords &&
          userCoords.lat !== 0 &&
          p.court?.latitude &&
          p.court?.longitude
        ) {
          distance = calculateDistance(
            userCoords.lat,
            userCoords.lng,
            Number(p.court.latitude),
            Number(p.court.longitude)
          );
        }

        return {
          id: p.id,
          firstname: p.firstname || '',
          lastname: p.lastname || '',
          declared_level: p.declared_level || 0,
          community_level: p.community_level,
          community_level_votes: p.community_level_votes || 0,
          court_name: p.court?.name || null,
          court_latitude: p.court?.latitude ? Number(p.court.latitude) : null,
          court_longitude: p.court?.longitude ? Number(p.court.longitude) : null,
          distance,
        };
      });

      setAllPlayers(playersList);
    } catch (error) {
      console.error('Erreur chargement joueurs:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let result = [...allPlayers];

    // Filtre recherche nom/prénom
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.firstname.toLowerCase().includes(q) ||
          p.lastname.toLowerCase().includes(q) ||
          `${p.firstname} ${p.lastname}`.toLowerCase().includes(q)
      );
    }

    // Filtre niveau
    result = result.filter(
      (p) => p.declared_level >= levelMin && p.declared_level <= levelMax
    );

    // Filtre distance
    if (userCoords && userCoords.lat !== 0) {
      result = result.filter((p) => {
        if (p.distance === undefined) return true;
        return p.distance <= maxDistance;
      });
    }

    setFilteredPlayers(result);
  };

  const renderPlayer = ({ item }: { item: Player }) => {
    const estimatedLevel =
      item.community_level != null && item.community_level_votes > 0
        ? item.community_level.toFixed(1)
        : '-';

    return (
      <View style={styles.row}>
        <Text style={styles.cellName} numberOfLines={1}>
          {item.firstname} {item.lastname}
        </Text>
        <Text style={styles.cellClub} numberOfLines={1}>
          {item.court_name || '-'}
        </Text>
        <Text style={styles.cellLevel}>{item.declared_level.toFixed(1)}</Text>
        <Text
          style={[
            styles.cellLevel,
            item.community_level != null &&
              item.community_level_votes > 0 &&
              item.community_level < item.declared_level && { color: '#FF4444' },
            item.community_level != null &&
              item.community_level_votes > 0 &&
              item.community_level >= item.declared_level && { color: '#44DD44' },
          ]}
        >
          {estimatedLevel}
        </Text>
      </View>
    );
  };

  const renderTableHeader = () => (
    <View style={styles.tableHeader}>
      <Text style={[styles.headerCell, styles.cellName]}>Nom</Text>
      <Text style={[styles.headerCell, styles.cellClub]}>Club</Text>
      <Text style={[styles.headerCell, styles.cellLevel]}>Déclaré</Text>
      <Text style={[styles.headerCell, styles.cellLevel]}>Estimé</Text>
    </View>
  );

  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Niveau déclaré</Text>
        <View style={styles.levelRange}>
          <Text style={styles.levelRangeText}>
            {levelMin.toFixed(1)} - {levelMax.toFixed(1)}
          </Text>
        </View>
        <Text style={styles.sliderSubLabel}>Minimum</Text>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={10}
          step={0.5}
          value={levelMin}
          onSlidingComplete={(v) => setLevelMin(Math.min(v, levelMax))}
          minimumTrackTintColor="#D4AF37"
          maximumTrackTintColor="#666666"
          thumbTintColor="#D4AF37"
        />
        <Text style={styles.sliderSubLabel}>Maximum</Text>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={10}
          step={0.5}
          value={levelMax}
          onSlidingComplete={(v) => setLevelMax(Math.max(v, levelMin))}
          minimumTrackTintColor="#D4AF37"
          maximumTrackTintColor="#666666"
          thumbTintColor="#D4AF37"
        />
      </View>

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
          onValueChange={(v) => setSliderDistance(v)}
          onSlidingComplete={(v) => setMaxDistance(v)}
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
            <Ionicons name="information-circle" size={16} color="#D4AF37" style={{ marginRight: 8 }} />
            <Text style={styles.distanceNoteText}>
              Activez la géolocalisation pour filtrer par distance.
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <ImageBackground
      source={require('@/assets/images/piste-noire.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#D4AF37" />
        </Pressable>
        <Text style={styles.headerTitle}>Rechercher un joueur</Text>
        <Pressable
          style={styles.filterToggle}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="filter" size={18} color="#D4AF37" />
        </Pressable>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#D4AF37" />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par nom ou prénom..."
          placeholderTextColor="#666666"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={20} color="#666666" />
          </Pressable>
        )}
      </View>

      {showFilters && renderFilters()}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
        </View>
      ) : (
        <FlatList
          data={filteredPlayers}
          renderItem={renderPlayer}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={renderTableHeader}
          stickyHeaderIndices={[0]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="#D4AF37" />
              <Text style={styles.emptyText}>Aucun joueur trouvé</Text>
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
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#D4AF37', flex: 1, textAlign: 'center' },
  filterToggle: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  filterSection: {
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
    marginBottom: 12,
  },
  levelRange: {
    alignItems: 'center',
    marginBottom: 8,
  },
  levelRangeText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#D4AF37',
  },
  sliderSubLabel: {
    fontSize: 12,
    color: '#AAAAAA',
    marginBottom: 4,
    marginTop: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#AAAAAA',
  },
  distanceValueContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  distanceValue: {
    fontSize: 24,
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
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    marginTop: 8,
  },
  distanceNoteText: {
    fontSize: 13,
    color: '#AAAAAA',
    flex: 1,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { paddingBottom: 20 },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  headerCell: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D4AF37',
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333333',
    alignItems: 'center',
  },
  cellName: {
    flex: 2,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  cellClub: {
    flex: 2,
    fontSize: 13,
    color: '#AAAAAA',
  },
  cellLevel: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '600',
  },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: '#AAAAAA', textAlign: 'center' },
});
