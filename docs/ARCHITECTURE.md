# JSON Map View — 架构设计

## 1. 概述

**JSON Map View**（npm 包名 `json-map-view`）是一个在浏览器中运行的纯前端单页应用（SPA）。用户通过本地文件选择加载 **JSON 地图**（`json_map` 命名规则）、**Layer 导出 JSON**（`*layer_data.json`）与 **TUM 轨迹文本**，应用将数据解析为统一的内部**场景图**（`SceneNode` 树），再用 **React Three Fiber** 在 3D 视口中绘制。项目同时提供独立的 **TUM EVO** 评估页面，用于对真值/测试轨迹进行文档化分析与 APE 统计。

- **无后端**：数据仅通过 `File` API 读入并在客户端 `JSON.parse`，不上传服务器。
- **典型用途**：泊车 / HD Map 类 JSON 的结构化可视化、与 TUM 轨迹对齐查看、属性检查与区域筛选。

---

## 2. 技术栈


| 类别  | 选型                                                | 说明                          |
| --- | ------------------------------------------------- | --------------------------- |
| 语言  | TypeScript                                        | 严格类型，配合 `tsc -b` 与 Vite 构建  |
| 框架  | React 18                                          | UI 与 R3F 宿主                 |
| 构建  | Vite 6                                            | 开发服务器、生产打包；`@/` → `src/` 别名 |
| 3D  | Three.js + @react-three/fiber + @react-three/drei | 场景、相机、轨道控制、网格、线条与文字等        |
| 状态  | Zustand                                           | 全局编辑器状态，避免面板与画布间层层传参        |
| 布局  | react-resizable-panels                            | 可拖拽分栏，持久化 `autoSaveId`      |


静态资源 **base URL**：在 CI（如 GitHub Actions）中若存在环境变量 `GITHUB_REPOSITORY`（形如 `owner/repo`），则 `vite.config.ts` 将 `base` 设为 `/仓库名/`，以适配 GitHub Pages 项目站点的子路径；本地开发默认为 `/`。

---

## 3. 分层架构

```mermaid
flowchart TB
  UI[React UI Panels Toolbar]
  Store[Zustand useEditorStore]
  Adapters[adapters jsonToScene mapJsonToScene layerDataToScene]
  Scene[scene buildSceneTree types graphUtils]
  R3F[Viewport3D R3F Three.js]
  UI --> Store
  Store --> Adapters
  Adapters --> Scene
  Store --> R3F
  Scene --> R3F
```




| 层级       | 职责                                              | 主要位置                                                                    |
| -------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| **表现层**  | 顶栏「加载数据」菜单、场景树、已加载文件列表、3D 视口、属性/区域面板，以及 TUM EVO 文档评估页；Godot 风格主题 | `src/App.tsx`、`src/components/*.tsx`（含 `Toolbar`、`TumEvoPage`、`TumEvoTrajectoryPresentation`、`InteractiveTimeSeriesChart`、`JsonMapDuplicateNotice`、`LayerDataDuplicateNotice`）、`src/styles/godot-theme.css` |
| **状态层**  | 文档列表、TUM 轨迹、合并后的场景根、选中节点、隐藏集合、区域筛选、相机对焦请求、**距离/角度测量开关与测量点状态**、加载错误、Json 地图 / Layer 重复加载提示等；TUM EVO 页内采用组件内局部状态管理 | `src/store/useEditorStore.ts`、`src/components/TumEvoPage.tsx` |
| **适配层**  | JSON → `SceneNode`：HD Map、Layer 导出、通用有界递归 | `src/adapters/jsonToScene.ts`、`mapJsonToScene.ts`、`layerDataToScene.ts` |
| **场景模型** | `SceneNode` 类型、合并多文件、图遍历工具                      | `src/scene/types.ts`、`buildSceneTree.ts`、`graphUtils.ts`、`constants.ts` |
| **渲染层**  | 将 `SceneNode` 映射为 Three.js 对象、拾取、选中高亮、相机同步、视口工具栏与距离/角度测量      | `src/components/Viewport3D.tsx`、`ViewportMeasureTool.tsx`、`CameraFocusSync.tsx` |


---

## 4. 目录与模块说明


