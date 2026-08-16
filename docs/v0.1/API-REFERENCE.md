# 双人记账 — 后端 API 对接参考文档

- 创建时间:2026-08-15 22:35
- 适用范围:React Native 客户端(双人记账 App)对接后端
- 依据代码:`backend/app/routers/`、`backend/app/schemas/`、`backend/app/core/response.py`、`backend/app/core/security.py`
- 版本:v0.1

---

## 1. 通用约定

### 1.1 Base URL

所有接口路径均以 Base URL 开头,生产环境为 `https://bookkeeping.neobee.top`(见 `main.py` CORS 配置),本地开发为 `http://127.0.0.1:<port>`。

- 除 **circles** 模块外,各 router 直接挂在根路径下(无版本前缀);
- **circles** 模块整体带前缀 `/api/v1`;
- 有一个无鉴权健康检查接口 `GET /health`。

### 1.2 统一响应包装

所有接口(除文件下载外)返回统一 JSON 结构:

```ts
interface ApiResponse<T> {
  success: boolean;   // 是否成功
  data: T | null;     // 业务数据;失败时为 null
  message: string;    // 提示信息;成功时可为空字符串
}
```

本文档「响应 data 结构」只描述 `data` 内部的字段结构。

**错误响应**:HTTP 非 2xx 时同样返回 `{ success: false, data: null, message: <原因> }`,客户端应依据 HTTP 状态码 + `message` 判断错误。

### 1.3 鉴权方式

- 采用 **JWT Bearer Token**(`OAuth2PasswordBearer`,tokenUrl=`/auth/login`);
- 请求头:`Authorization: Bearer <access_token>`;
- 令牌类型:`access_token`(默认 30 分钟过期)与 `refresh_token`(默认 30 天过期),均为 HS256 签名,payload 含 `sub`(用户 id)、`type`(`access`/`refresh`)、`iat`、`exp`;
- 令牌过期或无效 → `401`,`message` 为「令牌无效或已过期」;用 `refresh_token` 调受保护接口 → `401`「访问令牌类型错误」;
- **管理员(admin)**:通过 `CIRCLE_CREATOR_USERNAME` 环境变量配置,用户名与该值不区分大小写相等即为管理员(默认未配置则无管理员)。圈子创建、申请审核、用户列表、应用发布等接口仅管理员可用。

### 1.4 常见 HTTP 状态码语义

| 状态码 | 含义 | 典型场景 |
| --- | --- | --- |
| 400 | 参数/业务校验失败 | 邀请码无效、默认分类不可修改、日期格式错误 |
| 401 | 未认证/令牌无效 | token 缺失/过期/类型错误、用户名或密码错误、刷新令牌无效 |
| 403 | 无权限 | 未绑定伴侣、非管理员、非圈子成员、非资源所有者 |
| 404 | 资源不存在 | 账单/分类/预算/储蓄目标/圈子/帖子/评论不存在 |
| 409 | 状态冲突 | 已绑定伴侣、已加入圈子、版本已发布 |
| 413 | 上传文件过大 | bundle/APK 超限 |
| 422 | 请求体字段校验失败(Pydantic) | 字段缺失、长度/范围/格式不符,`message` 为第一条错误信息 |
| 500 | 服务器内部错误 | `message` 恒为「服务器内部错误」 |
| 503 | 服务不可用 | AI 服务未配置(DEEPSEEK_API_KEY 为空) |

### 1.5 日期参数约定

| 参数 | 格式 | 示例 |
| --- | --- | --- |
| `month` | `YYYY-MM` | `2026-07` |
| `start_date` / `end_date` | `YYYY-MM-DD` | `2026-07-01` |
| 账单 `date` 字段 | `YYYY-MM-DD` | `2026-07-15` |
| 时间戳字段(`created_at` 等) | ISO 8601 字符串 | `2026-07-15T08:30:00+00:00` |

- `month` 缺省时默认当月;
- 若同时传 `start_date`/`end_date` 则按日期区间过滤,**二者必须同时提供**且 `start_date < end_date`,否则 400「日期范围参数错误」;
- 区间为半开区间 `[start, end)`(含起始日、不含结束日)。

---

## 2. 公共数据结构(TS 风格)

