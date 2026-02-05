import { supabase } from '@/constants/supabase';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
        setProfile(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/auth');
  };

  if (loading) return <ActivityIndicator size="large" style={styles.loader} />;

  // Si pas de profil, rediriger vers la création de profil
  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>🏓 Bienvenue !</Text>
        <Text style={styles.subtitle}>Créez votre profil pour commencer</Text>
        <Pressable style={styles.button} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={styles.buttonText}>Créer mon profil</Text>
        </Pressable>
      </View>
    );
  }

  // Menu principal
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏓 Padel Partners</Text>
      <Text style={styles.welcome}>Bonjour, {profile.username} ! 👋</Text>
      
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>📍 Ville</Text>
        <Text style={styles.infoValue}>{profile.city}</Text>
        <Text style={styles.infoLabel}>⭐ Niveau</Text>
        <Text style={styles.infoValue}>{profile.declared_level}/10</Text>
        <Text style={styles.infoLabel}>🎾 Matchs joués</Text>
        <Text style={styles.infoValue}>{profile.match_played}</Text>
      </View>

      <View style={styles.menuContainer}>
        <Text style={styles.menuTitle}>Que voulez-vous faire ?</Text>

        <Pressable 
          style={styles.menuButton}
          onPress={() => router.push('/(tabs)/explore')}
        >
          <Text style={styles.menuIcon}>🔍</Text>
          <View style={styles.menuTextContainer}>
            <Text style={styles.menuButtonText}>Trouver des joueurs</Text>
            <Text style={styles.menuButtonSubtext}>Par proximité et niveau</Text>
          </View>
        </Pressable>

        <Pressable 
          style={styles.menuButton}
          onPress={() => {/* TODO: Ajouter une partie */}}
        >
          <Text style={styles.menuIcon}>➕</Text>
          <View style={styles.menuTextContainer}>
            <Text style={styles.menuButtonText}>Ajouter une partie</Text>
            <Text style={styles.menuButtonSubtext}>Créer un nouveau match</Text>
          </View>
        </Pressable>

        <Pressable 
          style={styles.menuButton}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <Text style={styles.menuIcon}>✏️</Text>
          <View style={styles.menuTextContainer}>
            <Text style={styles.menuButtonText}>Éditer mon profil</Text>
            <Text style={styles.menuButtonSubtext}>Modifier mes informations</Text>
          </View>
        </Pressable>

        <Pressable 
          style={[styles.menuButton, styles.logoutButton]}
          onPress={handleLogout}
        >
          <Text style={styles.menuIcon}>🚪</Text>
          <View style={styles.menuTextContainer}>
            <Text style={[styles.menuButtonText, styles.logoutText]}>Se déconnecter</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f0f8ff',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a73e8',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 10,
  },
  welcome: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#1a73e8',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  menuContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  menuButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  menuIcon: {
    fontSize: 28,
    marginRight: 15,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  menuButtonSubtext: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: '#ffe6e6',
    marginTop: 10,
  },
  logoutText: {
    color: '#d32f2f',
  },
});