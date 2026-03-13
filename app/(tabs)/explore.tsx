import { useTheme } from '@/contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

function ActionButton({ title, onPress, isDark }: { title: string; onPress: () => void; isDark: boolean }) {
  if (!isDark) {
    return (
      <View style={styles.actionCardLight}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.actionPressableLight,
            pressed && { opacity: 0.82, transform: [{ translateY: 1 }] },
          ]}
        >
          <LinearGradient
            colors={['#F8F6F0', '#DDD9CC']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.actionGradientLight}
          >
            <View style={styles.actionHighlight} />
            <Text style={styles.actionTitleLight}>{title}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.actionCard}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.actionPressable, pressed && styles.cardPressed]}
      >
        <LinearGradient
          colors={['#111214', '#0B0B0D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.actionGradient}
        >
          <View style={styles.actionShineLeft} />
          <View style={styles.actionShineRight} />
          <LinearGradient
            colors={['#17181B', '#0B0B0D']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.actionInner}
          >
            <View style={styles.actionReliefTop} />
            <View style={styles.actionReliefBottom} />
            <Text style={styles.actionTitle}>{title}</Text>
          </LinearGradient>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function ExploreScreen() {
  const { backgroundImage, theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <ImageBackground
      source={backgroundImage}
      style={styles.container}
      resizeMode="cover"
    >
      <Text style={styles.title}>Rechercher</Text>
      <Text style={[styles.subtitle, !isDark && { color: '#555555' }]}>Choisissez ce que vous voulez rechercher</Text>

      <ActionButton
        title="Rechercher une partie"
        onPress={() => router.push('/explore/matches')}
        isDark={isDark}
      />
      <ActionButton
        title="Rechercher un partenaire de tournoi"
        onPress={() => router.push('/tournament/explore')}
        isDark={isDark}
      />
      <ActionButton
        title="Rechercher un club"
        onPress={() => router.push('/explore/clubs' as any)}
        isDark={isDark}
      />
      <ActionButton
        title="Rechercher un joueur"
        onPress={() => router.push('/explore/players' as any)}
        isDark={isDark}
      />
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
  // Dark mode button
  actionCard: {
    height: 50,
    borderRadius: 30,
    marginBottom: 16,
    shadowColor: '#D4AF37',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  actionPressable: {
    flex: 1,
    borderRadius: 30,
    overflow: 'hidden',
  },
  actionGradient: {
    flex: 1,
    borderRadius: 30,
    justifyContent: 'center',
    padding: 2,
    overflow: 'hidden',
  },
  actionInner: {
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
  // Light mode button
  actionCardLight: {
    height: 50,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    marginBottom: 16,
    shadowColor: '#B8940A',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  actionPressableLight: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
  },
  actionGradientLight: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  actionHighlight: {
    position: 'absolute',
    top: 2,
    left: 14,
    right: 14,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 2,
  },
  actionTitleLight: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
  },
});