```ts
// 用户简要信息(圈子/评论/帖子等处内嵌)
interface UserBrief {
  id: number;
  username: string;
  nickname: string;
  avatar: string | null;
  created_at: string | null; // ISO 时间
}

// 完整用户(auth 模块返回)
interface User extends UserBrief {
  is_admin: boolean;
  partner_id: number | null;
  partner: UserBrief | null;      // 伴侣简要信息,未绑定为 null
  partner_code: string;           // 伴侣绑定码(如 "A1B2C3-XXXXXX")
  invite_code: string;            // 与 partner_code 相同的绑定码
  reg_invite_code: string;        // 8 位注册邀请码
}

interface Transaction {
  id: number;
  user_id: number;
  amount: number;                 // 金额,保留 2 位小数
  type: "income" | "expense";
  category: string;               // 分类名(1-10 字符)
  note: string | null;            // 备注,最多 255 字符
  date: string;                   // YYYY-MM-DD
  created_at: string | null;
}

interface Category {
  id: number;
  user_id: number;
  name: string;                   // 1-10 字符
  icon: string;                   // 1-10 字符(emoji)
  color: string;                  // #RRGGBB
  type: "income" | "expense";
  is_default: boolean;            // 默认分类不可改/删
  created_at: string | null;
}

interface BudgetItem {
  id: number | null;              // 仅有支出无预算时为 null
  user_id: number;
  category: string;
  monthly_limit: number;
  year_month: string;             // YYYY-MM
  actual_spent: number;
  remaining: number;              // monthly_limit - actual_spent
  created_at: string | null;
}

interface SavingGoal {
  id: number;
  user_id: number;
  name: string;                   // 1-100 字符
  target_amount: number;
  current_amount: number;
  deadline: string | null;        // YYYY-MM-DD
  created_at: string | null;
}

// —— 圈子模块 ——
interface CircleMemberInfo {
  id: number;                     // CircleMember 记录 id
  joined_at: string | null;
  user: UserBrief;
}

interface Circle {
  id: number;
  name: string;
  description: string | null;
  creator: UserBrief;
  creator_id: number;
  is_creator: boolean;
  member_count: number;
  members: CircleMemberInfo[];
  created_at: string | null;
}

interface CircleOverview {        // /circles/all 使用
  id: number;
  name: string;
  description: string | null;
  creator_id: number;
  member_count: number;
  my_status: "creator" | "member" | "not_member";
  created_at: string | null;
}

interface CircleInviteCode {
  id: number;
  circle_id: number;
  code: string;                   // 8 位邀请码
  created_at: string | null;
}

interface CircleApplication {
  id: number;
  circle_name: string;
  circle_description: string | null;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  created_circle_id: number | null;
  created_at: string | null;
  reviewed_at: string | null;
  user: UserBrief;
}

interface Post {
  id: number;
  circle_id: number;
  content: string | null;
  image: string | null;           // base64 图片字符串(≤600000 字符)
  created_at: string | null;
  user: UserBrief;
  average_score: number;          // 平均分,无评分时 0.0
  rating_count: number;
  comment_count: number;
  my_score: number | null;        // 当前用户评分,未评过为 null
  comments_preview: Comment[];    // 最新 3 条评论(时间倒序)
}

interface Comment {
  id: number;
  post_id: number;
  content: string;                // 1-500 字符
  created_at: string | null;
  user: UserBrief;
}

interface Rating {
  id: number;
  post_id: number;
  score: number;                  // 0-10,可含小数
  created_at: string | null;
  user: UserBrief;
}

// —— 其他 ——
interface AgentToolCall {
  name: string;
  target: string | null;          // 工具作用目标(如账单 id/分类名)
}

interface AgentChatResult {
  reply: string;
  tool_calls: AgentToolCall[];
}

interface ReleaseInfo {
  has_update: boolean;
  version?: string;               // 有更新时存在
  url?: string;                   // 下载地址(可能为反代后的绝对 URL)
  checksum?: string;              // SHA-256
  size?: number;                  // 字节数
  changelog?: string;
  released_at?: string | null;
}
```

---

## 3. 接口清单总览

| 模块 | 前缀 | 接口数 |
| --- | --- | --- |
| auth | `/auth` | 7(另有别名 `/auth/bind-invite`) |
| transactions | `/transactions` | 6 |
| categories | `/categories` | 4 |
| budget | `/budget` | 3(无删除接口) |
| savings | `/savings` | 4 |
| stats | `/stats` | 3 |
| circles | `/api/v1` | 24 |
| agent | `/agent` | 1 |
| app-updates | `/app-updates` | 8 |
| health | 根路径 | 1 |
| **合计** | | **61 个处理函数 / 62 条路径** |

---

## 4. 健康检查

### 4.1 `GET /health`(无鉴权)

- **响应 data**:`{ status: "ok" }`
- **说明**:服务存活探测;无任何依赖参数。

---

## 5. auth — 认证与用户

### 5.1 `POST /auth/register`(无鉴权)

**请求体(JSON)**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `username` | string | 是 | 3-50 字符,唯一 |
| `nickname` | string | 是 | 1-50 字符 |
| `password` | string | 是 | 6-128 字符 |
| `reg_invite_code` | string | 是 | 1-32 字符;为 `FOUNDER_INVITE_CODE`(默认 `NEOBEE2025`)且**系统中还没有任何用户**时注册为创始用户(不绑定邀请人);否则必须对应用户的 `reg_invite_code`,无效则 400 |
| `partner_code` | string | 否 | ≤64 字符;与 `invite_code` 二选一,用于注册时直接绑定伴侣 |
| `invite_code` | string | 否 | ≤64 字符;`partner_code` 的别名 |

**响应 data**:

```ts
{ user: User }
```

**错误**:400 用户名已存在 / 邀请码无效 / 不能绑定自己 / 注册失败;409 对方已绑定伴侣。

