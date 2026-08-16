import type { NavigatorScreenParams } from '@react-navigation/native';

import type { CirclePost } from '../types';

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
  /** 双人圈子概览(FR-08)。 */
  CircleOverview: undefined;
  /** 圈子帖子列表(FR-08)。 */
  CirclePosts: { circleId: number; circleName: string };
  /** 帖子详情 + 评论(FR-08);后端无单帖详情接口,由列表页传入 post 对象。 */
  CirclePostDetail: { circleId: number; post: CirclePost };
  /** 管理后台用户列表(FR-10,仅管理员)。 */
  AdminUsers: undefined;
};