| 路径                               | 作用                                                          |
| -------------------------------- | ----------------------------------------------------------- |
| `src/main.tsx`                   | 挂载 React 根节点，引入全局样式                                         |
| `src/App.tsx`                    | 根布局：顶栏 + 左（场景树 / 已加载文件）+ 中（3D 视口）+ 右（属性）                    |
| `src/store/useEditorStore.ts`    | 加载/移除文档与轨迹、构建 `sceneGraphRoot`、选择、可见性、区域筛选等                 |
| `src/adapters/jsonToScene.ts`    | 入口：HD Map → `mapJsonToScene`；Layer 根 → `layerDataToScene`；否则有界深度递归占位树 |
| `src/adapters/mapJsonToScene.ts` | 地图 JSON 各图层解析、车体系坐标到 Three.js 的变换 |
| `src/adapters/layerDataToScene.ts` | Layer 导出（`all_boundary_pts` / `all_lane_line_pts` / `center_nodes`）→ 点云与图边等节点 |
| `src/scene/buildSceneTree.ts`    | 多 JSON 文档 + TUM 合并为单一 `场景` 根；`json_map` 与 `*layer_data.json` 共用同一网格槽位，其余文件各占一格 |
| `src/scene/graphUtils.ts`        | 按 id 查找节点、路径、文档归属等                                          |
| `src/scene/regionMap.ts`         | `regionList` 提取与 `regionID` → 节点 id 映射（用于区域筛选）              |
| `src/utils/jsonMapFile.ts`       | `isJsonMapFileName`：`.json` 且基名中含 `json_map` 词元（排除 `json_mapper` 等） |
| `src/utils/layerDataFile.ts`     | `isLayerDataJsonFileName`：文件名以 `layer_data.json` 结尾 |
| `src/utils/tumTrajectory.ts`     | TUM 格式轨迹解析                                                  |
| `src/utils/tumEvoViz.ts`         | TUM EVO 对齐后时序数据（位置/姿态/速度）构建与姿态换算              |
| `src/utils/tumEvoApe.ts`         | APE 匹配帧构建、误差统计（max/mean/median/min/rmse/sse/std） |
| `src/utils/roadLinkColors.ts`    | `road_links` 等线条配色                                          |
| `src/utils/measurePick.ts` | 测距用射线拾取：优先场景交点，否则 **y=0** 平面；跳过背景网格与地图坐标轴子树（`userData.nodeId`） |

### 视口轨道控制与测量模块

- **轨道**：`Viewport3D.tsx` 内 `OrbitControls` 的 `mouseButtons` 为左键与中键旋转、右键平移；**滚轮**为缩放（`enableZoom`）。
- **测量**：右下角悬浮 `ViewportToolbarFab` 可切换距离测量与角度测量（互斥）；逻辑与绘制在 `ViewportMeasureTool.tsx`，拾取在 `measurePick.ts`；store 字段见 `useEditorStore` 中 `measureDistanceToolActive`、`measureDistancePointA/B`、`measureAngleToolActive`、`measureAnglePointA/B/C`。

### TUM EVO 文档评估模块

- **页面容器**：`TumEvoPage.tsx` 负责双轨迹加载、基础校验、确认对比与文档壳层（正文 + 目录）。
- **可视化与评估展示**：`TumEvoTrajectoryPresentation.tsx` 负责章节化内容渲染（3D 轨迹、位置、RPY、速度、APE 表与时序图）。
- **图表组件**：`InteractiveTimeSeriesChart.tsx` 提供统一时序图能力（内联图、弹层放大、缩放/平移、复制/保存图片）。
- **计算链路**：`tumTrajectory.ts` 负责解析，`tumEvoViz.ts` 负责对齐与时序派生量，`tumEvoApe.ts` 负责 APE 统计分析。

---

## 5. 数据流（简述）

1. **加载 JSON**：`File` → 文本 → `JSON.parse` → `parseJsonFileToSceneNodes`（先 Map、再 Layer 根判定、否则通用树）→ 单文档 `SceneNode` 子树；地图类可选提取 `regionList` 与构建 `regionIdToNodeIds`。Store 中 **Json地图** / **Layer数据** 两条入口分别用 `isJsonMapFileName` / `isLayerDataJsonFileName` 过滤文件名，并各自限制全局唯一实例。
2. **合并场景**：`buildSceneGraphRoot` 为每个 JSON 文档生成 `type: "json"` 包装节点，并可选追加 `轨迹` 分组（TUM 折线）。
3. **UI 与画布**：`sceneGraphRoot` 驱动场景树与 `Viewport3D`；选中 id 与 Three 对象 `userData.nodeId` 一致，便于射线拾取与属性面板同步。
4. **场景树选中**：若需相机对准该节点包围盒，通过 `cameraFocusRequest` + `CameraFocusSync` 更新轨道控制器目标。
5. **距离/角度测量**：测量状态存于 store（距离：`measureDistanceToolActive` / `measureDistancePointA/B`；角度：`measureAngleToolActive` / `measureAnglePointA/B/C`）；`ViewportMeasureTool` 在画布内绘制线段、标记与标签，在 `canvas` 上使用捕获阶段 `pointerdown` 取点并调用 `pickMeasurePointWorld`；测量左键不与「单击空白清选中」冲突（`onPointerMissed` 在任一测量模式下不调用 `clearSelection`）。背景网格与地图坐标轴根组带有 `userData.nodeId`（`SCENE_BACKGROUND_GRID_NODE_ID` / `MAP_FRAME_AXES_NODE_ID`），拾取时跳过。

---

## 6. 核心类型：`SceneNode`