**说明**:注册成功后自动为该用户创建 16 个默认分类(10 支出 + 6 收入,`is_default=true`);若带绑定码且对方可绑定,则双方互设 `partner_id`。

### 5.2 `POST /auth/login`(无鉴权)

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `username` | string | 是 | 1-50 字符 |
| `password` | string | 是 | 1-128 字符 |

**响应 data**:

```ts
{
  access_token: string;   // 默认 30 分钟有效
  refresh_token: string;  // 默认 30 天有效
  token_type: "bearer";
  user: User;
}
```

**错误**:401 用户名或密码错误。

### 5.3 `POST /auth/refresh`(无鉴权)

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `refresh_token` | string | 是 | ≥1 字符,须为 `type=refresh` 的令牌 |

**响应 data**:

```ts
{
  access_token: string;
  refresh_token: string;  // 刷新后同时换发新 refresh token
  token_type: "bearer";
}
```

**错误**:401 刷新令牌无效 / 用户不存在。

### 5.4 `GET /auth/me`(Bearer)

- **响应 data**:`User`
- **说明**:返回当前登录用户完整信息(含伴侣简要信息与绑定码)。

### 5.5 `PUT /auth/profile`(Bearer)

**请求体**:`{ nickname?: string }`(1-16 字符,可只传部分)

**响应 data**:`User`(更新后)

**错误**:400 昵称不能为空 / 昵称长度需在 1 到 16 个字符之间。

### 5.6 `POST /auth/avatar`(Bearer)

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `avatar` | string | 是 | 必须以 `data:image/` 开头且包含 `;base64,`;总长 ≤200000 字符 |

**响应 data**:`User`(更新后)

**错误**:400 头像不能为空 / 头像文件过大,请重新选择 / 头像格式不支持。

### 5.7 `POST /auth/bind-partner`(Bearer)—— 别名 `POST /auth/bind-invite`

> ⚠️ **路由别名**:同一处理函数同时挂在 `/auth/bind-partner` 和 `/auth/bind-invite` 两条路径上,调用任意一个均可。

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `partner_code` | string | 否 | 1-64 字符;与 `invite_code` 至少提供一个 |
| `invite_code` | string | 否 | 1-64 字符;`partner_code` 的别名 |

绑定码为对方 `User.partner_code`/`invite_code` 字段(形如 `XXXXXX-XXXXXX`),解析出对方用户 id 后双向绑定。

**响应 data**:`User`(绑定后,`partner` 字段为对方信息)

**错误**:400 绑定码无效 / 不能绑定自己;409 你已绑定伴侣 / 对方已绑定伴侣。

---

## 6. transactions — 账单

### 6.1 `GET /transactions`(Bearer)

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `month` | string | 否 | `YYYY-MM`,按整月过滤 |
| `start_date` | string | 否 | `YYYY-MM-DD`,与 `end_date` 成对使用 |
| `end_date` | string | 否 | `YYYY-MM-DD`,与 `start_date` 成对使用 |

> 注意:本接口**没有分页参数**;返回指定范围内当前用户全部账单,按 `date` 倒序、`created_at` 倒序排列。

**响应 data**:`Transaction[]`

**错误**:400 日期范围参数错误,month 应为 YYYY-MM,start_date/end_date 应为 YYYY-MM-DD。

### 6.2 `GET /transactions/partner`(Bearer,需已绑定伴侣)

- **查询参数**:同 6.1(`month`/`start_date`/`end_date`)。
- **响应 data**:`Transaction[]` —— 伴侣的全部账单,排序同 6.1。
- **错误**:403 尚未绑定伴侣;400 日期参数错误。

### 6.3 `POST /transactions`(Bearer)

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `amount` | number | 是 | >0,最多 12 位整数、2 位小数 |
| `type` | `"income"` \| `"expense"` | 是 | |
| `category` | string | 是 | 1-10 字符(建议传分类名) |
| `note` | string | 否 | ≤255 字符 |
| `date` | string | 是 | `YYYY-MM-DD` |

**响应 data**:`Transaction`(message:「创建成功」)

### 6.4 `POST /transactions/import`(Bearer,multipart/form-data)

**表单字段**:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | 文件 | 是 | **GBK 编码**的 CSV,列为:日期 / 收支类型 / 分类 / 金额 / 备注 |

- 日期格式:`2026年07月15日`;
- 收支类型:`支出` / `收入`;
- 表头行(首列 `日期`)自动跳过;列数 <5 的行跳过;
- 分类映射表:`餐饮/零食→餐饮`,`交通→交通`,`水/洗衣澡/理发→日用`,`娱乐/游戏→娱乐`,`医疗→医疗`,`学习→教育`,`购物/礼物→购物`,`旅游/其他/其它→其他`,`工资→收入`;未匹配分类一律归入「其他」;
- 备注截断为 255 字符,空备注存 `null`。

**响应 data**:

```ts
{
  imported: number;                        // 成功导入条数
  skipped: number;                         // 跳过条数
  skipped_rows: { row: number; reason: string }[]; // 跳过明细(原因:列数不足/收支类型错误/日期格式错误/金额格式错误)
}
```

