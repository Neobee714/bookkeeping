# v0.12 架构：分类刷新与弹层滚动

- 创建时间：2026-10-25 23:21

## 1. 分类刷新链路

```
分类管理（新增/编辑/删除）
  → fetchCategories()
  → setCategories(list)
  → writeCache(bk.cache.v1.<userId>.categories, list)

回到首页
  → useFocusEffect → loadCategories()
      → 先读缓存立即渲染
      → 在线时 fetchCategories() 覆盖并写缓存

打开记一笔
  → visible=true → loadCategories()
      → 先读缓存渲染
      → 在线时 fetchCategories() 覆盖并写缓存
```

关键改动：

- `AddTransactionSheet`：去掉 `categoriesLoaded` 一次性门闩；每次 `visible` 变 true
  都执行 `loadCategories()`，缓存优先、网络覆盖。
- `HomeScreen`：`useEffect` 改为 `useFocusEffect`，从分类管理返回时重新拉分类。
- `CategoryScreen`：`load()` 拉到列表后写回同一个缓存 key。

请求频率：只在「首页获得焦点」和「弹层打开」时各一次；弹层内选择分类只做本地过滤，
不会重复请求。

## 2. 弹层滚动与键盘

```
Modal
└── overlay (flex:1, justifyContent:flex-end)
    ├── backdrop (absolute)
    └── KeyboardAvoidingView (flex:1; iOS padding / Android height)
        └── sheet (maxHeight:92%, flexShrink:1)
            ├── handle / head
            └── ScrollView (flexShrink:1)
                ├── 收支 / 金额 / 备注 / 日期 / 分类宫格
                └── 保存按钮
```

- `sheetWrap` 加 `flex:1`：`sheet` 的 `maxHeight: 92%` 有明确的父高度。
- `sheet` / `ScrollView` 加 `flexShrink:1`：内容超过上限时 ScrollView 成为可滚动区域，
  而不是把整个弹层撑出屏幕。
- Android `KeyboardAvoidingView` 改为 `behavior="height"`：键盘弹出时弹层缩短，
  滚动区域位于键盘上方；iOS 保持 `padding`。
- 分类加载中且已有缓存时不再显示整块 spinner，避免每次打开闪一下。

## 3. 影响面

- `AddTransactionSheet.tsx`、`HomeScreen.tsx`、`CategoryScreen.tsx`；
- 不改 API、后端、缓存 key 与版本；
- 其他弹层（预算/分类表单）暂不动，若出现同类问题再按此模式处理。