定义见 `src/scene/types.ts`。节点类型包括：`root`、`json`（单文件容器）、`group`、`mesh`、`polyline`、`parkingSlot`、`pillar` 等。`payload` 承载与业务/Inspector 相关的键值，供右侧面板展示；几何常用 `transform` 与 `polylinePoints`（Y-up 场景空间）。

---

## 7. HD Map JSON、Layer 导出与坐标系

### HD Map

- **识别**：`mapJsonToScene.ts` 中 `isMapJsonRoot` 根据根对象是否包含若干已知数组字段（如 `arrows`、`laneLines`、`road_links`、`regionList` 等）判断是否为地图 JSON。
- **坐标映射**：文件坐标约定为车体系 x 前、y 左、z 上；Three.js 为 Y-up 时映射为：**场景 X = 文件 x，场景 Y = 文件 z，场景 Z = -文件 y**（避免左右镜像并保持与视口一致）。详见 `mapJsonPointToThree` / `mapJsonDirectionToThree` 注释。
- **已实现图层**（节选）：箭头填充、车道线、减速带/斑马线端点矩形、停车位、立柱、`road_links` 及边界线等；具体以 `mapJsonToScene.ts` 中实现为准。
- **跳过键**（不展开为场景内容）：`header`、`trajectories`、`parkingSlotsOptimize`、`mapId`、`timestampNs`（常量 `MAP_JSON_SKIPPED_KEYS`）。
- **`road_links`（当前实现）**：
  - 场景树：`road_links` → `roadLink N` → `道路边界线 M`（叶子节点，不再展开子节点）。
  - 数据承载：单个道路边界线节点 `payload` 同时包含 `refTrajectoryPoints`、`leftBoundaryPoints`、`rightBoundaryPoints`。
  - 渲染交互：`refTrajectoryPoints` 保持原点选行为并受点渲染模式开关影响；`left/right boundary points` 仅作小球可视化，不参与点选。

### Layer 导出（`layerDataToScene.ts`）

- **识别**：`isLayerDataJsonRoot`：根对象至少包含数组字段 `all_boundary_pts`、`all_lane_line_pts`、`center_nodes` 之一。
- **坐标**：点 `{x,y,z}` 经与 HD Map 相同的 `mapJsonPointToThree` 映射到场景。
- **场景内容**：边界/车道线点云（`polyline` + `payload.role` 为 `layerDataBoundaryPointCloud` / `layerDataLanePointCloud`）、中心节点图边（`layerDataGraphEdge`）等；`Viewport3D` 与 `InspectorPanel` 按 `payload.role` 分支。`jsonToScene.ts` 中 **先** 判定 HD Map，**再** 判定 Layer，避免根对象同时含两类字段时歧义（地图优先）。

---

## 8. 关键业务规则

- **Json 地图文件唯一**：`isJsonMapFileName` 为真的文件全局仅允许一个处于已加载状态；再加载会打开 `JsonMapDuplicateNotice`，用户点 **确认** 关闭后需先在「已加载文件」中移除已有项。命名规则见 `src/utils/jsonMapFile.ts`（不是简单的「必须以 `json_map.json` 结尾」）。
- **Layer 数据文件唯一**：`isLayerDataJsonFileName`（文件名以 `layer_data.json` 结尾）同理，由 `LayerDataDuplicateNotice` 提示。
- **地图与 Layer 共槽**：`buildSceneTree` 中 `isMapOverlayPairFile` 将两类文件排在同一 XZ 网格索引，便于与 HD Map 叠显。
- **重复文件**：同一 JSON 文件以「名称 + 大小 + 最后修改时间」指纹去重；TUM 以**文件名**去重。
- **区域筛选**：`regionList` 存在时，右侧面板可对某区域点击「筛选」；视口仅绘制 `payload.regionID` 与该区域 id 匹配的节点，无 `regionID` 的节点仍始终绘制。再次点击同一「筛选」可关闭筛选。
- **`road_links` 点渲染模式作用域**：仅切换 `refTrajectoryPoints` 的线/点显示；`leftBoundaryPoints` / `rightBoundaryPoints` 不受开关影响，始终为点球显示且不可拾取。

---

## 9. 扩展建议

- **新 JSON 格式**：在 `jsonToScene.ts` 增加分支或新增 adapter，将解析结果接到 `SceneNode`；尽量保持 `SceneNode` 语义稳定，仅在需要新几何/交互时扩展 `type` 或 `payload`。
- **新几何表现**：在 `Viewport3D.tsx` 中按 `SceneNode.type`（及必要时的 `payload`）增加渲染分支。
- **地图新图层**：在 `mapJsonToScene.ts` 中扩展解析，并文档化坐标与 `payload` 字段。
- **Layer 新字段**：在 `layerDataToScene.ts` 与 `Viewport3D.tsx` / `InspectorPanel.tsx` 中扩展，保持与现有 `payload.role` 约定一致。

---

## 10. 相关文档

- [使用说明（USAGE）](./USAGE.md)
- [GitHub Pages 部署](./github-pages-deploy.md)