**错误**:400 文件编码错误,请导出 GBK 编码的 CSV 文件。

### 6.5 `PUT /transactions/{transaction_id}`(Bearer)

**路径参数**:`transaction_id: number`

**请求体**:`TransactionUpdateRequest` —— 与创建字段相同但全部可选,`amount`/`type`/`category`/`note`/`date` **至少提供一个**;传了即为覆盖更新(部分更新语义)。

**响应 data**:`Transaction`(message:「修改成功」)

**错误**:404 账单不存在;403 只能修改自己的账单。

### 6.6 `DELETE /transactions/{transaction_id}`(Bearer)

**路径参数**:`transaction_id: number`

**响应 data**:`{ id: number }`(message:「删除成功」)

**错误**:404 账单不存在;403 只能删除自己的账单。

---

## 7. categories — 分类

### 7.1 `GET /categories`(Bearer)

- **响应 data**:`Category[]`,按 `type` 升序、`id` 升序排列。
- **说明**:若当前用户尚无任何分类,自动创建 16 个默认分类后返回。

### 7.2 `POST /categories`(Bearer)

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `name` | string | 是 | 1-10 字符 |
| `icon` | string | 是 | 1-10 字符 |
| `color` | string | 是 | `#RRGGBB`(正则 `^#[0-9a-fA-F]{6}$`) |
| `type` | `"income"` \| `"expense"` | 是 | |

**响应 data**:`Category`(message:「分类创建成功」)

### 7.3 `PUT /categories/{category_id}`(Bearer)

**路径参数**:`category_id: number`

**请求体**:`{ name?, icon?, color? }` —— 三者**至少提供一个**,约束同创建;默认分类(`is_default=true`)不可修改。

**响应 data**:`Category`(message:「分类更新成功」)

**错误**:404 分类不存在;403 无权修改此分类;400 默认分类不可修改。

### 7.4 `DELETE /categories/{category_id}`(Bearer)

**路径参数**:`category_id: number`

**响应 data**:`null`(message:「分类删除成功」)

**错误**:404 分类不存在;403 无权删除此分类;400 默认分类不可删除 / 该分类下存在账单,无法删除。

---

## 8. budget — 预算

### 8.1 `GET /budget`(Bearer)

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `month` | string | 否 | `YYYY-MM`;缺省为当月 |

**响应 data**:

```ts
{
  month: string;              // YYYY-MM(实际生效的月份)
  items: BudgetItem[];        // 按 category 名称升序
  total_budget: number;
  total_spent: number;
}
```

**说明**:`items` 由「有预算的分类」与「当月有支出但没设预算的分类」合并而来;后者 `id: null`、`monthly_limit: 0`、`remaining: 0`。`actual_spent` 为当月(或区间)该分类支出合计。

**错误**:400 month 参数格式错误,应为 YYYY-MM。

### 8.2 `POST /budget`(Bearer)

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `category` | string | 是 | 1-10 字符 |
| `monthly_limit` | number | 是 | >0,2 位小数 |
| `year_month` | string | 是 | `YYYY-MM`(正则 `^\d{4}-(0[1-9]|1[0-2])$`) |

**说明**:同用户 + 同分类 + 同月份已存在预算时,直接更新 `monthly_limit`(幂等),message 为「预算已更新」;否则新建,message 为「预算已创建」。

**响应 data**:`BudgetItem`

### 8.3 `PUT /budget/{budget_id}`(Bearer)

**路径参数**:`budget_id: number`

**请求体**:`{ category?, monthly_limit?, year_month? }` —— **至少提供一个**,约束同创建。

**响应 data**:`BudgetItem`(message:「预算修改成功」)

**错误**:404 预算不存在;403 只能修改自己的预算。

> ⚠️ 说明:budget 模块**未提供删除接口**(后端无 `DELETE /budget` 路由)。

---

## 9. savings — 储蓄目标

### 9.1 `GET /savings`(Bearer)

- **响应 data**:`SavingGoal[]`,按 `created_at` 倒序。

### 9.2 `POST /savings`(Bearer)

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `name` | string | 是 | 1-100 字符 |
| `target_amount` | number | 是 | >0,2 位小数 |
| `current_amount` | number | 否 | ≥0,默认 0 |
| `deadline` | string | 否 | `YYYY-MM-DD` |

**响应 data**:`SavingGoal`(message:「储蓄目标创建成功」)

### 9.3 `PUT /savings/{saving_id}`(Bearer)

**路径参数**:`saving_id: number`

**请求体**:`{ name?, target_amount?, current_amount?, deadline? }` —— **至少提供一个**,约束同创建。

**响应 data**:`SavingGoal`(message:「储蓄目标修改成功」)

**错误**:404 储蓄目标不存在;403 只能修改自己的储蓄目标。

### 9.4 `DELETE /savings/{saving_id}`(Bearer)

**路径参数**:`saving_id: number`

**响应 data**:`{ id: number }`(message:「储蓄目标删除成功」)

