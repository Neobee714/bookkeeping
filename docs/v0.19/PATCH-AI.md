# 2.9.0 AI 助手修复：并行工具调用与金额算式

## 现象

用户一次贴入 10 笔账单让「小光」记账：

- 前 7 笔陆续落库，随后 AI 回复「AI 助手暂时不可用」；
- 剩下的 3 笔由用户在 App 里手动补录（`client_id` 存在，可区分）；
- 另有一次「萍姐火锅消费 107+129」，AI 拒绝/算不出来。

## 根因

1. **并行工具调用共用同一个 SQLAlchemy Session**。LangGraph 会把同一条 AIMessage 里的多个
   tool_call 放进线程池并行执行，而 `build_agent_tools` 里所有工具闭包共用请求级 `db` Session。
   两个 `create_transaction` 同时 `db.commit()` 时抛：

   ```
   sqlalchemy.exc.IllegalStateChangeError: Method 'commit()' can't be called here;
   method 'commit()' is already in progress ...
   ```

   该异常被 `graph.py` 的 `except Exception` 兜底成「AI 助手暂时不可用」，且**没有日志**，
   所以线上完全看不到原因。同一条事务里提交的两行 `created_at` 完全相同（2292/2293、2294/2295、
   2296/2297），也是并行共享 Session 的痕迹。

2. **金额只接受数字**。`CreateTransactionInput.amount` 是 `Decimal`，「107+129」直接进
   pydantic 校验会失败；prompt 也没有要求模型先算再填。

3. **分类写死内置枚举**。用户自建分类（小摔炮、水）不在 `CATEGORY_VALUES` 里，AI 无法使用；
   即使历史里已经有这些分类。

4. **prompt 的「今天」用容器 UTC 日期**，北京时间 00:00–08:00 会差一天。

## 修复

- `tools.py`：`_TOOL_LOCK`（进程级 `threading.Lock`）+ `_serialized_tool` 包装全部 6 个工具，
  同一时刻只有一个工具操作 Session；工具仍共用请求级 Session，事务语义不变。
- `tools.py`：`CreateTransactionInput.amount` 增加 `mode="before"` 校验器，用 `ast` 手写
  四则运算求值（不用 `eval`），`107+129` → `236`；只放行数字与 `+ - * / ( )`。
- `tools.py`：新增 `merchant` 字段并写入 `transactions.merchant`；新增 `categories_for_user()`，
  从 `categories` 表读用户分类，读不到回退内置枚举。
- `prompts.py`：分类列表改为按用户动态生成；新增「商家放 merchant、明细放 note」与
  「金额可以算」两条规则；「今天」改用 `beijing_today()`。
- `graph.py`：读取用户分类并同时传给工具与 prompt；`agent.invoke(..., config={"recursion_limit":
  AGENT_RECURSION_LIMIT})`（默认 50，一次性录入多笔时不再撞 25 步上限）；`except Exception`
  改为 `logger.exception(...)`，保留兜底文案但写完整堆栈。
- `config.py`：新增 `AGENT_RECURSION_LIMIT`（默认 50，可用环境变量覆盖）。

## 回归测试

- `test_create_transaction_input_evaluates_arithmetic_amount` / `..._rejects_garbage_amount_expression`
- `test_create_transaction_data_accepts_user_custom_category`（自定义分类 + merchant 落库）
- `test_agent_tools_serialize_parallel_create_calls`（4 线程并发调用 create，全部成功、4 行落库）
- `test_system_prompt_lists_user_categories_and_arithmetic_rule`
- 既有 `test_agent_router.py` 的 FakeAgent 补 `**_kwargs`（invoke 多了 config 参数）

验证：`backend/.venv/bin/python -m pytest -q` → 325 passed。
线上复现：在 `bookkeeping_repro` 副本库上跑同一条 10 笔消息，修复前抛
`IllegalStateChangeError`，修复后 7.1s 正常返回。
