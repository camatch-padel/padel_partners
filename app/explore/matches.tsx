import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/constants/supabase';
import type { MatchWithDetails } from '@/types/match';
import Avatar from '@/components/Avatar';
import LevelPyramid from '@/components/LevelPyramid';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

const { width } = Dimensions.get('window');

interface MatchWithDistance extends MatchWithDetails {
  distance?: number;
  message_count?: number;
  request_count?: number;
  waitlist_count?: number;
}

export default function ExploreMatchesScreen() {
  const { backgroundImage, theme } = useTheme();
  const isDark = theme === 'dark';
  const [matches, setMatches] = useState<MatchWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationSource, setLocationSource] = useState<'gps' | 'club' | 'none'>('none');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Filtres
  const [levelMin, setLevelMin] = useState(1.0);
  const [maxDistance, setMaxDistance] = useState(50);
  const [sliderDistance, setSliderDistance] = useState(50);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'full' | 'completed'>('open');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadUserLocation();
    autoCompleteMatches();
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userCoords) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      loadMatches();
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [levelMin, maxDistance, statusFilter, userCoords]);

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
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const autoCompleteMatches = async () => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      const { data: activeMatches } = await supabase
        .from('matches')
        .select('id, date, time_slot, duration_minutes, status')
        .in('status', ['open', 'full'])
        .lte('date', todayStr);

      if (activeMatches && activeMatches.length > 0) {
        const matchIdsToComplete: string[] = [];
        const matchIdsToDelete: string[] = [];

        for (const match of activeMatches) {
          const dateStr = match.date.split('T')[0];
          const timeStr = match.time_slot.length === 5 ? `${match.time_slot}:00` : match.time_slot;
          const matchEnd = new Date(`${dateStr}T${timeStr}`);
          matchEnd.setMinutes(matchEnd.getMinutes() + (match.duration_minutes || 90));

          if (!isNaN(matchEnd.getTime()) && now > matchEnd) {
            if (match.status === 'full') {
              matchIdsToComplete.push(match.id);
            } else {
              matchIdsToDelete.push(match.id);
            }
          }
        }

        if (matchIdsToComplete.length > 0) {
          await supabase.from('matches').update({ status: 'completed' }).in('id', matchIdsToComplete);
        }
        if (matchIdsToDelete.length > 0) {
          await supabase.from('matches').delete().in('id', matchIdsToDelete);
        }
      }

      const { data: completedMatches } = await supabase
        .from('matches')
        .select('id, format')
        .eq('status', 'completed');

      if (completedMatches && completedMatches.length > 0) {
        const idsToCheck = completedMatches.map(m => m.id);
        const { data: participants } = await supabase
          .from('match_participants')
          .select('match_id')
          .in('match_id', idsToCheck);

        const incompletIds: string[] = [];
        for (const match of completedMatches) {
          const count = participants?.filter(p => p.match_id === match.id).length || 0;
          const required = match.format === 4 || match.format === '4' || match.format === '2v2' ? 4 : 2;
          if (count < required) {
            incompletIds.push(match.id);
          }
        }

        if (incompletIds.length > 0) {
          await supabase.from('matches').delete().in('id', incompletIds);
        }
      }
    } catch (error) {
      console.error('Erreur auto-complétion:', error);
    }
  };

  const loadMatches = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('matches')
        .select(`
          *,
          creator:profiles!matches_creator_id_fkey(id, username, firstname, lastname, declared_level, community_level, community_level_votes, avatar_url),
          court:courts(id, name, city, address, latitude, longitude)
        `)
        .gte('level_min', levelMin)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('time_slot', { ascending: true });

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

      const matchIds = matchesData.map(m => m.id);
      const { data: participantsData } = await supabase
        .from('match_participants')
        .select(`
          match_id,
          user_id,
          profile:profiles!match_participants_user_id_fkey(username, firstname, lastname, avatar_url, declared_level, community_level, community_level_votes)
        `)
        .in('match_id', matchIds);

      const { data: messagesCountData } = await supabase
        .from('match_messages')
        .select('match_id')
        .in('match_id', matchIds);

      const messageCountByMatch = new Map<string, number>();
      messagesCountData?.forEach((msg: any) => {
        const count = messageCountByMatch.get(msg.match_id) || 0;
        messageCountByMatch.set(msg.match_id, count + 1);
      });

      const { data: requestsData } = await supabase
        .from('match_requests')
        .select('match_id')
        .in('match_id', matchIds)
        .eq('status', 'pending');

      const requestCountByMatch = new Map<string, number>();
      requestsData?.forEach((req: any) => {
        const count = requestCountByMatch.get(req.match_id) || 0;
        requestCountByMatch.set(req.match_id, count + 1);
      });

      const { data: waitlistData } = await supabase
        .from('match_waitlist')
        .select('match_id')
        .in('match_id', matchIds);

      const waitlistCountByMatch = new Map<string, number>();
      waitlistData?.forEach((entry: any) => {
        const count = waitlistCountByMatch.get(entry.match_id) || 0;
        waitlistCountByMatch.set(entry.match_id, count + 1);
      });

      const matchesWithDetails: MatchWithDistance[] = matchesData.map(match => {
        const matchParticipants = participantsData
          ?.filter((p: any) => p.match_id === match.id)
          .map((p: any) => ({
            user_id: p.user_id,
            username: p.profile?.username || 'Inconnu',
            firstname: p.profile?.firstname || '',
            lastname: p.profile?.lastname || '',
            declared_level: p.profile?.declared_level || 0,
            community_level: p.profile?.community_level || null,
            community_level_votes: p.profile?.community_level_votes || 0,
            avatar_url: p.profile?.avatar_url || null,
          })) || [];

        const participants_count = matchParticipants.length;

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
            community_level: null,
            community_level_votes: 0,
            avatar_url: null
          },
          court: match.court || null,
          group: null,
          participants: matchParticipants,
          participants_count,
          distance,
          message_count: messageCountByMatch.get(match.id) || 0,
          request_count: requestCountByMatch.get(match.id) || 0,
          waitlist_count: waitlistCountByMatch.get(match.id) || 0
        };
      });

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const futureMatches = matchesWithDetails.filter(match => {
        if (match.date > todayStr) return true;
        if (match.date === todayStr) {
          return match.time_slot > currentTime;
        }
        return false;
      });

      const filteredMatches = futureMatches.filter(match => {
        if (match.distance === undefined) return true;
        return match.distance <= maxDistance;
      });

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

      const isAlreadyParticipant =
        match.creator.id === session.user.id ||
        match.participants.some(p => p.user_id === session.user.id);

      if (isAlreadyParticipant) {
        Alert.alert('Info', 'Vous participez déjà à cette partie');
        return;
      }

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('declared_level')
        .eq('id', session.user.id)
        .single();

      const userLevel = userProfile?.declared_level || 0;

      if (userLevel < match.level_min || userLevel > match.level_max) {
        Alert.alert(
          'Niveau requis',
          `Vous n'avez pas le niveau requis pour cette partie (${match.level_min.toFixed(1)} - ${match.level_max.toFixed(1)}). Souhaitez-vous faire une demande au créateur ?`,
          [
            { text: 'Non', style: 'cancel' },
            {
              text: 'Oui',
              onPress: async () => {
                try {
                  const { error } = await supabase
                    .from('match_requests')
                    .insert({ match_id: match.id, user_id: session.user.id });
                  if (error) {
                    if (error.code === '23505') {
                      Alert.alert('Info', 'Vous avez déjà fait une demande pour cette partie');
                    } else {
                      throw error;
                    }
                  } else {
                    Alert.alert('Succès', 'Votre demande a été envoyée au créateur');
                  }
                } catch (err: any) {
                  Alert.alert('Erreur', err.message || 'Impossible d\'envoyer la demande');
                }
              },
            },
          ]
        );
        return;
      }

      const totalParticipants = match.participants.length;
      if (totalParticipants >= match.format) {
        Alert.alert(
          'Partie complète',
          'Cette partie est complète. Souhaitez-vous vous mettre en liste d\'attente ?',
          [
            { text: 'Non', style: 'cancel' },
            {
              text: 'Oui',
              onPress: async () => {
                try {
                  const { data: maxPos } = await supabase
                    .from('match_waitlist')
                    .select('position')
                    .eq('match_id', match.id)
                    .order('position', { ascending: false })
                    .limit(1);

                  const nextPosition = (maxPos && maxPos.length > 0) ? maxPos[0].position + 1 : 1;

                  const { error } = await supabase
                    .from('match_waitlist')
                    .insert({ match_id: match.id, user_id: session.user.id, position: nextPosition });

                  if (error) {
                    if (error.code === '23505') {
                      Alert.alert('Info', 'Vous êtes déjà en liste d\'attente');
                    } else {
                      throw error;
                    }
                  } else {
                    Alert.alert('Succès', `Vous êtes en position #${nextPosition} sur la liste d'attente`);
                  }
                } catch (err: any) {
                  Alert.alert('Erreur', err.message || 'Impossible de rejoindre la liste d\'attente');
                }
              },
            },
          ]
        );
        return;
      }

      const { error } = await supabase
        .from('match_participants')
        .insert({
          match_id: match.id,
          user_id: session.user.id,
        });

      if (error) {
        Alert.alert('Erreur', error.message);
      } else {
        const newTotalParticipants = totalParticipants + 1;
        if (newTotalParticipants >= match.format) {
          await supabase
            .from('matches')
            .update({ status: 'full' })
            .eq('id', match.id);
        }

        Alert.alert('Succès', 'Vous avez rejoint la partie !');
        loadMatches();
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de rejoindre la partie');
    }
  };

  const toggleCard = (matchId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  };

  const renderLevelText = (declared: number, communityLevel: number | null, votes: number) => {
    if (!votes || votes === 0 || communityLevel == null) {
      return <Text style={styles.avatarLevel}>{declared.toFixed(1)}</Text>;
    }
    const isLower = communityLevel < declared;
    return (
      <Text style={styles.avatarLevel}>
        {declared.toFixed(1)}
        <Text style={{ color: isLower ? '#FF4444' : '#44DD44' }}>
          {' / '}{communityLevel.toFixed(1)}
        </Text>
      </Text>
    );
  };

  const renderMatch = ({ item }: { item: MatchWithDistance }) => {
    const otherParticipants = item.participants.filter(p => p.user_id !== item.creator.id);
    const spotsLeft = item.format - 1 - otherParticipants.length;
    const isExpanded = expandedCards.has(item.id);

    return (
      <Pressable style={[styles.matchCard, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]} onPress={() => toggleCard(item.id)}>
        {/* Header toujours visible */}
        <View style={styles.matchHeader}>
          <View style={styles.matchDateContainer}>
            <Text style={[styles.matchDate, !isDark && { color: '#111111' }]}>{formatDate(item.date)}</Text>
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
            <View style={styles.matchInfo}>
              <View style={styles.matchInfoRow}>
                <Ionicons name="location" size={18} color="#D4AF37" style={styles.matchInfoIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.matchInfoText, !isDark && { color: '#111111' }]}>
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
                <Ionicons name="star" size={18} color="#D4AF37" style={styles.matchInfoIcon} />
                <Text style={styles.matchInfoText}>
                  Niveau mini {item.level_min.toFixed(1)}
                </Text>
              </View>

              <View style={styles.matchInfoRow}>
                <Ionicons name="time" size={18} color="#D4AF37" style={styles.matchInfoIcon} />
                <Text style={styles.matchInfoText}>
                  {item.duration_minutes} min · {item.format} joueurs
                </Text>
              </View>

              <View style={styles.matchInfoRow}>
                <Ionicons name="person" size={18} color="#D4AF37" style={styles.matchInfoIcon} />
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
                <View style={styles.avatarWithInfo}>
                  <Avatar
                    imageUrl={item.creator.avatar_url}
                    firstName={item.creator.firstname || 'U'}
                    lastName={item.creator.lastname || 'ser'}
                    size={60}
                  />
                  <Text style={styles.avatarName} numberOfLines={1}>{item.creator.firstname}</Text>
                  {renderLevelText(item.creator.declared_level, item.creator.community_level, item.creator.community_level_votes)}
                </View>

                {/* Autres participants */}
                {otherParticipants.map((participant) => (
                  <View key={participant.user_id} style={styles.avatarWithInfo}>
                    <Avatar
                      imageUrl={participant.avatar_url}
                      firstName={participant.firstname || 'U'}
                      lastName={participant.lastname || 'ser'}
                      size={60}
                    />
                    <Text style={styles.avatarName} numberOfLines={1}>{participant.firstname}</Text>
                    {renderLevelText(participant.declared_level, participant.community_level, participant.community_level_votes)}
                  </View>
                ))}

                {/* Places vides */}
                {Array.from({ length: spotsLeft }).map((_, index) => (
                  <View key={`empty-${index}`} style={styles.avatarWithInfo}>
                    <View style={[styles.avatarWrapper, styles.emptyAvatar]}>
                      <Text style={styles.emptyAvatarText}>?</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.matchFooter}>
              <View style={styles.footerBadges}>
                <Pressable
                  style={[styles.chatButton, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]}
                  onPress={() => router.push(`/match/${item.id}` as any)}
                >
                  <Ionicons
                    name={(item.message_count || 0) > 0 ? "chatbubbles" : "chatbubbles-outline"}
                    size={20}
                    color="#D4AF37"
                  />
                </Pressable>

                {(item.request_count || 0) > 0 && (
                  <View style={styles.badgeButton}>
                    <Ionicons name="hand-left" size={16} color="#D4AF37" />
                    <Text style={styles.badgeCount}>{item.request_count}</Text>
                    <Text style={styles.badgeLabel}>Demandes</Text>
                  </View>
                )}

                {(item.waitlist_count || 0) > 0 && (
                  <View style={styles.badgeButton}>
                    <Ionicons name="hourglass" size={16} color="#D4AF37" />
                    <Text style={styles.badgeCount}>{item.waitlist_count}</Text>
                    <Text style={styles.badgeLabel}>File d'attente</Text>
                  </View>
                )}
              </View>

              <Pressable
                style={styles.joinButton}
                onPress={() => handleJoinMatch(item)}
              >
                <Text style={styles.joinButtonText}>Rejoindre</Text>
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
        <Text style={styles.filterLabel}>Niveau minimum</Text>
        <LevelPyramid value={levelMin} onChange={setLevelMin} />
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
            <Ionicons name="information-circle" size={16} color="#D4AF37" style={{ marginRight: 8 }} />
            <Text style={styles.distanceNoteText}>
              Activez la géolocalisation pour filtrer par distance.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Statut des parties</Text>
        <View style={styles.statusButtonsContainer}>
          <Pressable
            style={[styles.statusButton, statusFilter === 'all' && styles.statusButtonActive, !isDark && statusFilter !== 'all' && { backgroundColor: 'rgba(255,255,255,0.9)' }]}
            onPress={() => setStatusFilter('all')}
          >
            <Text numberOfLines={1} style={[styles.statusButtonText, statusFilter === 'all' && styles.statusButtonTextActive, !isDark && statusFilter !== 'all' && { color: '#555555' }]}>
              Toutes
            </Text>
          </Pressable>
          <Pressable
            style={[styles.statusButton, statusFilter === 'open' && styles.statusButtonActive, !isDark && statusFilter !== 'open' && { backgroundColor: 'rgba(255,255,255,0.9)' }]}
            onPress={() => setStatusFilter('open')}
          >
            <Text numberOfLines={1} style={[styles.statusButtonText, statusFilter === 'open' && styles.statusButtonTextActive, !isDark && statusFilter !== 'open' && { color: '#555555' }]}>
              Ouvertes
            </Text>
          </Pressable>
          <Pressable
            style={[styles.statusButton, statusFilter === 'full' && styles.statusButtonActive, !isDark && statusFilter !== 'full' && { backgroundColor: 'rgba(255,255,255,0.9)' }]}
            onPress={() => setStatusFilter('full')}
          >
            <Text numberOfLines={1} style={[styles.statusButtonText, statusFilter === 'full' && styles.statusButtonTextActive, !isDark && statusFilter !== 'full' && { color: '#555555' }]}>
              Complètes
            </Text>
          </Pressable>
          <Pressable
            style={[styles.statusButton, statusFilter === 'completed' && styles.statusButtonActive, !isDark && statusFilter !== 'completed' && { backgroundColor: 'rgba(255,255,255,0.9)' }]}
            onPress={() => setStatusFilter('completed')}
          >
            <Text numberOfLines={1} style={[styles.statusButtonText, statusFilter === 'completed' && styles.statusButtonTextActive, !isDark && statusFilter !== 'completed' && { color: '#555555' }]}>
              Terminées
            </Text>
          </Pressable>
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
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#D4AF37" />
        </Pressable>
        <View style={styles.titleContainer}>
          <Ionicons name="search" size={28} color="#D4AF37" />
          <Text style={styles.title}>Chercher une partie</Text>
        </View>
        <Pressable
          style={[styles.filterToggle, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="filter" size={20} color="#D4AF37" style={{ marginRight: 6 }} />
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
          data={matches}
          renderItem={renderMatch}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={showFilters ? renderFilters() : null}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={64} color="#D4AF37" style={{ marginBottom: 16 }} />
              <Text style={styles.emptyText}>Aucune partie disponible</Text>
              <Text style={styles.emptySubtext}>
                Essayez d'ajuster vos filtres ou créez une nouvelle partie
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
    flex: 1,
  },
  title: {
    fontSize: 24,
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
  },
  distanceNoteText: {
    fontSize: 13,
    color: '#AAAAAA',
    flex: 1,
  },
  statusButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
  },
  statusButton: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  statusButtonTextActive: {
    color: '#000000',
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
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  matchDateContainer: {
    flex: 1,
  },
  matchDate: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  matchTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
  },
  matchSpotsContainer: {
    alignItems: 'flex-end',
  },
  matchSpotsLabel: {
    fontSize: 12,
    color: '#AAAAAA',
    marginBottom: 4,
  },
  matchSpots: {
    fontSize: 24,
    fontWeight: '700',
    color: '#D4AF37',
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
    marginRight: 8,
    width: 24,
  },
  matchInfoText: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
  matchDistance: {
    fontSize: 12,
    color: '#D4AF37',
    marginTop: 2,
    fontWeight: '600',
  },
  participantsSection: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#D4AF37',
  },
  participantsLabel: {
    fontSize: 12,
    color: '#AAAAAA',
    marginBottom: 10,
  },
  participantsAvatars: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
  },
  avatarWrapper: {
    position: 'relative',
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
  emptyAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(212, 175, 55,0.1)',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyAvatarText: {
    fontSize: 20,
    color: '#D4AF37',
    fontWeight: '600',
  },
  matchFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  joinButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  joinButtonText: {
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