**错误**:404 储蓄目标不存在;403 只能删除自己的储蓄目标。

---

## 10. stats — 统计

### 10.1 `GET /stats/monthly-summary`(Bearer)

**查询参数**:`month` / `start_date` / `end_date`(约定见 1.5)。

**响应 data**:

```ts
{
  month: string;                              // YYYY-MM
  total_income: number;
  total_expense: number;
  balance: number;                            // income - expense
  transaction_count: number;                  // 区间内账单总数(收支合计)
  category_expenses: Record<string, number>;  // 分类名 -> 支出金额(仅 expense)
  note_breakdown: Record<                     // 分类名 -> 备注明细(按金额倒序)
    string,
    { note: string; amount: number; count: number }[]
  >;                                          // 无备注的归为「未备注」
}
```

**错误**:400 日期范围参数错误,month 应为 YYYY-MM,start_date/end_date 应为 YYYY-MM-DD。

### 10.2 `GET /stats/partner-summary`(Bearer,需已绑定伴侣)

- **查询参数**:同 10.1。
- **响应 data**:与 10.1 结构完全一致,统计对象为**伴侣**的账单。
- **错误**:403 尚未绑定伴侣;400 日期参数错误。

### 10.3 `GET /stats/trend`(Bearer)

**查询参数**:

| 参数 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `months` | number | 否 | 1-24,默认 6 |

**响应 data**:`{ month, income, expense, balance }[]` —— 以当月为末月、向前共 `months` 个月的逐月收支,`month` 升序、金额均保留 2 位小数。

---

## 11. circles — 圈子(前缀 `/api/v1`)

> 通用权限说明:
> - 「Bearer」= 任意已登录用户;
> - 「管理员」= 用户名等于 `CIRCLE_CREATOR_USERNAME`(不区分大小写);
> - 「成员」= 已是该圈子成员(`CircleMember` 存在),否则 403「你还不是圈子成员」;
> - 「圈主」= `creator_id == 当前用户 id`,或管理员。

### 11.1 `POST /api/v1/circles`(Bearer + 管理员)

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `name` | string | 是 | 1-30 字符,去空白后非空 |
| `description` | string | 否 | ≤100 字符 |

**响应 data**:`Circle`(message:「创建成功」)

**错误**:403 只有管理员可以执行该操作;400 圈子名称不能为空。

> ⚠️ 注意:管理员直接创建圈子时,**不会**自动把创建者写入 `circle_members`(与 11.14 审批通过后自动加入不同)。因此新圈子 `member_count` 为 0,创建者也不会出现在「我加入的圈子」列表中;需通过邀请码加入后才成为成员(此时 `member_count` 为 1)。客户端如需展示「我创建的圈子」,建议依赖 `/api/v1/circles/all`(管理员视角返回 `my_status: "creator"`)。

### 11.2 `GET /api/v1/circles`(Bearer)

- **响应 data**:`Circle[]` —— 当前用户**已加入**的圈子(含自己创建的),按 `created_at`、`id` 倒序。

### 11.3 `GET /api/v1/circles/all`(Bearer)

**响应 data**:`CircleOverview[]` —— 全部圈子列表:

- 非管理员:返回所有圈子,`my_status` 为 `member`(已加入)/ `not_member`;
- 管理员:只返回自己创建的圈子,`my_status` 恒为 `creator`。

### 11.4 `GET /api/v1/circles/applications/pending-count`(Bearer + 管理员)

**响应 data**:`{ pending_count: number }` —— 待审批申请总数。

> 路由顺序说明:该路径在 `{circle_id:int}` 之前注册,且 `{circle_id:int}` 转换器只匹配整数,不会与 `applications` 等固定路径冲突。

### 11.5 `GET /api/v1/circles/{circle_id}`(Bearer + 成员)

**路径参数**:`circle_id: number`

**响应 data**:`Circle`(完整详情,含全部成员)

**错误**:404 圈子不存在;403 你还不是圈子成员。

### 11.6 `GET /api/v1/circles/{circle_id}/invite`(Bearer + 圈主/管理员)

**路径参数**:`circle_id: number`

**响应 data**:`CircleInviteCode | null` —— 返回该圈子**当前未使用**的最新邀请码;无则为 `null`。

**错误**:404 圈子不存在;403 仅圈主可查看邀请码。

### 11.7 `POST /api/v1/circles/{circle_id}/invite`(Bearer + 圈主/管理员)

**路径参数**:`circle_id: number`;无请求体。

**响应 data**:`CircleInviteCode`(message:「邀请码生成成功」)

**错误**:404 圈子不存在;403 仅圈主可生成邀请码;500 邀请码生成失败(重试冲突)。

### 11.8 `POST /api/v1/circles/join`(Bearer)

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `code` | string | 是 | 1-8 字符(邀请码,服务端转大写后匹配) |

**说明**:使用邀请码加入;邀请码为**一次性**,使用后 `used_by` 置为当前用户,不能再次使用。

**响应 data**:`Circle`(message:「加入成功」)

