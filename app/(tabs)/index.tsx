import { supabase } from '@/constants/supabase';
import Logo from '@/components/Logo';
import Avatar from '@/components/Avatar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
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
  level_max: number;
  status: string;
  creator_id: string;
  participants_count: number;
  court: { name: string; city: string } | null;
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
  court: { name: string; city: string } | null;
  demand_count: number;
}

const getRequiredPlayers = (format: unknown): number => {
  if (format === 4 || format === '4' || format === '2v2') return 4;
  return 2;
};

function PremiumSearchButton({
  onPress,
  title,
}: {
  onPress: () => void;
  title: string;
}) {
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
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myMatches, setMyMatches] = useState<MyMatch[]>([]);
  const [myGroups, setMyGroups] = useState<GroupWithMembers[]>([]);
  const [myTournaments, setMyTournaments] = useState<MyTournament[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadMyMatches();
      loadMyGroups();
      loadMyTournaments();
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
          const dateStr = match.date.split('T')[0];
          const timeStr = match.time_slot.length === 5 ? `${match.time_slot}:00` : match.time_slot;
          const matchEnd = new Date(`${dateStr}T${timeStr}`);
          matchEnd.setMinutes(matchEnd.getMinutes() + (match.duration_minutes || 90));

          if (!isNaN(matchEnd.getTime()) && now > matchEnd) {
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
          court:courts(name, city)
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
              profile:Profiles!match_participants_user_id_fkey(firstname, lastname, avatar_url)
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
              const dateStr = (match.date || '').split('T')[0];
              const timeStr = (match.time_slot || '').length === 5 ? `${match.time_slot}:00` : match.time_slot;
              const matchEnd = new Date(`${dateStr}T${timeStr}`);
              matchEnd.setMinutes(matchEnd.getMinutes() + (match.duration_minutes || 90));

              if (!isNaN(matchEnd.getTime()) && now > matchEnd && isIncomplete) {
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
          court:courts(name, city)
        `)
        .eq('creator_id', session.user.id)
        .in('status', ['searching', 'partner_found'])
        .order('date', { ascending: true })
        .limit(20);

      if (tournamentsData && tournamentsData.length > 0) {
        const tournamentIds = tournamentsData.map(t => t.id);
        const { data: demandsData } = await supabase
          .from('tournament_demands')
          .select('tournament_id')
          .in('tournament_id', tournamentIds)
          .eq('status', 'pending');

        const demandCountMap = new Map<string, number>();
        demandsData?.forEach((d: any) => {
          const count = demandCountMap.get(d.tournament_id) || 0;
          demandCountMap.set(d.tournament_id, count + 1);
        });

        setMyTournaments(tournamentsData.map(t => ({
          ...t,
          demand_count: demandCountMap.get(t.id) || 0,
        })));
      } else {
        setMyTournaments([]);
      }
    } catch (error) {
      console.error('Erreur chargement tournois:', error);
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
  const doneTournaments = myTournaments.filter((t) => t.status !== 'searching');

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
      source={require('@/assets/images/piste-noire.png')}
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
              <Avatar
                imageUrl={profile.avatar_url}
                firstName={profile.firstname || ''}
                lastName={profile.lastname || ''}
                size={44}
                style={styles.headerAvatar}
              />
            </Pressable>
          </View>
          <Text style={styles.welcomeText}>Bonjour, {profile.username}</Text>
        </View>

        <View style={[styles.section, styles.sectionCompact]}>
          <Text style={styles.sectionTitle}>Mes parties ({myMatches.length})</Text>
          <View style={styles.rowInline}>
            <PremiumSearchButton
              title="Rechercher une partie"
              onPress={() => router.push('/(tabs)/explore')}
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
                    style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, pressed && styles.cardPressed]}
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
                      <Text style={styles.matchDate}>{formatDate(match.date)}</Text>
                      <Text style={[styles.matchTime, { color: accentColor }]}>
                        {formatTimeSlot(match.time_slot)}
                      </Text>
                    </View>

                    {match.court && (
                      <Text style={styles.matchCity} numberOfLines={1}>
                        {match.court.city}
                      </Text>
                    )}

                    <Text style={styles.matchLevel}>
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
                              size={18}
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
                      <Text style={styles.matchPlayers}>
                        {match.participants_count}/{match.format}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              <Pressable
                style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, styles.createMatchShortcutCard, pressed && styles.cardPressed]}
                onPress={() => router.push('/create-match')}
              >
                <Ionicons name="add-circle-outline" size={30} color="#D4AF37" />
                <Text style={styles.groupName}>Creer une partie</Text>
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
                    style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, pressed && styles.cardPressed]}
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
                      <Text style={styles.matchDate}>{formatDate(match.date)}</Text>
                      <Text style={[styles.matchTime, { color: accentColor }]}>
                        {formatTimeSlot(match.time_slot)}
                      </Text>
                    </View>

                    {match.court && (
                      <Text style={styles.matchCity} numberOfLines={1}>
                        {match.court.city}
                      </Text>
                    )}

                    <Text style={styles.matchLevel}>
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
                              size={18}
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
                      <Text style={styles.matchPlayers}>
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
                    style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, pressed && styles.cardPressed]}
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
                      <Text style={styles.matchDate}>{formatDate(tournament.date)}</Text>
                      <Text style={[styles.matchTime, { color: accentColor }]}>
                        {tournament.time_slot || 'Heure libre'}
                      </Text>
                    </View>

                    {tournament.court && (
                      <Text style={styles.matchCity} numberOfLines={1}>
                        {tournament.court.city}
                      </Text>
                    )}

                    <View style={styles.matchFooter}>
                      <Text style={styles.matchPlayers}>{tournament.category}</Text>
                      <Text style={styles.matchPlayers}>{tournament.event_type}</Text>
                    </View>
                  </Pressable>
                );
              })}
              <Pressable
                style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, styles.createTournamentShortcutCard, pressed && styles.cardPressed]}
                onPress={() => router.push('/create-tournament')}
              >
                <Ionicons name="add-circle-outline" size={30} color="#D4AF37" />
                <Text style={styles.groupName}>Créer un tournoi</Text>
              </Pressable>

              {doneTournaments.map((tournament) => {
                const isPartnerFound = tournament.status === 'partner_found';
                const accentColor = isPartnerFound ? '#44DD44' : '#D4AF37';
                return (
                  <Pressable
                    key={tournament.id}
                    style={({ pressed }) => [styles.matchCard, styles.matchCardCompact, pressed && styles.cardPressed]}
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
                      <Text style={styles.matchDate}>{formatDate(tournament.date)}</Text>
                      <Text style={[styles.matchTime, { color: accentColor }]}>
                        {tournament.time_slot || 'Heure libre'}
                      </Text>
                    </View>

                    {tournament.court && (
                      <Text style={styles.matchCity} numberOfLines={1}>
                        {tournament.court.city}
                      </Text>
                    )}

                    <View style={styles.matchFooter}>
                      <Text style={styles.matchPlayers}>{tournament.category}</Text>
                      <Text style={styles.matchPlayers}>{tournament.event_type}</Text>
                    </View>
                  </Pressable>
                );
              })}
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
                style={({ pressed }) => [styles.groupCard, pressed && styles.cardPressed]}
                onPress={() => router.push(`/group/${group.id}` as any)}
              >
                <Ionicons name={group.icon as any} size={30} color="#D4AF37" />
                <Text style={styles.groupName} numberOfLines={2}>
                  {group.name}
                </Text>
                <Text style={styles.groupMembers}>
                  {group.member_count} {group.member_count > 1 ? 'membres' : 'membre'}
                </Text>
              </Pressable>
            ))}

            <Pressable
              style={({ pressed }) => [styles.groupCard, pressed && styles.cardPressed]}
              onPress={() => router.push('/create-group')}
            >
              <Ionicons name="add-circle-outline" size={30} color="#D4AF37" />
              <Text style={styles.groupName}>Creer un groupe</Text>
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
  headerAvatar: {
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: -25,
  },
  row: {
    flexDirection: 'row',
    gap: 15,
    paddingHorizontal: 20,
    marginBottom: 10,
    height: 62,
  },
  premiumSearchWrapper: {
    flex: 1,
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
    height: 226,
    marginTop: -8,
  },
  rowInline: {
    height: 62,
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
    backgroundColor: 'rgba(16, 18, 22, 0.62)',
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
    marginLeft: -6,
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
    backgroundColor: 'rgba(17, 18, 22, 0.62)',
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
});


