import { supabase } from '@/constants/supabase';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

export default function ExploreScreen() {
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchCity, setSearchCity] = useState('');
  const [minLevel, setMinLevel] = useState('');
  const [maxLevel, setMaxLevel] = useState('');

  useEffect(() => {
    loadPlayers();
  }, [searchCity, minLevel, maxLevel]);

  const loadPlayers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      let query = supabase
        .from('Profiles')
        .select('*')
        .neq('id', session?.user?.id || ''); // Exclure l'utilisateur actuel

      if (searchCity) {
        query = query.ilike('city', `%${searchCity}%`);
      }

      if (minLevel) {
        query = query.gte('declared_level', parseInt(minLevel));
      }

      if (maxLevel) {
        query = query.lte('declared_level', parseInt(maxLevel));
      }

      const { data, error } = await query.order('declared_level', { ascending: false });

      if (error) {
        console.error('Erreur:', error);
      } else {
        setPlayers(data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderPlayer = ({ item }: { item: any }) => (
    <View style={styles.playerCard}>
      <View style={styles.playerHeader}>
        <Text style={styles.playerName}>{item.username}</Text>
        <Text style={styles.playerLevel}>⭐ {item.declared_level}/10</Text>
      </View>
      <Text style={styles.playerCity}>📍 {item.city}</Text>
      <Text style={styles.playerMatches}>🎾 {item.match_played} matchs joués</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔍 Trouver des joueurs</Text>

      <View style={styles.filtersContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ville"
          value={searchCity}
          onChangeText={setSearchCity}
        />
        
        <View style={styles.levelContainer}>
          <TextInput
            style={[styles.input, styles.levelInput]}
            placeholder="Niveau min"
            value={minLevel}
            onChangeText={setMinLevel}
            keyboardType="numeric"
          />
          <Text style={styles.levelSeparator}>-</Text>
          <TextInput
            style={[styles.input, styles.levelInput]}
            placeholder="Niveau max"
            value={maxLevel}
            onChangeText={setMaxLevel}
            keyboardType="numeric"
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a73e8" />
      ) : (
        <FlatList
          data={players}
          renderItem={renderPlayer}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Aucun joueur trouvé</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f0f8ff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a73e8',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  filtersContainer: {
    marginBottom: 20,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 15,
    marginBottom: 10,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  levelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  levelInput: {
    flex: 1,
  },
  levelSeparator: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
  },
  playerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  playerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  playerLevel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a73e8',
  },
  playerCity: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  playerMatches: {
    fontSize: 14,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#999',
    marginTop: 40,
  },
});