**错误**:400 圈子邀请码无效 / 圈子邀请码已使用;409 你已加入该圈子。

### 11.9 `DELETE /api/v1/circles/{circle_id}/leave`(Bearer + 成员)

**路径参数**:`circle_id: number`

**响应 data**:`{ circle_id: number }`

**说明**(三种情况):
- 圈主退出:若圈内还有其他人 → 400「圈子内还有成员,请先移出所有成员再退出」;否则圈子被删除,message「已退出并解散圈子」;
- 普通成员退出后圈内无人 → 圈子被删除,message「已退出圈子,圈子已无成员已删除」;
- 否则 message「已退出圈子」。

**错误**:404 圈子不存在 / 你还不是圈子成员;400 见上。

### 11.10 `POST /api/v1/circles/apply-create`(Bearer,非管理员)

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `circle_name` | string | 是 | 1-30 字符 |
| `circle_description` | string | 否 | ≤100 字符 |
| `message` | string | 否 | ≤100 字符 |

**说明**:普通用户创建圈子需先提交申请:
- 已有 **pending** 申请 → 400「已有待审批申请,请等待」;
- 上一次申请为 **rejected** 时,会复用该记录并重置为 pending(覆盖名称/描述/留言);
- 管理员调用 → 403「管理员无需申请」。

**响应 data**:`CircleApplication`(message:「申请已提交」)

### 11.11 `GET /api/v1/circles/my-application`(Bearer)

**响应 data**:`CircleApplication | null` —— 当前用户最近一次申请;管理员恒返回 `null`。

### 11.12 `DELETE /api/v1/circles/my-application`(Bearer)

**响应 data**:`{ id: number }`(message:「申请已撤回」)

**错误**:404 申请不存在;400 当前申请无法撤回(仅 pending 可撤回)。

### 11.13 `GET /api/v1/circles/applications`(Bearer + 管理员)

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `status` | string | 否 | `pending`(默认)/ `approved` / `rejected`;传其他值则不过滤 |

**响应 data**:`{ items: CircleApplication[] }` —— 按 `created_at`、`id` 倒序。

### 11.14 `PUT /api/v1/circles/applications/{application_id}/review`(Bearer + 管理员)

**路径参数**:`application_id: number`

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `action` | `"approve"` \| `"reject"` | 是 | |

**说明**:`approve` 时创建圈子(圈主为申请人)并把申请人自动加入;`reject` 仅置状态。两者都会写 `reviewed_by`/`reviewed_at`。

**响应 data**:`CircleApplication`(message:「已通过申请」/「已拒绝申请」)

**错误**:403 只有管理员可以执行该操作;404 申请不存在;400 该申请已处理。

### 11.15 `GET /api/v1/users`(Bearer + 管理员)

**响应 data**:

```ts
{
  id: number;
  username: string;
  nickname: string;
  avatar: string | null;
  is_admin: boolean;
  created_at: string | null;
  joined_circle: { id: number; name: string } | null; // 最近加入的圈子,未加入为 null
}[]
```

按 `created_at`、`id` 倒序。

### 11.16 `DELETE /api/v1/circles/{circle_id}/members/{user_id}`(Bearer + 管理员)

**路径参数**:`circle_id: number`、`user_id: number`

**响应 data**:`{ circle_id: number; user_id: number }`(message:「已移出圈子」)

**错误**:403 只有管理员可以执行该操作;404 圈子不存在 / 该用户不在圈子内。

### 11.17 `GET /api/v1/circles/{circle_id}/posts`(Bearer + 成员)

**查询参数**:

| 参数 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `page` | number | 否 | ≥1,默认 1 |
| `page_size` | number | 否 | 1-100,默认 20 |

**响应 data**:

```ts
{
  items: Post[];      // 按 created_at、id 倒序
  page: number;
  page_size: number;
  total: number;      // 该圈子帖子总数
  has_more: boolean;
}
```

**错误**:404 圈子不存在;403 你还不是圈子成员。

### 11.18 `POST /api/v1/circles/{circle_id}/posts`(Bearer + 成员)

**路径参数**:`circle_id: number`

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `content` | string | 否 | ≤200 字符;`content` 与 `image` **至少填一项**(去空白后判断) |
| `image` | string | 否 | base64 图片字符串,≤600000 字符;超限 400「图片过大,请重新选择」 |

**响应 data**:`Post`(message:「发布成功」)

### 11.19 `DELETE /api/v1/circles/{circle_id}/posts/{post_id}`(Bearer + 成员)

**路径参数**:`circle_id: number`、`post_id: number`

**权限**:帖子作者本人 **或** 该圈子圈主。

**响应 data**:`{ id: number }`(message:「删除成功」)

**错误**:404 圈子不存在 / 帖子不存在;403 你还不是圈子成员 / 没有删除该帖子的权限。

### 11.20 `POST /api/v1/posts/{post_id}/rate`(Bearer + 成员)

**路径参数**:`post_id: number`

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `score` | number | 是 | 0-10(可含小数) |

