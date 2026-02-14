import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

// Environment variables from .env.development or .env.production
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Fallback to staging values if env vars are not set (for local development)
const finalUrl = supabaseUrl || 'https://yhwkbhkisdtjkymmbgij.supabase.co';
const finalKey = supabaseAnonKey || 'sb_publishable_zm7OFzlJZOz5iMCepaBUug_lXOZ9W_p';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase environment variables not found, using fallback values');
}

// Fallback storage pour le SSR (Node.js n'a pas window)
const memoryStorage = {
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
};

const isServer = typeof window === 'undefined';

export const supabase = createClient(finalUrl, finalKey, {
  auth: {
    storage: isServer ? memoryStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});
