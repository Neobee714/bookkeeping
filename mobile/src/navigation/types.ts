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
  /** 外观：主题与明暗模式。 */
  Appearance: undefined;
  /** 财报列表（仅个人账本）。 */
  Reports: undefined;
  /** 财报详情；label 用于加载期间先显示标题。 */
  ReportDetail: { id: number; label?: string };
  /** 整理旧备注：把历史备注逐条归类为商家 / 备注。 */
  NoteCleanup: undefined;
  /** 账单导入（v0.23）：上传微信 / 支付宝账单，预览后确认入账。 */
  Import: undefined;
  /** 分类规则（v0.24）：导入时记住的商家 / 平台分类，可改可删。 */
  Rules: undefined;
  /** 账单邮箱（v0.25）：配置 QQ / 163 IMAP 自动导入。 */
  BillMailbox: undefined;
  /** 分类/商家/平台明细（v0.21）：从图表页支出分布点入，按维度过滤当月账单。 */
  CategoryDetail: {
    dimension: 'category' | 'merchant' | 'channel';
    name: string;
    /** YYYY-MM，继承图表页月份。 */
    month: string;
    /** 继承图表页的我的/伴侣档位。 */
    tab: 'self' | 'partner';
  };
};
