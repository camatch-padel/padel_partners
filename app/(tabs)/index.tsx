import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/constants/supabase';
import * as Location from 'expo-location';
import Logo from '@/components/Logo';
import Avatar from '@/components/Avatar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { GroupWithIcon } from '@/types/group';

interface MyMatch {
  id: string;
  date: string;
  time_slot: string;
  format: number;
  level_min: number;
  status: string;
  creator_id: string;
  participants_count: number;
  court: { name: string; city: string; latitude: number | null; longitude: number | null } | null;
  participant_previews?: {
    user_id: string;
    firstname: string;
    lastname: string;
    avatar_url: string | null;
  }[];
}

interface GroupWithMembers extends GroupWithIcon {
  member_count: number;
}

interface MyTournament {
  id: string;
  date: string;
  time_slot: string | null;
  category: string;
  event_type: string;
  status: string;
  court: { name: string; city: string; latitude: number | null; longitude: number | null } | null;
  demand_count: number;
  min_ranking?: number | null;
  participant_previews?: {
    user_id: string;
    firstname: string;
    lastname: string;
    avatar_url: string | null;
  }[];
}

interface PlayerStats {
  totalMatches: number;
  wins: number;
  losses: number;
  leftMatches: number;
  rightMatches: number;
  lastMatchDelta: number | null;
  totalDelta: number;
  monthDelta: number;
}

const getRank = (level: number): { label: string; color: string; iconName: string } => {
  if (level >= 9.5) return { label: 'ÉLITE', color: '#CC44FF', iconName: 'diamond' };
  if (level >= 7.5) return { label: 'EXPERT', color: '#FF6B00', iconName: 'flame' };
  if (level >= 5.5) return { label: 'AVANCÉ', color: '#D4AF37', iconName: 'trophy' };
  if (level >= 3.5) return { label: 'CONFIRMÉ', color: '#44AAFF', iconName: 'star' };
  return { label: 'DÉBUTANT', color: '#909090', iconName: 'tennisball-outline' };
};

const getRequiredPlayers = (format: unknown): number => {
  if (format === 4 || format === '4' || format === '2v2') return 4;
  return 2;
};

