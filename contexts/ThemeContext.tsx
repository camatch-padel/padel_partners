import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageSourcePropType } from 'react-native';

type Theme = 'dark' | 'light';

type ThemeContextType = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  backgroundImage: ImageSourcePropType;
};

const DARK_BG = require('@/assets/images/piste-noire.png');
const LIGHT_BG = require('@/assets/images/piste-blanche.png');

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  backgroundImage: DARK_BG,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    AsyncStorage.getItem('@theme').then((stored) => {
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
      }
    });
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    AsyncStorage.setItem('@theme', t);
  };

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      backgroundImage: theme === 'dark' ? DARK_BG : LIGHT_BG,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
