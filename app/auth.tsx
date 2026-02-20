import { supabase } from '@/constants/supabase';
import Logo from '@/components/Logo';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

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
      Alert.alert('Succes', 'Compte cree ! Verifiez vos emails.');
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

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Email requis', 'Veuillez saisir votre adresse email avant de reinitialiser votre mot de passe.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) {
      Alert.alert('Erreur', error.message);
    } else {
      Alert.alert(
        'Email envoye',
        'Si un compte existe avec cette adresse, vous recevrez un email pour reinitialiser votre mot de passe.'
      );
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoWrapper}>
          <Logo size="large" showText={true} />
        </View>

        <View style={styles.loginForm}>
          <Text style={styles.formTitle}>{isSignUp ? 'Creer un compte' : 'Connexion'}</Text>

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
              placeholder="��������"
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.btnLogin, pressed && styles.btnLoginPressed]}
            onPress={isSignUp ? handleSignUp : handleSignIn}
            disabled={loading}
          >
            <Text style={styles.btnLoginText}>{loading ? '...' : isSignUp ? "S'inscrire" : 'Se connecter'}</Text>
          </Pressable>

          {isSignUp && (
            <View style={styles.legalNotice}>
              <Text style={styles.legalNoticeText}>
                En créant un compte, vous acceptez notre{' '}
                <Text
                  style={styles.legalNoticeLink}
                  onPress={() => Linking.openURL('https://camatch-padel.github.io/privacy-policy.html')}
                >
                  Politique de confidentialité
                </Text>
                .{'\n'}Votre nom, prénom, club et niveau seront visibles publiquement dans l'application.
              </Text>
            </View>
          )}

          {!isSignUp && (
            <Pressable style={styles.forgotPassword} onPress={handleForgotPassword}>
              <Text style={styles.forgotPasswordText}>Mot de passe oublie ?</Text>
            </Pressable>
          )}

          <View style={styles.signupLink}>
            <Text style={styles.signupLinkText}>{isSignUp ? 'Deja un compte ? ' : 'Pas encore de compte ? '}</Text>
            <Pressable onPress={() => setIsSignUp(!isSignUp)}>
              <Text style={styles.signupLinkButton}>{isSignUp ? 'Se connecter' : "S'inscrire"}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 28,
  },
  logoWrapper: {
    marginBottom: 12,
  },
  loginForm: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 32,
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
  legalNotice: {
    marginTop: 16,
  },
  legalNoticeText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  legalNoticeLink: {
    color: 'rgba(255, 255, 255, 0.8)',
    textDecorationLine: 'underline',
  },
});
