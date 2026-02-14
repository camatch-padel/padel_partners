import Slider from '@react-native-community/slider';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState, useEffect } from 'react';

const { width } = Dimensions.get('window');
const TRIANGLE_HEIGHT = 320;

interface LevelPyramidProps {
  value: number;
  onChange: (value: number) => void;
}

export default function LevelPyramid({ value, onChange }: LevelPyramidProps) {
  // État local pour l'affichage fluide (sans re-render du parent)
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const cursorPosition = ((localValue - 1) / 9) * TRIANGLE_HEIGHT;

  return (
    <View>
      <View style={styles.triangleContainer}>
        {/* Échelle de niveaux à gauche */}
        <View style={styles.scale}>
          {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((level) => (
            <Text key={level} style={[
              styles.scaleText,
              Math.round(localValue) === level && styles.scaleTextActive
            ]}>{level}</Text>
          ))}
        </View>

        {/* Triangle vertical + curseur */}
        <View style={styles.triangleWrapper}>
          <View style={styles.triangleOuter}>
            {Array.from({ length: 20 }).map((_, i) => {
              const ratio = i / 19;
              const barWidth = 20 + (1 - ratio) * (width - 180);
              const level = 10 - (ratio * 9);
              const isAboveMin = level >= localValue;
              return (
                <Pressable
                  key={i}
                  style={[
                    styles.bar,
                    {
                      width: barWidth,
                      backgroundColor: isAboveMin ? '#D4AF37' : '#333333',
                    }
                  ]}
                  onPress={() => {
                    const newLevel = Math.max(1, Math.round(level * 2) / 2);
                    setLocalValue(newLevel);
                    onChange(newLevel);
                  }}
                />
              );
            })}
          </View>

          {/* Curseur */}
          <View style={[styles.cursor, { bottom: cursorPosition - 16 }]}>
            <View style={styles.cursorDot} />
            <View style={styles.cursorLabel}>
              <Text style={styles.cursorText}>{localValue.toFixed(1)}</Text>
            </View>
          </View>
        </View>

        {/* Labels à droite */}
        <View style={styles.labels}>
          <Text style={styles.labelTop}>Expert</Text>
          <Text style={styles.labelBottom}>Débutant</Text>
        </View>
      </View>

      {/* Slider horizontal */}
      <View style={styles.sliderContainer}>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={10}
          step={0.5}
          value={localValue}
          onValueChange={(v) => setLocalValue(Math.round(v * 10) / 10)}
          onSlidingComplete={(v) => onChange(Math.round(v * 10) / 10)}
          minimumTrackTintColor="#D4AF37"
          maximumTrackTintColor="#666666"
          thumbTintColor="#D4AF37"
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>1</Text>
          <Text style={styles.sliderLabel}>10</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  triangleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  scale: {
    justifyContent: 'space-between',
    height: TRIANGLE_HEIGHT,
    width: 24,
  },
  scaleText: {
    fontSize: 13,
    color: '#666666',
    fontWeight: '600',
    textAlign: 'center',
  },
  scaleTextActive: {
    color: '#D4AF37',
    fontSize: 15,
    fontWeight: '700',
  },
  triangleWrapper: {
    flex: 1,
    position: 'relative' as const,
    height: TRIANGLE_HEIGHT,
    justifyContent: 'center',
  },
  triangleOuter: {
    alignItems: 'center',
    justifyContent: 'space-between',
    height: TRIANGLE_HEIGHT,
  },
  bar: {
    height: 12,
    borderRadius: 6,
    marginVertical: 2,
  },
  cursor: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  cursorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#D4AF37',
  },
  cursorLabel: {
    backgroundColor: '#D4AF37',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
  },
  cursorText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  labels: {
    justifyContent: 'space-between',
    height: TRIANGLE_HEIGHT,
    width: 60,
  },
  labelTop: {
    fontSize: 12,
    color: '#D4AF37',
    fontWeight: '600',
  },
  labelBottom: {
    fontSize: 12,
    color: '#AAAAAA',
    fontWeight: '600',
  },
  sliderContainer: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
    marginTop: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 16,
  },
  sliderLabel: {
    fontSize: 14,
    color: '#AAAAAA',
  },
});


