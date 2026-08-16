import type { NavigatorScreenParams } from '@react-navigation/native';

/** 登录后底部 Tab 参数表。 */
export type MainTabParamList = {
  Home: undefined;
  Stats: undefined;
  Agent: undefined;
  Plan: undefined;
  Profile: undefined;
};

/** 根栈(登录前):Login / Register + 登录后 Main Tab 容器与二级页面。 */
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  /** 分类管理(FR-03,由并行 Agent 实现完整功能)。 */
  Category: undefined;
  /** 管理后台用户列表(FR-10,仅管理员)。 */
  AdminUsers: undefined;
};
