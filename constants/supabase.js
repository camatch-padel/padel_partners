import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = 'https://yhwkbhkisdtjkymmbgij.supabase.co';
const supabaseAnonKey = 'sb_publishable_zm7OFzlJZOz5iMCepaBUug_lXOZ9W_p';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
