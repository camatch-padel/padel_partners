import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/constants/supabase';

// Configuration du comportement des notifications reçues en foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Créer le canal Android (obligatoire pour Android 8+)
export async function setupAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D4AF37',
    });
  }
}

// Enregistrer le device pour les push notifications et retourner le token
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Les push ne marchent que sur un vrai device
  if (!Device.isDevice) {
    console.log('Push notifications nécessitent un appareil physique');
    return null;
  }

  // Vérifier/demander la permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Permission push notifications refusée');
    return null;
  }

  // Récupérer le push token Expo
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.error('projectId EAS manquant dans app.json');
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

// Sauvegarder le push token dans le profil Supabase
export async function savePushToken(token: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', session.user.id);
}

// Mettre à jour le badge de l'app
export async function updateBadgeCount(count: number) {
  await Notifications.setBadgeCountAsync(count);
}
