import React, { createContext, useContext } from 'react';
import { ImageSourcePropType } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DARK_BG = require('@/assets/images/piste-noire.png');
// const LIGHT_BG = require('@/assets/images/piste-blanche.png'); // mode clair désactivé

type Theme = 'dark' | 'light';

type ThemeContextType = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  backgroundImage: ImageSourcePropType;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  backgroundImage: DARK_BG,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Mode sombre forcé — le choix de thème est désactivé pour le moment
  // Pour réactiver : restaurer useState + AsyncStorage + setTheme ci-dessous
  /*
  const [theme, setThemeState] = useState<Theme>('dark');
  useEffect(() => {
    AsyncStorage.getItem('@theme').then((stored) => {
      if (stored === 'light' || stored === 'dark') setThemeState(stored);
    });
  }, []);
  const setTheme = (t: Theme) => {
    setThemeState(t);
    AsyncStorage.setItem('@theme', t);
  };
  */

  return (
    <ThemeContext.Provider value={{
      theme: 'dark',
      setTheme: () => {},
      backgroundImage: DARK_BG,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