**说明**:重复评分覆盖原分数(同一用户对同一帖子只有一条评分)。

**响应 data**:`Rating`(message:「打分成功」)

**错误**:404 帖子不存在;403 你还不是圈子成员。

### 11.21 `GET /api/v1/posts/{post_id}/ratings`(Bearer + 成员)

**路径参数**:`post_id: number`

**响应 data**:`Rating[]` —— 按 `created_at`、`id` 升序。

**错误**:404 帖子不存在;403 你还不是圈子成员。

### 11.22 `GET /api/v1/posts/{post_id}/comments`(Bearer + 成员)

**路径参数**:`post_id: number`

**响应 data**:`Comment[]` —— 按 `created_at`、`id` 升序。

**错误**:404 帖子不存在;403 你还不是圈子成员。

### 11.23 `POST /api/v1/posts/{post_id}/comments`(Bearer + 成员)

**路径参数**:`post_id: number`

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `content` | string | 是 | 1-500 字符,去空白后非空 |

**响应 data**:`Comment`(message:「评论成功」)

**错误**:404 帖子不存在;403 你还不是圈子成员;400 评论内容不能为空。

### 11.24 `DELETE /api/v1/comments/{comment_id}`(Bearer,仅作者本人)

**路径参数**:`comment_id: number`

**响应 data**:`{ id: number }`(message:「删除成功」)

**错误**:404 评论不存在;403 只能删除自己的评论。

---

## 12. agent — AI 记账助手

### 12.1 `POST /agent/chat`(Bearer)

**请求体**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `message` | string | 是 | 1-4000 字符,去空白后非空 |
| `history` | `{ role: "user" \| "assistant"; content: string }[]` | 否 | 最多 40 条;每条 `content` 1-4000 字符、去空白后非空 |

**响应 data**:

```ts
{
  reply: string;                       // AI 回复文本
  tool_calls: { name: string; target: string | null }[]; // 本次会话中 AI 调用的工具摘要
}
```

**错误**:503 AI 服务未配置,请先设置 DEEPSEEK_API_KEY(仅当环境变量缺失时);401 未认证。

**说明**:服务端会结合当前用户账单数据执行查询/记账等工具,`tool_calls` 供客户端展示「助手执行了哪些操作」;请求体不合法(如 message 为空)返回 422。

---

## 13. app-updates — 应用更新

> 说明:该模块同时维护两类发布物:
> - **bundle**(React Native 热更新 zip,通过 `AppRelease` 数据表记录);
> - **APK**(通过文件系统 `app-release-<version>.apk` + 同名 `.json` 元数据管理)。
>
> `GET /latest`、`GET /apk/latest` **无需鉴权**,供 App 启动时检查更新;其余管理接口需 Bearer + 管理员。

### 13.1 `GET /app-updates/latest`(无鉴权)

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `current` | string | 否 | 当前客户端版本,形如 `X.Y.Z`;格式合法时才参与比较 |

**响应 data**:

```ts
// 无可用更新(无 active 版本)
{ has_update: false }
// 有 active 版本(版本号比 current 大,或 current 为空/非法)
{
  has_update: true;
  version: string;        // X.Y.Z
  url: string;            // bundle 下载地址(可能被 APP_RELEASES_PUBLIC_BASE_URL 改写协议/域名)
  checksum: string;       // SHA-256
  size: number;           // 字节
  changelog: string;
  released_at: string | null;
}
```

**说明**:取 `is_active=true` 且 `created_at` 最新的发布记录。

### 13.2 `GET /app-updates/files/{filename}`(无鉴权,文件下载)

**路径参数**:`filename: string` —— 仅允许 `*.zip`(会做 `basename` 安全检查)。

**响应**:直接返回 `application/zip` 文件流(非 JSON 包装)。

**错误**:404 文件不存在。

### 13.3 `POST /app-updates/releases`(Bearer + 管理员,multipart/form-data)

**表单字段**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `version` | string | 是 | `X.Y.Z`(正则 `^\d+\.\d+\.\d+$`),唯一 |
| `changelog` | string | 否 | 更新日志,默认空 |
| `bundle` | 文件 | 是 | zip 包,≤50 MB(默认),非空 |

**响应 data**:

```ts
{
  version: string;
  url: string;
  checksum: string;   // SHA-256
  size: number;
  changelog: string;
  released_at: string | null;
}
```

(message:「发布成功」)

**错误**:400 版本号格式应为 X.Y.Z / bundle 文件为空;403 无权限;409 版本 X.Y.Z 已发布;413 bundle 超过 XX MB 限制。

### 13.4 `GET /app-updates/releases`(Bearer + 管理员)

**响应 data**:

```ts
{
  id: number;
  version: string;
  checksum: string;
  size: number;
  changelog: string;
  is_active: boolean;
  released_at: string | null;
}[]
```

按 `created_at` 倒序。

### 13.5 `GET /app-updates/apk/latest`(无鉴权)

**查询参数**:`current`(同 13.1)。

