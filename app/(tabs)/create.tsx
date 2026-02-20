import { useTheme } from '@/contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

export default function CreateScreen() {
  const { backgroundImage } = useTheme();
  return (
    <ImageBackground
      source={backgroundImage}
      style={styles.container}
      resizeMode="cover"
    >
      <Text style={styles.title}>Créer</Text>
      <Text style={styles.subtitle}>Choisissez ce que vous voulez creer</Text>

      <Pressable
        style={({ pressed }) => [styles.actionCard, pressed && styles.cardPressed]}
        onPress={() => router.push('/create-match')}
      >
        <LinearGradient
          colors={['#111214', '#0B0B0D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.actionCardGradient}
        >
          <View style={styles.actionShineLeft} />
          <View style={styles.actionShineRight} />
          <LinearGradient
            colors={['#17181B', '#0B0B0D']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.actionCardInner}
          >
            <View style={styles.actionReliefTop} />
            <View style={styles.actionReliefBottom} />
            <Text style={styles.actionTitle}>Creer une nouvelle partie</Text>
          </LinearGradient>
        </LinearGradient>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.actionCard, pressed && styles.cardPressed]}
        onPress={() => router.push('/create-tournament')}
      >
        <LinearGradient
          colors={['#111214', '#0B0B0D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.actionCardGradient}
        >
          <View style={styles.actionShineLeft} />
          <View style={styles.actionShineRight} />
          <LinearGradient
            colors={['#17181B', '#0B0B0D']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.actionCardInner}
          >
            <View style={styles.actionReliefTop} />
            <View style={styles.actionReliefBottom} />
            <Text style={styles.actionTitle}>Creer une nouvelle recherche de partenaire</Text>
          </LinearGradient>
        </LinearGradient>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.actionCard, pressed && styles.cardPressed]}
        onPress={() => router.push('/create-group')}
      >
        <LinearGradient
          colors={['#111214', '#0B0B0D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.actionCardGradient}
        >
          <View style={styles.actionShineLeft} />
          <View style={styles.actionShineRight} />
          <LinearGradient
            colors={['#17181B', '#0B0B0D']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.actionCardInner}
          >
            <View style={styles.actionReliefTop} />
            <View style={styles.actionReliefBottom} />
            <Text style={styles.actionTitle}>Créer un groupe privé</Text>
          </LinearGradient>
        </LinearGradient>
      </Pressable>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingTop: 70,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#D4AF37',
  },
  subtitle: {
    fontSize: 15,
    color: '#B0B0B0',
    marginTop: 8,
    marginBottom: 26,
  },
  actionCard: {
    height: 62,
    borderRadius: 30,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#D4AF37',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  actionCardGradient: {
    flex: 1,
    borderRadius: 30,
    justifyContent: 'center',
    padding: 2,
    overflow: 'hidden',
  },
  actionCardInner: {
    flex: 1,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
    overflow: 'hidden',
  },
  actionReliefTop: {
    position: 'absolute',
    top: 1,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  actionReliefBottom: {
    position: 'absolute',
    bottom: 1,
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  actionShineLeft: {
    position: 'absolute',
    top: 7,
    left: 16,
    width: 26,
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.23)',
  },
  actionShineRight: {
    position: 'absolute',
    bottom: 7,
    right: 16,
    width: 20,
    height: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.16)',
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  cardPressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.97,
  },
});


