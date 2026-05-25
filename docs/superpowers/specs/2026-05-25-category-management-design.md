# 分类管理功能设计规格

日期: 2026-05-25

## 概述

将硬编码的分类系统改为用户可自定义管理的分类系统。支持分类的增删改查，包含后端 CRUD API、前端管理页面、以及与现有账单/统计/预算页面的集成。

## 技术决策

1. **唯一性约束**: `UniqueConstraint(user_id, name, type)` — 同一用户下，同类型分类名不能重复
2. **排序**: 新增 `sort_order: int` 字段，按 `sort_order ASC, created_at ASC` 排序
3. **Transaction 不改**: `Transaction.category` 继续存分类名字符串，不加 FK
4. **保留 CategoryEnum**: 不删除现有的 `CategoryEnum`，Transaction/Budget 模型继续使用
5. **默认分类**: 每个用户注册时创建 11 个默认分类（`is_default=True`），不可删除但可修改

## 后端

### Category 模型 (`backend/app/models/category.py`)

```
categories 表:
  id           int PK autoincrement
  user_id      int FK(users.id) CASCADE
  name         str(10) not null
  icon         str(10) — emoji 字符串
  color        str(7) — hex 色值如 #FF6B6B
  type         str(8) — expense/income (复用 TransactionType enum)
  is_default   bool default False
  sort_order   int default 0
  created_at   datetime server_default=now
  updated_at   datetime onupdate=now

约束: UniqueConstraint(user_id, name, type)
索引: ix_categories_user_id
```

关系: `user = relationship("User", back_populates="categories")`

### Alembic Migration

创建 `categories` 表。不包含数据迁移（不对已有用户生效）。

### CRUD API (`backend/app/routers/categories.py`, prefix `/categories`)

| 端点 | 说明 | 业务规则 |
|------|------|----------|
| GET / | 获取当前用户所有分类 | 返回按 type 分组的分类列表 |
| POST / | 新增分类 | name 不超过 10 字，验证 type 为 expense/income |
| PUT /{id} | 修改分类 | 只能改自己的，可改 name/icon/color/sort_order |
| DELETE /{id} | 删除分类 | 只能删自己的，不能删 is_default，有关联账单时禁止删除 |

删除检查: `SELECT COUNT(*) FROM transactions WHERE user_id=? AND category=?` (分类名匹配)

### 默认分类初始化

在 `auth.py` 的 `register` 端点中，`db.flush()` 之后调用 `create_default_categories(db, user.id)`:

| type | name | icon | color |
|------|------|------|-------|
| expense | 餐饮 | 🍜 | #FF6B6B |
| expense | 交通 | 🚌 | #4F6EF7 |
| expense | 购物 | 🛒 | #FFC93C |
| expense | 娱乐 | 🎮 | #9B59B6 |
| expense | 医疗 | 💊 | #36CFC9 |
| expense | 零食 | 🍰 | #FF8E53 |
| expense | 居住 | 🏠 | #607D8B |
| income | 工资 | 💼 | #52C41A |
| income | 生活费 | 💰 | #FFC93C |
| income | 理财 | 📈 | #4F6EF7 |
| income | 红包 | 🎁 | #FF6B6B |

sort_order 按列表顺序递增 (0, 1, 2, ...)。

### 响应格式

遵循现有 `success_response` / `error_response` 模式:

```python
# GET /categories 返回
{"success": True, "data": {"expense": [...], "income": [...]}, "message": ""}

# 单个分类的序列化
{"id": 1, "name": "餐饮", "icon": "🍜", "color": "#FF6B6B", "type": "expense", "is_default": True, "sort_order": 0}
```

## 前端

### 新增文件

1. **`src/api/categories.ts`** — CRUD API 调用，遵循 `assertSuccess` 模式
2. **`src/store/categoryStore.ts`** — Zustand store:
   ```
   state: categories[], loading
   actions: fetchCategories, addCategory, updateCategory, deleteCategory
   getters: getByType(type), getByName(name, type)
   ```
3. **`src/pages/CategoryPage.tsx`** — 分类管理页面:
   - 顶栏: 返回 + 标题 + "新增" 按钮
   - Tab: 支出分类 / 收入分类 (ios-segment 风格)
   - 列表: 图标(带颜色背景) + 名称 + "默认"标签 + 编辑/删除按钮
   - is_default 分类删除按钮禁用
   - 底部 "+ 添加支出/收入分类" 按钮
   - 新增/编辑用底部弹窗 (bottom sheet)
4. **`src/components/IconPicker.tsx`** — 图标+颜色选择器:
   - 50+ emoji 图标 (6 列网格)
   - 12 种预设颜色 (横排圆点)
   - 参照 category-prototype.html 的 ICONS 和 COLORS 数组

### 修改文件

| 文件 | 改动 |
|------|------|
| `types/index.ts` | 新增 `CategoryItem` 接口，`Category` 类型改为 `string` |
| `App.tsx` | 新增 `/app/categories` 路由，ProtectedRoute 内登录后自动 fetchCategories |
| `ProfilePage.tsx` | 在"导入账单"后加"分类管理"入口 (emoji 🏷️) |
| `AddTransactionSheet.tsx` | 移除硬编码 categories，从 categoryStore 读取 |
| `TransactionItem.tsx` | 移除硬编码 maps，从 categoryStore 读取 emoji/color |
| `StatsPage.tsx` | 移除 CATEGORY_COLORS，从 categoryStore 读取颜色 |
| `PlanPage.tsx` | 移除 categoryMeta，从 categoryStore 读取 |

### 向后兼容

旧账单可能使用默认分类里不存在的分类名（如"日用"、"教育"、"收入"、"其他"）。`getByName` 找不到时返回 `undefined`，UI 层用 fallback 显示（灰色圆形图标 + 原分类名字符串）。

### CategoryPage UI 参照

参照 `category-prototype.html` 的设计:
- 配色使用 COLORS 数组的 12 种颜色
- 图标使用 ICONS 数组的 50+ emoji
- 分类项样式: 40x40 圆角图标 + 名称 + 操作按钮
- 弹窗: 底部滑出，包含名称输入 + 图标网格 + 颜色选择 + 确定/取消按钮

## 实现范围

### 包含
- Category 模型 + Migration
- CRUD API (4 个端点)
- 默认分类初始化 (注册时)
- 分类管理页面 (CategoryPage)
- 图标选择器组件 (IconPicker)
- 路由注册 + ProfilePage 入口
- HomePage/StatsPage/PlanPage 使用 categoryStore 替代硬编码
- AddTransactionSheet/TransactionItem 使用 categoryStore

### 不包含
- 已有用户的数据迁移
- 拖拽排序 UI (sort_order 字段预留)
- 分类图标自定义上传 (仅支持 emoji)
- Transaction model 的 FK 关系改造

## 验证标准

1. 后端: 新用户注册后 categories 表有 11 条默认记录
2. 后端: CRUD 端点全部正常工作，权限检查正确
3. 后端: 不能删除 is_default 分类，不能删除有关联账单的分类
4. 前端: CategoryPage 展示分类列表，可增删改
5. 前端: AddTransactionSheet 使用 categoryStore 的分类列表
6. 前端: TransactionItem 显示正确的分类图标和颜色
7. 前端: StatsPage 图表使用 categoryStore 的颜色
8. 前端: PlanPage 预算页使用 categoryStore 的分类信息
9. 前端: 旧分类名（如"日用"）有 fallback 显示
