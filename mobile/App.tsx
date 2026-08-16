import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootNavigator from './src/navigation/RootNavigator';
import { loadStoredThemeMode } from './src/store/themeStore';
import { useIsDarkMode } from './src/theme';

function App() {
  const isDark = useIsDarkMode();

  useEffect(() => {
    void loadStoredThemeMode();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default App;
