import React, { useEffect } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootNavigator from './src/navigation/RootNavigator';
import { loadStoredThemeMode } from './src/store/themeStore';
import { useIsDarkMode, useTheme } from './src/theme';

function App() {
  const isDark = useIsDarkMode();
  const colors = useTheme();

  useEffect(() => {
    void loadStoredThemeMode();
  }, []);

  return (
    <SafeAreaProvider>
      {/* 沉浸式:RN 0.87 Android 强制 edge-to-edge,状态栏本身透明,由页面/根容器背景
          接管状态栏区域;根容器背景作兜底,状态栏区域(含挖孔)不再露出窗口默认白色。 */}
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <RootNavigator />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default App;
