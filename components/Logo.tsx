import { Image, StyleSheet, View } from 'react-native';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
}

export default function Logo({ size = 'medium' }: LogoProps) {
  const dimensions = {
    small: 120,
    medium: 160,
    large: 240,
  };

  const dim = dimensions[size];

  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/images/logo2.png')}
        style={{ width: dim, height: dim }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
});
