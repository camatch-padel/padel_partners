import { supabase } from '@/constants/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useRef } from 'react';
import 'react-native-reanimated';
import type { Session } from '@supabase/supabase-js';
import {
  addNotificationResponseReceivedListener,
  type NotificationResponse,
} from 'expo-notifications';
import type { EventSubscription } from 'expo-modules-core';
import {
  registerForPushNotificationsAsync,
  savePushToken,
  setupAndroidChannel,
} from '@/services/pushNotifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  const notificationResponseListener = useRef<EventSubscription>(null);

  useEffect(() => {
    // Récupère la session au démarrage
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Écoute les changements d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Canal Android
    setupAndroidChannel();

    // Écouter les taps sur les notifications push
    notificationResponseListener.current = addNotificationResponseReceivedListener((response: NotificationResponse) => {
      const data = response.notification.request.content.data;
      if (data?.url) {
        router.push(data.url as any);
      }
    });

    return () => {
      subscription?.unsubscribe();
      notificationResponseListener.current?.remove();
    };
  }, []);

  // Gère la navigation automatique basée sur l'état d'authentification
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!session && !inAuthGroup) {
      // Pas de session et pas sur la page auth → rediriger vers auth
      router.replace('/auth');
    } else if (session && inAuthGroup) {
      // Session active et sur la page auth → rediriger vers les tabs
      router.replace('/(tabs)');
    }
  }, [session, segments, loading]);

  // Enregistrer le push token quand l'utilisateur est connecté
  useEffect(() => {
    if (!session?.user) return;

    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        savePushToken(token);
      }
    });
  }, [session?.user?.id]);

  if (loading) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
        <Stack.Screen
          name="create-match"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="edit-match/[id]"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}