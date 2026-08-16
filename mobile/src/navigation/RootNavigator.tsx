import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import GradientView from '../components/GradientView';
import LoadingView from '../components/LoadingView';
import UpdateModal from '../components/UpdateModal';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AgentScreen from '../screens/AgentScreen';
import CategoryScreen from '../screens/CategoryScreen';
import CircleOverviewScreen from '../screens/circle/CircleOverviewScreen';
import CirclePostDetailScreen from '../screens/circle/CirclePostDetailScreen';
import CirclePostsScreen from '../screens/circle/CirclePostsScreen';
import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import PlanScreen from '../screens/PlanScreen';
import ProfileScreen from '../screens/ProfileScreen';
import RegisterScreen from '../screens/RegisterScreen';
import StatsScreen from '../screens/StatsScreen';
import { useAuthStore } from '../store/authStore';
import { radius, useIsDarkMode, useTheme } from '../theme';
import { checkForUpdate, useUpdateCheck } from '../updater/useUpdateCheck';
import type { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

const TAB_ITEMS: Record<keyof MainTabParamList, { emoji: string; label: string }> = {
  Home: { emoji: '🏠', label: '首页' },
  Stats: { emoji: '📊', label: '图表' },
  Agent: { emoji: '✨', label: '流金' },
  Plan: { emoji: '🎯', label: '规划' },
  Profile: { emoji: '👤', label: '我的' },
};

/** Tab 图标:选中态渐变胶囊强调,未选中淡化。 */
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  if (focused) {
    return (
      <GradientView style={styles.tabPill}>
        <Text style={styles.tabEmoji}>{emoji}</Text>
      </GradientView>
    );
  }
  return (
    <View style={styles.tabPill}>
      <Text style={[styles.tabEmoji, styles.tabEmojiInactive]}>{emoji}</Text>
    </View>
  );
}

function MainTabs() {
  const colors = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          { backgroundColor: colors.tabBarBg, borderTopColor: colors.border },
        ],
      }}
    >
      {(Object.keys(TAB_ITEMS) as Array<keyof MainTabParamList>).map((name) => (
        <Tab.Screen
          key={name}
          name={name}
          component={tabComponent(name)}
          options={{
            tabBarLabel: ({ focused }) => (
              <Text
                style={[
                  styles.tabLabel,
                  { color: focused ? colors.primary : colors.tabInactive },
                ]}
              >
                {TAB_ITEMS[name].label}
              </Text>
            ),
            tabBarIcon: ({ focused }) => (
              <TabIcon emoji={TAB_ITEMS[name].emoji} focused={focused} />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

const tabComponent = (
  name: keyof MainTabParamList,
): React.ComponentType<any> => {
  switch (name) {
    case 'Home':
      return HomeScreen;
    case 'Stats':
      return StatsScreen;
    case 'Agent':
      return AgentScreen;
    case 'Plan':
      return PlanScreen;
    case 'Profile':
      return ProfileScreen;
  }
};

function AuthStack() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Login" component={LoginScreen} />
      <RootStack.Screen name="Register" component={RegisterScreen} />
    </RootStack.Navigator>
  );
}

/** 登录后的栈:Main Tab 容器 + 二级页面(分类管理/圈子/管理后台)。 */
function MainStack() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Main" component={MainTabs} />
      <RootStack.Screen name="Category" component={CategoryScreen} />
      <RootStack.Screen name="CircleOverview" component={CircleOverviewScreen} />
      <RootStack.Screen name="CirclePosts" component={CirclePostsScreen} />
      <RootStack.Screen name="CirclePostDetail" component={CirclePostDetailScreen} />
      <RootStack.Screen name="AdminUsers" component={AdminUsersScreen} />
    </RootStack.Navigator>
  );
}

/** 根路由:依据登录态自动切换登录栈 / 主 Tab。 */
function RootGate() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    if (!hydrated) {
      void restoreSession();
    }
  }, [hydrated, restoreSession]);

  if (!hydrated) {
    return <LoadingView text="正在恢复会话…" />;
  }

  return accessToken ? <MainStack /> : <AuthStack />;
}

/**
 * 更新门:挂载全局更新弹窗(与导航同级,任何页面可弹出);登录态就绪
 * (会话恢复完成且有 token)后触发一次启动静默检查。未登录不检查;
 * 启动时未登录、登录成功后就绪时同样会检查一次(FR-01)。
 */
function UpdateGate() {
  const { updateInfo, visible, onUpdate, onLater, onRequestClose } =
    useUpdateCheck();
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (hydrated && accessToken && !checkedRef.current) {
      checkedRef.current = true;
      void checkForUpdate('auto');
    }
  }, [hydrated, accessToken]);

  return (
    <UpdateModal
      visible={visible}
      updateInfo={updateInfo}
      onUpdate={onUpdate}
      onLater={onLater}
      onRequestClose={onRequestClose}
    />
  );
}

export default function RootNavigator() {
  const colors = useTheme();
  const isDark = useIsDarkMode();

  const navTheme: Theme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.secondary,
    },
  };

  return (
    <>
      <NavigationContainer theme={navTheme}>
        <RootGate />
      </NavigationContainer>
      <UpdateGate />
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 64,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  tabPill: {
    width: 38,
    height: 28,
    borderRadius: radius.fab,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabEmoji: {
    fontSize: 18,
  },
  tabEmojiInactive: {
    opacity: 0.5,
  },
});
