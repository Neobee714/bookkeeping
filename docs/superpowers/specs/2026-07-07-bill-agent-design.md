# 账单 AI Agent 设计规格

日期: 2026-07-07

## 概述

新增一个聊天式账单 AI Agent。用户可以用自然语言询问开销分析和账单明细，例如“总结最近六个月的开销”“去年我和伴侣总共花了多少”“列出最近三个月餐饮超过 100 的账单”。

第一版使用 LangGraph 编排 Agent，使用 LangChain 封装 DeepSeek Chat 模型和工具。账单数据不做 RAG，不使用向量检索；所有账单查询都通过后端受控 ORM 工具完成，保证金额、日期、分类和权限判断准确。

## 技术决策

1. **Agent 框架**: 使用 LangGraph 编排模型和工具调用流程。
2. **模型接入**: 使用 DeepSeek OpenAI-compatible Chat API，通过 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL` 配置。
3. **工具边界**: 不让模型直接执行 SQL，不开放任意 `user_id` 参数，只开放白名单账单工具。
4. **数据检索方式**: 账单查询走 SQLAlchemy ORM 聚合和筛选，不做 RAG。
5. **聊天记录**: 第一版只在前端页面内临时保存，刷新后丢失；后端不新增会话表。
6. **权限范围**: Agent 只能查询当前登录用户本人、已绑定伴侣、或两人合计的数据。

## 用户能力

Agent 支持两类问题:

1. **分析型问题**
   - 最近六个月开销总结
   - 去年哪类花得最多
   - 我和伴侣今年总支出对比
   - 本月相比上月支出变化

2. **明细型问题**
   - 列出去年 12 月餐饮超过 100 的账单
   - 最近三个月买奶茶花了多少
   - 她去年购物花得最多的前 10 笔
   - 我和伴侣本月最大的一笔支出是什么

## 后端

### 依赖

在 `backend/requirements.txt` 中新增:

```
langchain
langchain-openai
langgraph
```

DeepSeek 兼容 OpenAI Chat Completions 接口，因此优先用 `langchain-openai` 的 Chat 模型客户端设置自定义 `base_url`。

### 配置

在 `backend/app/core/config.py` 中新增:

```
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"
AGENT_MAX_HISTORY_MESSAGES = 12
AGENT_TRANSACTION_RESULT_LIMIT = 50
```

`DEEPSEEK_API_KEY` 未配置时，`/agent/chat` 返回友好错误，不触发模型调用。
后端只使用最近 `AGENT_MAX_HISTORY_MESSAGES` 条历史消息参与模型上下文，避免前端页面停留过久导致请求过大。

### API

新增 `backend/app/routers/agent.py`，注册到 `main.py`。

```
POST /agent/chat
```

请求:

```json
{
  "message": "总结我最近六个月的开销",
  "history": [
    {"role": "user", "content": "上个月餐饮呢？"},
    {"role": "assistant", "content": "上个月餐饮支出..."}
  ]
}
```

响应:

```json
{
  "success": true,
  "data": {
    "reply": "最近六个月你总支出...",
    "tool_calls": [
      {"name": "summarize_expenses", "target": "self"}
    ]
  },
  "message": ""
}
```

### 权限模型

工具参数中的 `target` 只允许:

| target | 查询范围 |
|--------|----------|
| `self` | 当前登录用户 |
| `partner` | 当前用户绑定的伴侣 |
| `both` | 当前用户和绑定伴侣合计 |

后端根据 `current_user` 解析允许的用户 ID。工具不接受任意用户 ID。没有绑定伴侣时，请求 `partner` 或 `both` 返回可解释的业务错误。

### Agent 工具

工具统一放在 `backend/app/agent/tools.py`，只接收业务参数和当前用户上下文。

#### `summarize_expenses`

参数:

```
target: self | partner | both
start_date: YYYY-MM-DD
end_date: YYYY-MM-DD
```

返回:

- 总收入
- 总支出
- 结余
- 账单笔数
- 分类支出排行
- 备注支出 Top 项

#### `category_breakdown`

参数:

```
target: self | partner | both
start_date: YYYY-MM-DD
end_date: YYYY-MM-DD
```

返回分类维度的支出金额、笔数和占比。

#### `search_transactions`

参数:

```
target: self | partner | both
start_date: YYYY-MM-DD
end_date: YYYY-MM-DD
category?: string
note_keyword?: string
min_amount?: number
max_amount?: number
limit?: number
```

返回匹配账单列表。`limit` 最大值受 `AGENT_TRANSACTION_RESULT_LIMIT` 限制。

#### `top_expenses`

参数:

```
target: self | partner | both
start_date: YYYY-MM-DD
end_date: YYYY-MM-DD
limit?: number
```

返回金额最高的支出明细。

#### `compare_expenses`

参数:

```
target: self | partner | both
start_date_a: YYYY-MM-DD
end_date_a: YYYY-MM-DD
start_date_b: YYYY-MM-DD
end_date_b: YYYY-MM-DD
```

返回两个时间段的收入、支出、结余、分类变化和主要差异。

### 日期解析

第一版让模型负责把自然语言时间转换为工具参数，但系统提示中必须明确:

- 所有工具日期使用 `YYYY-MM-DD`
- `end_date` 使用开区间语义，即查询 `start_date <= date < end_date`
- 当前日期按服务器日期计算
- 常见表达支持: 最近六个月、去年、今年、本月、上月、某年某月

如果模型无法确定时间范围，应先向用户追问，而不是猜测。

### 回答约束

系统提示要求 Agent:

- 只根据工具返回的数据回答账单事实
- 不编造不存在的账单、金额、分类或日期
- 明细型问题返回最多必要条数，并说明是否因上限被截断
- 空结果时明确说没有找到相关账单
- 涉及伴侣时用“伴侣”或用户昵称，不暴露内部 ID
- 不提供投资、医疗、法律等高风险建议

## 前端

### 新增页面

新增 `frontend/src/pages/AgentPage.tsx`，在 `/app/agent` 路由展示聊天界面。

页面包含:

- 消息列表
- 输入框
- 发送按钮
- 加载状态
- 错误提示
- 示例问题快捷按钮

聊天历史保存在页面 state 中，刷新即丢失。

### API

新增 `frontend/src/api/agent.ts`:

```
sendAgentMessage(message, history)
```

遵循现有 `ApiResponse<T>` 和 `assertSuccess` 风格。

### 类型

在 `frontend/src/types/index.ts` 新增:

```
AgentChatMessage
AgentChatRequest
AgentChatResponse
AgentToolCallSummary
```

### 导航

在用户主布局中新增 AI 入口。具体位置跟随现有 `Layout` 底部导航样式，名称使用“AI”或“助手”。

## 文件范围

### 后端新增

- `backend/app/routers/agent.py`
- `backend/app/schemas/agent.py`
- `backend/app/agent/__init__.py`
- `backend/app/agent/graph.py`
- `backend/app/agent/prompts.py`
- `backend/app/agent/tools.py`

### 后端修改

- `backend/requirements.txt`
- `backend/app/core/config.py`
- `backend/app/main.py`

### 前端新增

- `frontend/src/api/agent.ts`
- `frontend/src/pages/AgentPage.tsx`

### 前端修改

- `frontend/src/types/index.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/Layout.tsx`

## 不包含

- 不做 RAG 或向量数据库
- 不新增长期聊天记录表
- 不让 Agent 直接执行 SQL
- 不支持查询当前用户和已绑定伴侣之外的人
- 不做后台定时自动总结
- 不做语音输入

## 验证标准

1. 后端: `DEEPSEEK_API_KEY` 未配置时，`POST /agent/chat` 返回友好错误。
2. 后端: Agent 工具不能传入任意 `user_id`。
3. 后端: 没有绑定伴侣时，`partner` 和 `both` 查询返回业务错误。
4. 后端: `self` 只能查询当前登录用户账单。
5. 后端: `partner` 只能查询当前登录用户绑定伴侣账单。
6. 后端: `both` 只合并当前用户和绑定伴侣账单。
7. 后端: 明细查询结果受最大条数限制。
8. 后端: 空结果不会编造回答。
9. 前端: 聊天页可以发送消息、展示回复、展示加载和错误状态。
10. 前端: 页面刷新后聊天历史清空。
11. 前端: TypeScript 构建通过。
