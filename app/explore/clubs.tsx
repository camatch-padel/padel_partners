import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/constants/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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

interface Club {
  id: string;
  name: string;
  city: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distance?: number;
}

export default function ExploreClubsScreen() {
  const { backgroundImage } = useTheme();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [filteredClubs, setFilteredClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    loadUserLocation();
  }, []);

  useEffect(() => {
    if (userCoords) loadClubs();
  }, [userCoords]);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredClubs(clubs);
      return;
    }
    const q = search.toLowerCase();
    setFilteredClubs(
      clubs.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q)
      )
    );
  }, [search, clubs]);

  const loadUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserCoords({ lat: location.coords.latitude, lng: location.coords.longitude });
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
            return;
          }
        }
      }

      setUserCoords({ lat: 0, lng: 0 });
    } catch {
      setUserCoords({ lat: 0, lng: 0 });
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

  const loadClubs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('courts')
        .select('id, name, city, address, latitude, longitude')
        .order('name', { ascending: true });

      if (error) throw error;

      const clubsWithDistance: Club[] = (data || []).map((c: any) => {
        let distance: number | undefined;
        if (
          userCoords &&
          userCoords.lat !== 0 &&
          c.latitude &&
          c.longitude
        ) {
          distance = calculateDistance(
            userCoords.lat,
            userCoords.lng,
            Number(c.latitude),
            Number(c.longitude)
          );
        }
        return { ...c, distance };
      });

      clubsWithDistance.sort((a, b) => {
        if (a.distance === undefined) return 1;
        if (b.distance === undefined) return -1;
        return a.distance - b.distance;
      });

      setClubs(clubsWithDistance);
      setFilteredClubs(clubsWithDistance);
    } catch (error) {
      console.error('Erreur chargement clubs:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderClub = ({ item }: { item: Club }) => (
    <View style={styles.clubCard}>
      <View style={styles.clubIcon}>
        <Ionicons name="business" size={24} color="#D4AF37" />
      </View>
      <View style={styles.clubInfo}>
        <Text style={styles.clubName}>{item.name}</Text>
        <Text style={styles.clubCity}>{item.city}</Text>
        {item.address && <Text style={styles.clubAddress}>{item.address}</Text>}
      </View>
      {item.distance !== undefined && (
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceText}>{item.distance.toFixed(1)} km</Text>
        </View>
      )}
    </View>
  );

  return (
    <ImageBackground
      source={backgroundImage}
      style={styles.container}
      resizeMode="cover"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#D4AF37" />
        </Pressable>
        <Text style={styles.headerTitle}>Rechercher un club</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#D4AF37" />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par nom ou ville..."
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

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
        </View>
      ) : (
        <FlatList
          data={filteredClubs}
          renderItem={renderClub}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="business-outline" size={64} color="#D4AF37" />
              <Text style={styles.emptyText}>Aucun club trouvé</Text>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#D4AF37' },
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 20 },
  clubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  clubIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubInfo: { flex: 1 },
  clubName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  clubCity: { fontSize: 14, color: '#D4AF37', marginTop: 2 },
  clubAddress: { fontSize: 12, color: '#AAAAAA', marginTop: 2 },
  distanceBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  distanceText: { fontSize: 13, fontWeight: '600', color: '#D4AF37' },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: '#AAAAAA', textAlign: 'center' },
});