const parseMatchEndDate = (dateStr: string, timeSlot: string, durationMinutes: number): Date | null => {
  const cleanDate = (dateStr || '').split('T')[0];
  const parts = cleanDate.split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const timeParts = (timeSlot || '').split(':');
  const hours = parseInt(timeParts[0], 10) || 0;
  const minutes = parseInt(timeParts[1], 10) || 0;

  const d = new Date(year, month, day, hours, minutes);
  if (isNaN(d.getTime())) return null;
  d.setMinutes(d.getMinutes() + durationMinutes);
  return d;
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
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

function PremiumSearchButton({
  onPress,
  title,
  isDark = true,
}: {
  onPress: () => void;
  title: string;
  isDark?: boolean;
}) {
  if (!isDark) {
    return (
      <View style={styles.premiumLightBorder}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.premiumLightPressable,
            pressed && { opacity: 0.82, transform: [{ translateY: 1 }] },
          ]}
        >
          <LinearGradient
            colors={['#F8F6F0', '#DDD9CC']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.premiumLightGradient}
          >
            <View style={styles.premiumLightHighlight} />
            <Text style={styles.premiumLightText}>{title}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.premiumSearchWrapper}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.premiumSearchPressable, pressed && styles.premiumSearchPressed]}
      >
        <LinearGradient
          colors={['#111214', '#0B0B0D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.premiumSearchGradient}
        >
          <View style={styles.premiumShineLeft} />
          <View style={styles.premiumShineRight} />
          <LinearGradient
            colors={['#17181B', '#0B0B0D']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.premiumSearchInner}
          >
            <View style={styles.premiumReliefTop} />
            <View style={styles.premiumReliefBottom} />
            <Text style={styles.premiumSearchText}>{title}</Text>
          </LinearGradient>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const { backgroundImage, theme } = useTheme();
  const isDark = theme === 'dark';
  const C = {
    cardBg: isDark ? (Platform.OS === 'android' ? '#0E1014' : 'rgba(16, 18, 22, 0.62)') : 'rgba(255, 255, 255, 0.45)',
    cardText: isDark ? '#FFFFFF' : '#111111',
    cardSubtext: isDark ? '#AAAAAA' : '#444444',
    statBg: isDark ? 'rgba(20, 19, 17, 0.78)' : 'rgba(255, 255, 255, 0.75)',
    gradientColors: isDark
      ? ['rgba(28, 23, 12, 0.94)', 'rgba(16, 14, 10, 0.96)', 'rgba(8, 8, 9, 0.98)'] as const
      : ['rgba(255, 255, 255, 0.92)', 'rgba(248, 245, 235, 0.95)', 'rgba(240, 238, 228, 0.98)'] as const,
    levelBarBg: isDark ? '#141414' : '#141414',
  };
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myMatches, setMyMatches] = useState<MyMatch[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [myGroups, setMyGroups] = useState<GroupWithMembers[]>([]);
  const [myTournaments, setMyTournaments] = useState<MyTournament[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats>({
    totalMatches: 0,
    wins: 0,
    losses: 0,
    leftMatches: 0,
    rightMatches: 0,
    lastMatchDelta: null,
    totalDelta: 0,
    monthDelta: 0,
  });

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadMyMatches();
      loadMyGroups();
      loadMyTournaments();
      loadPlayerStats();
      loadUserLocation();
    }, [])
  );

  const loadUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    } catch {
      // géolocalisation indisponible
    }
  };

  const loadProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setProfile(data);
      }
    } finally {
      setLoading(false);
    }
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
        .select('id, date, time_slot, duration_minutes, status, format')
        .in('status', ['open', 'full'])
        .lte('date', todayStr);

      if (activeMatches && activeMatches.length > 0) {
        const activeIds = activeMatches.map((m: any) => m.id);
        const { data: participantRows } = await supabase
          .from('match_participants')
          .select('match_id')
          .in('match_id', activeIds);

        const participantsByMatch = new Map<string, number>();
        participantRows?.forEach((p: any) => {
          const count = participantsByMatch.get(p.match_id) || 0;
          participantsByMatch.set(p.match_id, count + 1);
        });

        const matchIdsToComplete: string[] = [];
        const matchIdsToDelete: string[] = [];

        for (const match of activeMatches) {
          const matchEnd = parseMatchEndDate(match.date, match.time_slot, match.duration_minutes || 90);

          if (matchEnd && now > matchEnd) {
            const requiredPlayers = getRequiredPlayers((match as any).format);
            const currentPlayers = participantsByMatch.get((match as any).id) || 0;
            if (currentPlayers >= requiredPlayers) {
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
          const required = getRequiredPlayers((match as any).format);
          if (count < required) {
            incompletIds.push(match.id);
          }
        }

        if (incompletIds.length > 0) {
          await supabase.from('matches').delete().in('id', incompletIds);
        }
      }
    } catch (error) {
      console.error('Erreur auto-completion:', error);
    }
  };

  const loadMyMatches = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await autoCompleteMatches();

      const { data: participantMatches } = await supabase
        .from('match_participants')
        .select('match_id')
        .eq('user_id', session.user.id);

      const participantMatchIds = participantMatches?.map(p => p.match_id) || [];

      let query = supabase
        .from('matches')
        .select(`
          *,
          court:courts(name, city, latitude, longitude)
        `)
        .in('status', ['open', 'full', 'completed']);

      if (participantMatchIds.length > 0) {
        query = query.or(`creator_id.eq.${session.user.id},id.in.(${participantMatchIds.join(',')})`);
      } else {
        query = query.eq('creator_id', session.user.id);
      }

      const { data: matchesData } = await query
        .order('date', { ascending: false })
        .order('time_slot', { ascending: false })
        .limit(20);

      if (matchesData) {
        const matchIds = matchesData.map(m => m.id);
        if (matchIds.length > 0) {
          const { data: participantsData } = await supabase
            .from('match_participants')
            .select(`
              match_id,
              user_id,
              profile:profiles!match_participants_user_id_fkey(firstname, lastname, avatar_url)
            `)
            .in('match_id', matchIds);

          const matchesWithCount = matchesData.map(match => {
            const matchParticipants = participantsData?.filter((p: any) => p.match_id === match.id) || [];
            const count = matchParticipants.length;
            const requiredPlayers = getRequiredPlayers((match as any).format);
            let normalizedStatus = match.status;
            if (match.status !== 'completed') {
              normalizedStatus = count >= requiredPlayers ? 'full' : 'open';
            }
            const participant_previews = matchParticipants.map((p: any) => ({
              user_id: p.user_id,
              firstname: p.profile?.firstname || '',
              lastname: p.profile?.lastname || '',
              avatar_url: p.profile?.avatar_url || null,
            }));
            return { ...match, status: normalizedStatus, participants_count: count, participant_previews };
          });

          const idsToSetFull = matchesWithCount
            .filter((m: any) => m.status === 'full')
            .map((m: any) => m.id);
          const idsToSetOpen = matchesWithCount
            .filter((m: any) => m.status === 'open')
            .map((m: any) => m.id);

          if (idsToSetFull.length > 0) {
            await supabase
              .from('matches')
              .update({ status: 'full' })
              .in('id', idsToSetFull)
              .neq('status', 'completed');
          }
          if (idsToSetOpen.length > 0) {
            await supabase
              .from('matches')
              .update({ status: 'open' })
              .in('id', idsToSetOpen)
              .neq('status', 'completed');
          }

          const now = new Date();
          const matchIdsToDelete = new Set<string>();
          const visibleMatches = matchesWithCount.filter((match: any) => {
            const requiredPlayers = getRequiredPlayers(match.format);
            const isIncomplete = match.participants_count < requiredPlayers;

            if (match.status === 'completed' && isIncomplete) {
              if (match.creator_id === session.user.id) {
                matchIdsToDelete.add(match.id);
              }
              return false;
            }

            if (match.status === 'open' || match.status === 'full') {
              const matchEnd = parseMatchEndDate(match.date, match.time_slot, match.duration_minutes || 90);

              if (matchEnd && now > matchEnd && isIncomplete) {
                if (match.creator_id === session.user.id) {
                  matchIdsToDelete.add(match.id);
                }
                return false;
              }
            }

            return true;
          });

          const idsToDelete = Array.from(matchIdsToDelete);
          if (idsToDelete.length > 0) {
            await supabase.from('matches').delete().in('id', idsToDelete);
          }

          setMyMatches(visibleMatches);
        } else {
          setMyMatches([]);
        }
      }
    } catch (error) {
      console.error('Erreur chargement matches:', error);
    }
  };

  const loadMyGroups = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: memberData } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', session.user.id);

      const groupIds = memberData?.map(m => m.group_id) || [];

      if (groupIds.length === 0) {
        setMyGroups([]);
        return;
      }

      const { data: groupsData } = await supabase
        .from('groups')
        .select('*')
        .in('id', groupIds)
        .order('created_at', { ascending: false });

      if (groupsData) {
        const groupsWithCount = await Promise.all(
          groupsData.map(async (group) => {
            const { data: membersData } = await supabase
              .from('group_members')
              .select('id')
              .eq('group_id', group.id);

            return {
              ...group,
              member_count: membersData?.length || 0
            };
          })
        );

        setMyGroups(groupsWithCount);
      }
    } catch (error) {
      console.error('Erreur chargement groupes:', error);
    }
  };

  const loadMyTournaments = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: tournamentsData } = await supabase
        .from('tournaments')
        .select(`
          *,
          court:courts(name, city, latitude, longitude),
          creator:profiles!tournaments_creator_id_fkey(firstname, lastname, avatar_url)
        `)
        .eq('creator_id', session.user.id)
        .in('status', ['searching', 'partner_found'])
        .order('date', { ascending: true })
        .limit(20);

      if (tournamentsData && tournamentsData.length > 0) {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // Supprimer les tournois "searching" dont la date est passée
        const expiredSearchingIds = tournamentsData
          .filter(t => t.status === 'searching' && t.date < todayStr)
          .map(t => t.id);

        if (expiredSearchingIds.length > 0) {
          await supabase.from('tournaments').delete().in('id', expiredSearchingIds);
        }

        // Filtrer les tournois expirés searching et marquer les partner_found passés comme completed
        const visibleTournaments = tournamentsData
          .filter(t => !expiredSearchingIds.includes(t.id))
          .map(t => {
            if (t.status === 'partner_found' && t.date < todayStr) {
              return { ...t, status: 'completed' };
            }
            return t;
          });

        const tournamentIds = visibleTournaments.map(t => t.id);
        const { data: demandsData } = tournamentIds.length > 0
          ? await supabase
              .from('tournament_demands')
              .select('tournament_id')
              .in('tournament_id', tournamentIds)
              .eq('status', 'pending')
          : { data: null };

        const demandCountMap = new Map<string, number>();
        demandsData?.forEach((d: any) => {
          const count = demandCountMap.get(d.tournament_id) || 0;
          demandCountMap.set(d.tournament_id, count + 1);
        });

        const { data: acceptedDemands } = tournamentIds.length > 0
          ? await supabase
              .from('tournament_demands')
              .select(`
                tournament_id,
                user_id,
                profile:profiles!tournament_demands_user_id_fkey(firstname, lastname, avatar_url)
              `)
              .in('tournament_id', tournamentIds)
              .eq('status', 'accepted')
          : { data: null };

        const acceptedPartnerMap = new Map<string, any>();
        acceptedDemands?.forEach((d: any) => {
          acceptedPartnerMap.set(d.tournament_id, {
            user_id: d.user_id,
            firstname: d.profile?.firstname || '',
            lastname: d.profile?.lastname || '',
            avatar_url: d.profile?.avatar_url || null,
          });
        });

        setMyTournaments(visibleTournaments.map(t => {
          const creatorPreview = {
            user_id: t.creator_id,
            firstname: (t as any).creator?.firstname || '',
            lastname: (t as any).creator?.lastname || '',
            avatar_url: (t as any).creator?.avatar_url || null,
          };
          const partner = acceptedPartnerMap.get(t.id);
          const participant_previews = partner ? [creatorPreview, partner] : [creatorPreview];
          return {
            ...t,
            demand_count: demandCountMap.get(t.id) || 0,
            participant_previews,
          };
        }));
      } else {
        setMyTournaments([]);
      }
    } catch (error) {
      console.error('Erreur chargement tournois:', error);
    }
  };

  const loadPlayerStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const userId = session.user.id;
      const orFilter = `team1_player1_id.eq.${userId},team1_player2_id.eq.${userId},team2_player1_id.eq.${userId},team2_player2_id.eq.${userId}`;

      const { data: resultsData } = await supabase
        .from('match_results')
        .select(`
          team1_player1_id,
          team1_player1_position,
          team1_player2_id,
          team1_player2_position,
          team2_player1_id,
          team2_player1_position,
          team2_player2_id,
          team2_player2_position,
          winner_team,
          match:matches(date, time_slot)
        `)
        .or(orFilter);

      if (!resultsData) {
        setPlayerStats({ totalMatches: 0, wins: 0, losses: 0, leftMatches: 0, rightMatches: 0, lastMatchDelta: null, totalDelta: 0, monthDelta: 0 });
        return;
      }

      let wins = 0;
      let losses = 0;
      let leftMatches = 0;
      let rightMatches = 0;

      resultsData.forEach((result: any) => {
        const isTeam1 = result.team1_player1_id === userId || result.team1_player2_id === userId;
        const isTeam2 = result.team2_player1_id === userId || result.team2_player2_id === userId;

        if (result.team1_player1_id === userId) {
          if (result.team1_player1_position === 'left') leftMatches += 1;
          if (result.team1_player1_position === 'right') rightMatches += 1;
        }
        if (result.team1_player2_id === userId) {
          if (result.team1_player2_position === 'left') leftMatches += 1;
          if (result.team1_player2_position === 'right') rightMatches += 1;
        }
        if (result.team2_player1_id === userId) {
          if (result.team2_player1_position === 'left') leftMatches += 1;
          if (result.team2_player1_position === 'right') rightMatches += 1;
        }
        if (result.team2_player2_id === userId) {
          if (result.team2_player2_position === 'left') leftMatches += 1;
          if (result.team2_player2_position === 'right') rightMatches += 1;
        }

        if (result.winner_team === 1 && isTeam1) wins += 1;
        if (result.winner_team === 2 && isTeam2) wins += 1;
        if (result.winner_team === 1 && isTeam2) losses += 1;
        if (result.winner_team === 2 && isTeam1) losses += 1;
      });

      // Fetch unique player profiles (un seul appel pour tous les matchs)
      const allPlayerIds = new Set<string>();
      resultsData.forEach((r: any) => {
        [r.team1_player1_id, r.team1_player2_id, r.team2_player1_id, r.team2_player2_id]
          .filter(Boolean)
          .forEach((id: string) => allPlayerIds.add(id));
      });
      const { data: allPlayerData } = allPlayerIds.size > 0
        ? await supabase.from('profiles').select('id, declared_level').in('id', Array.from(allPlayerIds))
        : { data: [] as any[] };

      const getLevel = (pid: string | null) =>
        (allPlayerData || []).find((p: any) => p.id === pid)?.declared_level || 0;

      const THRESHOLD = 1.0;
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      let totalDelta = 0;
      let monthDelta = 0;
      let lastMatchDelta: number | null = null;

      // Calcul delta pour chaque match avec gagnant
      const resultsWithWinner = resultsData
        .filter((r: any) => r.winner_team != null && r.match?.date)
        .sort((a: any, b: any) => {
          const dtA = new Date(`${a.match.date}T${a.match.time_slot || '00:00'}`).getTime();
          const dtB = new Date(`${b.match.date}T${b.match.time_slot || '00:00'}`).getTime();
          return dtA - dtB; // ordre chronologique pour cumuler totalDelta
        });

      resultsWithWinner.forEach((r: any, idx: number) => {
        const isTeam1 = r.team1_player1_id === userId || r.team1_player2_id === userId;
        const t1w = getLevel(r.team1_player1_id) + getLevel(r.team1_player2_id);
        const t2w = getLevel(r.team2_player1_id) + getLevel(r.team2_player2_id);
        const myW = isTeam1 ? t1w : t2w;
        const oppW = isTeam1 ? t2w : t1w;
        const iWon = r.winner_team === (isTeam1 ? 1 : 2);
        const diff = oppW - myW;
        const delta = iWon
          ? (diff > THRESHOLD ? 0.3 : diff >= -THRESHOLD ? 0.1 : 0)
          : (diff > THRESHOLD ? 0 : diff >= -THRESHOLD ? -0.1 : -0.3);

        totalDelta = Math.round((totalDelta + delta) * 10) / 10;

        const matchDate = new Date(r.match.date);
        if (matchDate.getMonth() === currentMonth && matchDate.getFullYear() === currentYear) {
          monthDelta = Math.round((monthDelta + delta) * 10) / 10;
        }

        // Dernier match = dernier élément après tri chronologique
        if (idx === resultsWithWinner.length - 1) {
          lastMatchDelta = delta;
        }
      });

      setPlayerStats({ totalMatches: resultsData.length, wins, losses, leftMatches, rightMatches, lastMatchDelta, totalDelta, monthDelta });
    } catch (error) {
      console.error('Erreur chargement stats joueur:', error);
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

  const formatTimeSlot = (timeSlot: string): string => {
    if (!timeSlot) return '';
    const parts = timeSlot.split(':');
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
    return timeSlot;
  };

  const handleMatchPress = (match: MyMatch) => {
    router.push(`/my-match/${match.id}` as any);
  };

  const activeMatches = myMatches.filter((m) => m.status !== 'completed');
  const completedMatches = myMatches.filter((m) => m.status === 'completed');
  const searchingTournaments = myTournaments.filter((t) => t.status === 'searching');
  const partnerFoundTournaments = myTournaments.filter((t) => t.status === 'partner_found');
  const completedTournaments = myTournaments.filter((t) => t.status === 'completed');
  const declaredLevel = Number(profile?.declared_level || 0);
  const hasCommunityLevel = profile?.community_level != null;
  const estimatedLevel = Number(hasCommunityLevel ? profile.community_level : profile?.declared_level || 0);
  const declaredLevelPct = Math.min((declaredLevel / 10) * 100, 100);
  const estimatedLevelPct = Math.min((estimatedLevel / 10) * 100, 100);
  const playedWithResult = playerStats.wins + playerStats.losses;
  const winRate = playedWithResult > 0 ? Math.round((playerStats.wins / playedWithResult) * 100) : 0;
  const rank = getRank(estimatedLevel);

  const levelBarAnim = useRef(new Animated.Value(0)).current;
  const deltaScaleAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    Animated.timing(levelBarAnim, {
      toValue: estimatedLevelPct,
      duration: 1000,
      useNativeDriver: false,
    }).start();
    Animated.spring(deltaScaleAnim, {
      toValue: 1,
      tension: 60,
      friction: 6,
      useNativeDriver: true,
    }).start();
  }, [estimatedLevelPct, playerStats.totalDelta]);

  const animatedBarWidth = levelBarAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  if (loading) return <ActivityIndicator size="large" style={styles.loader} />;

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Bienvenue !</Text>
        <Text style={styles.subtitle}>Creez votre profil pour commencer</Text>
        <Pressable
          style={({ pressed }) => [styles.createProfileButton, pressed && styles.buttonPressed]}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <LinearGradient
            colors={['rgba(212, 175, 55, 0.45)', 'rgba(15, 16, 21, 0.94)', 'rgba(8, 9, 12, 0.98)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.goldButtonGradient}
            pointerEvents="none"
          />
          <Text style={styles.createProfileButtonText}>Creer mon profil</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ImageBackground
      source={backgroundImage}
      style={styles.container}
      resizeMode="cover"
    >
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLogo}>
              <Logo size="small" showText={true} />
            </View>
            <Pressable
              onPress={() => router.push('/(tabs)/profile')}
              style={styles.avatarButton}
            >
              <View style={styles.avatarFrame}>
                <Avatar
                  imageUrl={profile.avatar_url}
                  firstName={profile.firstname || ''}
                  lastName={profile.lastname || ''}
                  size={50}
                  style={styles.headerAvatar}
                />
              </View>
            </Pressable>
          </View>
          <Text style={[styles.welcomeText, !isDark && { color: '#000000' }]}>Bonjour, {profile.username}</Text>

          <View style={[styles.playerStatsCard, { borderColor: rank.color + '99', shadowColor: rank.color }]}>
            <LinearGradient
              colors={C.gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.playerStatsGradient}
            >
              {/* Header */}
              <View style={styles.playerStatsHeaderRow}>
                <Text style={[styles.playerStatsTitle, { color: C.cardText }]}>Progression joueur</Text>
                <Animated.Text style={[
                  styles.playerStatsXp,
                  {
                    transform: [{ scale: deltaScaleAnim }],
                    color: playerStats.totalDelta > 0
                      ? '#44DD44'
                      : playerStats.totalDelta < -0.2
                      ? '#FF4444'
                      : playerStats.totalDelta < 0
                      ? '#FF8844'
                      : '#AAAAAA',
                  },
                ]}>
                  {playerStats.totalDelta > 0
                    ? `+${playerStats.totalDelta}🔥`
                    : playerStats.totalDelta < 0
                    ? `${playerStats.totalDelta}`
                    : '0'}
                </Animated.Text>
              </View>

              {/* Rank banner */}
              <View style={[styles.rankBanner, { backgroundColor: rank.color + '18', borderColor: rank.color + '55' }]}>
                <View style={[styles.rankIconCircle, { backgroundColor: rank.color + '33' }]}>
                  <Ionicons name={rank.iconName as any} size={22} color={rank.color} />
                </View>
                <Text style={[styles.rankLabel, { color: rank.color }]}>{rank.label}</Text>
                <View style={[styles.rankScoreBadge, { borderColor: rank.color + '88' }]}>
                  <Text style={[styles.rankScoreValue, { color: rank.color }]}>{estimatedLevel.toFixed(1)}</Text>
                  <Text style={styles.rankScoreSuffix}> / 10</Text>
                </View>
              </View>

              {/* Level bar */}
              <Text style={[styles.playerStatsSectionLabel, { color: C.cardSubtext }]}>Niveau déclaré VS Niveau estimé</Text>
              <View style={styles.levelCompareRow}>
                <Text style={[styles.levelCompareValue, { color: C.cardText }]}>Déclaré {declaredLevel.toFixed(1)}</Text>
                <Text style={[styles.levelCompareValue, { color: C.cardText }]}>Estimé {estimatedLevel.toFixed(1)}</Text>
              </View>
              <View style={styles.levelBarTrack}>
                <View style={[styles.levelBarDeclared, { width: `${declaredLevelPct}%` }]} />
                <Animated.View style={[styles.levelBarEstimated, { width: animatedBarWidth, backgroundColor: C.levelBarBg }]} />
              </View>
              <View style={styles.levelLegendRow}>
                <View style={styles.levelLegendItem}>
                  <View style={styles.levelLegendDeclared} />
                  <Text style={[styles.levelLegendText, { color: C.cardSubtext }]}>Déclaré</Text>
                </View>
                <View style={styles.levelLegendItem}>
                  <View style={styles.levelLegendEstimated} />
                  <Text style={[styles.levelLegendText, { color: C.cardSubtext }]}>Estimé</Text>
                </View>
              </View>

              {/* Stats */}
              <View style={styles.statsGrid}>
                <View style={[styles.statCell, styles.statCellThird, { backgroundColor: C.statBg }]}>
                  <Text style={[styles.statLabel, { color: C.cardSubtext }]}>Ce mois-ci :</Text>
                  <Text style={[styles.statValue, {
                    color: playerStats.monthDelta > 0
                      ? '#44DD44'
                      : playerStats.monthDelta < -0.2
                      ? '#FF4444'
                      : playerStats.monthDelta < 0
                      ? '#FF8844'
                      : C.cardText,
                  }]}>
                    {playerStats.monthDelta > 0 ? `+${playerStats.monthDelta}` : `${playerStats.monthDelta}`}
                    <Text style={[styles.statLabel, { color: C.cardSubtext, fontWeight: '400' }]}> de progression</Text>
                  </Text>
                </View>
                <View style={[styles.statCell, styles.statCellThird, { backgroundColor: C.statBg, justifyContent: 'center' }]}>
                  <Text style={[styles.statValue, { color: C.cardText }]}>
                    {playerStats.totalMatches}
                    <Text style={[styles.statLabel, { color: C.cardSubtext, fontWeight: '400' }]}> matchs joués</Text>
                  </Text>
                </View>
                <View style={[styles.statCell, styles.statCellThird, { backgroundColor: C.statBg, justifyContent: 'center' }]}>
                  <Text style={[styles.statValue, { color: C.cardText }]}>
                    {playerStats.wins}
                    <Text style={[styles.statLabel, { color: C.cardSubtext, fontWeight: '400' }]}> victoires</Text>
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </View>

        <View style={[styles.section, styles.sectionCompact]}>
          <Text style={styles.sectionTitle}>Mes parties ({myMatches.length})</Text>
          <View style={styles.rowInline}>
            <PremiumSearchButton
              title="Rechercher une partie"
              onPress={() => router.push('/explore/matches' as any)}
              isDark={isDark}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.horizontalScroll, styles.horizontalScrollPaddedBottom]}
          >
              {activeMatches.map((match) => {
                const isCompleted = match.status === 'completed';
                const isFull = match.status === 'full';
                const accentColor = isCompleted ? '#FF4444' : '#D4AF37';
                const statusLabel = isCompleted ? 'Terminee' : isFull ? 'Complete' : 'En cours';
                const statusBadgeStyle = isCompleted
                  ? styles.badgeCompleted
                  : isFull
                  ? styles.badgeFull
                  : styles.badgeOpen;
                return (
                  <Pressable
                    key={match.id}
                    style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, { backgroundColor: C.cardBg }, pressed && styles.cardPressed]}
                    onPress={() => handleMatchPress(match)}
                  >
                    <View style={styles.matchCardHeader}>
                      <View style={[styles.badge, statusBadgeStyle]}>
                        <Text style={styles.matchStatusText}>
                          {statusLabel}
                        </Text>
                      </View>
                      {isFull && !isCompleted && (
                        <Ionicons name="checkmark-circle" size={20} color="#D4AF37" />
                      )}
                    </View>

                    <View style={styles.matchDateTimeRow}>
                      <Text style={[styles.matchDate, { color: C.cardText }]}>{formatDate(match.date)}</Text>
                      <Text style={[styles.matchTime, { color: accentColor }]}>
                        {formatTimeSlot(match.time_slot)}
                      </Text>
                    </View>

                    {match.court && (
                      <>
                        <Text style={[styles.matchCity, !isDark && { color: '#111111' }]} numberOfLines={1}>
                          {match.court.city} · {match.court.name}
                        </Text>
                        {userCoords && match.court.latitude && match.court.longitude && (
                          <Text style={[styles.matchCourtInfo, !isDark && { color: '#111111' }]}>
                            {calculateDistance(userCoords.lat, userCoords.lng, Number(match.court.latitude), Number(match.court.longitude))} km
                          </Text>
                        )}
                      </>
                    )}

                    <Text style={[styles.matchLevel, !isDark && { color: '#111111' }]}>
                      Niveau mini {match.level_min.toFixed(1)}
                    </Text>

                    <View style={styles.matchFooter}>
                      <View style={styles.matchAvatarsRow}>
                        {match.participant_previews?.slice(0, 4).map((p, index) => (
                          <View
                            key={p.user_id}
                            style={[styles.matchAvatarItem, index > 0 && styles.matchAvatarOverlap]}
                          >
                            <Avatar
                              imageUrl={p.avatar_url}
                              firstName={p.firstname}
                              lastName={p.lastname}
                              size={36}
                              style={styles.matchAvatar}
                            />
                          </View>
                        ))}
                        {(match.participant_previews?.length || 0) > 4 && (
                          <Text style={styles.matchAvatarMore}>
                            +{(match.participant_previews?.length || 0) - 4}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.matchPlayers, { color: C.cardText }]}>
                        {match.participants_count}/{match.format}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              <Pressable
                style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, styles.createMatchShortcutCard, { backgroundColor: C.cardBg }, pressed && styles.cardPressed]}
                onPress={() => router.push('/create-match')}
              >
                <Ionicons name="add-circle-outline" size={30} color="#D4AF37" />
                <Text style={[styles.groupName, { color: C.cardText }]}>Creer une partie</Text>
              </Pressable>

              {completedMatches.map((match) => {
                const isCompleted = match.status === 'completed';
                const isFull = match.status === 'full';
                const accentColor = isCompleted ? '#FF4444' : '#D4AF37';
                const statusLabel = isCompleted ? 'Terminee' : isFull ? 'Complete' : 'En cours';
                const statusBadgeStyle = isCompleted
                  ? styles.badgeCompleted
                  : isFull
                  ? styles.badgeFull
                  : styles.badgeOpen;
                return (
                  <Pressable
                    key={match.id}
                    style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, { borderColor: '#FF4444', backgroundColor: C.cardBg }, pressed && styles.cardPressed]}
                    onPress={() => handleMatchPress(match)}
                  >
                    <View style={styles.matchCardHeader}>
                      <View style={[styles.badge, statusBadgeStyle]}>
                        <Text style={styles.matchStatusText}>
                          {statusLabel}
                        </Text>
                      </View>
                      {isFull && !isCompleted && (
                        <Ionicons name="checkmark-circle" size={20} color="#D4AF37" />
                      )}
                    </View>

                    <View style={styles.matchDateTimeRow}>
                      <Text style={[styles.matchDate, { color: C.cardText }]}>{formatDate(match.date)}</Text>
                      <Text style={[styles.matchTime, { color: accentColor }]}>
                        {formatTimeSlot(match.time_slot)}
                      </Text>
                    </View>

                    {match.court && (
                      <>
                        <Text style={[styles.matchCity, !isDark && { color: '#111111' }]} numberOfLines={1}>
                          {match.court.city} · {match.court.name}
                        </Text>
                        {userCoords && match.court.latitude && match.court.longitude && (
                          <Text style={[styles.matchCourtInfo, !isDark && { color: '#111111' }]}>
                            {calculateDistance(userCoords.lat, userCoords.lng, Number(match.court.latitude), Number(match.court.longitude))} km
                          </Text>
                        )}
                      </>
                    )}

                    <Text style={[styles.matchLevel, !isDark && { color: '#111111' }]}>
                      Niveau mini {match.level_min.toFixed(1)}
                    </Text>

                    <View style={styles.matchFooter}>
                      <View style={styles.matchAvatarsRow}>
                        {match.participant_previews?.slice(0, 4).map((p, index) => (
                          <View
                            key={p.user_id}
                            style={[styles.matchAvatarItem, index > 0 && styles.matchAvatarOverlap]}
                          >
                            <Avatar
                              imageUrl={p.avatar_url}
                              firstName={p.firstname}
                              lastName={p.lastname}
                              size={36}
                              style={styles.matchAvatar}
                            />
                          </View>
                        ))}
                        {(match.participant_previews?.length || 0) > 4 && (
                          <Text style={styles.matchAvatarMore}>
                            +{(match.participant_previews?.length || 0) - 4}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.matchPlayers, { color: C.cardText }]}>
                        {match.participants_count}/{match.format}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
          </ScrollView>
        </View>

        <View style={[styles.section, styles.sectionCompact, styles.sectionTournamentTight]}>
          <Text style={styles.sectionTitle}>Mes tournois ({myTournaments.length})</Text>
          <View style={styles.rowInline}>
            <PremiumSearchButton
              title="Rechercher un partenaire de tournoi"
              onPress={() => router.push('/tournament/explore' as any)}
              isDark={isDark}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
              {searchingTournaments.map((tournament) => {
                const isPartnerFound = tournament.status === 'partner_found';
                const accentColor = isPartnerFound ? '#44DD44' : '#D4AF37';
                return (
                  <Pressable
                    key={tournament.id}
                    style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, { backgroundColor: C.cardBg }, pressed && styles.cardPressed]}
                    onPress={() => router.push(`/my-tournament/${tournament.id}` as any)}
                  >
                    <View style={styles.matchCardHeader}>
                      <View style={[styles.badge, styles.badgeOpen]}>
                        <Text style={styles.badgeText}>
                          {isPartnerFound ? 'Trouve' : 'En recherche'}
                        </Text>
                      </View>
                      {tournament.demand_count > 0 && (
                        <View style={styles.demandCountBadge}>
                          <Text style={styles.demandCountText}>{tournament.demand_count}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.matchDateTimeRow}>
                      <Text style={[styles.matchDate, { color: C.cardText }]}>{formatDate(tournament.date)}</Text>
                      <Text style={[styles.matchTime, { color: accentColor }]}>
                        {tournament.time_slot || 'Heure libre'}
                      </Text>
                    </View>

                    {tournament.court && (
                      <>
                        <Text style={[styles.matchCity, !isDark && { color: '#111111' }]} numberOfLines={1}>
                          {tournament.court.city} · {tournament.court.name}
                        </Text>
                        {userCoords && tournament.court.latitude && tournament.court.longitude && (
                          <Text style={[styles.matchCourtInfo, !isDark && { color: '#111111' }]}>
                            {calculateDistance(userCoords.lat, userCoords.lng, Number(tournament.court.latitude), Number(tournament.court.longitude))} km
                          </Text>
                        )}
                      </>
                    )}

                    <Text style={[styles.matchPlayers, { color: C.cardText }]}>{tournament.category}</Text>
                    {tournament.min_ranking != null && (
                      <Text style={[styles.matchLevel, !isDark && { color: '#111111' }]}>
                        Classement mini : {tournament.min_ranking}
                      </Text>
                    )}
                    <View style={styles.matchAvatarsRow}>
                      {tournament.participant_previews?.slice(0, 2).map((p, index) => (
                        <View
                          key={p.user_id}
                          style={[styles.matchAvatarItem, index > 0 && styles.matchAvatarOverlap]}
                        >
                          <Avatar
                            imageUrl={p.avatar_url}
                            firstName={p.firstname}
                            lastName={p.lastname}
                            size={36}
                            style={styles.matchAvatar}
                          />
                        </View>
                      ))}
                    </View>
                  </Pressable>
                );
              })}
              <Pressable
                style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, styles.createTournamentShortcutCard, { backgroundColor: C.cardBg }, pressed && styles.cardPressed]}
                onPress={() => router.push('/create-tournament')}
              >
                <Ionicons name="add-circle-outline" size={30} color="#D4AF37" />
                <Text style={[styles.groupName, { color: C.cardText }]}>Créer un tournoi</Text>
              </Pressable>

              {partnerFoundTournaments.map((tournament) => (
                  <Pressable
                    key={tournament.id}
                    style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, { backgroundColor: C.cardBg }, pressed && styles.cardPressed]}
                    onPress={() => router.push(`/my-tournament/${tournament.id}` as any)}
                  >
                    <View style={styles.matchCardHeader}>
                      <View style={[styles.badge, styles.badgePartnerFound]}>
                        <Text style={styles.badgeText}>Trouvé</Text>
                      </View>
                    </View>

                    <View style={styles.matchDateTimeRow}>
                      <Text style={[styles.matchDate, { color: C.cardText }]}>{formatDate(tournament.date)}</Text>
                      <Text style={[styles.matchTime, { color: '#44DD44' }]}>
                        {tournament.time_slot || 'Heure libre'}
                      </Text>
                    </View>

                    {tournament.court && (
                      <>
                        <Text style={[styles.matchCity, !isDark && { color: '#111111' }]} numberOfLines={1}>
                          {tournament.court.city} · {tournament.court.name}
                        </Text>
                        {userCoords && tournament.court.latitude && tournament.court.longitude && (
                          <Text style={[styles.matchCourtInfo, !isDark && { color: '#111111' }]}>
                            {calculateDistance(userCoords.lat, userCoords.lng, Number(tournament.court.latitude), Number(tournament.court.longitude))} km
                          </Text>
                        )}
                      </>
                    )}

                    <Text style={[styles.matchPlayers, { color: C.cardText }]}>{tournament.category}</Text>
                    {tournament.min_ranking != null && (
                      <Text style={[styles.matchLevel, !isDark && { color: '#111111' }]}>
                        Classement mini : {tournament.min_ranking}
                      </Text>
                    )}
                    <View style={styles.matchAvatarsRow}>
                      {tournament.participant_previews?.slice(0, 2).map((p, index) => (
                        <View
                          key={p.user_id}
                          style={[styles.matchAvatarItem, index > 0 && styles.matchAvatarOverlap]}
                        >
                          <Avatar
                            imageUrl={p.avatar_url}
                            firstName={p.firstname}
                            lastName={p.lastname}
                            size={36}
                            style={styles.matchAvatar}
                          />
                        </View>
                      ))}
                    </View>
                  </Pressable>
              ))}

              {completedTournaments.map((tournament) => (
                  <Pressable
                    key={tournament.id}
                    style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, { borderColor: '#FF4444', backgroundColor: C.cardBg }, pressed && styles.cardPressed]}
                    onPress={() => router.push(`/my-tournament/${tournament.id}` as any)}
                  >
                    <View style={styles.matchCardHeader}>
                      <View style={[styles.badge, styles.badgeCompleted]}>
                        <Text style={styles.badgeText}>Terminé</Text>
                      </View>
                    </View>

                    <View style={styles.matchDateTimeRow}>
                      <Text style={[styles.matchDate, { color: C.cardText }]}>{formatDate(tournament.date)}</Text>
                      <Text style={[styles.matchTime, { color: '#FF4444' }]}>
                        {tournament.time_slot || 'Heure libre'}
                      </Text>
                    </View>

                    {tournament.court && (
                      <>
                        <Text style={[styles.matchCity, !isDark && { color: '#111111' }]} numberOfLines={1}>
                          {tournament.court.city} · {tournament.court.name}
                        </Text>
                        {userCoords && tournament.court.latitude && tournament.court.longitude && (
                          <Text style={[styles.matchCourtInfo, !isDark && { color: '#111111' }]}>
                            {calculateDistance(userCoords.lat, userCoords.lng, Number(tournament.court.latitude), Number(tournament.court.longitude))} km
                          </Text>
                        )}
                      </>
                    )}

                    <Text style={[styles.matchPlayers, { color: C.cardText }]}>{tournament.category}</Text>
                    {tournament.min_ranking != null && (
                      <Text style={[styles.matchLevel, !isDark && { color: '#111111' }]}>
                        Classement mini : {tournament.min_ranking}
                      </Text>
                    )}
                    <View style={styles.matchAvatarsRow}>
                      {tournament.participant_previews?.slice(0, 2).map((p, index) => (
                        <View
                          key={p.user_id}
                          style={[styles.matchAvatarItem, index > 0 && styles.matchAvatarOverlap]}
                        >
                          <Avatar
                            imageUrl={p.avatar_url}
                            firstName={p.firstname}
                            lastName={p.lastname}
                            size={36}
                            style={styles.matchAvatar}
                          />
                        </View>
                      ))}
                    </View>
                  </Pressable>
              ))}
          </ScrollView>
        </View>

        <View style={[styles.section, styles.sectionCompact]}>
          <Text style={styles.sectionTitle}>Mes groupes prives ({myGroups.length})</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {myGroups.map((group) => (
              <Pressable
                key={group.id}
                style={({ pressed }) => [styles.groupCard, { backgroundColor: C.cardBg }, pressed && styles.cardPressed]}
                onPress={() => router.push(`/group/${group.id}` as any)}
              >
                <Ionicons name={group.icon as any} size={30} color="#D4AF37" />
                <Text style={[styles.groupName, { color: C.cardText }]} numberOfLines={2}>
                  {group.name}
                </Text>
                <Text style={styles.groupMembers}>
                  {group.member_count} {group.member_count > 1 ? 'membres' : 'membre'}
                </Text>
              </Pressable>
            ))}

            <Pressable
              style={({ pressed }) => [styles.groupCard, { backgroundColor: C.cardBg }, pressed && styles.cardPressed]}
              onPress={() => router.push('/create-group')}
            >
              <Ionicons name="add-circle-outline" size={30} color="#D4AF37" />
              <Text style={[styles.groupName, { color: C.cardText }]}>Creer un groupe</Text>
            </Pressable>
          </ScrollView>
        </View>
      </ScrollView>
    </ImageBackground>
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
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 6,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLogo: {
    marginTop: -22,
  },
  avatarButton: {
    borderRadius: 999,
    marginTop: 16,
  },
  avatarFrame: {
    borderRadius: 999,
    padding: 2,
    backgroundColor: '#0E0E0E',
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  headerAvatar: {
    borderWidth: 0,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: -25,
  },
  playerStatsCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1.1,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    overflow: 'hidden',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius: 14,
    elevation: 8,
  },
  playerStatsGradient: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  rankBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  rankIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankLabel: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  rankScoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rankScoreValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  rankScoreSuffix: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666666',
  },
  playerStatsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playerStatsTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  playerStatsXp: {
    color: '#D4AF37',
    fontSize: 20,
    fontWeight: '800',
  },
  playerStatsSectionLabel: {
    color: '#C9B27A',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  levelCompareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  levelCompareValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  levelBarTrack: {
    position: 'relative',
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  levelBarDeclared: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(212, 175, 55, 0.72)',
  },
  levelBarEstimated: {
    position: 'absolute',
    left: 0,
    top: 2,
    bottom: 2,
    backgroundColor: '#141414',
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.28)',
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  levelLegendRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 14,
  },
  levelLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelLegendDeclared: {
    width: 9,
    height: 9,
    borderRadius: 99,
    backgroundColor: 'rgba(212, 175, 55, 0.9)',
  },
  levelLegendEstimated: {
    width: 9,
    height: 9,
    borderRadius: 99,
    backgroundColor: '#141414',
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  levelLegendText: {
    color: '#C0C0C0',
    fontSize: 10,
    fontWeight: '600',
  },
  statsGrid: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
  },
  statCell: {
    width: '48%',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.28)',
    backgroundColor: 'rgba(20, 19, 17, 0.78)',
  },
  statCellThird: {
    width: undefined,
    flex: 1,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  statLabel: {
    color: '#B8B8B8',
    fontSize: 11,
    marginTop: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 15,
    paddingHorizontal: 20,
    marginBottom: 10,
    height: 62,
  },
  premiumSearchWrapper: {
    width: '100%',
    height: 50,
    shadowColor: '#D4AF37',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  premiumSearchPressable: {
    flex: 1,
    borderRadius: 30,
    overflow: 'hidden',
  },
  premiumSearchPressed: {
    opacity: 0.97,
    transform: [{ translateY: 1 }],
  },
  premiumSearchGradient: {
    flex: 1,
    borderRadius: 30,
    justifyContent: 'center',
    padding: 2,
    overflow: 'hidden',
  },
  premiumSearchInner: {
    flex: 1,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    overflow: 'hidden',
  },
  premiumReliefTop: {
    position: 'absolute',
    top: 1,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  premiumReliefBottom: {
    position: 'absolute',
    bottom: 1,
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  premiumShineLeft: {
    position: 'absolute',
    top: 7,
    left: 16,
    width: 26,
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.23)',
  },
  premiumShineRight: {
    position: 'absolute',
    bottom: 7,
    right: 16,
    width: 20,
    height: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.16)',
  },
  premiumSearchText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.15,
    textAlign: 'center',
  },
  searchBlock: {
    flex: 2,
    backgroundColor: '#0C0D11',
    borderRadius: 20,
    borderWidth: 2.2,
    borderColor: '#D4AF37',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  createBlock: {
    flex: 1,
    backgroundColor: '#0C0D11',
    borderRadius: 20,
    borderWidth: 2.2,
    borderColor: '#D4AF37',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 14,
    minHeight: 200,
  },
  sectionCompact: {
    height: 252,
    marginBottom: 14,
  },
  sectionTournamentTight: {
    height: 252,
    marginTop: -8,
  },
  rowInline: {
    height: 50,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#D4AF37',
    marginBottom: 12,
  },
  horizontalScroll: {
    gap: 15,
  },
  horizontalScrollPaddedBottom: {
    paddingBottom: 6,
  },
  matchCard: {
    width: 160,
    backgroundColor: Platform.OS === 'android' ? '#0E1014' : 'rgba(16, 18, 22, 0.62)',
    borderRadius: 18,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    padding: 12,
    gap: 8,
    shadowColor: '#E3B14F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 7,
  },
  matchCardCompact: {
    padding: 9,
    gap: 5,
  },
  matchCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8E6A1F',
  },
  badgeCreator: {
    backgroundColor: '#E7BD58',
  },
  badgeParticipant: {
    backgroundColor: '#2A2F3A',
  },
  badgeOpen: {
    backgroundColor: '#D4AF37',
  },
  badgeFull: {
    backgroundColor: '#D4AF37',
  },
  badgeCompleted: {
    backgroundColor: '#FF4444',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000000',
  },
  matchStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000000',
  },
  matchDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  matchDateTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  matchTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D4AF37',
  },
  matchCity: {
    fontSize: 11,
    color: '#AAAAAA',
  },
  matchFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    alignItems: 'center',
  },
  matchAvatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchAvatarItem: {
    zIndex: 2,
  },
  matchAvatarOverlap: {
    marginLeft: -10,
  },
  matchAvatar: {
    borderColor: '#101216',
    borderWidth: 1.5,
  },
  matchAvatarMore: {
    marginLeft: 6,
    fontSize: 10,
    color: '#A0A0A5',
    fontWeight: '600',
  },
  matchLevel: {
    fontSize: 10,
    color: '#AAAAAA',
  },
  matchCourtInfo: {
    fontSize: 10,
    color: '#AAAAAA',
  },
  matchPlayers: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    height: 140,
    backgroundColor: '#111216',
    borderRadius: 18,
    borderWidth: 1.3,
    borderColor: '#D4AF37',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D8A948',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  groupCard: {
    width: 120,
    height: 118,
    backgroundColor: Platform.OS === 'android' ? '#0E1014' : 'rgba(17, 18, 22, 0.62)',
    borderRadius: 18,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#E3B14F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 7,
  },
  createShortcutCard: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  createMatchShortcutCard: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  createTournamentShortcutCard: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  groupMembers: {
    fontSize: 11,
    color: '#AAAAAA',
  },
  badgePartnerFound: {
    backgroundColor: '#44DD44',
  },
  demandCountBadge: {
    backgroundColor: '#FF4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  demandCountText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  createProfileButton: {
    backgroundColor: '#0C0D11',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 16,
    marginTop: 20,
    borderWidth: 2.2,
    borderColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  createProfileButtonText: {
    color: '#F8D57A',
    fontSize: 16,
    fontWeight: '700',
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
    color: '#AAAAAA',
    textAlign: 'center',
    marginTop: 10,
  },
  goldButtonGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  buttonPressed: {
    transform: [{ scale: 0.985 }],
    borderColor: '#FFD978',
    shadowOpacity: 0.8,
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
    shadowOpacity: 0.45,
  },
  premiumLightBorder: {
    width: '100%',
    height: 50,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    shadowColor: '#B8940A',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  premiumLightPressable: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden' as const,
  },
  premiumLightGradient: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
  },
  premiumLightHighlight: {
    position: 'absolute' as const,
    top: 2,
    left: 14,
    right: 14,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 2,
  },
  premiumLightShadowLine: {
    position: 'absolute' as const,
    bottom: 2,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: 'rgba(140,120,70,0.4)',
    borderRadius: 2,
  },
  premiumLightText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#1A1A1A',
    letterSpacing: 0.15,
    textAlign: 'center' as const,
  },
});
