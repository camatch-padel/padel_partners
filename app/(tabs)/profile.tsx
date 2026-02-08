import { supabase } from '@/constants/supabase';
import Avatar from '@/components/Avatar';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [city, setCity] = useState('');
  const [level, setLevel] = useState('');
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
        const { data } = await supabase
          .from('Profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (data) {
          setProfile(data);
          setUsername(data.username || '');
          setFirstName(data.firstname || '');
          setLastName(data.lastname || '');
          setCity(data.city || '');
          setLevel(data.declared_level?.toString() || '');
          setAvatarUrl(data.avatar_url || null);
        }
      }
    } catch (error) {
      console.log('Pas de profil existant');
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
        .from('Profiles')
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
    if (!username || !firstName || !lastName || !city || !level) {
      Alert.alert('Erreur', 'Tous les champs sont obligatoires');
      return;
    }

    const levelNum = parseFloat(level);
    if (isNaN(levelNum) || levelNum < 1 || levelNum > 10) {
      Alert.alert('Erreur', 'Le niveau doit être entre 1 et 10');
      return;
    }

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
          .from('Profiles')
          .update({
            username,
            firstname: firstName,
            lastname: lastName,
            city,
            declared_level: levelNum,
          })
          .eq('id', session.user.id);

        if (error) {
          Alert.alert('Erreur', error.message);
        } else {
          Alert.alert('Succès', 'Profil mis à jour !');
          await loadProfile();
        }
      } else {
        // Création
        const { error } = await supabase.from('Profiles').insert({
          id: session.user.id,
          username,
          firstname: firstName,
          lastname: lastName,
          city,
          declared_level: levelNum,
          community_level: levelNum,
          community_level_votes: 0,
          match_played: 0,
        });

        if (error) {
          Alert.alert('Erreur', error.message);
        } else {
          // Rediriger directement vers l'accueil après création
          await loadProfile();
          router.replace('/(tabs)');
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
    router.replace('/auth');  // <-- Ajoutez cette ligne
  } catch (error) {
    console.error('Erreur déconnexion:', error);
  }
};

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0066FF" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Titre ou Logo */}
      {profile ? (
        <Text style={styles.title}>Mon Profil</Text>
      ) : (
        <View style={styles.logoContainer}>
          <Svg width="45" height="60" viewBox="0 0 45 60" fill="none">
            <Path
              d="M22.5 0C10.08 0 0 10.08 0 22.5C0 35.625 22.5 60 22.5 60C22.5 60 45 35.625 45 22.5C45 10.08 34.92 0 22.5 0Z"
              fill="#0066FF"
            />
            <Circle cx="22.5" cy="22.5" r="10" fill="white"/>
            <Circle cx="22.5" cy="22.5" r="6" fill="#00D9C0"/>
          </Svg>
          <Text style={styles.logoText}>Linkerra</Text>
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
            <ActivityIndicator size="small" color="white" />
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
          placeholderTextColor="#999"
          value={firstName}
          onChangeText={setFirstName}
        />

        <Text style={styles.label}>Nom *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Dupont"
          placeholderTextColor="#999"
          value={lastName}
          onChangeText={setLastName}
        />

        <Text style={styles.label}>Pseudo *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Padel Pro"
          placeholderTextColor="#999"
          value={username}
          onChangeText={setUsername}
        />

        <Text style={styles.label}>Ville *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Paris"
          placeholderTextColor="#999"
          value={city}
          onChangeText={setCity}
        />

        <Text style={styles.label}>Niveau (1 à 10) *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 5"
          placeholderTextColor="#999"
          value={level}
          onChangeText={setLevel}
          keyboardType="decimal-pad"
        />

        <Pressable
          style={[styles.saveButton, creating && styles.saveButtonDisabled]}
          onPress={handleCreateOrUpdate}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.saveButtonText}>
              {profile ? 'Mettre à jour' : 'Créer mon profil'}
            </Text>
          )}
        </Pressable>

        {profile && (
          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Se déconnecter</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
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
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
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
    color: 'white',
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
    backgroundColor: '#0066FF',
    borderRadius: 20,
    minWidth: 150,
    alignItems: 'center',
  },
  changePhotoText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    fontSize: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: 'white',
  },
  saveButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#0066FF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  logoutButton: {
    width: '100%',
    height: 50,
    backgroundColor: 'transparent',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    borderWidth: 2,
    borderColor: '#FF4444',
  },
  logoutButtonText: {
    color: '#FF4444',
    fontSize: 16,
    fontWeight: '600',
  },
});