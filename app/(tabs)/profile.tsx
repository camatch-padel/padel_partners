import { supabase } from '@/constants/supabase';
import type { Court } from '@/types/match';
import Avatar from '@/components/Avatar';
import LevelPyramid from '@/components/LevelPyramid';
import Logo from '@/components/Logo';
import { useProfile } from '@/contexts/ProfileContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

export default function ProfileScreen() {
  const { setHasProfile } = useProfile();
  const [profile, setProfile] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [level, setLevel] = useState(5.0);
  const [courtId, setCourtId] = useState<string | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [clubSearch, setClubSearch] = useState('');
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.log('Erreur chargement profil:', error.message);
        }

        if (data) {
          setProfile(data);
          setUsername(data.username || '');
          setFirstName(data.firstname || '');
          setLastName(data.lastname || '');
          setLevel(data.declared_level || 5.0);
          setCourtId(data.court_id || null);
          setAvatarUrl(data.avatar_url || null);
        }
      }

      // Charger les clubs
      const { data: courtsData } = await supabase
        .from('courts')
        .select('*')
        .order('city');
      if (courtsData) setCourts(courtsData);
    } catch (error: any) {
      console.log('Pas de profil existant:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      // Demander la permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'Nous avons besoin de votre permission pour accéder aux photos');
        return;
      }

      // Lancer le sélecteur d'images
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0].uri);
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    }
  };

  const uploadAvatar = async (uri: string) => {
    try {
      setUploadingImage(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Erreur', 'Vous devez être connecté');
        return;
      }

      // Lire le fichier en base64
      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });

      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${session.user.id}/${Date.now()}.${fileExt}`;

      // Supprimer l'ancienne image si elle existe
      if (avatarUrl) {
        const oldPath = avatarUrl.split('/').slice(-2).join('/');
        await supabase.storage.from('avatars').remove([oldPath]);
      }

      // Uploader la nouvelle image
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Obtenir l'URL publique
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Mettre à jour le profil avec la nouvelle URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      Alert.alert('Succès', 'Photo de profil mise à jour !');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de télécharger la photo');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCreateOrUpdate = async () => {
    if (!username || !firstName || !lastName) {
      Alert.alert('Erreur', 'Tous les champs obligatoires doivent être remplis');
      return;
    }

    const levelNum = level;

    setCreating(true);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session || !session.user) {
        Alert.alert('Erreur', 'Vous devez être connecté. Veuillez vous reconnecter.');
        await supabase.auth.signOut();
        setCreating(false);
        return;
      }

      if (profile) {
        // Mise à jour
        const { error } = await supabase
          .from('profiles')
          .update({
            username,
            firstname: firstName,
            lastname: lastName,
            declared_level: levelNum,
            court_id: courtId,
          })
          .eq('id', session.user.id);

        if (error) {
          Alert.alert('Erreur', error.message);
        } else {
          await loadProfile();
          Alert.alert('Succès', 'Profil mis à jour !', [
            { text: 'OK', onPress: () => router.replace('/(tabs)') }
          ]);
        }
      } else {
        // Création
        const { error } = await supabase.from('profiles').insert({
          id: session.user.id,
          username,
          firstname: firstName,
          lastname: lastName,
          declared_level: levelNum,
          community_level: levelNum,
          community_level_votes: 0,
          match_played: 0,
          court_id: courtId,
        });

        if (error) {
          Alert.alert('Erreur', error.message);
        } else {
          await loadProfile();
          setHasProfile(true);
          Alert.alert('Succès', 'Profil créé avec succès !', [
            { text: 'OK', onPress: () => router.replace('/(tabs)') }
          ]);
        }
      }
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/auth');
    } catch (error) {
      console.error('Erreur déconnexion:', error);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Supprimer mon compte',
      'Cette action est irréversible. Toutes vos données (profil, matchs, groupes, tournois) seront définitivement supprimées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmer la suppression',
              'Êtes-vous vraiment sûr ? Cette action ne peut pas être annulée.',
              [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Oui, supprimer définitivement',
                  style: 'destructive',
                  onPress: deleteAccount,
                },
              ]
            );
          },
        },
      ]
    );
  };

  const deleteAccount = async () => {
    try {
      setCreating(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const userId = session.user.id;

      // Supprimer l'avatar du storage
      if (avatarUrl) {
        const oldPath = avatarUrl.split('/').slice(-2).join('/');
        await supabase.storage.from('avatars').remove([oldPath]);
      }

      // Supprimer le profil (les données liées seront supprimées par CASCADE ou RLS)
      await supabase.from('profiles').delete().eq('id', userId);

      // Supprimer le compte auth via edge function ou RPC
      await supabase.rpc('delete_own_account');

      await supabase.auth.signOut();
      router.replace('/auth');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de supprimer le compte');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  return (
    <ImageBackground
      source={require('@/assets/images/piste-noire.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
        {/* Titre ou Logo */}
        {profile ? (
          <Text style={styles.title}>Mon Profil</Text>
        ) : (
          <View style={styles.logoContainer}>
            <Logo size="medium" showText={true} />
          </View>
        )}

        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <Avatar
            imageUrl={avatarUrl}
            firstName={firstName}
            lastName={lastName}
            size={120}
          />
          <Pressable
            style={styles.changePhotoButton}
            onPress={pickImage}
            disabled={uploadingImage}
          >
            {uploadingImage ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Text style={styles.changePhotoText}>
                {avatarUrl ? 'Changer la photo' : 'Ajouter une photo'}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Prénom *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Jean"
            placeholderTextColor="#666666"
            value={firstName}
            onChangeText={setFirstName}
          />

          <Text style={styles.label}>Nom *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Dupont"
            placeholderTextColor="#666666"
            value={lastName}
            onChangeText={setLastName}
          />

          <Text style={styles.label}>Pseudo *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Padel Pro"
            placeholderTextColor="#666666"
            value={username}
            onChangeText={setUsername}
          />

          <Text style={styles.label}>Club (optionnel)</Text>
          {courtId ? (
            <View style={styles.selectedClub}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedClubName}>
                  {courts.find(c => c.id === courtId)?.name || 'Club sélectionné'}
                </Text>
                <Text style={styles.selectedClubCity}>
                  {courts.find(c => c.id === courtId)?.city || ''}
                </Text>
              </View>
              <Pressable onPress={() => setShowClubPicker(!showClubPicker)}>
                <Ionicons name="swap-horizontal" size={20} color="#D4AF37" />
              </Pressable>
              <Pressable onPress={() => { setCourtId(null); setShowClubPicker(false); }}>
                <Ionicons name="close-circle" size={20} color="#FF4444" />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.clubPickerToggle}
              onPress={() => setShowClubPicker(!showClubPicker)}
            >
              <Ionicons name="business-outline" size={20} color="#D4AF37" />
              <Text style={styles.clubPickerToggleText}>
                {showClubPicker ? 'Masquer la liste' : 'Choisir un club'}
              </Text>
            </Pressable>
          )}

          {showClubPicker && (() => {
            const searchLower = clubSearch.toLowerCase();
            const filteredCourts = clubSearch.trim()
              ? courts.filter(c =>
                  c.name.toLowerCase().includes(searchLower) ||
                  c.city.toLowerCase().includes(searchLower)
                )
              : courts;

            return (
              <View style={styles.clubPickerContainer}>
                <View style={styles.clubSearchContainer}>
                  <Ionicons name="search" size={20} color="#D4AF37" />
                  <TextInput
                    style={styles.clubSearchInput}
                    placeholder="Rechercher par nom ou ville..."
                    placeholderTextColor="#666666"
                    value={clubSearch}
                    onChangeText={setClubSearch}
                    autoCapitalize="none"
                  />
                  {clubSearch.length > 0 && (
                    <Pressable onPress={() => setClubSearch('')}>
                      <Ionicons name="close-circle" size={20} color="#666666" />
                    </Pressable>
                  )}
                </View>

                <View style={styles.clubList}>
                  {filteredCourts.slice(0, 20).map((court) => (
                    <Pressable
                      key={court.id}
                      style={[
                        styles.clubItem,
                        courtId === court.id && styles.clubItemSelected
                      ]}
                      onPress={() => {
                        setCourtId(court.id);
                        setShowClubPicker(false);
                        setClubSearch('');
                      }}
                    >
                      <Text style={[
                        styles.clubItemName,
                        courtId === court.id && styles.clubItemTextSelected
                      ]}>
                        {court.name}
                      </Text>
                      <Text style={[
                        styles.clubItemCity,
                        courtId === court.id && styles.clubItemTextSelected
                      ]}>
                        {court.city}
                      </Text>
                    </Pressable>
                  ))}

                  {filteredCourts.length > 20 && (
                    <Text style={styles.clubMoreText}>
                      +{filteredCourts.length - 20} clubs — affinez votre recherche
                    </Text>
                  )}

                  {filteredCourts.length === 0 && clubSearch.trim() && (
                    <Text style={styles.clubMoreText}>
                      Aucun club trouvé pour "{clubSearch}"
                    </Text>
                  )}
                </View>
              </View>
            );
          })()}

          <Text style={styles.label}>Niveau (1 à 10) *</Text>
          <LevelPyramid value={level} onChange={setLevel} />

          <Pressable
            style={[styles.saveButton, creating && styles.saveButtonDisabled]}
            onPress={handleCreateOrUpdate}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Text style={styles.saveButtonText}>
                {profile ? 'Mettre à jour' : 'Créer mon profil'}
              </Text>
            )}
          </Pressable>

          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
            <Text style={styles.logoutButtonText}>Se déconnecter</Text>
          </Pressable>

          <Pressable style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={20} color="#FF4444" style={{ marginRight: 8 }} />
            <Text style={styles.deleteAccountButtonText}>Supprimer mon compte</Text>
          </Pressable>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentContainer: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 100,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#D4AF37',
    textAlign: 'center',
    marginBottom: 30,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
    gap: 12,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  changePhotoButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#D4AF37',
    borderRadius: 20,
    minWidth: 150,
    alignItems: 'center',
  },
  changePhotoText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#AAAAAA',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    fontSize: 16,
    backgroundColor: '#1A1A1A',
    color: '#FFFFFF',
  },
  saveButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#D4AF37',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  saveButtonDisabled: {
    backgroundColor: '#666666',
  },
  saveButtonText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    width: '100%',
    height: 50,
    backgroundColor: 'transparent',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  logoutButtonText: {
    color: '#D4AF37',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedClub: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  selectedClubName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  selectedClubCity: {
    fontSize: 14,
    color: '#AAAAAA',
    marginTop: 2,
  },
  clubPickerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  clubPickerToggleText: {
    fontSize: 16,
    color: '#D4AF37',
  },
  clubPickerContainer: {
    marginBottom: 20,
  },
  clubSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    marginBottom: 12,
  },
  clubSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  clubList: {
    maxHeight: 250,
  },
  clubItem: {
    padding: 14,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  clubItemSelected: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  clubItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  clubItemCity: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  clubItemTextSelected: {
    color: '#000000',
  },
  clubMoreText: {
    fontSize: 14,
    color: '#AAAAAA',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    width: '100%',
    height: 50,
    backgroundColor: 'transparent',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderWidth: 0.8,
    borderColor: '#FF4444',
  },
  deleteAccountButtonText: {
    color: '#FF4444',
    fontSize: 16,
    fontWeight: '600',
  },
});

