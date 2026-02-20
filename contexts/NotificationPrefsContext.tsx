import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NotificationType } from '@/types/notification';

type NotificationPrefs = Record<NotificationType, boolean>;

const ALL_TYPES: NotificationType[] = [
  'match_full',
  'match_player_joined',
  'tournament_demand_new',
  'tournament_demand_accepted',
  'tournament_demand_rejected',
  'group_match_new',
  'nearby_match_new',
  'group_tournament_new',
];

const DEFAULT_PREFS: NotificationPrefs = Object.fromEntries(
  ALL_TYPES.map((t) => [t, true])
) as NotificationPrefs;

type NotificationPrefsContextType = {
  prefs: NotificationPrefs;
  setPref: (type: NotificationType, value: boolean) => void;
  setAllPrefs: (value: boolean) => void;
  isEnabled: (type: NotificationType) => boolean;
  allEnabled: boolean;
};

const NotificationPrefsContext = createContext<NotificationPrefsContextType>({
  prefs: DEFAULT_PREFS,
  setPref: () => {},
  setAllPrefs: () => {},
  isEnabled: () => true,
  allEnabled: true,
});

export function NotificationPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    AsyncStorage.getItem('@notif_prefs').then((stored) => {
      if (stored) {
        try {
          setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(stored) });
        } catch {}
      }
    });
  }, []);

  const savePrefs = (updated: NotificationPrefs) => {
    setPrefs(updated);
    AsyncStorage.setItem('@notif_prefs', JSON.stringify(updated));
  };

  const setPref = (type: NotificationType, value: boolean) => {
    savePrefs({ ...prefs, [type]: value });
  };

  const setAllPrefs = (value: boolean) => {
    savePrefs(Object.fromEntries(ALL_TYPES.map((t) => [t, value])) as NotificationPrefs);
  };

  const allEnabled = ALL_TYPES.every((t) => prefs[t]);

  return (
    <NotificationPrefsContext.Provider value={{
      prefs,
      setPref,
      setAllPrefs,
      isEnabled: (type) => prefs[type] ?? true,
      allEnabled,
    }}>
      {children}
    </NotificationPrefsContext.Provider>
  );
}

export function useNotificationPrefs() {
  return useContext(NotificationPrefsContext);
}
