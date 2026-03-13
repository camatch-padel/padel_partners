import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/constants/supabase';
import { GROUP_ICONS, type GroupFormData } from '@/types/group';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import Avatar from '@/components/Avatar';

interface PlayerSearchResult {
  id: string;
  username: string;
  firstname: string;
  lastname: string;
  declared_level: number;
  avatar_url: string | null;
}

export default function CreateGroupScreen() {
  const { backgroundImage, theme } = useTheme();
  const isDark = theme === 'dark';
  const [formData, setFormData] = useState<GroupFormData>({
    name: '',
    description: '',
    icon: 'people',
    memberIds: [],
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);

  // Rechercher des joueurs
  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, firstname, lastname, declared_level, avatar_url')
        .or(`username.ilike.%${query}%,firstname.ilike.%${query}%,lastname.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;

      // Filtrer les joueurs déjà ajoutés
      const filtered = data?.filter(p => !formData.memberIds.includes(p.id)) || [];
      setSearchResults(filtered);
    } catch (error) {
      console.error('Erreur recherche:', error);
    } finally {
      setSearching(false);
    }
  };

  const addMember = (playerId: string) => {
    setFormData({
      ...formData,
      memberIds: [...formData.memberIds, playerId],
    });
    setSearchResults(searchResults.filter(p => p.id !== playerId));
  };

  const removeMember = (playerId: string) => {
    setFormData({
      ...formData,
      memberIds: formData.memberIds.filter(id => id !== playerId),
    });
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Erreur', 'Le nom du groupe est obligatoire');
      return;
    }

    if (formData.memberIds.length === 0) {
      Alert.alert('Erreur', 'Ajoutez au moins un membre au groupe');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié');

      // Créer le groupe
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          icon: formData.icon,
          creator_id: session.user.id,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Ajouter le créateur comme membre
      const members = [
        { group_id: group.id, user_id: session.user.id },
        ...formData.memberIds.map(userId => ({ group_id: group.id, user_id: userId }))
      ];

      const { error: membersError } = await supabase
        .from('group_members')
        .insert(members);

      if (membersError) throw membersError;

      Alert.alert('Succès', 'Groupe créé !', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') }
      ]);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de créer le groupe');
    } finally {
      setLoading(false);
    }
  };

  // Obtenir les profils des membres ajoutés
  const [selectedMembers, setSelectedMembers] = useState<PlayerSearchResult[]>([]);

  const loadSelectedMembers = async () => {
    if (formData.memberIds.length === 0) {
      setSelectedMembers([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, firstname, lastname, declared_level, avatar_url')
        .in('id', formData.memberIds);

      if (error) throw error;
      setSelectedMembers(data || []);
    } catch (error) {
      console.error('Erreur chargement membres:', error);
    }
  };

  // Charger les membres sélectionnés quand la liste change
  useEffect(() => {
    loadSelectedMembers();
  }, [formData.memberIds]);

  return (
    <ImageBackground
      source={backgroundImage}
      style={styles.container}
      resizeMode="cover"
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#D4AF37" />
        </Pressable>
        <Text style={styles.headerTitle}>Créer un groupe</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Nom du groupe */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nom du groupe *</Text>
          <TextInput
            style={[styles.input, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)', color: '#111111' }]}
            placeholder="Ex: Les Warriors du Padel"
            placeholderTextColor="#666666"
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
            maxLength={50}
          />
        </View>

        {/* Description (optionnel) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description (optionnel)</Text>
          <TextInput
            style={[styles.input, styles.textArea, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)', color: '#111111' }]}
            placeholder="Décrivez votre groupe..."
            placeholderTextColor="#666666"
            value={formData.description}
            onChangeText={(text) => setFormData({ ...formData, description: text })}
            multiline
            numberOfLines={3}
            maxLength={200}
          />
        </View>

        {/* Recherche de joueurs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ajouter des joueurs *</Text>
          <View style={[styles.searchContainer, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
            <Ionicons name="search" size={20} color="#D4AF37" style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, !isDark && { color: '#111111' }]}
              placeholder="Chercher par nom ou prénom..."
              placeholderTextColor="#666666"
              value={searchQuery}
              onChangeText={handleSearch}
            />
            {searching && <ActivityIndicator size="small" color="#D4AF37" />}
          </View>

          {/* Résultats de recherche */}
          {searchResults.length > 0 && (
            <View style={[styles.searchResults, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
              {searchResults.map((player) => (
                <Pressable
                  key={player.id}
                  style={styles.playerItem}
                  onPress={() => addMember(player.id)}
                >
                  <Avatar
                    imageUrl={player.avatar_url}
                    firstName={player.firstname}
                    lastName={player.lastname}
                    size={48}
                  />
                  <View style={styles.playerInfo}>
                    <Text style={[styles.playerName, !isDark && { color: '#111111' }]}>
                      {player.firstname} {player.lastname}
                    </Text>
                    <Text style={[styles.playerDetails, !isDark && { color: '#555555' }]}>
                      @{player.username} · Niv. {player.declared_level.toFixed(1)}
                    </Text>
                  </View>
                  <Ionicons name="add-circle" size={24} color="#D4AF37" />
                </Pressable>
              ))}
            </View>
          )}

          {/* Membres ajoutés */}
          {formData.memberIds.length > 0 && (
            <View style={styles.selectedMembers}>
              <Text style={styles.selectedMembersTitle}>
                Membres ajoutés ({formData.memberIds.length})
              </Text>
              {selectedMembers.map((player) => (
                <View key={player.id} style={[styles.selectedMemberItem, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
                  <Avatar
                    imageUrl={player.avatar_url}
                    firstName={player.firstname}
                    lastName={player.lastname}
                    size={48}
                  />
                  <View style={styles.playerInfo}>
                    <Text style={[styles.playerName, !isDark && { color: '#111111' }]}>
                      {player.firstname} {player.lastname}
                    </Text>
                    <Text style={[styles.playerDetails, !isDark && { color: '#555555' }]}>
                      Niv. {player.declared_level.toFixed(1)}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeMember(player.id)}>
                    <Ionicons name="close-circle" size={24} color="#FF4444" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Sélection d'icône */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choisissez une icône</Text>
          <View style={styles.iconGrid}>
            {GROUP_ICONS.map((iconName) => (
              <Pressable
                key={iconName}
                style={[
                  styles.iconButton,
                  formData.icon === iconName && styles.iconButtonSelected,
                  !isDark && formData.icon !== iconName && { backgroundColor: 'rgba(255,255,255,0.9)' },
                ]}
                onPress={() => setFormData({ ...formData, icon: iconName })}
              >
                <View style={styles.iconGlyphWrapper}>
                  <Ionicons
                    name={iconName as any}
                    size={24}
                    style={styles.iconGlyph}
                    color={formData.icon === iconName ? '#000000' : '#D4AF37'}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Bouton créer */}
        <Pressable
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <Text style={styles.createButtonText}>Créer le groupe</Text>
          )}
        </Pressable>
      </ScrollView>
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
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#D4AF37',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#D4AF37',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  iconButton: {
    width: '18%',
    aspectRatio: 1,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyphWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  iconButtonSelected: {
    backgroundColor: '#D4AF37',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  searchResults: {
    marginTop: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 8,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
  },
  playerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  playerDetails: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  selectedMembers: {
    marginTop: 16,
  },
  selectedMembersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
    marginBottom: 12,
  },
  selectedMemberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  createButton: {
    backgroundColor: '#D4AF37',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  createButtonDisabled: {
    backgroundColor: '#666666',
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
});


