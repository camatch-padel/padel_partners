import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import { supabase } from '@/constants/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { ProfileProvider, useProfile } from '@/contexts/ProfileContext';

function TabLayoutInner() {
  const { hasProfile, setHasProfile } = useProfile();
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      checkProfile();
    }, [])
  );

  const checkProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase
          .from('Profiles')
          .select('id')
          .eq('id', session.user.id)
          .single();

        const profileExists = !!data;
        setHasProfile(profileExists);

        if (!profileExists) {
          router.replace('/(tabs)/profile');
        }
      }
    } catch (error) {
      setHasProfile(false);
      router.replace('/(tabs)/profile');
    }
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: hasProfile === false
          ? { display: 'none' }
          : {
              backgroundColor: 'rgba(0,0,0,0.15)',
              borderTopWidth: 0.8,
              borderTopColor: '#D4AF37',
              height: 68,
              paddingTop: 6,
              paddingBottom: 8,
              elevation: 0,
            },
        tabBarActiveTintColor: '#D4AF37',
        tabBarInactiveTintColor: '#7F848D',
        tabBarActiveBackgroundColor: 'rgba(212, 175, 55, 0.18)',
        tabBarItemStyle: {
          borderRadius: 16,
          marginHorizontal: 6,
          marginVertical: 4,
        },
        tabBarLabelStyle: {
          fontWeight: '600',
          letterSpacing: 0.2,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
          href: hasProfile === false ? null : '/(tabs)',
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Creer',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" size={size} color={color} />
          ),
          href: hasProfile === false ? null : '/(tabs)/create',
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Chercher',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
          href: hasProfile === false ? null : '/(tabs)/explore',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <ProfileProvider>
      <TabLayoutInner />
    </ProfileProvider>
  );
}