**响应 data**:与 13.1 结构一致(有更新时含 `version`/`url`/`checksum`/`size`/`changelog`/`released_at`);无 APK 时 `{ has_update: false }`。

**说明**:从发布目录扫描 `app-release-*.apk` 取版本号最大者;元数据优先读同名 `.json`,否则实时计算 SHA-256。

### 13.6 `GET /app-updates/apk/files/{filename}`(无鉴权,文件下载)

**路径参数**:`filename: string` —— 仅允许 `app-release-<X.Y.Z>.apk` 命名。

**响应**:`application/vnd.android.package-archive` 文件流。

**错误**:404 文件不存在。

### 13.7 `POST /app-updates/apk`(Bearer + 管理员,multipart/form-data)

**表单字段**:

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `version` | string | 是 | `X.Y.Z`,唯一 |
| `changelog` | string | 否 | 默认空 |
| `apk` | 文件 | 是 | APK 包,≤100 MB(默认),非空,文件头须为 `PK`(zip 魔数) |

**响应 data**:同 13.3(含 `version`/`url`/`checksum`/`size`/`changelog`/`released_at`),message「发布成功」。

**错误**:400 版本号格式应为 X.Y.Z / APK 文件为空 / 文件不是有效的 APK 包;403 无权限;409 版本 X.Y.Z 已发布;413 APK 超过 XX MB 限制。

### 13.8 `DELETE /app-updates/apk/{version}`(Bearer + 管理员)

**路径参数**:`version: string`(须为 `X.Y.Z`)

**响应 data**:`null`(message:「删除成功」)

**错误**:400 版本号格式应为 X.Y.Z;404 版本不存在。

---

## 14. 附注与注意事项

1. **路由别名**
   - `POST /auth/bind-partner` ≡ `POST /auth/bind-invite`(同一处理函数,功能完全相同)。
2. **无分页的接口**
   - `GET /transactions`、`GET /transactions/partner` 无分页参数,一次性返回区间内全部账单;数据量大时客户端需自行控制 `month`/日期区间粒度。
3. **budget 无删除接口**
   - `DELETE /budget/{id}` 不存在;如需删除预算,可调用 `PUT` 将 `monthly_limit` 置 0(当前实现不支持置 0,因 `monthly_limit > 0` 校验;需与后端确认删除方案)。
4. **金额精度**
   - 所有金额字段在后端以 `Numeric(12,2)` 存储,响应统一转为 `number`(float);客户端展示时注意浮点精度,建议按分计算或做四舍五入。
5. **管理员判定**
   - 管理员由环境变量 `CIRCLE_CREATOR_USERNAME` 决定(默认空 = 无管理员);`is_admin` 字段在 `User` 与 `/api/v1/users` 中均有返回,客户端可据此控制入口显隐,但**权限强校验始终在后端**。
6. **创始用户注册**
   - `reg_invite_code` 传 `FOUNDER_INVITE_CODE`(默认 `NEOBEE2025`)且系统无任何用户时,注册为创始用户(无邀请人);已有用户后该码失效。
7. **CORS**
   - 允许的来源包括生产域名、`capacitor://localhost`、`ionic://localhost`、`localhost`/`127.0.0.1` 各端口(见 `main.py`),React Native 原生请求不受 CORS 限制,但 Web 调试页面需在上述来源内。
8. **GZip**
   - 全局启用 GZip 中间件(`minimum_size=1024`),大响应(如账单列表、圈子帖子)自动压缩,客户端无需额外处理。
9. **统一错误处理**
   - 未捕获异常统一返回 500「服务器内部错误」;Pydantic 校验失败返回 422,`message` 为第一条错误信息(英文,来自 Pydantic),建议客户端对 422 做通用表单提示。
10. **管理员直建圈子不自动入会**
    - `POST /api/v1/circles` 只创建圈子记录,不写入 `circle_members`;创建者需通过邀请码加入才能获得成员身份(详见 11.1 附注)。

---

## 15. 验证方式

本文档为**代码静态分析**产出,逐接口与 `routers/*.py`、`schemas/*.py`、`core/*.py` 比对核实:

- 每个 endpoint 的路径、方法、鉴权要求取自各 router 的 `@router.*` 装饰器与 `Depends(get_current_user)`/`_require_admin`;
- 请求体字段与约束取自对应 Pydantic schema(`schemas/*.py`);
- 响应字段取自各路由函数的 `_serialize_*` 序列化器与实际返回字典;
- 抽查示例:`GET /transactions` 的响应字段(`id/user_id/amount/type/category/note/date/created_at`)与 `transactions.py` 第 53-63 行 `_serialize_transaction` 一致;`POST /api/v1/circles/{id}/posts` 的 `comments_preview` 为最新 3 条评论、`my_score` 为用户本人评分,与 `circles.py` `_build_post_payloads`(第 217-281 行)一致;`GET /budget` 的 `items` 合并逻辑与 `budget.py` 第 78-102 行一致。

> 建议后续用真实环境做一次冒烟验证(注册 → 登录 → 记一笔账 → 查月度统计 → 创建圈子流程),以确认运行时行为与本文档一致。
