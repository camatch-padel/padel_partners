import { supabase } from '@/constants/supabase';
import { router } from 'expo-router'; // <-- Ajoutez cette ligne
import { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [city, setCity] = useState('');
  const [level, setLevel] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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
          setUsername(data.username);
          setCity(data.city);
          setLevel(data.declared_level.toString());
        }
      }
    } catch (error) {
      console.log('Pas de profil existant');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrUpdate = async () => {
    if (!username || !city || !level) {
      Alert.alert('Erreur', 'Tous les champs sont obligatoires');
      return;
    }

    const levelNum = parseInt(level);
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
          city,
          declared_level: levelNum,
          community_level: parseFloat(level),
          community_level_votes: 0,
          match_played: 0,
        });

        if (error) {
          Alert.alert('Erreur', error.message);
        } else {
          Alert.alert('Succès', 'Profil créé !');
          await loadProfile();
          router.replace('/(tabs)');  // <-- Redirection vers l'accueil
        }
      }
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Chargement...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>👤 {profile ? 'Mon Profil' : 'Créer mon profil'}</Text>

      <Text style={styles.label}>Pseudo</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Padel Pro"
        value={username}
        onChangeText={setUsername}
      />

      <Text style={styles.label}>Ville</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Paris"
        value={city}
        onChangeText={setCity}
      />

      <Text style={styles.label}>Niveau (1 à 10)</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: 5"
        value={level}
        onChangeText={setLevel}
        keyboardType="numeric"
      />

      <Button
        title={creating ? "..." : profile ? "Mettre à jour" : "Créer mon profil"}
        onPress={handleCreateOrUpdate}
        disabled={creating}
      />

      <View style={{ marginTop: 20 }}>
        <Button title="Se déconnecter" onPress={handleLogout} color="#ff4444" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 30,
    backgroundColor: '#f0f8ff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a73e8',
    textAlign: 'center',
    marginBottom: 30,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 15,
    marginBottom: 20,
    fontSize: 16,
    backgroundColor: '#fff',
  },
});