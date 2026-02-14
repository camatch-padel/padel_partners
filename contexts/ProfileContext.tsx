import React, { createContext, useContext, useState } from 'react';

type ProfileContextType = {
  hasProfile: boolean | null;
  setHasProfile: (value: boolean) => void;
};

const ProfileContext = createContext<ProfileContextType>({
  hasProfile: null,
  setHasProfile: () => {},
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  return (
    <ProfileContext.Provider value={{ hasProfile, setHasProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
