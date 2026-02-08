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

export const supabase = createClient(finalUrl, finalKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
