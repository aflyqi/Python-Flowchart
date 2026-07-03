# Python Flowchart

[![en](https://img.shields.io/badge/lang-en-red.svg)](README.md)
[![zh](https://img.shields.io/badge/lang-zh-blue.svg)](README.zh.md)

> 中文版本 | [English Version](./README.md)

---

# Python Flowchart — 代码可视化流程图工具

将 Python 源码自动生成**可交互的流程图**（Flowchart），支持 **文件级 / 函数级 / 类级 / 项目级** 四种视图，双击 drill-down 查看内部实现，代码 ↔ 流程图**双向同步**，**双屏 Popout**，**自动跳转（Auto-Jump）**，以及丰富的右键交互。

---

## 快速开始

### 启动

```bash
# 1. 安装后端依赖
pip install -r requirements.txt

# 2. 安装前端依赖
cd frontend
NODE_ENV=development npm install

# 3. 构建前端
NODE_ENV=development npm run build

# 4. 启动服务器
cd ..
python server.py
```

打开浏览器访问 **http://localhost:8765**

### 使用

| 操作 | 效果 |
|------|------|
| 左侧粘贴代码，点击 **Parse**（或 `Ctrl+Enter`） | 生成文件级流程图 |
| 点击函数节点 | 进入该函数的内部流程图 |
| 双击函数/类节点 | drill-down 到内部流程图 |
| 右键空白 → `📍 Go to start` | 跳转到当前视图 Entry |
| 右键节点 → `📍 Find definition` | 跳转到父级结构节点（if/while） |
| 单击节点（Sync 开启时） | 代码编辑器跳转到对应行 |
| 单击代码行（Sync 开启时） | 流程图居中高亮对应节点 |
| 开启 `⏩ Jump` → 单击代码行 | 自动跳转到该行所在函数的流程图 |

---

## 功能详细介绍

### 1. 四种视图模式

| 模式 | 说明 |
|------|------|
| **File** | 显示文件顶层所有函数 + class + 语句，每个函数/class 一个可双击节点 |
| **Function** | 进入单个 function 内部，展示其完整控制流（if/for/while/try/break/continue） |
| **Class** | 双击 class 节点 → 显示类变量（串行）+ 方法（同级连接），方法可继续 drill-down |
| **Project** | 跨文件展示函数调用关系图 |

### 2. 九种节点类型

| 节点 | 颜色 | 说明 |
|------|------|------|
| Entry | 🟢 绿色 | 函数/文件入口 |
| Exit | 🔴 红色 | return / exit |
| Statement | 🔵 蓝色 | 普通语句 |
| Condition (if) | 🟡 橙色 | 分支条件 |
| Loop (for/while) | 🟢 青色 | 循环 |
| Try/Except | 🟣 紫色 | 异常处理 |
| Call | 🟣 紫色 | 函数调用（可 drill-down） |
| Break | 🟠 暗橙 | break 语句 |
| Continue | 🟡 黄 | continue 语句 |
| Comment | 🌿 深绿 | 注释/docstring（可展开/折叠） |
| Class | 🟤 深紫 | class 节点（可 drill-down） |
| GroupBox | 虚线框 | 结构分组 / 块分组 |

### 3. 控制流逻辑

- **break** → 边指向循环外的第一个节点（正确退出循环）
- **continue** → 边指回循环头（for/while 开始处）
- **if/elif/else** → True/False 分支，绿色/红色边
- **try/except** → 异常边（橙色）
- **loop back** → 循环回边（青色虚线动画，可关闭）

### 4. 交互功能

#### 🔗 Sync（双向同步）

Toggle 开关（默认关闭）。开启后：
- **点击流程图节点** → 代码编辑器跳转到对应行
- **点击/移动代码编辑器光标** → 流程图居中高亮对应节点
- **单击 = 同步 / 双击 = Drill-down** — 分离操作避免冲突

#### ⏩ Auto-Jump（自动跳转）

Toggle 开关（默认关闭，橙色）。开启后：
- 点击代码行 → 如果该行不在当前 Flowchart 视图中 → 自动找到包含该行的函数 → 跳转到该函数的流程图并居中高亮节点
- **Case 1**: 行不在当前视图 → 自动跳转到目标函数
- **Case 2**: 行已在当前视图 → 仅居中高亮（不跳转）

**Depth（查找深度）**：数字选择器（1-10，+/-调整）。控制向上查找的层级数。

#### 🗺️ Map（缩略图）

Toggle 开关（默认开启）。右下角的 React Flow MiniMap，显示全局鸟瞰图。

#### 🐜 Anim（蚂蚁线动画）

Toggle 开关（默认开启）。关闭后循环回边的虚线动画停止，大型流程图更流畅。

#### 📦 Struct / Chunks（分组开关）

- **Struct Groups**: 结构化节点（while/for/if/try）的 body 以虚线方框包裹，子节点在框内
- **Chunk Groups**: 连续同类型语句自动合并为块
- dagre `{ compound: true }` + `g.setParent()` 保持子节点在块内

#### ⇱ Popout（双屏弹出）

- 点击按钮 → 弹出独立窗口，包含完整右侧面板（ControlPanel + FlowCanvas + 所有按钮）
- 主窗口**只显示代码编辑器**
- 关闭 Popout 窗口 → 主窗口自动恢复左右布局
- **Sync 跨窗口联动**：主窗口光标 → Popout 高亮；Popout 点击节点 → 主窗口跳转代码行
- 所有操作通过 `postMessage` 回传主窗口执行（唯一数据源架构）

#### 🔍 Inspect

右键有 inspect 数据的节点（return、call 等）→ 弹出窗口显示结构化内容（dict/list/参数），由后端 `_extract_inspect()` 递归提取 AST 值。

#### 📸 Export PNG

导出当前 Flowchart 为 PNG 图片。

#### 右键上下文菜单

| 操作 | 适用对象 |
|------|----------|
| 📖 Expand / 📕 Collapse | 注释节点 |
| View block | while/for/if/try 节点 → 隔离显示块内内容 |
| 🔍 View method | 类方法节点 |
| 🔍 Inspect value | return/call 等有 inspect 数据的节点 |
| 📍 Find definition | 任意节点 → 跳转到父级结构（if/while） |
| 📍 Go to start | 空白背景 → 跳转到 Entry |

### 5. 缩放与视角

- 所有导航操作（Sync、Go to start、Find definition、隔离视图）使用 `setCenter(x, y, { zoom })`，**保持用户当前缩放倍率**
- 初次加载时 fitView 一次，后续操作不重置缩放
- React Flow Controls（缩放/锁定/fit 按钮）已暗色风格化

---

## 技术栈

### 前端

| 技术 | 用途 |
|------|------|
| **React 18** | 组件框架 |
| **TypeScript** | 类型安全 |
| **React Flow (@xyflow/react)** | 流程图渲染 + dagre 布局 + MiniMap + Controls |
| **Monaco Editor (@monaco-editor/react)** | 代码编辑器（VS Code 引擎） |
| **Vite** | 前端构建工具 |
| **dagre** | 有向图自动布局算法（DAG 分层排列） |
| **html-to-image** | 导出 PNG |

### 后端

| 技术 | 用途 |
|------|------|
| **Python 3.13+** | 运行环境 |
| **FastAPI** | REST API 框架 |
| **UVicorn** | ASGI 服务器 |
| **Python AST (ast)** | 源码静态分析（标准库） |
| **tokenize** | 注释提取（标准库） |

---

## 项目结构

![架构图](./assets/architecture.png)

```
E:\Coding\Test\Paint/
├── parser/
│   ├── __init__.py
│   └── ast_parser.py        # AST 解析器核心 (~1400 行)
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx          # React 入口
│   │   ├── App.tsx           # 主组件 (~740 行)
│   │   ├── App.css           # 暗色主题样式
│   │   ├── types.ts          # TypeScript 类型定义
│   │   ├── api.ts            # API 调用层
│   │   ├── popout-sync.ts    # Popout 跨窗口通信
│   │   ├── components/
│   │   │   ├── FlowCanvas.tsx    # 流程图渲染 (~780 行)
│   │   │   ├── CustomNodes.tsx   # 自定义节点组件
│   │   │   ├── CodeEditor.tsx    # Monaco 编辑器封装
│   │   │   └── ControlPanel.tsx  # 控制面板 (~440 行)
│   │   └── vite-env.d.ts
│   ├── dist/                 # 构建产物 (ignored)
│   └── node_modules/         # (ignored)
├── server.py                 # FastAPI 服务器 (~120 行)
├── requirements.txt
├── start.sh / start.bat      # 启动脚本
├── .gitignore
├── README.md                 # 英文版本
├── README.zh.md              # 中文版本
└── README.md
```

---

## 依赖

### 后端 (requirements.txt)

| 包 | 用途 |
|---|------|
| fastapi | Web API 框架 |
| uvicorn | ASGI 服务器 |
| pydantic | 请求/响应模型验证 |

### 前端 (package.json)

| 包 | 用途 |
|---|------|
| react, react-dom | UI 框架 |
| @xyflow/react | 流程图引擎（React Flow） |
| @monaco-editor/react | 代码编辑器 |
| dagre | 有向图自动布局 |
| typescript | 类型检查 |
| vite | 构建工具 |
| html-to-image | 导出 PNG |
| @vitejs/plugin-react | Vite React 支持 |

### 标准库（无外部依赖）

| 模块 | 用途 |
|------|------|
| ast | Python 抽象语法树解析 |
| tokenize | 源码词法分析（注释提取） |
| json | 数据序列化 |
| typing | 类型注解 |
| tempfile | 临时文件（用于测试） |

---

## 核心解析器架构 (ast_parser.py)

### 多遍扫描

1. **第一遍 — `_collect_definitions`**：`ast.walk()` 收集所有函数和类定义，记录 `name`, `lineno`, `end_lineno`, `ast_node`
2. **第二遍 — `parse_source`**：遍历顶层语句，构建文件级流程图
3. **第三遍 — `parse_function` / `parse_class`**：根据需求深入 function/class 内部构建流程图

### `_visit_block` 流式构建

```
results = []
for stmt in body:
    entry, exits = _visit_with_comments(stmt)
    results.append((entry, exits))

# 链式连接（跳过 break/continue 的后续连接）
for i, (entry, exits) in enumerate(results):
    if not _is_break_or_continue(entry):
        for exit_id in previous_exits:
            add_edge(exit_id, entry)
```

- 每个语句返回 `(first_node_id, exit_node_ids)`
- 前一个语句的 `exit_node_ids` 连接到后一个语句的 `first_node_id`
- **break/continue** 单独收集：break→循环外部，continue→循环头
- **循环回边**：body 的正常 exit 连接到循环头

### 分组 (`_start_block` / `_end_block`)

```
_start_block("while", "while body")
body_first, body_exits = _visit_block(stmt.body)
_end_block()
```

- 所有 block 始终被标记 `blockId`（层级化：`block_0_1` → `block_0`）
- 前端控制是否渲染视觉分组框
- dagre `compound: true` + `g.setParent()` 保持子节点在父框内

### 注释提取

- 使用 `tokenize` 模块解析注释 token
- 连续单行注释合并为块
- docstring 通过 `ast.Expr(ast.Constant)` 检测，跳过重复解析
- 函数级别过滤：仅显示该函数内部的注释

---

## 已知限制

- 不支持 Python 3.7 以下版本（缺少 `end_lineno`）
- 不支持动态执行：仅静态 AST 分析，不运行代码
- 不支持 import / module 级别的跨文件分析
- 大型代码（500+ 节点）性能受 React Flow 渲染和 dagre 布局开销影响
- Search Depth（auto-jump 的层级查找）仅支持函数级跳转，尚未实现 for/while 嵌套结构层级 Entry

---

## 开发说明

### 前端构建

```bash
cd frontend
export NODE_ENV=development
npm run build        # 完整构建
npm run typecheck    # TypeScript 类型检查
npm run dev          # Vite 开发模式 (watch)
```

### Windows 注意

- 使用 `bash` (git-bash / MSYS)，非 PowerShell
- 必须显式 `export NODE_ENV=development`
- 路径：`/e/Coding/Test/Paint` 或 `E:\Coding\Test\Paint`

### 服务器

```bash
python server.py
# 监听 http://0.0.0.0:8765
```

---

## License

MIT
