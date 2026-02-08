import { supabase } from '@/constants/supabase';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSignUp = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      Alert.alert('Erreur', error.message);
    } else {
      Alert.alert('Succès', 'Compte créé ! Vérifiez vos emails.');
      setIsSignUp(false);
    }
    setLoading(false);
  };

  const handleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      Alert.alert('Erreur', error.message);
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      {/* Logo */}
      <View style={styles.logoWrapper}>
        <View style={styles.logo}>
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
      </View>

      {/* Formulaire */}
      <View style={styles.loginForm}>
        <Text style={styles.formTitle}>
          {isSignUp ? 'Créer un compte' : 'Connexion'}
        </Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="exemple@email.com"
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Mot de passe</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.btnLogin,
            pressed && styles.btnLoginPressed
          ]}
          onPress={isSignUp ? handleSignUp : handleSignIn}
          disabled={loading}
        >
          <Text style={styles.btnLoginText}>
            {loading ? '...' : isSignUp ? "S'inscrire" : 'Se connecter'}
          </Text>
        </Pressable>

        {!isSignUp && (
          <Pressable style={styles.forgotPassword}>
            <Text style={styles.forgotPasswordText}>Mot de passe oublié ?</Text>
          </Pressable>
        )}

        <View style={styles.signupLink}>
          <Text style={styles.signupLinkText}>
            {isSignUp ? 'Déjà un compte ? ' : 'Pas encore de compte ? '}
          </Text>
          <Pressable onPress={() => setIsSignUp(!isSignUp)}>
            <Text style={styles.signupLinkButton}>
              {isSignUp ? 'Se connecter' : "S'inscrire"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  logoWrapper: {
    marginBottom: 50,
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '800',
    color: 'white',
    letterSpacing: -0.5,
  },
  logoPadel: {
    color: '#0066FF',
  },
  loginForm: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  formTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 30,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    width: '100%',
    padding: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    color: 'white',
    fontSize: 16,
  },
  btnLogin: {
    width: '100%',
    padding: 14,
    backgroundColor: '#0066FF',
    borderRadius: 10,
    marginTop: 10,
  },
  btnLoginPressed: {
    backgroundColor: '#0052cc',
    transform: [{ translateY: -1 }],
  },
  btnLoginText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  forgotPassword: {
    marginTop: 20,
    alignItems: 'center',
  },
  forgotPasswordText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  signupLink: {
    marginTop: 30,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupLinkText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  signupLinkButton: {
    color: '#0066FF',
    fontSize: 14,
    fontWeight: '600',
  },
});