// src/quant-core.js
// 定量数据核心逻辑（纯函数，无 DOM 依赖，浏览器与 Node 测试脚本均可复用）：
//   提示词构建（批量 / 修复 / 单题 / 分析摘要）
//   结果合并（mergeRawResults / mergeRepairedResults）
//   结果校验（validateQuantResults）
//   数据质量汇总（makeQuantQualitySummary）
//   导出文本（buildQuantCsv / buildQuantAnalysisMarkdown）
//
// 核心原则：AI 未返回的数据绝不补 0。
// 缺失数据保留 dataStatus（missing / incomplete / invalid / complete）与 dataError，
// 由页面明确提示，导出时标记为「未返回」，禁止把缺失值写成 0%。

export const QUANT_BATCH_SIZE = 10;   // 普通题每批最多 10 道
export const REPAIR_BATCH_SIZE = 5;   // 自动修复每批最多 5 道
export const MAX_REPAIR_ROUNDS = 2;   // 自动修复最多 2 轮
export const SUM_TOLERANCE = 2;       // 单选/量表/矩阵分布合计允许 ±2% 取整误差

// ===== 题型注册表（v52 统一题型架构，可扩展） =====
// category: choice/rating/matrix/input/allocation —— 决定结果结构与处理分支
// group: 界面分组；requiresOptions: 是否需要选项；resultType: 结果形态
export const QUESTION_TYPE_REGISTRY = {
  single: { label: "单选题", category: "choice", group: "选择类", requiresOptions: true, resultType: "distribution" },
  multiple: { label: "多选题", category: "choice", group: "选择类", requiresOptions: true, resultType: "distribution" },
  rank: { label: "排序题", category: "choice", group: "选择类", requiresOptions: true, resultType: "ranking" },
  scale: { label: "量表题", category: "rating", group: "评价类", requiresOptions: false, resultType: "scale" },
  nps: { label: "NPS推荐度", category: "rating", group: "评价类", requiresOptions: false, resultType: "nps" },
  matrix: { label: "矩阵打分", category: "matrix", group: "评价类", requiresOptions: false, resultType: "matrix" },
  numeric: { label: "数值题", category: "input", group: "输入类", requiresOptions: false, resultType: "numeric" },
  open: { label: "开放题", category: "input", group: "输入类", requiresOptions: false, resultType: "text" },
  allocation: { label: "定和分配题", category: "allocation", group: "分配类", requiresOptions: true, resultType: "allocation" }
};

// 题型选择器分组顺序
export const QUESTION_TYPE_GROUPS = [
  { id: "choice", label: "选择类", types: ["single", "multiple", "rank"] },
  { id: "rating", label: "评价类", types: ["scale", "nps", "matrix"] },
  { id: "input", label: "输入类", types: ["numeric", "open"] },
  { id: "allocation", label: "分配类", types: ["allocation"] }
];

export const TYPE_LABEL = Object.fromEntries(
  Object.entries(QUESTION_TYPE_REGISTRY).map(([k, v]) => [k, v.label])
);

const CHOICE_TYPES = new Set(["single", "multiple", "rank", "allocation"]);
const RATING_TYPES = new Set(["scale", "nps", "matrix"]);

export function isChoiceType(type) { return CHOICE_TYPES.has(type); }
export function isRatingType(type) { return RATING_TYPES.has(type); }

// 选项 id 生成（稳定唯一，不依赖数组下标）
let _optSeq = 0;
export function newOptionId() { return `opt_${Date.now().toString(36)}_${(_optSeq++).toString(36)}`; }

// 结构化选项列表：[{id, label}]（兼容旧的字符串 options，原地补齐 id）
export function optionsList(q) {
  const list = splitList(q.rows && (q.type === "matrix") ? q.rows : q.options);
  if (!q._optionIds) q._optionIds = [];
  return list.map((label, i) => {
    let id = q._optionIds[i];
    if (!id) {
      id = newOptionId();
      q._optionIds[i] = id;
    }
    return { id, label };
  });
}

// 老数据结构迁移：补齐 id / code / config（不改写不破坏现有字段）
export function migrateQuestionData(q, index = 0) {
  const base = { ...q };
  if (!base.id) base.id = `question_${Date.now().toString(36)}_${index}`;
  if (!base.code) base.code = base.code || `Q${index + 1}`;
  if (base.config === undefined) base.config = {};
  // 从题干/标记提取配置（导入未显式给 config 时）
  if (base.type === "rank") {
    base.config.rankMode = base.config.rankMode || "full";
    const m = String(base.text || "").match(/(?:前|出|重要的|最重要|选择|选出)\s*(\d+)\s*项|top\s*-?\s*(\d+)/i);
    const topN = Number(base.config.topN ?? (m ? (m[1] || m[2] || m[3]) : 0));
    if (topN > 0 && topN < splitList(base.options).length) {
      base.config.rankMode = "top_n";
      base.config.topN = topN;
    }
    if (base.config.rankMode === "top_n" && !base.config.topN) base.config.topN = 3;
    base.config.allowTies = !!base.config.allowTies;
  } else if (base.type === "nps") {
    base.config.min = base.config.min ?? 0;
    base.config.max = base.config.max ?? 10;
    base.config.detractorRange = base.config.detractorRange || [0, 6];
    base.config.passiveRange = base.config.passiveRange || [7, 8];
    base.config.promoterRange = base.config.promoterRange || [9, 10];
  } else if (base.type === "numeric") {
    base.config.numericType = base.config.numericType || "integer";
    base.config.min = base.config.min ?? 0;
    base.config.max = base.config.max ?? 10000;
    base.config.unit = base.config.unit || "";
    base.config.decimalPlaces = base.config.decimalPlaces ?? 0;
  } else if (base.type === "open") {
    base.config.openMode = base.config.openMode || "long_text";
    base.config.maxLength = base.config.maxLength ?? 500;
  } else if (base.type === "allocation") {
    base.config.totalPoints = base.config.totalPoints ?? 100;
    base.config.minPerOption = base.config.minPerOption ?? 0;
    base.config.maxPerOption = base.config.maxPerOption ?? base.config.totalPoints;
  }
  return base;
}

// 结构性错误（数据不完整）与数值性错误（数据无效）的类型划分
const STRUCTURAL_ERRORS = [
  "missing_result", "missing_value_array", "not_array",
  "option_count_mismatch", "scale_count_mismatch",
  "matrix_row_count_mismatch", "matrix_row_missing",
  "matrix_row_dist_missing", "matrix_row_dist_mismatch",
  "rank_items_missing", "rank_item_missing", "rank_item_mismatch",
  "rank_dist_mismatch", "nps_dist_mismatch", "nps_dist_missing",
  "numeric_missing", "numeric_dist_bad", "open_themes_missing",
  "allocation_items_missing", "allocation_item_mismatch", "allocation_item_missing"
];

export function splitList(value) {
  return String(value || "")
    // 保护 "其他，请说明" / "其它，请注明" 等作为一个完整选项，不被逗号拆分
    .replace(/(其他|其它)，/g, "$1\x00")
    .split(/[,，、\n]/)
    .map((item) => item.trim().replace(/\x00/g, "，"))
    .filter(Boolean);
}

// ===== 题目结构化描述 =====

export function questionSpec(q, i) {
  const type = q.type || "single";
  const config = q.config || {};
  const isChoice = isChoiceType(type);
  const isRating = isRatingType(type);
  const scaleMax = isRating
    ? (type === "nps" ? 11 : parseInt(String(q.scale || "1-5").split("-")[1] || "5", 10))
    : null;
  const options = isChoice ? splitList(q.options) : [];
  const rows = type === "matrix" ? splitList(q.rows) : [];
  return {
    index: i,
    number: i + 1,
    type,
    text: q.text || "",
    scale: q.scale || "",
    rows: q.rows || "",
    config,
    options,
    optionCount: isChoice ? options.length : null,
    rowsList: rows,
    rowCount: type === "matrix" ? rows.length : null,
    scaleMax,
    // 排序题可排序名次数：全排序=选项数；TopN=topN
    rankCount: type === "rank"
      ? (config.rankMode === "top_n" ? Math.max(1, config.topN || 1) : Math.max(0, options.length))
      : null
  };
}

// 每题预期返回的数据项数量（用于 UI 提示与 CSV 遍历）
export function expectedCountOf(spec) {
  if (spec.type === "single" || spec.type === "multiple") return spec.optionCount;
  if (spec.type === "rank") return spec.optionCount;           // items 数量 = 选项数
  if (spec.type === "allocation") return spec.optionCount;     // items 数量 = 选项数
  if (spec.type === "scale") return spec.scaleMax;
  if (spec.type === "nps") return 11;                          // 0-10 分布
  if (spec.type === "matrix") return spec.rowCount;
  if (spec.type === "numeric") return 1;
  if (spec.type === "open") return 1;
  return 0;
}

function choiceReturnLine(spec) {
  return `{"i":${spec.index},"expectedCount":${spec.optionCount},"v":[${"数字,".repeat(spec.optionCount).replace(/,$/, "")}]}`;
}

function scaleReturnLine(spec) {
  return `{"i":${spec.index},"expectedCount":${spec.scaleMax},"dist":[${"数字,".repeat(spec.scaleMax).replace(/,$/, "")}],"mean":${"均值"},"sd":${"标准差"}}`;
}

function matrixReturnLine(spec) {
  const row = `{"m":${"均值"},"d":[${"数字,".repeat(spec.scaleMax).replace(/,$/, "")}]}`;
  return `{"i":${spec.index},"expectedCount":${spec.rowCount},"mx":[${`${row},`.repeat(spec.rowCount).replace(/,$/, "")}]}`;
}

function rankReturnLine(spec) {
  const rc = spec.rankCount;
  const item = `{"optionIndex":${"选项下标"},"avgRank":${"平均排名"},"firstPct":${"第一比例"},"top3Pct":${"前三比例"},"rankDistribution":[${"数字,".repeat(rc).replace(/,$/, "")}]}`;
  return `{"i":${spec.index},"type":"rank","rankMode":"${spec.config.rankMode}","items":[${`${item},`.repeat(spec.optionCount).replace(/,$/, "")}]${spec.config.rankMode === "top_n" ? `,"unrankedPct":${"未入前N比例"}` : ""}}`;
}

function npsReturnLine(spec) {
  return `{"i":${spec.index},"type":"nps","distribution":[${"0到10分各档占比共11个数字,".repeat(10)}最后一个数字],"promoterPct":30,"passivePct":32,"detractorPct":38,"nps":-8,"mean":6.8}`;
}

function numericReturnLine(spec) {
  const c = spec.config;
  return `{"i":${spec.index},"type":"numeric","mean":${"均值"},"median":${"中位数"},"min":${ifGt(c.min) || "最小值"},"max":${ifGt(c.max) || "最大值"},"p25":${"P25"},"p75":${"P75"},"distribution":[{"label":"分段描述","pct":18},{"label":"分段2","pct":42}]}`;
}

function ifGt(v) {
  return v !== undefined && v !== null ? `必不超出${v}` : "最小值";
}

function openReturnLine(spec) {
  return `{"i":${spec.index},"type":"open","responseCount":${"样本量"},"themes":[{"name":"主题名","pct":36,"summary":"主题摘要","quotes":["合成原声示例"]}],"otherPct":8}`;
}

function allocationReturnLine(spec) {
  const item = `{"optionIndex":${"选项下标"},"meanPoints":${"平均分配"},"medianPoints":${"中位数分配"}}`;
  return `{"i":${spec.index},"type":"allocation","totalPoints":${spec.config.totalPoints},"items":[${`${item},`.repeat(spec.optionCount).replace(/,$/, "")}]}`;
}

// 单词提示词片段：根据题型分发（新题型不与其他题型共用结构模板）
export function buildQuestionPromptFragment(q, i) {
  const spec = questionSpec(q, i);
  const type = spec.type;
  const lines = [
    `题目索引：${spec.index}`,
    `题目编号：第 ${spec.number} 题`,
    `题型：${TYPE_LABEL[type] || type}`
  ];
  const c = spec.config;
  if (type === "single" || type === "multiple") {
    lines.push(
      `选项数量：${spec.optionCount}`,
      "",
      "选项：",
      ...spec.options.map((o, j) => `${j}. ${o}`),
      "",
      `必须返回：${choiceReturnLine(spec)}`,
      "",
      "强制规则：",
      `1. v 必须恰好包含 ${spec.optionCount} 个数值；`,
      "2. v[j] 必须对应第 j 个选项；",
      "3. 不得省略尾部选项；",
      "4. 不得使用 null、空字符串或省略号；",
      "5. 每个数值必须在 0 到 100 之间；",
      "6. 即使某选项占比较低，也必须返回具体数值；",
      "7. 不允许只返回前几个选项。"
    );
  } else if (type === "rank") {
    const rc = spec.rankCount;
    lines.push(
      `选项数量：${spec.optionCount}（全部参与排序）`,
      `排序模式：${c.rankMode === "top_n" ? `仅排序前 ${c.topN} 项` : "全部排序"}`,
      `可排序名次数：${rc}`,
      "",
      "选项：",
      ...spec.options.map((o, j) => `${j}. ${o}`),
      "",
      `必须返回：${rankReturnLine(spec)}`,
      "",
      "强制规则：",
      `1. items 必须恰好包含 ${spec.optionCount} 个元素（每个选项一个），不得省略；`,
      "2. items[j].optionIndex 必须等于 j，不得重复或越界；",
      `3. avgRank 必须在 1 到 ${spec.optionCount} 之间（越小越靠前），不得虚构；`,
      "4. firstPct / top3Pct 必须在 0 到 100 之间（TopN 模式 top3Pct 表示进入前N比例）；",
      `5. 每个选项的 rankDistribution 必须恰好包含 ${rc} 个数值（各名次占比），合计须接近 100%（允许 ±2%）；`,
      "6. 同一名次位置各选项占比之和应接近 100%（全排序模式）；",
      "7. TopN 模式必须返回 unrankedPct（未进入前N的比例，0-100）；",
      "8. 不得把排序题返回成普通多选百分比。"
    );
  } else if (type === "scale") {
    lines.push(
      `量表档位数量：${spec.scaleMax}`,
      "",
      `必须返回：${scaleReturnLine(spec)}`,
      "",
      "强制规则：",
      `1. dist 必须恰好包含 ${spec.scaleMax} 个数值（每个档位一个）；`,
      "2. 不得省略尾部档位；不得使用 null、空字符串或省略号；",
      "3. 每个数值必须在 0 到 100 之间；",
      "4. dist 合计须接近 100%（允许 ±2% 取整误差）；",
      "5. 必须同时返回 mean（均值）和 sd（标准差）。"
    );
  } else if (type === "nps") {
    lines.push(
      "NPS 推荐度：0-10 分制（0=完全不会推荐，10=一定会推荐）",
      "推荐者(9-10) / 被动者(7-8) / 贬损者(0-6)",
      "",
      `必须返回：${npsReturnLine(spec)}`,
      "",
      "强制规则：",
      "1. distribution 必须恰好包含 11 个数值（对应 0到10 分，各一档）；",
      "2. 每个数值在 0 到 100 之间，distribution 合计须接近 100%（允许 ±2%）；",
      "3. promoterPct/passivePct/detractorPct 必须与 distribution 对应一致（promoter=9+10分，passive=7+8分，detractor=0-6分）；",
      "4. nps = promoterPct - detractorPct；nps 必须在 -100 到 100 之间；",
      "5. mean 为 0-10 分均值；",
      "6. 不要把 NPS 当成普通 10 分量表的均值。"
    );
  } else if (type === "matrix") {
    lines.push(
      `矩阵行数：${spec.rowCount}`,
      "矩阵行：",
      ...spec.rowsList.map((r, j) => `${j}. ${r}`),
      `量表档位数量：${spec.scaleMax}`,
      "",
      `必须返回：${matrixReturnLine(spec)}`,
      "",
      "强制规则：",
      `1. mx 必须恰好包含 ${spec.rowCount} 个元素（每行一个）；`,
      `2. 每行 d 必须恰好包含 ${spec.scaleMax} 个数值；`,
      "3. 不得省略尾部行；不得使用 null、空字符串或省略号；",
      "4. 每个数值必须在 0 到 100 之间；",
      "5. 每行 d 合计须接近 100%（允许 ±2% 取整误差）；",
      "6. 每行必须同时返回 m（均值）。"
    );
  } else if (type === "numeric") {
    lines.push(
      `数值类型：${c.numericType || "integer"}；单位：${c.unit || "无"}；小数位：${c.decimalPlaces ?? 0}`,
      `取值范围：${c.min ?? 0} 到 ${c.max ?? 10000}`,
      "",
      `必须返回：${numericReturnLine(spec)}`,
      "",
      "强制规则：",
      `1. mean/median/p25/p75/min/max 必须在 ${c.min ?? 0} 到 ${c.max ?? 10000} 之间（含边界）；`,
      "2. 数值顺序必须满足 min ≤ p25 ≤ median ≤ p75 ≤ max；",
      "3. distribution 为分段占比，每段 pct 在 0 到 100 之间；",
      "4. 不要返回伪造的完整原始样本明细；",
      "5. 单位统一按题干标注。"
    );
  } else if (type === "open") {
    lines.push(
      `开放题模式：${c.openMode === "short_text" ? "短文本" : "长文本"}；建议长度 ≤ ${c.maxLength || 500} 字`,
      `必须返回：${openReturnLine(spec)}`,
      "",
      "强制规则：",
      "1. themes 主题数量 3-8 个；",
      "2. pct 表示提及率（该主题被提及的样本比例），可合计超过 100%（开放式编码）；",
      "3. 每个主题必须包含 summary（主题摘要）与 quotes（1-2 条合成原声示例）；",
      "4. quotes 必须明确是合成的示例原声，不得伪装成真实用户逐字稿；",
      "5. otherPct 为未归类比例（0-100）；",
      "6. 不要返回百分比分布。"
    );
  } else if (type === "allocation") {
    lines.push(
      `定和分配：总分为 ${c.totalPoints}，每个选项 ≥ ${c.minPerOption ?? 0}、≤ ${c.maxPerOption ?? c.totalPoints}`,
      "把总分分配给各个购买因素，分数越高越重要。",
      "选项：",
      ...spec.options.map((o, j) => `${j}. ${o}`),
      "",
      `必须返回：${allocationReturnLine(spec)}`,
      "",
      "强制规则：",
      `1. items 必须恰好包含 ${spec.optionCount} 个元素（每个选项一个）；`,
      "2. items[j].optionIndex 必须等于 j，不得重复或越界；",
      `3. 所有 meanPoints 合计必须接近 ${c.totalPoints}（允许 ±2%）；`,
      `4. meanPoints / medianPoints 必须在 ${0} 到 ${c.totalPoints} 之间；`,
      "5. 不得把平均分配分数当成选择率。"
    );
  }
  return lines.join("\n");
}

// 兼容旧调用（questionBlock 接收 questionSpec 的返回）：单题结构化提示词块（v50 及以前）
export function questionBlock(spec) {
  return buildQuestionPromptFragment({
    text: spec.text,
    type: spec.type,
    options: Array.isArray(spec.options) ? spec.options.join(", ") : spec.options,
    rows: spec.rows,
    scale: spec.scale,
    config: spec.config || {}
  }, spec.index);
}

export function buildBatchPrompt(env, indexes) {
  const specs = indexes.map((i) => migrateQuestionData(env.questions[i], i));
  return `${buildPromptHeader(env)}
## 本次需生成数据的题目（共 ${specs.length} 道，索引与全卷一致）
${specs.map((q, k) => buildQuestionPromptFragment(q, indexes[k])).join("\n\n")}

${BATCH_OUTPUT_RULES}`;
}

// ===== 提示词构建 =====

// env = { topic, audienceConfig, quotaText, quotaPlan, sampleSize, questions }
// quotaText 为旧字段（仍兼容）；quotaPlan 为 v52 新字段（数组结构）。
// 当存在 quotaPlan 时，使用结构化文本（含人数），覆盖旧 quotaText。
export function buildPromptHeader(env) {
  const c = env.audienceConfig || {};
  const quotaText = env.quotaPlan && Array.isArray(env.quotaPlan)
    ? buildStructuredQuotaText(env.quotaPlan, env.sampleSize)
    : (env.quotaText || "（未配置配额）");
  return `你是一位资深市场研究数据分析师，擅长用定量数据模拟消费者行为。请为以下研究设计生成合理的问卷统计结果。

## 研究主题
${env.topic}

## 目标人群画像
- 年龄：${c.age}
- 性别比例：${c.gender}
- 城市层级：${c.city}
- 收入/消费力：${c.income}
- 品类行为：${c.usage}
- 价格敏感度：${c.price}
- 心理/生活方式标签：${c.lifestyle}

## 配额设计
${quotaText}

## 模拟样本量
N = ${env.sampleSize}
`;
}

// v52：根据 quotaPlan 结构化构建配额文本，包含所有启用维度与换算人数。
function buildStructuredQuotaText(quotaPlan, sampleSize) {
  const dims = (quotaPlan || []).filter((d) => d && d.enabled !== false);
  if (!dims.length) return "（未配置配额）";
  const lines = [`样本量：N=${sampleSize}`];
  dims.forEach((dim, i) => {
    const items = Array.isArray(dim.items) ? dim.items : [];
    const itemLines = items.map((it) => `- ${it.label}：${Number(it.pct) || 0}%，约 ${Math.max(0, Math.round((Number(it.pct) || 0) * sampleSize / 100))} 人`);
    lines.push(`维度${i + 1}：${dim.name}\n${itemLines.join("\n")}`);
  });
  lines.push("");
  lines.push("约束说明：");
  lines.push("1. 每个维度属于独立边际配额，生成的人群分布应尽量符合各维度比例。");
  lines.push("2. 不要只使用性别、年龄、城市三个默认维度，所有启用维度都需要满足。");
  lines.push("3. 用户新增的自定义配额同样具有约束力，不得擅自忽略占比较低的配额选项。");
  lines.push("4. 配额属于合成样本的边际分布约束，不代表各配额维度之间已经建立真实交叉样本关系。");
  return lines.join("\n");
}

const BATCH_OUTPUT_RULES = `## 输出格式
请严格按以下精简 JSON 输出（不要包含 markdown 代码块标记，直接输出 JSON；不要输出 analysis 或任何解释文字）：
{"results":[
  {"i":0,"expectedCount":4,"v":[35,27,18,12,8]},
  {"i":1,"expectedCount":5,"dist":[8,15,25,35,17],"mean":3.2,"sd":1.1},
  {"i":2,"expectedCount":3,"mx":[{"m":4.1,"d":[5,10,15,30,40]},{"m":3.5,"d":[10,15,25,30,20]}]}
]}

强制规则：
1. results 只允许包含上面列出的题目，i 必须与题目索引一致；
2. 每项的 v / dist / mx 长度必须与 expectedCount 完全一致；
3. 不得省略尾部选项；不得使用 null、空字符串或省略号；
4. 每个数值必须在 0 到 100 之间；
5. 即使某选项占比较低，也必须返回具体数值；
6. 单选 / 量表 / 矩阵分布合计须接近 100%（允许 ±2% 取整误差）；
7. 不要返回 analysis、summary、findings 或任何解释文字。`;

// 长问卷分批：只请求本批题目
// 全卷单次请求（题目数量少时的快捷入口，规则与分批一致）
export function buildQuantPrompt(env) {
  return buildBatchPrompt(env, env.questions.map((_, i) => i));
}

// 单题重新生成：只请求当前题目
export function buildSingleQuestionPrompt(env, index) {
  return buildBatchPrompt(env, [index]);
}

// 自动修复：只请求失败题目，并说明上次失败原因
export function buildQuantRepairPrompt(env, invalidItems) {
  const blocks = invalidItems.map((item) => {
    const spec = questionSpec(env.questions[item.questionIndex], item.questionIndex);
    return `【上次返回不完整/无效】${item.message || "数据不符合要求"}

${questionBlock(spec)}`;
  });
  return `${buildPromptHeader(env)}
## 需要重新生成的题目（共 ${invalidItems.length} 道）
以下题目上次返回的数据不完整或无效，请只重新生成这些题目，不要返回其他正常题目：

${blocks.join("\n\n")}

## 输出要求
1. 只输出上列指定题目的 results，i 必须与题目索引一致；
2. 每项的 v / dist / mx 长度必须与每题的 expectedCount 完全一致（本次预期数量见各题）；
3. 不要返回分析摘要、findings、rationale 或任何解释文字；
4. 其余规则与上方每题的「强制规则」一致。
输出格式与批量生成相同：{"results":[...]}`;
}

// 分析摘要：所有批次数据生成并校验后，最后单独生成
export function buildAnalysisPrompt(env, mergedQuestions) {
  const complete = mergedQuestions.filter((q) => q.dataStatus === "complete");
  const dataLines = complete.map((q) => {
    if (q.type === "scale") {
      return `第${q.index + 1}题（量表${q.scale}分）：dist=[${q.distribution.join(",")}]，mean=${q.mean}，sd=${q.sd}`;
    }
    if (q.type === "matrix") {
      return `第${q.index + 1}题（矩阵）：${q.matrix.map((r) => `${r.row} m=${r.mean} d=[${r.distribution.join(",")}]`).join("；")}`;
    }
    if (q.type === "nps") {
      return `第${q.index + 1}题（NPS推荐度）：dist=[${q.distribution.join(",")}]，NPS=${q.nps}，推荐者${q.promoterPct}%/被动者${q.passivePct}%/贬损者${q.detractorPct}%，均值${q.mean}`;
    }
    if (q.type === "rank") {
      const items = (q.items || []).map((it) => `选项${it.optionIndex} 均排${it.avgRank} 第一${it.firstPct}% 前三${it.top3Pct}%`).join("；");
      return `第${q.index + 1}题（排序题）：${q.optionsArray.map((o, j) => `选项${j}=${o}`).join("，")}；${items}`;
    }
    if (q.type === "numeric") {
      return `第${q.index + 1}题（数值题）：均值${q.mean} 中位数${q.median} 区间[${q.min},${q.max}] P25=${q.p25} P75=${q.p75} 分段=${(q.distribution || []).map((d) => `${d.label}=${d.pct}%`).join("，")}`;
    }
    if (q.type === "open") {
      return `第${q.index + 1}题（开放题）：主题=${(q.themes || []).map((t) => `${t.name}(${t.pct}%)`).join("，")} 其他=${q.otherPct}%`;
    }
    if (q.type === "allocation") {
      return `第${q.index + 1}题（定和分配题·总分${q.totalPoints}）：${(q.items || []).map((it) => `选项${it.optionIndex} 均分${it.meanPoints}`).join("；")}`;
    }
    return `第${q.index + 1}题（${q.type === "multiple" ? "多选" : "单选"}）：v=[${q.values.join(",")}]`;
  }).join("\n");
  return `${buildPromptHeader(env)}
## 已生成的有效统计数据（以下 ${complete.length} 道题数据完整；其余题目数据不完整，不要引用其数值）
${dataLines}

## 任务
基于以上统计数据生成分析摘要，严格按以下 JSON 输出（不要包含 markdown 代码块标记）：
{"analysis":{"summary":"200字以内的总结","findings":["关键发现1","关键发现2","关键发现3"],"crosstab":[["维度A","维度B描述","百分比"]],"rationale":[{"questionIndex":14,"reasoning":"该题分布说明"}]}}

要求：
1. findings 3-5 条，每条具体、有洞察，引用具体数字；
2. crosstab 2-3 组交叉分析；
3. rationale 数组：只为核心需求/行为/态度题目提供比例分布说明，最多选 10 题；
   跳过甄别题（题号以 S 开头）、背景信息题（题号以 D 开头或最后 5-6 题）、交通车辆拥有等纯客观题；
   优先选择：使用行为、痛点需求、概念购买意愿、价格敏感度、功能偏好等有业务洞察价值的题目；
   每条必须包含 questionIndex（从 0 开始，对应上述统计数据的题号）与 reasoning（80-150 字，引用该题分布的关键数字、人群画像特征和商业逻辑）；
4. 只输出 JSON，不要输出任何其他文字。`;
}

// 题目分批：矩阵题单独成批（复杂且长），普通题每批最多 batchSize 道
export function buildQuantBatches(questions, batchSize = QUANT_BATCH_SIZE) {
  const batches = [];
  let current = [];
  questions.forEach((q, i) => {
    if (q.type === "matrix") {
      if (current.length) { batches.push(current); current = []; }
      batches.push([i]);
    } else {
      current.push(i);
      if (current.length >= batchSize) { batches.push(current); current = []; }
    }
  });
  if (current.length) batches.push(current);
  return batches;
}

// ===== 结果合并（缺失不补 0） =====

function round1(n) {
  return Math.round(n * 10) / 10;
}

// 校验单个数值：非法 / 负数 / 超 100 时记录错误，但保留原值用于展示
function numericValue(v, label, errors) {
  if (v === null || v === undefined || v === "") {
    errors.push({ errorType: "invalid_number", expected: null, actual: null, message: `${label}为空` });
    return NaN;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) {
    errors.push({ errorType: "invalid_number", expected: null, actual: String(v), message: `${label}不是有效数字` });
    return NaN;
  }
  const r = round1(n);
  if (r < 0) {
    errors.push({ errorType: "negative_value", expected: "0-100", actual: r, message: `${label}为负数（${r}）` });
  } else if (r > 100) {
    errors.push({ errorType: "value_over_100", expected: "0-100", actual: r, message: `${label}超过 100（${r}）` });
  }
  return r;
}

function hasNumericError(errors, from) {
  return errors.slice(from).some((e) => ["invalid_number", "negative_value", "value_over_100"].includes(e.errorType));
}

function statusFromErrors(errors) {
  if (!errors.length) return "complete";
  const structural = errors.some((e) => STRUCTURAL_ERRORS.includes(e.errorType));
  return structural ? "incomplete" : "invalid";
}

function emptyQuestion(spec) {
  const base = {
    text: spec.text, type: spec.type, scale: spec.scale, rows: spec.rows,
    index: spec.index, expectedCount: expectedCountOf(spec),
    dataStatus: "missing",
    dataError: `AI 未返回本题数据（第 ${spec.number} 题）`,
    dataErrors: [{ errorType: "missing_result", expected: expectedCountOf(spec), actual: 0, message: `第 ${spec.number} 题未返回任何结果` }]
  };
  if (spec.type === "scale") return { ...base, optionsArray: [], distribution: [], mean: null, sd: null };
  if (spec.type === "matrix") {
    return {
      ...base, optionsArray: [],
      matrix: spec.rowsList.map((row, ri) => ({ row, mean: null, distribution: [], rowStatus: "missing", dataError: `第 ${spec.number} 题矩阵第 ${ri + 1} 行「${row}」数据缺失` }))
    };
  }
  if (spec.type === "rank") return { ...base, optionsArray: spec.options, items: [], rankMode: spec.config.rankMode, rankCount: spec.rankCount, unrankedPct: null };
  if (spec.type === "nps") return { ...base, optionsArray: [], distribution: [], promoterPct: null, passivePct: null, detractorPct: null, nps: null, mean: null };
  if (spec.type === "numeric") return { ...base, optionsArray: [], mean: null, median: null, min: null, max: null, p25: null, p75: null, distribution: [], unit: spec.config.unit || "", numericType: spec.config.numericType || "integer" };
  if (spec.type === "open") return { ...base, optionsArray: [], themes: [], otherPct: null, responseCount: null };
  if (spec.type === "allocation") return { ...base, optionsArray: spec.options, items: [], totalPoints: spec.config.totalPoints || 100 };
  return { ...base, optionsArray: spec.options, values: [] };
}

function mergeChoice(spec, r, errors) {
  const base = { optionsArray: spec.options };
  const raw = r.v !== undefined && r.v !== null ? r.v : (r.values !== undefined && r.values !== null ? r.values : null);
  if (raw === null) {
    errors.push({ errorType: "missing_value_array", expected: spec.optionCount, actual: 0, message: `第 ${spec.number} 题缺少 v 数组` });
    return { ...base, values: [] };
  }
  if (!Array.isArray(raw)) {
    errors.push({ errorType: "not_array", expected: spec.optionCount, actual: 0, message: `第 ${spec.number} 题的 v 不是数组` });
    return { ...base, values: [] };
  }
  if (raw.length !== spec.optionCount) {
    errors.push({ errorType: "option_count_mismatch", expected: spec.optionCount, actual: raw.length, message: `第 ${spec.number} 题应返回 ${spec.optionCount} 个选项数值，实际只返回 ${raw.length} 个` });
  }
  const errStart = errors.length;
  const values = raw.map((v, j) => numericValue(v, `第 ${spec.number} 题第 ${j + 1} 个选项的数值`, errors));
  // 单选合计校验（仅当长度一致且无数值错误时）
  if (spec.type === "single" && raw.length === spec.optionCount && !hasNumericError(errors, errStart)) {
    const sum = round1(values.reduce((a, b) => a + b, 0));
    if (Math.abs(sum - 100) > SUM_TOLERANCE) {
      errors.push({ errorType: "single_sum_not_100", expected: 100, actual: sum, message: `第 ${spec.number} 题单选题合计 ${sum}%，应接近 100%（允许 ±2% 取整误差）` });
    }
  }
  return { ...base, values };
}

function mergeScale(spec, r, errors) {
  const base = { optionsArray: [] };
  const raw = r.dist !== undefined && r.dist !== null ? r.dist : (r.distribution !== undefined && r.distribution !== null ? r.distribution : null);
  if (raw === null) {
    errors.push({ errorType: "missing_value_array", expected: spec.scaleMax, actual: 0, message: `第 ${spec.number} 题缺少 dist 数组` });
    return { ...base, distribution: [], mean: null, sd: null };
  }
  if (!Array.isArray(raw)) {
    errors.push({ errorType: "not_array", expected: spec.scaleMax, actual: 0, message: `第 ${spec.number} 题的 dist 不是数组` });
    return { ...base, distribution: [], mean: null, sd: null };
  }
  if (raw.length !== spec.scaleMax) {
    errors.push({ errorType: "scale_count_mismatch", expected: spec.scaleMax, actual: raw.length, message: `第 ${spec.number} 题量表应返回 ${spec.scaleMax} 个档位分布值，实际只返回 ${raw.length} 个` });
  }
  const errStart = errors.length;
  const distribution = raw.map((v, j) => numericValue(v, `第 ${spec.number} 题第 ${j + 1} 档的分布值`, errors));
  if (raw.length === spec.scaleMax && !hasNumericError(errors, errStart)) {
    const sum = round1(distribution.reduce((a, b) => a + b, 0));
    if (Math.abs(sum - 100) > SUM_TOLERANCE) {
      errors.push({ errorType: "scale_sum_not_100", expected: 100, actual: sum, message: `第 ${spec.number} 题量表分布合计 ${sum}%，应接近 100%（允许 ±2% 取整误差）` });
    }
  }
  const mean = r.mean !== undefined && r.mean !== null ? Number(r.mean) : NaN;
  const sd = r.sd !== undefined && r.sd !== null ? Number(r.sd) : NaN;
  if (!Number.isFinite(mean)) {
    errors.push({ errorType: "missing_mean", expected: "有效数字", actual: r.mean, message: `第 ${spec.number} 题量表缺少有效 mean（均值）` });
  }
  if (!Number.isFinite(sd)) {
    errors.push({ errorType: "missing_sd", expected: "有效数字", actual: r.sd, message: `第 ${spec.number} 题量表缺少有效 sd（标准差）` });
  }
  return {
    ...base, distribution,
    mean: Number.isFinite(mean) ? round1(mean) : null,
    sd: Number.isFinite(sd) ? round1(sd) : null
  };
}

function mergeMatrix(spec, r, errors) {
  const base = { optionsArray: [] };
  const mx = Array.isArray(r.mx) ? r.mx : (Array.isArray(r.matrix) ? r.matrix : null);
  if (!mx) {
    errors.push({ errorType: "matrix_row_count_mismatch", expected: spec.rowCount, actual: 0, message: `第 ${spec.number} 题矩阵缺少 mx 数组（应包含 ${spec.rowCount} 行）` });
    return { ...base, matrix: spec.rowsList.map((row, ri) => ({ row, mean: null, distribution: [], rowStatus: "missing", dataError: `第 ${spec.number} 题矩阵第 ${ri + 1} 行「${row}」数据缺失` })) };
  }
  if (mx.length !== spec.rowCount) {
    errors.push({ errorType: "matrix_row_count_mismatch", expected: spec.rowCount, actual: mx.length, message: `第 ${spec.number} 题矩阵应返回 ${spec.rowCount} 行，实际只返回 ${mx.length} 行` });
  }
  const matrix = spec.rowsList.map((rowName, ri) => {
    const row = mx[ri];
    if (!row || typeof row !== "object") {
      errors.push({ errorType: "matrix_row_missing", expected: 1, actual: 0, message: `第 ${spec.number} 题矩阵第 ${ri + 1} 行「${rowName}」未返回` });
      return { row: rowName, mean: null, distribution: [], rowStatus: "missing" };
    }
    const mean = row.m !== undefined && row.m !== null ? Number(row.m) : (row.mean !== undefined && row.mean !== null ? Number(row.mean) : NaN);
    const meanOk = Number.isFinite(mean);
    if (!meanOk) {
      errors.push({ errorType: "matrix_row_missing_mean", expected: "有效数字", actual: row.m, message: `第 ${spec.number} 题矩阵第 ${ri + 1} 行「${rowName}」缺少有效均值` });
    }
    const dRaw = row.d !== undefined && row.d !== null ? row.d : (row.distribution !== undefined && row.distribution !== null ? row.distribution : null);
    if (dRaw === null) {
      errors.push({ errorType: "matrix_row_dist_missing", expected: spec.scaleMax, actual: 0, message: `第 ${spec.number} 题矩阵第 ${ri + 1} 行「${rowName}」缺少分布数组` });
      return { row: rowName, mean: meanOk ? round1(mean) : null, distribution: [], rowStatus: "incomplete" };
    }
    if (!Array.isArray(dRaw)) {
      errors.push({ errorType: "not_array", expected: spec.scaleMax, actual: 0, message: `第 ${spec.number} 题矩阵第 ${ri + 1} 行「${rowName}」的分布不是数组` });
      return { row: rowName, mean: meanOk ? round1(mean) : null, distribution: [], rowStatus: "incomplete" };
    }
    if (dRaw.length !== spec.scaleMax) {
      errors.push({ errorType: "matrix_row_dist_mismatch", expected: spec.scaleMax, actual: dRaw.length, message: `第 ${spec.number} 题矩阵第 ${ri + 1} 行「${rowName}」应返回 ${spec.scaleMax} 个分布值，实际只返回 ${dRaw.length} 个` });
    }
    const errStart = errors.length;
    const distribution = dRaw.map((v, j) => numericValue(v, `第 ${spec.number} 题矩阵第 ${ri + 1} 行第 ${j + 1} 档`, errors));
    let rowStatus = "complete";
    if (dRaw.length === spec.scaleMax && !hasNumericError(errors, errStart)) {
      const sum = round1(distribution.reduce((a, b) => a + b, 0));
      if (Math.abs(sum - 100) > SUM_TOLERANCE) {
        errors.push({ errorType: "matrix_row_sum_not_100", expected: 100, actual: sum, message: `第 ${spec.number} 题矩阵第 ${ri + 1} 行「${rowName}」分布合计 ${sum}%，应接近 100%` });
        rowStatus = "invalid";
      }
    } else if (dRaw.length !== spec.scaleMax) {
      rowStatus = "incomplete";
    } else {
      rowStatus = "invalid";
    }
    return { row: rowName, mean: meanOk ? round1(mean) : null, distribution, rowStatus };
  });
  return { ...base, matrix };
}

// ===== 新题型结果合并（rank / nps / numeric / open / allocation） =====
// 原则：缺失不补 0，关联按类型返回结构校验

function mergeRank(spec, r, errors) {
  const base = { optionsArray: spec.options, rankMode: spec.config.rankMode, rankCount: spec.rankCount };
  const itemsRaw = r.items !== undefined && r.items !== null ? r.items : null;
  if (itemsRaw === null) {
    errors.push({ errorType: "rank_items_missing", expected: spec.optionCount, actual: 0, message: `第 ${spec.number} 题排序题缺少 items 数组（应包含 ${spec.optionCount} 个选项结果）` });
    return { ...base, items: [], unrankedPct: null };
  }
  if (!Array.isArray(itemsRaw)) {
    errors.push({ errorType: "not_array", expected: spec.optionCount, actual: 0, message: `第 ${spec.number} 题排序题的 items 不是数组` });
    return { ...base, items: [], unrankedPct: null };
  }
  if (itemsRaw.length !== spec.optionCount) {
    errors.push({ errorType: "rank_items_mismatch", expected: spec.optionCount, actual: itemsRaw.length, message: `第 ${spec.number} 题排序题应返回 ${spec.optionCount} 个选项结果，实际只返回 ${itemsRaw.length} 个` });
  }
  const seen = new Set();
  const items = spec.options.map((label, j) => {
    const row = itemsRaw[j];
    if (!row || typeof row !== "object") {
      errors.push({ errorType: "rank_item_missing", expected: 1, actual: 0, message: `第 ${spec.number} 题排序题第 ${j + 1} 个选项「${label}」未返回结果` });
      return { optionIndex: j, label, avgRank: null, firstPct: null, top3Pct: null, rankDistribution: [] };
    }
    const oi = Number(row.optionIndex);
    if (!Number.isInteger(oi)) {
      errors.push({ errorType: "rank_item_bad_index", expected: j, actual: row.optionIndex, message: `第 ${spec.number} 题排序题第 ${j + 1} 项缺少有效 optionIndex` });
    } else if (oi !== j) {
      errors.push({ errorType: "rank_item_bad_index", expected: j, actual: oi, message: `第 ${spec.number} 题排序题 items[${j}].optionIndex 应为 ${j}，实际为 ${oi}` });
    } else if (seen.has(oi)) {
      errors.push({ errorType: "rank_item_duplicate", expected: "不重复", actual: oi, message: `第 ${spec.number} 题排序题 optionIndex ${oi} 重复出现` });
    }
    seen.add(oi);
    const avgRank = Number(row.avgRank);
    const avgRankOk = Number.isFinite(avgRank) && avgRank >= 1 && avgRank <= spec.optionCount;
    if (!avgRankOk) {
      errors.push({ errorType: "rank_avg_out_of_range", expected: `1-${spec.optionCount}`, actual: row.avgRank, message: `第 ${spec.number} 题排序题选项「${label}」的平均排名 ${row.avgRank} 超出合法范围` });
    }
    const numericPct = (v, name) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        errors.push({ errorType: "rank_pct_out_of_range", expected: "0-100", actual: v, message: `第 ${spec.number} 题排序题选项「${label}」的${name} ${v} 超出 0-100` });
        return null;
      }
      return round1(n);
    };
    const firstPct = numericPct(row.firstPct, "第一名比例");
    const top3Pct = numericPct(row.top3Pct, "前三比例");
    const rd = row.rankDistribution;
    if (rd === null || rd === undefined || !Array.isArray(rd)) {
      errors.push({ errorType: "rank_dist_missing", expected: spec.rankCount, actual: 0, message: `第 ${spec.number} 题排序题选项「${label}」缺少名次分布数组` });
      return { optionIndex: j, label, avgRank: avgRankOk ? round1(avgRank) : null, firstPct, top3Pct, rankDistribution: [] };
    }
    if (rd.length !== spec.rankCount) {
      errors.push({ errorType: "rank_dist_mismatch", expected: spec.rankCount, actual: rd.length, message: `第 ${spec.number} 题排序题选项「${label}」的名次分布应包含 ${spec.rankCount} 个数值，实际 ${rd.length} 个` });
    }
    const errStart = errors.length;
    const rankDistribution = rd.map((v, k) => numericValue(v, `第 ${spec.number} 题排序题选项「${label}」第 ${k + 1} 名占比`, errors));
    if (rd.length === spec.rankCount && !hasNumericError(errors, errStart)) {
      const sum = round1(rankDistribution.reduce((a, b) => a + b, 0));
      if (Math.abs(sum - 100) > SUM_TOLERANCE) {
        errors.push({ errorType: "rank_dist_sum_not_100", expected: 100, actual: sum, message: `第 ${spec.number} 题排序题选项「${label}」名次分布合计 ${sum}%，应接近 100%` });
      }
    }
    return { optionIndex: j, label, avgRank: avgRankOk ? round1(avgRank) : null, firstPct, top3Pct, rankDistribution };
  });
  // TopN 模式的整体 unrankedPct
  let unrankedPct = null;
  if (spec.config.rankMode === "top_n") {
    const u = Number(r.unrankedPct);
    if (!Number.isFinite(u) || u < 0 || u > 100) {
      errors.push({ errorType: "rank_unranked_bad", expected: "0-100", actual: r.unrankedPct, message: `第 ${spec.number} 题排序题（TopN）未返回有效 unrankedPct=0-100` });
    } else {
      unrankedPct = round1(u);
    }
  }
  return { ...base, items, unrankedPct };
}

function mergeNps(spec, r, errors) {
  const base = { optionsArray: [] };
  const raw = r.distribution !== undefined && r.distribution !== null ? r.distribution : (r.dist !== undefined && r.dist !== null ? r.dist : null);
  if (raw === null) {
    errors.push({ errorType: "nps_dist_missing", expected: 11, actual: 0, message: `第 ${spec.number} 题 NPS 缺少 distribution 数组（0-10 分共 11 档）` });
    return { ...base, distribution: [], promoterPct: null, passivePct: null, detractorPct: null, nps: null, mean: null };
  }
  if (!Array.isArray(raw)) {
    errors.push({ errorType: "not_array", expected: 11, actual: 0, message: `第 ${spec.number} 题 NPS 的 distribution 不是数组` });
    return { ...base, distribution: [], promoterPct: null, passivePct: null, detractorPct: null, nps: null, mean: null };
  }
  if (raw.length !== 11) {
    errors.push({ errorType: "nps_dist_mismatch", expected: 11, actual: raw.length, message: `第 ${spec.number} 题 NPS 应返回 11 个档位分布值（0-10 分），实际只返回 ${raw.length} 个` });
  }
  const errStart = errors.length;
  const distribution = raw.map((v, k) => numericValue(v, `第 ${spec.number} 题 NPS 第 ${k} 分占比`, errors));
  if (raw.length === 11 && !hasNumericError(errors, errStart)) {
    const sum = round1(distribution.reduce((a, b) => a + b, 0));
    if (Math.abs(sum - 100) > SUM_TOLERANCE) {
      errors.push({ errorType: "nps_dist_sum_not_100", expected: 100, actual: sum, message: `第 ${spec.number} 题 NPS 分布合计 ${sum}%，应接近 100%` });
    }
  }
  // 系统按分布重算三分组与 NPS（不完全相信 AI 返回值）
  let promoterPct = null;
  let passivePct = null;
  let detractorPct = null;
  if (raw.length === 11 && !hasNumericError(errors, errStart)) {
    const sum = (idx) => distribution.slice(idx[0], idx[1] + 1).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    promoterPct = round1(sum([9, 10]));
    passivePct = round1(sum([7, 8]));
    detractorPct = round1(sum([0, 6]));
  } else {
    promoterPct = Number.isFinite(Number(r.promoterPct)) ? round1(Number(r.promoterPct)) : null;
    passivePct = Number.isFinite(Number(r.passivePct)) ? round1(Number(r.passivePct)) : null;
    detractorPct = Number.isFinite(Number(r.detractorPct)) ? round1(Number(r.detractorPct)) : null;
  }
  const nps = (promoterPct !== null && detractorPct !== null) ? Math.round(promoterPct - detractorPct) : null;
  const mean = Number.isFinite(Number(r.mean)) ? round1(Number(r.mean)) : (promoterPct !== null ? null : null);
  if (!Number.isFinite(Number(r.mean))) {
    errors.push({ errorType: "missing_mean", expected: "0-10 有效数字", actual: r.mean, message: `第 ${spec.number} 题 NPS 缺少有效 mean（0-10 分均值）` });
  }
  return {
    ...base, distribution,
    promoterPct, passivePct, detractorPct,
    nps, mean: Number.isFinite(Number(r.mean)) ? round1(Number(r.mean)) : null
  };
}

function mergeNumeric(spec, r, errors) {
  const base = { optionsArray: [], unit: spec.config.unit || "", numericType: spec.config.numericType || "integer" };
  const lo = spec.config.min ?? 0;
  const hi = spec.config.max ?? 10000;
  const num = (v, name) => {
    const n = Number(v);
    if (!Number.isFinite(n)) {
      errors.push({ errorType: "numeric_missing", expected: "有效数字", actual: v, message: `第 ${spec.number} 题数值题缺少有效 ${name}` });
      return null;
    }
    if (n < lo || n > hi) {
      errors.push({ errorType: "numeric_out_of_range", expected: `${lo}-${hi}`, actual: n, message: `第 ${spec.number} 题数值题 ${name} ${n} 超出合法范围 ${lo}-${hi}` });
    }
    return n;
  };
  const mean = num(r.mean, "均值");
  const median = num(r.median, "中位数");
  const p25 = num(r.p25, "P25");
  const p75 = num(r.p75, "P75");
  const min = num(r.min, "最小值");
  const max = num(r.max, "最大值");
  const vals = [min, p25, median, p75, max].filter((v) => v !== null);
  for (let k = 1; k < vals.length; k++) {
    if (vals[k] < vals[k - 1]) {
      errors.push({ errorType: "numeric_order_bad", expected: "min≤p25≤median≤p75≤max", actual: vals.join("<"), message: `第 ${spec.number} 题数值题统计量不满足顺序（min≤p25≤median≤p75≤max）` });
      break;
    }
  }
  let distribution = [];
  const distRaw = Array.isArray(r.distribution) ? r.distribution : [];
  distRaw.forEach((d, k) => {
    if (d && typeof d === "object") {
      const pct = Number(d.pct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        errors.push({ errorType: "numeric_dist_bad", expected: "0-100", actual: d.pct, message: `第 ${spec.number} 题数值题第 ${k + 1} 段占比 ${d.pct} 无效` });
      } else {
        distribution.push({ label: String(d.label || `分段${k + 1}`), pct: round1(pct) });
      }
    }
  });
  return { ...base, mean, median, p25, p75, min, max, distribution };
}

function mergeOpen(spec, r, errors) {
  const base = { optionsArray: [] };
  const themesRaw = r.themes !== undefined && r.themes !== null ? r.themes : null;
  if (themesRaw === null || !Array.isArray(themesRaw)) {
    errors.push({ errorType: "open_themes_missing", expected: "3-8 个主题数组", actual: Array.isArray(themesRaw) ? themesRaw.length : 0, message: `第 ${spec.number} 题开放题缺少 themes 主题聚类数组` });
    return { ...base, themes: [], otherPct: null, responseCount: null };
  }
  const themes = themesRaw.map((t, k) => {
    if (!t || typeof t !== "object") {
      errors.push({ errorType: "open_theme_bad", expected: "主题对象", actual: null, message: `第 ${spec.number} 题开放题第 ${k + 1} 个主题无效` });
      return { name: `主题${k + 1}`, pct: null, summary: "", quotes: [] };
    }
    const pct = Number(t.pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      errors.push({ errorType: "open_pct_bad", expected: "0-100", actual: t.pct, message: `第 ${spec.number} 题开放题主题「${t.name || k + 1}」提及率 ${t.pct} 无效` });
    }
    return {
      name: String(t.name || `主题${k + 1}`),
      pct: Number.isFinite(pct) ? round1(pct) : null,
      summary: String(t.summary || ""),
      quotes: Array.isArray(t.quotes) ? t.quotes.map(String).slice(0, 3) : []
    };
  });
  if (themes.length < 3 || themes.length > 8) {
    errors.push({ errorType: "open_theme_count", expected: "3-8", actual: themes.length, message: `第 ${spec.number} 题开放题主题数量 ${themes.length} 个，建议 3-8 个` });
  }
  const otherPctRaw = Number(r.otherPct);
  const otherPct = Number.isFinite(otherPctRaw) && otherPctRaw >= 0 && otherPctRaw <= 100 ? round1(otherPctRaw) : (Number.isFinite(otherPctRaw) ? otherPctRaw : null);
  const rc = Number(r.responseCount);
  return {
    ...base, themes,
    otherPct: Number.isFinite(Number(r.otherPct)) ? round1(Number(r.otherPct)) : null,
    responseCount: Number.isFinite(rc) ? Math.round(rc) : null
  };
}

function mergeAllocation(spec, r, errors) {
  const base = { optionsArray: spec.options };
  const totalPoints = spec.config.totalPoints || 100;
  const itemsRaw = r.items !== undefined && r.items !== null ? r.items : null;
  if (itemsRaw === null) {
    errors.push({ errorType: "allocation_items_missing", expected: spec.optionCount, actual: 0, message: `第 ${spec.number} 题定和分配题缺少 items 数组` });
    return { ...base, items: [], totalPoints };
  }
  if (!Array.isArray(itemsRaw)) {
    errors.push({ errorType: "not_array", expected: spec.optionCount, actual: 0, message: `第 ${spec.number} 题定和分配题的 items 不是数组` });
    return { ...base, items: [], totalPoints };
  }
  if (itemsRaw.length !== spec.optionCount) {
    errors.push({ errorType: "allocation_item_mismatch", expected: spec.optionCount, actual: itemsRaw.length, message: `第 ${spec.number} 题定和分配题应返回 ${spec.optionCount} 个选项分配结果，实际 ${itemsRaw.length} 个` });
  }
  const seen = new Set();
  const items = spec.options.map((label, j) => {
    const row = itemsRaw[j];
    if (!row || typeof row !== "object") {
      errors.push({ errorType: "allocation_item_missing", expected: 1, actual: 0, message: `第 ${spec.number} 题定和分配题第 ${j + 1} 个选项「${label}」未返回结果` });
      return { optionIndex: j, label, meanPoints: null, medianPoints: null };
    }
    const oi = Number(row.optionIndex);
    if (!Number.isInteger(oi) || oi !== j || seen.has(oi)) {
      errors.push({ errorType: "allocation_item_bad_index", expected: j, actual: row.optionIndex, message: `第 ${spec.number} 题定和分配题 items[${j}].optionIndex 无效或重复` });
    }
    seen.add(oi);
    const mp = Number(row.meanPoints);
    const mdp = Number(row.medianPoints);
    if (!Number.isFinite(mp) || mp < 0 || mp > totalPoints) {
      errors.push({ errorType: "allocation_points_bad", expected: `0-${totalPoints}`, actual: row.meanPoints, message: `第 ${spec.number} 题定和分配题选项「${label}」平均分配分 ${row.meanPoints} 无效` });
    }
    return {
      optionIndex: j, label,
      meanPoints: Number.isFinite(mp) ? round1(mp) : null,
      medianPoints: Number.isFinite(mdp) ? round1(mdp) : null
    };
  });
  const validSums = items.filter((it) => it.meanPoints !== null);
  if (validSums.length === items.length && items.length) {
    const sum = round1(validSums.reduce((a, b) => a + b.meanPoints, 0));
    if (Math.abs(sum - totalPoints) > Math.max(2, totalPoints * 0.02)) {
      errors.push({ errorType: "allocation_sum_not_total", expected: totalPoints, actual: sum, message: `第 ${spec.number} 题定和分配题各选项平均分合计 ${sum}，应接近总分 ${totalPoints}` });
    }
  }
  return { ...base, items, totalPoints };
}

// 将 AI 返回的原始 results 合并为完整题目对象（缺失不补 0，标注 dataStatus / dataError）
export function mergeRawResults(rawResults, questions) {
  const byIndex = new Map();
  (Array.isArray(rawResults) ? rawResults : []).forEach((r, idx) => {
    const i = typeof r.i === "number" ? r.i : idx;
    if (!byIndex.has(i)) byIndex.set(i, r);
  });
  return questions.map((q, i) => {
    const spec = questionSpec(q, i);
    const r = byIndex.get(i);
    if (!r || typeof r !== "object") return emptyQuestion(spec);
    const errors = [];
    let body;
    if (spec.type === "scale") body = mergeScale(spec, r, errors);
    else if (spec.type === "matrix") body = mergeMatrix(spec, r, errors);
    else if (spec.type === "rank") body = mergeRank(spec, r, errors);
    else if (spec.type === "nps") body = mergeNps(spec, r, errors);
    else if (spec.type === "numeric") body = mergeNumeric(spec, r, errors);
    else if (spec.type === "open") body = mergeOpen(spec, r, errors);
    else if (spec.type === "allocation") body = mergeAllocation(spec, r, errors);
    else body = mergeChoice(spec, r, errors);
    return {
      text: spec.text, type: spec.type, scale: spec.scale, rows: spec.rows, config: spec.config,
      index: spec.index, expectedCount: expectedCountOf(spec),
      ...body,
      dataStatus: statusFromErrors(errors),
      dataError: errors.length ? errors[0].message : "",
      dataErrors: errors
    };
  });
}

// 只把「本次返回的题目」合并进现有结果，其余题目保持原样（用于自动修复 / 单题重生成）
export function mergeRepairedResults(mergedQuestions, rawResults, questions) {
  const next = mergedQuestions.map((q) => ({ ...q }));
  const repairedAll = mergeRawResults(rawResults, questions);
  const byIndex = new Map(repairedAll.map((q) => [q.index, q]));
  (Array.isArray(rawResults) ? rawResults : []).forEach((r) => {
    const i = typeof r.i === "number" ? r.i : -1;
    if (i >= 0 && i < next.length && byIndex.has(i)) next[i] = byIndex.get(i);
  });
  return next;
}

// ===== 结果校验 =====

// parsed: { results: [...] }（AI 原始返回）；questions: 问卷定义；merged: 可选，mergeRawResults 结果
// 返回 { valid, validQuestionIndexes, invalidQuestionIndexes, errors[] }
export function validateQuantResults(parsed, questions, mergedQuestions) {
  const rawResults = parsed && Array.isArray(parsed.results) ? parsed.results : [];
  const merged = mergedQuestions || mergeRawResults(rawResults, questions);
  const errors = [];
  const seen = new Set();
  rawResults.forEach((r, idx) => {
    const i = typeof r.i === "number" ? r.i : idx;
    if (seen.has(i)) {
      errors.push({ questionIndex: i, errorType: "duplicate_index", expected: 1, actual: 2, message: `题目索引 ${i} 在 results 中重复出现` });
    }
    seen.add(i);
    if (!Number.isInteger(i) || i < 0 || i >= questions.length) {
      errors.push({ questionIndex: i, errorType: "index_out_of_range", expected: `0-${questions.length - 1}`, actual: i, message: `题目索引 ${i} 超出问卷范围（应为 0-${questions.length - 1}）` });
    }
  });
  merged.forEach((q) => {
    (q.dataErrors || []).forEach((e) => errors.push({ questionIndex: q.index, ...e }));
  });
  const invalid = [...new Set(errors.map((e) => e.questionIndex))]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < questions.length);
  const valid = questions.map((_, i) => i).filter((i) => !invalid.includes(i));
  return {
    valid: invalid.length === 0,
    validQuestionIndexes: valid,
    invalidQuestionIndexes: invalid,
    errors
  };
}

// ===== 数据质量汇总 =====

export function makeQuantQualitySummary(questions, repairedCount = 0) {
  const total = questions.length;
  const complete = questions.filter((q) => q.dataStatus === "complete").length;
  const pending = total - complete;
  const status = pending > 0 ? "pending" : (repairedCount > 0 ? "repaired" : "complete");
  return { total, complete, repaired: repairedCount, pending, status };
}

// ============================================================
// v50 定量分析工作台：以下为纯函数扩展，浏览器与 Node 均可复用
//   问卷模块识别（detectQuestionModule）
//   逐题指标计算（computeQuestionMetrics）
//   核心指标选择（selectCoreMetrics）
//   关键发现（buildKeyFindings，每条绑定证据）
//   模拟交叉分析（buildSimulatedCrosstab）
//   报告故事线（buildStoryline / buildStorylinePrompt）
//   数据来源标记（SOURCE_LABELS）
//   质量明细（makeQuantQualityDetails）
//   Excel 导出（buildQuantWorkbook / buildQualityWorkbook）
//   完整 Markdown 报告（buildQuantWorkbenchMarkdown）
// ============================================================

// ===== 问卷模块识别 =====

export const QUESTION_MODULES = [
  { id: "screening", label: "甄别题" },
  { id: "demographics", label: "人群背景" },
  { id: "behavior", label: "使用行为" },
  { id: "brand", label: "品牌认知" },
  { id: "needs", label: "需求与痛点" },
  { id: "features", label: "功能偏好" },
  { id: "concept", label: "概念测试" },
  { id: "purchase", label: "购买意愿" },
  { id: "price", label: "价格测试" },
  { id: "channel", label: "渠道偏好" },
  { id: "satisfaction", label: "满意度" },
  { id: "recommend", label: "推荐意愿" },
  { id: "other", label: "其他" }
];

export const MODULE_LABEL = Object.fromEntries(QUESTION_MODULES.map((m) => [m.id, m.label]));

// 按优先级从高到低匹配：推荐/价格/渠道等具体模块优先于宽泛的行为/需求
const MODULE_RULES = [
  ["screening", /^(S|W)\s*[\d.、]|甄别|筛选|是否符合受访|过去(12|6|3|1)个月(内)?(是否)?|是否购买过该(品类|产品|品牌)|是否使用过/],
  ["demographics", /^(D|B|J)\s*[\d.、]|性别|年龄|婚姻|学历|职业|收入|家庭|城市|居住|常住|所在城市|从事|子女|家庭结构|教育程度|月收入|年收入|税后|出生/],
  ["recommend", /推荐|NPS|净推荐|口碑/],
  ["price", /价格|价位|定价|多少钱|支付|接受度|性价比|价格敏感|预算|贵|便宜/],
  ["satisfaction", /满意|满意度|整体评价|打分|评分|体验感受|使用体验/],
  ["purchase", /购买意愿|购买意向|会购买|愿意购买|考虑购买|购买可能|是否会买|打算购买|复购|回购|再次购买|购买倾向|下单|意向|购买计划/],
  ["concept", /概念|吸引力|第一印象|整体印象|喜欢程度|兴趣程度|创新|包装|广告语|宣传语|卖点|试吃|试用|接受度/],
  ["channel", /渠道|电商|门店|线上|线下|途径|平台|购买渠道|选购渠道|海淘|代购|直播|商场|超市|专卖店/],
  ["brand", /品牌认知|品牌印象|品牌形象|品牌态度|品牌偏好|品牌知名度|品牌联想|品牌熟悉|听说过|知道哪些品牌|哪些.{0,10}品牌/],
  ["needs", /需求|痛点|困扰|烦恼|不满|期望|希望改进|障碍|顾虑|担心|阻碍|不便|不满意|吐槽|重要(度|性)|决策因素|影响因素|核心/],
  ["features", /功能|配置|特性|偏好|喜欢|加分项|属性|特点|亮点/],
  ["behavior", /使用|频率|多久|时长|时间|次数|习惯|经常|偶尔|每天|每周|每月|场景|场合|时机|接触|观看|浏览|去过|光顾|拥有|多少辆|多少台/]
];

// 自动识别题目所属模块（q 可为题目定义或已合并结果；index 从 0 开始）
export function detectQuestionModule(q, index = 0) {
  const text = String(q?.text || "");
  const number = String(q?.number || index + 1);
  for (const [id, re] of MODULE_RULES) {
    if (re.test(text) || re.test(number)) {
      return { id, label: MODULE_LABEL[id] };
    }
  }
  return { id: "other", label: MODULE_LABEL.other };
}

// ===== 数据来源标记 =====

export const SOURCE_LABELS = {
  ai: "AI首次生成",
  repaired: "AI自动修复",
  regenerated: "单题重新生成",
  user: "用户手动调整",
  mock: "本地模拟数据"
};

export function sourceLabel(source) {
  return SOURCE_LABELS[source] || "未知来源";
}

// ===== 逐题指标计算 =====

function finite(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 单选/多选：排序、Top 差距、Top2 合计、集中度、长尾
export function choiceMetrics(question) {
  const options = Array.isArray(question.optionsArray) ? question.optionsArray : [];
  const values = Array.isArray(question.values) ? question.values : [];
  const ranked = options
    .map((label, i) => ({ label, value: finite(values[i]), index: i }))
    .filter((r) => r.value !== null)
    .sort((a, b) => b.value - a.value);
  if (ranked.length === 0) return { ranked: [], available: false };
  const top1 = ranked[0].value;
  const top2Sum = ranked.length > 1 ? top1 + ranked[1].value : top1;
  const gap = ranked.length > 1 ? round1(top1 - ranked[1].value) : null;
  const tail = ranked.filter((r, idx) => idx >= 3 && r.value <= 10);
  const concentrated = top1 >= 50 || top2Sum >= 75;
  const longTail = tail.length >= 2 || (tail.length >= Math.ceil(ranked.length * 0.3) && tail.length >= 1);
  // 多选题：平均勾选数量 ≈ 百分比合计 / 100
  const avgSelections = question.type === "multiple"
    ? round1(ranked.reduce((s, r) => s + r.value, 0) / 100)
    : null;
  const otherIndex = options.findIndex((label) => /^其他|^其它/.test(label));
  const otherValue = otherIndex >= 0 ? finite(values[otherIndex]) : null;
  return {
    available: true,
    ranked,
    top1,
    top1Label: ranked[0].label,
    top2Sum: round1(top2Sum),
    gap,
    concentrated,
    longTail,
    tailCount: tail.length,
    tailSum: round1(tail.reduce((s, r) => s + r.value, 0)),
    avgSelections,
    top3: ranked.slice(0, 3).map((r) => ({ label: r.label, value: r.value })),
    other: otherValue !== null ? { value: otherValue, isTop: otherIndex === ranked[0]?.index } : null
  };
}

// 量表：均值/中位数估计/Top2 Box/Bottom2 Box/正-中立-负向
export function scaleMetrics(question) {
  const dist = Array.isArray(question.distribution) ? question.distribution : [];
  const max = question.expectedCount || dist.length;
  if (!max || dist.length === 0 || dist.some((v) => finite(v) === null)) {
    return { available: false, mean: finite(question.mean), sd: finite(question.sd) };
  }
  const n = dist.length;
  const mean = finite(question.mean) ?? round1(dist.reduce((s, v, i) => s + Number(v) * (i + 1), 0) / 100);
  let cum = 0;
  let median = null;
  for (let i = 0; i < n; i++) {
    cum += Number(dist[i]);
    if (cum >= 50) { median = i + 1; break; }
  }
  const top2box = round1(Number(dist[n - 1]) + Number(dist[n - 2]));
  const bottom2box = round1(Number(dist[0]) + Number(dist[1]));
  // 正/中立/负向：以量表中点为界（5分→1-2负/3中立/4-5正；10分→1-4负/5-6中立/7-10正）
  const mid = (max + 1) / 2;
  const negMax = Math.floor(mid - 0.51);
  const posMin = Math.ceil(mid + 0.51);
  let negative = 0, neutral = 0, positive = 0;
  dist.forEach((v, i) => {
    const point = i + 1;
    if (point <= negMax) negative += Number(v);
    else if (point >= posMin) positive += Number(v);
    else neutral += Number(v);
  });
  return {
    available: true,
    mean: round1(mean),
    sd: finite(question.sd),
    median,
    top2box,
    bottom2box,
    negative: round1(negative),
    neutral: round1(neutral),
    positive: round1(positive),
    n
  };
}

// 矩阵：各维度均值排序 / Top3 / Bottom3 / 维度差距
export function matrixMetrics(question) {
  const rows = (question.matrix || []).map((r, i) => ({
    label: r.row,
    mean: finite(r.mean),
    index: i,
    status: r.rowStatus
  }));
  const ranked = rows.filter((r) => r.mean !== null).sort((a, b) => b.mean - a.mean);
  if (ranked.length === 0) return { available: false, rows: [], ranked: [] };
  const top3 = ranked.slice(0, 3);
  const bottom3 = ranked.slice(-3);
  return {
    available: true,
    rows,
    ranked,
    top3,
    bottom3,
    topRow: ranked[0],
    bottomRow: ranked[ranked.length - 1],
    gap: round1(ranked[0].mean - ranked[ranked.length - 1].mean)
  };
}

// ===== 新题型指标（v52） =====

// 排序题：按平均排名排序、第一名/前三、集中度、"稳定次级"（排名靠前但第一名少）、"少数强偏好"
export function rankMetrics(question) {
  const items = (question.items || []).filter((it) => it && Number.isFinite(Number(it.avgRank)));
  if (!items.length) return { available: false, exact: (question.items || []).map((it) => ({ ...it })) };
  const ranked = [...items].sort((a, b) => a.avgRank - b.avgRank);
  const top3ByRank = ranked.slice(0, 3);
  const firstLeader = [...items].sort((a, b) => (b.firstPct ?? -1) - (a.firstPct ?? -1))[0];
  const top3Leader = [...items].sort((a, b) => (b.top3Pct ?? -1) - (a.top3Pct ?? -1))[0];
  // “稳定次级”：平均排名高但第一名比例偏低（如 < 30%），且 Top3 比例高
  const stableSecondary = ranked.find((it) => (it.firstPct ?? 0) < 30 && (it.top3Pct ?? 0) >= 50);
  // “少数用户强偏好”：第一名比例最高但与平均排名偏差较大（有少数第一但整体靠后）
  const fewStrongPref = [...items].find((it) => (it.firstPct ?? 0) >= 25 && (it.avgRank ?? 99) > 2.5);
  const isConcentrated = (firstLeader?.firstPct ?? 0) >= 45;
  const isDispersed = (ranked[0]?.avgRank ?? 0) >= 2.5 && (firstLeader?.firstPct ?? 0) < 30;
  // 名次是否与第一名一致：平均排名第一的选项是否也是第一名比例最高
  const consistent = ranked[0]?.optionIndex === firstLeader?.optionIndex;
  return {
    available: true,
    ranked,
    top3ByRank,
    firstLeader,
    top3Leader,
    stableSecondary: stableSecondary || null,
    fewStrongPref: fewStrongPref || null,
    consistent,
    isConcentrated,
    isDispersed,
    gapBetween1and2: ranked.length > 1 ? round1(ranked[1].avgRank - ranked[0].avgRank) : null
  };
}

// NPS：推荐者/被动者/贬损者/净推荐值
export function npsMetrics(question) {
  const dist = Array.isArray(question.distribution) ? question.distribution : [];
  if (dist.length !== 11 || dist.some((v) => !Number.isFinite(Number(v)))) {
    return { available: false };
  }
  const promoter = round1(Number(dist[9]) + Number(dist[10]));
  const passive = round1(Number(dist[7]) + Number(dist[8]));
  const detractor = round1(dist.slice(0, 7).reduce((s, v) => s + Number(v), 0));
  const nps = Math.round(promoter - detractor);
  const mean = Number.isFinite(Number(question.mean)) ? Number(question.mean) : round1(dist.reduce((s, v, k) => s + Number(v) * k, 0) / 100);
  return {
    available: true,
    promoter,
    passive,
    detractor,
    nps,
    mean: round1(mean),
    gap: promoter - detractor,
    passiveShare: passive
  };
}

// 数值题：均值 vs 中位数、偏斜、集中区间、长尾
export function numericMetrics(question) {
  const mean = finite(question.mean);
  const median = finite(question.median);
  const p25 = finite(question.p25);
  const p75 = finite(question.p75);
  const min = finite(question.min);
  const max = finite(question.max);
  const unit = question.unit || "";
  const dist = Array.isArray(question.distribution) ? question.distribution : [];
  const spread = (p25 !== null && p75 !== null) ? p75 - p25 : null;
  let skew = null;
  if (mean !== null && median !== null && mean !== median) skew = mean > median ? "右偏（少数高值拉高均值）" : "左偏（少数低值拉低均值）";
  const longTail = dist.filter((d) => Number(d.pct) < 3).length >= 2;
  return {
    available: mean !== null || median !== null,
    mean, median, p25, p75, min, max, spread, unit, skew, longTail,
    dist,
  };
}

// 开放题：高频主题、情绪方向、主要痛点、长尾
export function openMetrics(question) {
  const themes = (question.themes || []).filter((t) => Number.isFinite(Number(t.pct)));
  if (!themes.length) return { available: false };
  const ranked = [...themes].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const top = ranked[0];
  const nearN = ranked.filter((t) => (t.pct ?? 0) >= 30).length;
  const longTail = themes.filter((t) => (t.pct ?? 0) < 10).length;
  const mood = top ? (String(top.summary || "").includes("担心") || String(top.name || "").includes("担忧") || String(top.name || "").includes("不足") ? "偏负向" : "中性/正向") : null;
  return {
    available: true,
    ranked,
    top,
    top3: ranked.slice(0, 3),
    nearN,
    longTail,
    mood,
    otherPct: finite(question.otherPct),
    themeCount: themes.length
  };
}

// 定和分配：集中度、Top2 合计、资源差距
export function allocationMetrics(question) {
  const items = (question.items || []).filter((it) => Number.isFinite(Number(it.meanPoints)));
  if (!items.length) return { available: false };
  const ranked = [...items].sort((a, b) => (b.meanPoints ?? 0) - (a.meanPoints ?? 0));
  const total = question.totalPoints || 100;
  const top1 = ranked[0];
  const top2Sum = ranked.length > 1 ? (top1.meanPoints + ranked[1].meanPoints) : top1.meanPoints;
  const gap = ranked.length > 1 ? round1(top1.meanPoints - ranked[1].meanPoints) : null;
  const concentrated = (top1.meanPoints / total) >= 0.4;
  return {
    available: true,
    ranked,
    top1,
    top2Sum: round1(top2Sum),
    top2Pct: round1((top2Sum / total) * 100),
    gap,
    total,
    concentrated,
    secondary: ranked.length > 1 ? ranked[1] : null
  };
}

export function computeQuestionMetrics(question) {
  if (question.type === "single" || question.type === "multiple") return choiceMetrics(question);
  if (question.type === "rank") return rankMetrics(question);
  if (question.type === "scale") return scaleMetrics(question);
  if (question.type === "nps") return npsMetrics(question);
  if (question.type === "matrix") return matrixMetrics(question);
  if (question.type === "numeric") return numericMetrics(question);
  if (question.type === "open") return openMetrics(question);
  if (question.type === "allocation") return allocationMetrics(question);
  return {};
}

// ===== 核心指标选择 =====

const CORE_METRIC_RULES = [
  { kind: "purchase", label: "购买意愿", re: /购买|复购|回购|下单|意向|会买|是否会购买|购买计划/ },
  { kind: "usage_intent", label: "使用意愿", re: /使用意愿|使用意向|会用|愿意使用|接受.*使用/ },
  { kind: "concept", label: "概念吸引力", re: /概念|吸引力|第一印象|整体印象|喜欢程度|兴趣程度/ },
  { kind: "satisfaction", label: "满意度", re: /满意/ },
  { kind: "recommend", label: "推荐意愿", re: /推荐/ },
  { kind: "price", label: "价格接受度", re: /价格|价位|支付|接受度|多少钱|价格敏感/ },
  { kind: "needs", label: "核心需求", re: /需求|最重要|最关键|核心/ },
  { kind: "pain", label: "核心痛点", re: /痛点|困扰|障碍|顾虑|不满|担心/ }
];

function metricValueOf(q) {
  if (q.type === "scale") {
    const m = scaleMetrics(q);
    return { headline: `均值 ${m.mean}`, detail: `${q.scale} 分制 · Top2Box ${m.top2box}%` };
  }
  if (q.type === "matrix") {
    const m = matrixMetrics(q);
    return { headline: `「${m.topRow?.label || "—"}」${m.topRow?.mean} 分`, detail: `维度均值最高 · 差距 ${m.gap}` };
  }
  if (q.type === "rank") {
    const m = rankMetrics(q);
    if (m.available) {
      return { headline: `「${m.ranked[0]?.label || "—"}」均排 ${m.ranked[0]?.avgRank}`, detail: `第一名 ${m.firstLeader?.firstPct}% · 前三 ${m.top3Leader?.top3Pct}%` };
    }
    return { headline: "数据缺失", detail: "排序题结果不完整" };
  }
  if (q.type === "nps") {
    const m = npsMetrics(q);
    if (m.available) return { headline: `NPS ${m.nps}`, detail: `推荐者 ${m.promoter}% − 贬损者 ${m.detractor}%` };
    return { headline: "数据缺失", detail: "NPS 分布不完整" };
  }
  if (q.type === "numeric") {
    const m = numericMetrics(q);
    if (m.available) return { headline: `均值 ${m.mean}${m.unit || ""}`, detail: `中位数 ${m.median}${m.unit || ""} · 区间 ${m.p25}~${m.p75}${m.unit || ""}` };
    return { headline: "数据缺失", detail: "数值统计量不完整" };
  }
  if (q.type === "open") {
    const m = openMetrics(q);
    if (m.available) return { headline: `「${m.top?.name || "—"}」${m.top?.pct}%`, detail: `提及率最高主题 · 共 ${m.themeCount} 个主题` };
    return { headline: "数据缺失", detail: "开放题主题聚类不完整" };
  }
  if (q.type === "allocation") {
    const m = allocationMetrics(q);
    if (m.available) return { headline: `「${m.top1?.label || "—"}」${m.top1?.meanPoints} 分`, detail: `Top2 合计占比 ${m.top2Pct}%` };
    return { headline: "数据缺失", detail: "定和分配结果不完整" };
  }
  const m = choiceMetrics(q);
  const top = m.top1Label || "—";
  return { headline: `「${top}」${m.top1}%`, detail: `Top2 合计 ${m.top2Sum}%` };
}

// 自动选出适合做核心指标的题目，并给出与其他指标的关系提示
export function selectCoreMetrics(questions) {
  const selected = [];
  for (const rule of CORE_METRIC_RULES) {
    const q = (questions || []).find((item) =>
      item.dataStatus === "complete" && rule.re.test(String(item.text || ""))
    );
    if (!q) continue;
    const value = metricValueOf(q);
    selected.push({
      kind: rule.kind,
      label: rule.label,
      questionIndex: q.index,
      questionText: q.text,
      ...value
    });
    if (selected.length >= 8) break;
  }
  // 关系提示：两两比较选中的指标，引用真实数值
  selected.forEach((m, i) => {
    const pair = selected.find((o, j) => j !== i && o.kind !== m.kind);
    if (pair) {
      m.relation = `${pair.label}（${pair.questionIndex + 1} 题）为 ${pair.headline}，${m.label}（${m.questionIndex + 1} 题）为 ${m.headline}，两者可作为主假设与验证指标成对观察。`;
    } else {
      m.relation = "该指标可作为后续正式问卷的核心测量项，建议与人群背景变量交叉验证。";
    }
  });
  return selected;
}

// ===== 关键发现（每条绑定证据，杜绝「正确的废话」） =====

export function findingForChoice(question, m, env) {
  if (!m.available || m.top1 === null) return null;
  const text = String(question.text || "");
  if (question.type === "single") {
    const second = m.ranked[1];
    const evidence = [{
      questionIndex: question.index,
      optionIndexes: [m.ranked[0].index],
      values: [m.top1]
    }];
    if (second) {
      evidence[0].optionIndexes.push(second.index);
      evidence[0].values.push(second.value);
    }
    const focus = /购买|意愿|意向|会买/.test(text) ? "选择意向" : "关注重点";
    return {
      title: `「${m.top1Label}」是用户${focus}最集中的选项`,
      conclusion: `${m.top1Label}占比 ${m.top1}%${second ? `，领先第二名「${second.label}」（${second.value}%）${m.gap} 个百分点` : ""}，Top2 合计 ${m.top2Sum}%。`,
      evidence
    };
  }
  const second = m.ranked[1];
  return {
    title: `「${m.top1Label}」是最多用户选择的${/痛点|困扰|顾虑/.test(text) ? "痛点" : "项"}`,
    conclusion: `「${m.top1Label}」勾选率 ${m.top1}%${second ? `，高于「${second.label}」（${second.value}%）` : ""}；平均每位用户勾选 ${m.avgSelections} 项。`,
    evidence: [{
      questionIndex: question.index,
      optionIndexes: [m.ranked[0].index, second ? second.index : null].filter((x) => x !== null),
      values: [m.top1, second ? second.value : null].filter((x) => x !== null)
    }]
  };
}

export function findingForMatrix(question, m) {
  if (!m.available || m.ranked.length < 2) return null;
  if (m.gap < 0.4) return null;
  return {
    title: `「${m.topRow.label}」与「${m.bottomRow.label}」拉开明显差距`,
    conclusion: `维度均值最高为「${m.topRow.label}」（${m.topRow.mean}），最低为「${m.bottomRow.label}」（${m.bottomRow.mean}），差距 ${m.gap} 分。`,
    evidence: [{
      questionIndex: question.index,
      optionIndexes: [m.topRow.index, m.bottomRow.index],
      values: [m.topRow.mean, m.bottomRow.mean]
    }]
  };
}

export function findingForScale(question, m) {
  if (!m.available) return null;
  if (m.mean >= 4 && m.top2box >= 50) {
    return {
      title: `「${question.text}」整体评价偏高`,
      conclusion: `均值 ${m.mean}（${m.scale} 分制），Top2 Box 合计 ${m.top2box}%，正向比例 ${m.positive}%。`,
      evidence: [{ questionIndex: question.index, optionIndexes: [], values: [m.mean, m.top2box] }]
    };
  }
  if (m.mean <= 2.5) {
    return {
      title: `「${question.text}」评价偏低，是需要关注的风险点`,
      conclusion: `均值仅 ${m.mean}（${m.scale} 分制），Bottom2 Box 合计 ${m.bottom2box}%，负向比例 ${m.negative}%。`,
      evidence: [{ questionIndex: question.index, optionIndexes: [], values: [m.mean, m.bottom2box] }]
    };
  }
  return null;
}

// NPS 发现：净推荐值正负与转化空间
export function findingForNps(question, m) {
  if (!m.available) return null;
  if (m.nps >= 30) {
    return {
      title: "NPS 表现优秀，推荐者显著多于贬损者",
      conclusion: `NPS 为 ${m.nps}，推荐者 ${m.promoter}%，是贬损者（${m.detractor}%）的两倍以上。`,
      evidence: [{ questionIndex: question.index, optionIndexes: [], values: [m.nps, m.promoter, m.detractor] }]
    };
  }
  if (m.nps <= 0) {
    return {
      title: "NPS 非正，多为贬损者所拖累",
      conclusion: `NPS 为 ${m.nps}，贬损者 ${m.detractor}% 不低于推荐者 ${m.promoter}%，被动者 ${m.passive}% 占比突出，存在明显转化空间。`,
      evidence: [{ questionIndex: question.index, optionIndexes: [], values: [m.nps, m.promoter, m.detractor, m.passive] }]
    };
  }
  return null;
}

// 排序题发现：排名与第一名一致性，稳定次级需求
export function findingForRank(question, m) {
  if (!m.available) return null;
  const top = m.ranked[0];
  const topOpt = question.optionsArray?.[top.optionIndex] || `选项${top.optionIndex + 1}`;
  if (top && Number.isFinite(top.firstPct)) {
    const mention = m.consistent
      ? `且 ${top.firstPct}% 的样本将其排在第一位，首选优势明显。`
      : `但其第一名比例（${top.firstPct}%）并非最高，属于整体优先级平稳的前列选项。`;
    return {
      title: `「${topOpt}」是用户整体排序最靠前的选项`,
      conclusion: `「${topOpt}」的平均排名 ${top.avgRank}，${mention}`,
      evidence: [{
        questionIndex: question.index,
        optionIndexes: [top.optionIndex],
        values: [top.avgRank, Number.isFinite(top.firstPct) ? top.firstPct : 0]
      }]
    };
  }
  return null;
}

// 基于数据生成本地关键发现；AI 的 findings 若带证据则追加合并
export function buildKeyFindings(questions, analysis, env) {
  const findings = [];
  const seen = new Set();
  const push = (f) => {
    if (!f) return;
    const key = `${f.evidence?.[0]?.questionIndex || -1}:${f.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };
  // 单选题中最强的 2 个选择集中发现
  const singles = (questions || [])
    .filter((q) => q.dataStatus === "complete" && (q.type === "single" || q.type === "multiple"))
    .map((q) => ({ q, m: choiceMetrics(q) }))
    .filter((x) => x.m.available && x.m.top1 >= 38)
    .sort((a, b) => b.m.top1 - a.m.top1);
  singles.slice(0, 2).forEach((x) => push(findingForChoice(x.q, x.m, env)));
  // 矩阵差距
  (questions || [])
    .filter((q) => q.dataStatus === "complete" && q.type === "matrix")
    .forEach((q) => push(findingForMatrix(q, matrixMetrics(q))));
  // 量表高低评价
  (questions || [])
    .filter((q) => q.dataStatus === "complete" && q.type === "scale")
    .forEach((q) => push(findingForScale(q, scaleMetrics(q))));
  // NPS 正负
  (questions || [])
    .filter((q) => q.dataStatus === "complete" && q.type === "nps")
    .forEach((q) => push(findingForNps(q, npsMetrics(q))));
  // 排序题首选
  (questions || [])
    .filter((q) => q.dataStatus === "complete" && q.type === "rank")
    .forEach((q) => push(findingForRank(q, rankMetrics(q))));
  // 兜底：至少保留一条可追溯的发现
  if (findings.length === 0) {
    const q = (questions || []).find((x) => x.dataStatus === "complete" && (x.type === "single" || x.type === "multiple"));
    if (q) push(findingForChoice(q, choiceMetrics(q), env));
  }
  return findings.slice(0, 6);
}

// ===== 数据质量明细（异常分类，供总览卡片点击筛选） =====

const MATRIX_ERROR_TYPES = new Set([
  "matrix_row_count_mismatch", "matrix_row_missing", "matrix_row_dist_missing",
  "matrix_row_dist_mismatch", "matrix_row_missing_mean"
]);

export function makeQuantQualityDetails(questions, repairedIndexes = []) {
  const total = (questions || []).length;
  const complete = (questions || []).filter((q) => q.dataStatus === "complete").length;
  const pending = total - complete;
  const singleSum = [], scaleSum = [], matrixMissing = [], other = [];
  (questions || []).forEach((q) => {
    (q.dataErrors || []).forEach((e) => {
      if (e.errorType === "single_sum_not_100") singleSum.push(q.index);
      else if (e.errorType === "scale_sum_not_100" || e.errorType === "matrix_row_sum_not_100") scaleSum.push(q.index);
      else if (MATRIX_ERROR_TYPES.has(e.errorType)) matrixMissing.push(q.index);
      else other.push(q.index);
    });
  });
  const unique = (arr) => [...new Set(arr)];
  const anomalyIndexes = unique([...singleSum, ...scaleSum, ...matrixMissing, ...other]);
  return {
    total,
    complete,
    pending,
    repaired: repairedIndexes.length,
    completePct: total ? Math.round((complete / total) * 1000) / 10 : 0,
    singleSumAnomalies: unique(singleSum),
    scaleSumAnomalies: unique(scaleSum),
    matrixMissing: unique(matrixMissing),
    otherAnomalies: unique(other),
    anomalyIndexes,
    status: pending > 0 ? "pending" : (repairedIndexes.length > 0 ? "repaired" : "complete")
  };
}

// ===== 模拟交叉分析 =====

// 确定性伪随机（相同输入 → 相同输出）
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CROSSTAB_GROUP_TYPES = [
  { id: "tier", label: "高、中、低分组" },
  { id: "age", label: "年龄分组" },
  { id: "gender", label: "性别分组" },
  { id: "city", label: "城市分组" },
  { id: "usage", label: "使用频率分组" },
  { id: "price", label: "价格敏感度分组" }
];

function quotaWeights(env, dimensionIdOrName) {
  // v52：维度 id 不再固定为 "gender"/"age"/"city"，改为按 id 或 名称匹配。
  // 优先按 id 匹配（向后兼容旧调用），其次按名称匹配（性别/年龄/城市层级）。
  const quotaPlan = env.quotaPlan || [];
  let dim = quotaPlan.find((d) => d && d.id === dimensionIdOrName);
  if (!dim) {
    const nameMap = {
      gender: "性别",
      age: "年龄",
      city: "城市层级"
    };
    const targetName = nameMap[dimensionIdOrName] || dimensionIdOrName;
    dim = quotaPlan.find((d) => d && (d.enabled !== false) && String(d.name || "").trim() === targetName);
  }
  if (dim && dim.items && dim.items.length) {
    return dim.items.map((item) => ({ label: item.label, weight: Math.max(1, Number(item.pct) || 0) }));
  }
  return null;
}

function groupWeightsFor(questions, colType, env) {
  if (colType === "tier") {
    return [{ label: "高分组", weight: 33 }, { label: "中分组", weight: 34 }, { label: "低分组", weight: 33 }];
  }
  if (colType === "gender") {
    const w = quotaWeights(env, "gender");
    if (w) return w;
    return [{ label: "女性", weight: 55 }, { label: "男性", weight: 45 }];
  }
  if (colType === "age") {
    const w = quotaWeights(env, "age");
    if (w) return w;
    return [{ label: "较年轻", weight: 50 }, { label: "较年长", weight: 50 }];
  }
  if (colType === "city") {
    const w = quotaWeights(env, "city");
    if (w) return w;
    return [{ label: "一线城市", weight: 60 }, { label: "其他城市", weight: 40 }];
  }
  if (colType === "usage") {
    const q = (questions || []).find((x) => x.dataStatus === "complete" && /频率|多久|经常|每周|每月|使用次/.test(String(x.text || "")));
    if (q && Array.isArray(q.optionsArray) && q.optionsArray.length >= 2) {
      const vals = q.values || [];
      return q.optionsArray.slice(0, 3).map((label, i) => ({ label, weight: Math.max(1, Number(vals[i]) || 10) }));
    }
    return [{ label: "高频使用", weight: 45 }, { label: "中频使用", weight: 35 }, { label: "低频使用", weight: 20 }];
  }
  if (colType === "price") {
    const q = (questions || []).find((x) => x.dataStatus === "complete" && /价格敏感|对价格/.test(String(x.text || "")) && x.type === "scale");
    if (q && Array.isArray(q.distribution)) {
      const d = q.distribution;
      const n = d.length;
      const third = Math.max(1, Math.floor(n / 3));
      const neg = d.slice(0, third).reduce((s, v) => s + Number(v), 0);
      const pos = d.slice(n - third).reduce((s, v) => s + Number(v), 0);
      return [
        { label: "价格敏感", weight: Math.max(1, neg) },
        { label: "价格中立", weight: Math.max(1, 100 - neg - pos) },
        { label: "价格不敏感", weight: Math.max(1, pos) }
      ];
    }
    return [{ label: "价格敏感", weight: 40 }, { label: "价格中立", weight: 35 }, { label: "价格不敏感", weight: 25 }];
  }
  return [{ label: "全体", weight: 100 }];
}

// 模拟交叉：基于边际分布 + 确定性扰动，明确标注为模拟结果
export function buildSimulatedCrosstab(questions, config, env) {
  const rowQ = (questions || [])[config.rowIndex];
  if (!rowQ || (rowQ.type !== "single" && rowQ.type !== "multiple")) {
    return { error: "请选择一道单选或多选题作为行变量", config };
  }
  const groups = groupWeightsFor(questions, config.colType, env);
  const totalWeight = groups.reduce((s, g) => s + g.weight, 0);
  const base = choiceMetrics(rowQ);
  const rows = (rowQ.optionsArray || []).map((label, i) => {
    const baseValue = Number(rowQ.values?.[i]) || 0;
    const cells = groups.map((g, gi) => {
      const rnd = mulberry32(config.rowIndex * 7919 + i * 104729 + gi * 31 + config.colType.length * 7)();
      const bias = (g.label === "高分组" || g.label === "高频使用" || g.label === "价格敏感") ? 0.06 : (g.label === "低分组" || g.label === "低频使用" || g.label === "价格不敏感" ? -0.06 : 0);
      let v = baseValue * (1 + (rnd - 0.5) * 0.5 + bias);
      v = Math.max(1, Math.min(100, v));
      return round1(v);
    });
    return { label, cells, base: round1(baseValue) };
  });
  // 单选：每组行合计校正为接近 100
  if (rowQ.type === "single") {
    groups.forEach((_, gi) => {
      const sum = rows.reduce((s, r) => s + r.cells[gi], 0);
      if (sum > 0) {
        rows.forEach((r) => { r.cells[gi] = round1((r.cells[gi] / sum) * 100); });
        const diff = 100 - rows.reduce((s, r) => s + r.cells[gi], 0);
        if (rows.length && Math.abs(diff) >= 0.5) rows[0].cells[gi] = round1(rows[0].cells[gi] + diff);
      }
    });
  }
  // 指标变量：每个分组给出 Top2 Box 估计
  let metricRows = [];
  const metricQ = (questions || [])[config.metricIndex];
  if (metricQ && metricQ.dataStatus === "complete") {
    let top2 = null;
    if (metricQ.type === "scale") top2 = scaleMetrics(metricQ).top2box;
    else if (metricQ.type === "single" || metricQ.type === "multiple") top2 = choiceMetrics(metricQ).top2Sum;
    if (top2 !== null) {
      metricRows = [{
        label: `${metricQ.text}（Top2Box）`,
        cells: groups.map((g, gi) => {
          const rnd = mulberry32(config.metricIndex * 65537 + gi * 101 + 13)();
          const v = top2 * (1 + (rnd - 0.5) * 0.5) + (g.weight > totalWeight / groups.length ? 4 : -4);
          return round1(Math.max(5, Math.min(98, v)));
        }),
        base: round1(top2)
      }];
    }
  }
  return {
    rowIndex: config.rowIndex,
    colType: config.colType,
    metricIndex: config.metricIndex,
    rowText: rowQ.text,
    groups,
    rows,
    metricRows,
    base: base,
    isSimulated: true,
    notice: "该交叉结果为基于合成人群和边际分布生成的模拟结果，不替代真实样本交叉统计。",
    generatedAt: new Date().toISOString()
  };
}

// ===== 报告故事线 =====

export const STORY_CHAPTERS = [
  { id: "background", title: "研究背景" },
  { id: "conclusion", title: "核心结论" },
  { id: "profile", title: "人群特征" },
  { id: "behavior", title: "使用行为" },
  { id: "needs", title: "核心需求" },
  { id: "barriers", title: "主要障碍" },
  { id: "concept", title: "概念评价" },
  { id: "purchase", title: "购买意愿" },
  { id: "price_channel", title: "价格和渠道" },
  { id: "actions", title: "行动建议" }
];

function chartTypeOf(q) {
  if (!q) return "summary_card";
  if (q.type === "single") return "horizontal_bar";
  if (q.type === "multiple") return "horizontal_bar";
  if (q.type === "scale") return "scale_histogram";
  if (q.type === "matrix") return "matrix_ranking";
  return "summary_card";
}

function choiceSlide(q, m) {
  const evidence = m.ranked.slice(0, 3).map((r) => `${r.label}${r.value}%`);
  return {
    title: `第 ${q.index + 1} 题：${q.text}`,
    conclusion: `「${m.top1Label}」占比最高（${m.top1}%）${m.ranked[1] ? `，其次「${m.ranked[1].label}」（${m.ranked[1].value}%）` : ""}。`,
    questionIndexes: [q.index],
    chartType: chartTypeOf(q),
    evidence
  };
}

function scaleSlide(q, m) {
  return {
    title: `第 ${q.index + 1} 题：${q.text}`,
    conclusion: `均值 ${m.mean}（${q.scale} 分制），Top2 Box ${m.top2box}%，中位数约 ${m.median} 分。`,
    questionIndexes: [q.index],
    chartType: chartTypeOf(q),
    evidence: [`均值 ${m.mean}`, `Top2Box ${m.top2box}%`, `中位数 ${m.median}`]
  };
}

function matrixSlide(q, m) {
  return {
    title: `第 ${q.index + 1} 题：${q.text}`,
    conclusion: `「${m.topRow.label}」均值最高（${m.topRow.mean}），与最低维度「${m.bottomRow.label}」（${m.bottomRow.mean}）差距 ${m.gap} 分。`,
    questionIndexes: [q.index],
    chartType: chartTypeOf(q),
    evidence: m.ranked.slice(0, 3).map((r) => `${r.label}${r.mean}分`)
  };
}

// v52 新题型故事线 slide
function rankSlide(q, m) {
  const ev = m.ranked.slice(0, 3).map((r) => `${r.label} 均排${r.avgRank}（第一${r.firstPct}%）`);
  return {
    title: `第 ${q.index + 1} 题：${q.text}`,
    conclusion: `「${m.ranked[0]?.label}」平均排名 ${m.ranked[0]?.avgRank} 最靠前${m.firstLeader && m.firstLeader.optionIndex !== m.ranked[0]?.optionIndex ? `；「${m.firstLeader.label}」第一名比例最高（${m.firstLeader.firstPct}%）` : ""}。`,
    questionIndexes: [q.index],
    chartType: "ranking",
    evidence: ev
  };
}

function npsSlide(q, m) {
  return {
    title: `第 ${q.index + 1} 题：${q.text}`,
    conclusion: `NPS 为 ${m.nps}（推荐者 ${m.promoter}% − 贬损者 ${m.detractor}%），被动者 ${m.passive}%。`,
    questionIndexes: [q.index],
    chartType: "nps",
    evidence: [`NPS ${m.nps}`, `推荐者 ${m.promoter}%`, `贬损者 ${m.detractor}%`]
  };
}

function numericSlide(q, m) {
  return {
    title: `第 ${q.index + 1} 题：${q.text}`,
    conclusion: `均值 ${m.mean}${m.unit || ""}，中位数 ${m.median}${m.unit || ""}，四分位区间 ${m.p25}~${m.p75}${m.unit || ""}。`,
    questionIndexes: [q.index],
    chartType: "numeric_histogram",
    evidence: [`均值 ${m.mean}${m.unit || ""}`, `中位数 ${m.median}${m.unit || ""}`, `区间 ${m.p25}~${m.p75}${m.unit || ""}`]
  };
}

function openSlide(q, m) {
  return {
    title: `第 ${q.index + 1} 题：${q.text}`,
    conclusion: `提及率最高主题为「${m.top?.name}」（${m.top?.pct}%），共聚类 ${m.themeCount} 个主题。`,
    questionIndexes: [q.index],
    chartType: "theme_list",
    evidence: m.top3.map((t) => `${t.name} ${t.pct}%`)
  };
}

function allocationSlide(q, m) {
  return {
    title: `第 ${q.index + 1} 题：${q.text}`,
    conclusion: `「${m.top1.label}」平均分配 ${m.top1.meanPoints} 分（占 ${m.total ? Math.round((m.top1.meanPoints / m.total) * 100) : 0}%），Top2 合计占比 ${m.top2Pct}%。`,
    questionIndexes: [q.index],
    chartType: "total_allocation",
    evidence: m.ranked.slice(0, 3).map((r) => `${r.label} ${r.meanPoints}分`)
  };
}

// 按题型生成故事线 slide
function slideForType(q) {
  const m = computeQuestionMetrics(q);
  if (q.type === "scale") return scaleSlide(q, m);
  if (q.type === "matrix") return matrixSlide(q, m);
  if (q.type === "rank") return rankSlide(q, m);
  if (q.type === "nps") return npsSlide(q, m);
  if (q.type === "numeric") return numericSlide(q, m);
  if (q.type === "open") return openSlide(q, m);
  if (q.type === "allocation") return allocationSlide(q, m);
  return choiceSlide(q, m);
}

function findQuestionsByModule(questions, moduleId, max = 3) {
  return (questions || []).filter((q) => q.module === moduleId && q.dataStatus === "complete").slice(0, max);
}

function slideForQuestions(questions, indexes, conclusion, chartType = "horizontal_bar", evidence = []) {
  const realIndexes = indexes.filter((i) => questions[i] && questions[i].dataStatus === "complete");
  return {
    title: realIndexes.map((i) => `Q${i + 1}`).join(" + ") + (realIndexes.length ? ` · ${String(questions[realIndexes[0]].text).slice(0, 18)}…` : ""),
    conclusion,
    questionIndexes: realIndexes,
    chartType,
    evidence
  };
}

// 本地兜底故事线：完全从数据生成，每个章节都绑定题目与数据
export function buildStoryline(questions, analysis, findings, env, sampleSize) {
  const chapters = [];
  const slidesByModule = (moduleId, max) => findQuestionsByModule(questions, moduleId, max).map((q) => slideForType(q));

  chapters.push({
    id: "background",
    title: "研究背景",
    slides: [{
      title: `${env.topic}`,
      conclusion: `本研究报告基于 ${sampleSize} 份合成样本（${env.audienceConfig.age}，${env.audienceConfig.city}，${env.audienceConfig.income}）生成，用于概念验证与假设预检。`,
      questionIndexes: [],
      chartType: "summary_card",
      evidence: [`样本量 N=${sampleSize}`, `人群：${env.audienceConfig.age} / ${env.audienceConfig.city}`]
    }]
  });

  const top = (findings || []).slice(0, 3);
  chapters.push({
    id: "conclusion",
    title: "核心结论",
    slides: top.length ? top.map((f, i) => ({
      title: `发现${i + 1}：${f.title}`,
      conclusion: f.conclusion,
      questionIndexes: (f.evidence || []).map((e) => e.questionIndex),
      chartType: "summary_card",
      evidence: (f.evidence || []).flatMap((e) => (e.values || []).map((v, j) => v))
    })) : [{
      title: "核心结论",
      conclusion: "请先生成关键发现，或检查题目数据完整度。",
      questionIndexes: [],
      chartType: "summary_card",
      evidence: []
    }]
  });

  const profileQ = findQuestionsByModule(questions, "demographics", 3);
  chapters.push({
    id: "profile",
    title: "人群特征",
    slides: profileQ.length ? profileQ.map((q) => slideForType(q)) : [slideForQuestions(questions, [], `样本配额：${env.quotaText || "见配额设计"}。`, "summary_card", ["配额由人群画像自动生成"])]
  });

  const behaviorQ = findQuestionsByModule(questions, "behavior", 3);
  chapters.push({
    id: "behavior",
    title: "使用行为",
    slides: behaviorQ.length ? behaviorQ.map((q) => slideForType(q)) : [slideForQuestions(questions, [], "未识别到使用行为类题目，可在「题目目录」中手动修改模块归类。", "summary_card", [])]
  });

  const needsQ = findQuestionsByModule(questions, "needs", 3);
  chapters.push({
    id: "needs",
    title: "核心需求",
    slides: needsQ.length ? needsQ.map((q) => slideForType(q)) : [slideForQuestions(questions, [], "未识别到需求类题目，可在「题目目录」中手动修改模块归类。", "summary_card", [])]
  });

  const painQ = findQuestionsByModule(questions, "needs", 6).filter((q) => /痛点|困扰|顾虑|担心|障碍|不满/.test(String(q.text || ""))).slice(0, 2);
  chapters.push({
    id: "barriers",
    title: "主要障碍",
    slides: painQ.length ? painQ.map((q) => slideForType(q)) : (needsQ.length ? [{ ...slideForType(needsQ[0]), title: `第 ${needsQ[0].index + 1} 题：${needsQ[0].text}` }] : [slideForQuestions(questions, [], "未识别到障碍/痛点类题目。", "summary_card", [])])
  });

  const conceptQ = findQuestionsByModule(questions, "concept", 2);
  chapters.push({
    id: "concept",
    title: "概念评价",
    slides: conceptQ.length ? conceptQ.map((q) => slideForType(q)) : [slideForQuestions(questions, [], "未识别到概念测试类题目。", "summary_card", [])]
  });

  const purchaseQ = findQuestionsByModule(questions, "purchase", 2);
  chapters.push({
    id: "purchase",
    title: "购买意愿",
    slides: purchaseQ.length ? purchaseQ.map((q) => slideForType(q)) : [slideForQuestions(questions, [], "未识别到购买意愿类题目。", "summary_card", [])]
  });

  const priceQ = findQuestionsByModule(questions, "price", 2);
  const channelQ = findQuestionsByModule(questions, "channel", 2);
  const pcSlides = [];
  priceQ.forEach((q) => pcSlides.push(slideForType(q)));
  channelQ.forEach((q) => pcSlides.push(slideForType(q)));
  chapters.push({
    id: "price_channel",
    title: "价格和渠道",
    slides: pcSlides.length ? pcSlides : [slideForQuestions(questions, [], "未识别到价格/渠道类题目。", "summary_card", [])]
  });

  const actionSlides = (findings || []).slice(0, 3).map((f, i) => ({
    title: `行动建议 ${i + 1}`,
    conclusion: `围绕「${f.title}」：优先资源投入在 Q${(f.evidence?.[0]?.questionIndex ?? 0) + 1} 所反映的方向，并在正式调研中做分群验证。`,
    questionIndexes: (f.evidence || []).map((e) => e.questionIndex),
    chartType: "summary_card",
    evidence: (f.evidence || []).flatMap((e) => (e.values || []).map((v) => `${v}%`))
  }));
  chapters.push({
    id: "actions",
    title: "行动建议",
    slides: actionSlides.length ? actionSlides : [{
      title: "行动建议",
      conclusion: "建议先完成数据修复，再生成报告故事线。",
      questionIndexes: [],
      chartType: "summary_card",
      evidence: []
    }]
  });

  return { chapters, generated: "local", generatedAt: new Date().toISOString() };
}

// AI 生成故事线的提示词（章节固定为 STORY_CHAPTERS，每章 1-3 页）
export function buildStorylinePrompt(env, questions, findings) {
  const complete = (questions || []).filter((q) => q.dataStatus === "complete");
  const dataLines = complete.map((q) => {
    if (q.type === "scale") {
      return `第${q.index + 1}题（${q.moduleLabel || "量表"}·${q.scale}分）：均值 ${q.mean}，dist=[${q.distribution.join(",")}]`;
    }
    if (q.type === "matrix") {
      return `第${q.index + 1}题（矩阵·${q.moduleLabel || ""}）：${q.matrix.map((r) => `${r.row} ${r.mean}分`).join("；")}`;
    }
    return `第${q.index + 1}题（${q.type === "multiple" ? "多选" : "单选"}·${q.moduleLabel || ""}）：${(q.optionsArray || []).map((o, i) => `${o} ${q.values?.[i]}%`).join("，")}`;
  }).join("\n");
  const findingLines = (findings || []).map((f, i) => `发现${i + 1}：${f.title}（${f.conclusion}）`).join("\n");
  const chapterTitles = STORY_CHAPTERS.map((c, i) => `${i + 1}. ${c.title}`).join("\n");
  return `${buildPromptHeader(env)}
## 已生成的有效统计数据
${dataLines}

## 已确认的关键发现
${findingLines || "（暂无）"}

## 任务
基于以上数据生成报告故事线，严格按以下 JSON 输出（不要包含 markdown 代码块标记）：
{"storyline":{"chapters":[{"title":"章节标题","slides":[{"title":"页面标题","conclusion":"页面结论(30字以内)","questionIndexes":[题目索引数组],"chartType":"horizontal_bar|scale_histogram|matrix_ranking|summary_card","evidence":["证据1","证据2"]}]}]}}

固定章节标题（必须全部包含，顺序如下）：
${chapterTitles}

要求：
1. 每个章节 1-3 页 slides，questionIndexes 必须引用上面统计数据中存在的题目索引；
2. 每页 evidence 必须引用该页题目中的真实数字（如「行车记录68%」）；
3. 结论必须与数据一致，禁止编造数据；
4. 只输出 JSON，不要输出任何其他文字。`;
}

// 校验 AI 返回的故事线结构，过滤无效题目引用
export function normalizeStoryline(raw, questions, fallback) {
  const chapters = Array.isArray(raw?.storyline?.chapters) ? raw.storyline.chapters : [];
  if (chapters.length === 0) return fallback;
  const indexSet = new Set((questions || []).map((q) => q.index));
  const mapTitle = STORY_CHAPTERS.map((c) => c.title);
  const ordered = mapTitle
    .map((title) => chapters.find((c) => c && String(c.title || "").includes(title)))
    .filter(Boolean)
    .map((c) => ({
      title: c.title,
      slides: (Array.isArray(c.slides) ? c.slides : []).slice(0, 5).map((s) => ({
        title: String(s.title || "").slice(0, 60),
        conclusion: String(s.conclusion || "").slice(0, 120),
        questionIndexes: (Array.isArray(s.questionIndexes) ? s.questionIndexes : [])
          .filter((i) => indexSet.has(i))
          .slice(0, 6),
        chartType: ["horizontal_bar", "scale_histogram", "matrix_ranking", "crosstab_table", "summary_card"].includes(s.chartType) ? s.chartType : "summary_card",
        evidence: (Array.isArray(s.evidence) ? s.evidence : []).map(String).slice(0, 8)
      })).filter((s) => s.title || s.conclusion)
    }));
  if (ordered.length < 3) return fallback;
  return { chapters: ordered, generated: "ai", generatedAt: new Date().toISOString() };
}

// ===== Excel 导出（零依赖最小 XLSX 写入器） =====

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function colName(index) {
  let name = "";
  let i = index;
  while (i >= 0) {
    name = String.fromCharCode(65 + (i % 26)) + name;
    i = Math.floor(i / 26) - 1;
  }
  return name;
}

function sheetXml(rows) {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const dim = `A1:${colName(Math.max(0, maxCols - 1))}${Math.max(1, rows.length)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dim}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="16"/><sheetData>${rows.map((row, ri) => `<row r="${ri + 1}">${row.map((value, ci) => {
    if (value === null || value === undefined || value === "") return "";
    const ref = `${colName(ci)}${ri + 1}`;
    if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
    const s = ri === 0 ? ' s="1"' : "";
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  }).join("")}</row>`).join("")}</sheetData></worksheet>`;
}

// sheets: [{ name, rows: [[string|number|null, ...], ...] }]（首行为表头，加粗）
export function buildXlsxZip(sheets) {
  const encoder = new TextEncoder();
  const files = [];
  files.push(["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`]);
  files.push(["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`]);
  files.push(["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`]);
  files.push(["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`]);
  files.push(["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`]);
  sheets.forEach((s, i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)]));

  // 组装 ZIP（STORED 无压缩，Excel 兼容）
  // 布局：所有本地条目（localOffset 累计）→ 中央目录（cdStart = 本地总长）→ EOCD
  const chunks = [];
  const central = [];
  let localOffset = 0;   // 只累计本地条目长度（中央目录起始位置）
  let totalOffset = 0;   // 累计所有字节（决定输出数组长度）
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  const pushBytes = (data) => {
    chunks.push(data);
    return data.length;
  };
  const u16 = (view, value, pos) => { view.setUint16(pos, value, true); };
  const u32 = (view, value, pos) => { view.setUint32(pos, value, true); };

  for (const [name, content] of files) {
    const data = encoder.encode(content);
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    u32(header, 0x04034b50, 0);
    u16(header, 20, 4);
    u16(header, 0x0800, 6);
    u16(header, 0, 8);
    u16(header, dosTime, 10);
    u16(header, dosDate, 12);
    u32(header, crc, 14);
    u32(header, data.length, 18);
    u32(header, data.length, 22);
    u16(header, name.length, 26);
    u16(header, 0, 28);
    const nameBytes = encoder.encode(name);
    const headerBytes = new Uint8Array(header.buffer);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    local.set(headerBytes, 0);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    const localStart = localOffset;
    pushBytes(local);
    localOffset += local.length;
    totalOffset += local.length;

    const cd = new DataView(new ArrayBuffer(46));
    u32(cd, 0x02014b50, 0);
    u16(cd, 20, 4);
    u16(cd, 20, 6);
    u16(cd, 0x0800, 8);
    u16(cd, 0, 10);
    u16(cd, dosTime, 12);
    u16(cd, dosDate, 14);
    u32(cd, crc, 16);
    u32(cd, data.length, 20);
    u32(cd, data.length, 24);
    u16(cd, name.length, 28);
    u32(cd, localStart, 42);   // 本地文件头偏移（必须指向实际布局位置）
    const cdBytes = new Uint8Array(cd.buffer);
    const cdEntry = new Uint8Array(46 + nameBytes.length);
    cdEntry.set(cdBytes, 0);
    cdEntry.set(nameBytes, 46);
    central.push({ bytes: cdEntry });
    totalOffset += cdEntry.length;
  }

  const cdSize = central.reduce((s, c) => s + c.bytes.length, 0);
  const cdStart = localOffset;   // 中央目录在输出文件中的起始位置
  const eocd = new DataView(new ArrayBuffer(22));
  u32(eocd, 0x06054b50, 0);
  u16(eocd, 0, 4);
  u16(eocd, 0, 6);
  u16(eocd, files.length, 8);
  u16(eocd, files.length, 10);
  u32(eocd, cdSize, 12);
  u32(eocd, cdStart, 16);
  u16(eocd, 0, 20);
  const all = new Uint8Array(totalOffset + 22);
  let pos = 0;
  for (const c of chunks) { all.set(c, pos); pos += c.length; }
  for (const c of central) { all.set(c.bytes, pos); pos += c.bytes.length; }
  all.set(new Uint8Array(eocd.buffer), pos);
  return all;
}

// ===== Excel 工作表数据构建 =====

function qualitySheetRows(result) {
  const d = result.qualityDetails;
  return [
    ["指标", "数值", "说明"],
    ["问卷总题数", d.total, ""],
    ["完整题目数", d.complete, "数据状态为 complete"],
    ["自动修复题目数", d.repaired, "由 AI 自动修复"],
    ["仍有异常题目数", d.pending, "需要重新生成或人工处理"],
    ["数据完整度", `${d.completePct}%`, "完整题目 / 总题数"],
    ["单选合计异常", d.singleSumAnomalies.length, d.singleSumAnomalies.map((i) => `Q${i + 1}`).join("、")],
    ["量表分布异常", d.scaleSumAnomalies.length, d.scaleSumAnomalies.map((i) => `Q${i + 1}`).join("、")],
    ["矩阵缺失", d.matrixMissing.length, d.matrixMissing.map((i) => `Q${i + 1}`).join("、")],
    ["其他异常", d.otherAnomalies.length, d.otherAnomalies.map((i) => `Q${i + 1}`).join("、")]
  ];
}

function questionListRows(result) {
  return [
    ["题号", "题干", "题型", "模块", "数据状态", "数据来源", "人工修改", "修改时间", "异常明细"],
    ...(result.questions || []).map((q) => [
      `Q${q.index + 1}`,
      q.text || "",
      { single: "单选", multiple: "多选", scale: "量表", matrix: "矩阵" }[q.type] || q.type,
      q.moduleLabel || MODULE_LABEL[q.module] || "其他",
      q.dataStatus,
      sourceLabel(q.source),
      q.modifiedByUser ? "是" : "否",
      q.modifiedAt || "",
      (q.dataErrors || []).map((e) => e.message).join("；")
    ])
  ];
}

function choiceSheetRows(result) {
  const rows = [["题号", "题干", "题型", "选项", "百分比", "数据状态"]];
  (result.questions || []).forEach((q) => {
    if (q.type !== "single" && q.type !== "multiple") return;
    (q.optionsArray || []).forEach((o, i) => {
      const v = q.values?.[i];
      rows.push([
        `Q${q.index + 1}`,
        q.text || "",
        q.type === "single" ? "单选" : "多选",
        o,
        Number.isFinite(Number(v)) ? Number(v) : "数据缺失",
        q.dataStatus === "complete" ? "完整" : (q.dataError || "数据缺失")
      ]);
    });
  });
  return rows;
}

function scaleSheetRows(result) {
  const rows = [["题号", "题干", "量表", "档位", "分布%", "均值", "标准差", "数据状态"]];
  (result.questions || []).forEach((q) => {
    if (q.type !== "scale") return;
    (q.distribution || []).forEach((v, i) => {
      rows.push([
        `Q${q.index + 1}`,
        q.text || "",
        q.scale || "",
        `${i + 1} 分`,
        Number.isFinite(Number(v)) ? Number(v) : "数据缺失",
        Number.isFinite(Number(q.mean)) ? Number(q.mean) : "数据缺失",
        Number.isFinite(Number(q.sd)) ? Number(q.sd) : "数据缺失",
        q.dataStatus === "complete" ? "完整" : (q.dataError || "数据缺失")
      ]);
    });
  });
  return rows;
}

function matrixSheetRows(result) {
  const rows = [["题号", "题干", "矩阵行", "均值", "分布", "数据状态"]];
  (result.questions || []).forEach((q) => {
    if (q.type !== "matrix") return;
    (q.matrix || []).forEach((r) => {
      const dist = (r.distribution || []).every((v) => Number.isFinite(Number(v)))
        ? r.distribution.join("/")
        : "数据缺失";
      rows.push([
        `Q${q.index + 1}`,
        q.text || "",
        r.row,
        Number.isFinite(Number(r.mean)) ? Number(r.mean) : "数据缺失",
        dist,
        r.rowStatus === "complete" ? "完整" : (r.dataError || "数据缺失")
      ]);
    });
  });
  return rows;
}

function findingsSheetRows(result) {
  return [
    ["发现", "结论", "证据（题目/选项/数值）"],
    ...(result.keyFindings || []).map((f, i) => {
      const ev = (f.evidence || []).map((e) => {
        const q = result.questions?.[e.questionIndex];
        const opts = (e.optionIndexes || []).map((oi, j) => {
          const label = q?.optionsArray?.[oi] || (q?.matrix?.[oi]?.row) || `选项${oi + 1}`;
          return `${q ? `Q${q.index + 1}` : "Q?"}「${label}」${e.values?.[j] ?? ""}${e.values?.[j] !== undefined ? "%" : ""}`;
        }).join("，");
        return opts;
      }).join("；");
      return [`发现${i + 1}：${f.title}`, f.conclusion || "", ev];
    })
  ];
}

function anomalySheetRows(result) {
  const rows = [["题号", "错误类型", "说明"]];
  (result.questions || []).forEach((q) => {
    (q.dataErrors || []).forEach((e) => {
      rows.push([`Q${q.index + 1}`, e.errorType, e.message]);
    });
  });
  return rows;
}

function historySheetRows(result) {
  const rows = [["题号", "时间", "操作", "说明"]];
  (result.questions || []).forEach((q) => {
    (q.editHistory || []).forEach((h) => {
      rows.push([`Q${q.index + 1}`, h.at || "", h.action || "", h.detail || ""]);
    });
  });
  return rows;
}

export function buildQuantWorkbook(result) {
  const sheets = [
    { name: "数据质量", rows: qualitySheetRows(result) },
    { name: "题目列表", rows: questionListRows(result) },
    { name: "单选多选结果", rows: choiceSheetRows(result) },
    { name: "排序题结果", rows: rankSheetRows(result) },
    { name: "量表/NPS结果", rows: scaleSheetRows(result) },
    { name: "矩阵结果", rows: matrixSheetRows(result) },
    { name: "数值/开放/定和", rows: advancedSheetRows(result) },
    { name: "关键发现", rows: findingsSheetRows(result) },
    { name: "异常题目", rows: anomalySheetRows(result) },
    { name: "修改记录", rows: historySheetRows(result) }
  ];
  return buildXlsxZip(sheets);
}

// ===== v52 新题型 Excel 行 =====

function rankSheetRows(result) {
  const rows = [["题号", "题干", "排名", "选项", "平均排名", "第一名比例", "前三比例", "名次分布", "数据状态"]];
  (result.questions || []).forEach((q) => {
    if (q.type !== "rank") return;
    const ranked = [...(q.items || [])].sort((a, b) => Number(a.avgRank) - Number(b.avgRank));
    ranked.forEach((it, k) => {
      rows.push([
        `Q${q.index + 1}`, q.text || "", k + 1, it.label || "",
        Number.isFinite(Number(it.avgRank)) ? it.avgRank : "数据缺失",
        Number.isFinite(Number(it.firstPct)) ? it.firstPct : "数据缺失",
        Number.isFinite(Number(it.top3Pct)) ? it.top3Pct : "数据缺失",
        (it.rankDistribution || []).every((v) => Number.isFinite(Number(v))) ? it.rankDistribution.join("/") : "数据缺失",
        q.dataStatus === "complete" ? "完整" : (q.dataError || "数据缺失")
      ]);
    });
  });
  return rows;
}

function advancedSheetRows(result) {
  const rows = [["题号", "题干", "题型", "指标", "数值", "备注"]];
  const typeName = (t) => TYPE_LABEL[t] || t;
  (result.questions || []).forEach((q) => {
    const remark = q.dataStatus !== "complete" ? (q.dataError || "数据缺失") : "";
    if (q.type === "numeric") {
      rows.push([`Q${q.index + 1}`, q.text || "", "数值题", "均值", Number.isFinite(Number(q.mean)) ? `${q.mean}${q.unit || ""}` : "数据缺失", remark]);
      rows.push([`Q${q.index + 1}`, q.text || "", "数值题", "中位数", Number.isFinite(Number(q.median)) ? `${q.median}${q.unit || ""}` : "数据缺失", remark]);
      rows.push([`Q${q.index + 1}`, q.text || "", "数值题", "四分位区间", (Number.isFinite(Number(q.p25)) && Number.isFinite(Number(q.p75))) ? `${q.p25}~${q.p75}${q.unit || ""}` : "数据缺失", remark]);
      (q.distribution || []).forEach((d) => {
        rows.push([`Q${q.index + 1}`, q.text || "", "数值题", `分段：${d.label}`, Number.isFinite(Number(d.pct)) ? `${d.pct}%` : "数据缺失", remark]);
      });
    } else if (q.type === "open") {
      (q.themes || []).forEach((t) => {
        rows.push([`Q${q.index + 1}`, q.text || "", "开放题", `主题：${t.name}`, Number.isFinite(Number(t.pct)) ? `${t.pct}%` : "数据缺失", String(t.summary || "") + (t.quotes && t.quotes.length ? `（合成原声：${t.quotes[0]}）` : "")]);
      });
    } else if (q.type === "allocation") {
      (q.items || []).forEach((it) => {
        rows.push([`Q${q.index + 1}`, q.text || "", "定和分配", it.label || "选项", Number.isFinite(Number(it.meanPoints)) ? it.meanPoints : "数据缺失", `中位${Number.isFinite(Number(it.medianPoints)) ? it.medianPoints : "数据缺失"}`]);
      });
    } else if (q.type === "nps") {
      rows.push([`Q${q.index + 1}`, q.text || "", "NPS", "NPS", Number.isFinite(Number(q.nps)) ? q.nps : "数据缺失", remark]);
      rows.push([`Q${q.index + 1}`, q.text || "", "NPS", "推荐者/被动者/贬损者", `${Number.isFinite(Number(q.promoterPct)) ? q.promoterPct : "数据缺失"} / ${Number.isFinite(Number(q.passivePct)) ? q.passivePct : "数据缺失"} / ${Number.isFinite(Number(q.detractorPct)) ? q.detractorPct : "数据缺失"}`, remark]);
    }
  });
  return rows;
}

export function buildQualityWorkbook(result) {
  const sheets = [
    { name: "数据质量", rows: qualitySheetRows(result) },
    { name: "题目列表", rows: questionListRows(result) },
    { name: "异常题目", rows: anomalySheetRows(result) },
    { name: "修改记录", rows: historySheetRows(result) }
  ];
  return buildXlsxZip(sheets);
}

// ===== 完整 Markdown 分析报告（v50 工作台版） =====

function valueText(v) {
  return Number.isFinite(Number(v)) ? `${Number(v)}%` : "数据缺失";
}

export function buildQuantWorkbenchMarkdown(result, env) {
  const d = result.qualityDetails || makeQuantQualityDetails(result.questions || [], result.dataQuality?.repaired || []);
  const lines = [];
  lines.push(`# ${env.topic} - 定量分析报告`, "");
  lines.push(`> 合成样本 N=${env.sampleSize}，人群：${env.audienceConfig.age} / ${env.audienceConfig.gender} / ${env.audienceConfig.city}`);
  lines.push(`> 生成时间：${new Date().toISOString()}`);

  lines.push("", "## 一、数据质量");
  lines.push(
    `- 数据完整度：${d.completePct}%（${d.complete}/${d.total} 题完整）`,
    `- 自动修复题目：${d.repaired} 道`,
    `- 仍有异常题目：${d.pending} 道`,
    `- 单选合计异常：${d.singleSumAnomalies.length} 道（${d.singleSumAnomalies.map((i) => `Q${i + 1}`).join("、")}）`,
    `- 量表分布异常：${d.scaleSumAnomalies.length} 道（${d.scaleSumAnomalies.map((i) => `Q${i + 1}`).join("、")}）`,
    `- 矩阵缺失：${d.matrixMissing.length} 道（${d.matrixMissing.map((i) => `Q${i + 1}`).join("、")}）`,
    "> 缺失值从未被当作 0%，均以「数据缺失」标记。"
  );

  if ((result.coreMetrics || []).length) {
    lines.push("", "## 二、核心指标");
    result.coreMetrics.forEach((m) => {
      lines.push(`- **${m.label}**（Q${m.questionIndex + 1}）：${m.headline}。${m.detail}${m.relation ? ` ${m.relation}` : ""}`);
    });
  }

  if ((result.keyFindings || []).length) {
    lines.push("", "## 三、关键发现（附证据）");
    result.keyFindings.forEach((f, i) => {
      const ev = (f.evidence || []).map((e) => {
        const q = result.questions?.[e.questionIndex];
        const qLabel = q ? `Q${q.index + 1}「${q.text}」` : `Q${(e.questionIndex ?? 0) + 1}`;
        const parts = (e.optionIndexes || []).map((oi, j) => {
          const label = q?.optionsArray?.[oi] || q?.matrix?.[oi]?.row || `选项${oi + 1}`;
          return `「${label}」${e.values?.[j] ?? ""}${e.values?.[j] !== undefined ? "%" : ""}`;
        });
        return `${qLabel}：${parts.join("，")}`;
      }).join("；");
      lines.push(`**发现${i + 1}：${f.title}**`, f.conclusion, `- 证据：${ev}`);
    });
  }

  lines.push("", "## 四、题目与模块");
  lines.push("| 题号 | 模块 | 题型 | 状态 | 来源 | 题干 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  (result.questions || []).forEach((q) => {
    lines.push(`| Q${q.index + 1} | ${q.moduleLabel || MODULE_LABEL[q.module] || "其他"} | ${TYPE_LABEL[q.type] || q.type} | ${q.dataStatus} | ${sourceLabel(q.source)} | ${String(q.text || "").replace(/\|/g, "\\|")} |`);
  });

  lines.push("", "## 五、逐题统计");
  (result.questions || []).forEach((q) => {
    const status = q.dataStatus === "complete" ? "" : `（⚠️ ${q.dataError || "数据缺失"}）`;
    lines.push(`### Q${q.index + 1} ${q.text}${status}`);
    if (q.type === "scale") {
      const m = scaleMetrics(q);
      lines.push(`- 均值 ${m.mean}，Top2Box ${m.top2box}%，Bottom2Box ${m.bottom2box}%`);
      (q.distribution || []).forEach((v, i) => {
        lines.push(`  - ${i + 1} 分：${Number.isFinite(Number(v)) ? `${Number(v)}%` : "数据缺失"}`);
      });
    } else if (q.type === "matrix") {
      (q.matrix || []).forEach((r) => {
        lines.push(`  - ${r.row}：均值 ${Number.isFinite(Number(r.mean)) ? r.mean : "数据缺失"}${(r.distribution || []).some((v) => !Number.isFinite(Number(v))) ? "（分布缺失）" : ""}`);
      });
    } else if (q.type === "rank") {
      // 排序题：平均排名表格
      const m = rankMetrics(q);
      if (m.available) {
        const header = `| 排名 | 选项 | 平均排名 | 第一名比例 | 前三比例 |`;
        const sep = `| --- | --- | --- | --- | --- |`;
        lines.push(header, sep);
        m.ranked.forEach((it, k) => {
          lines.push(`| ${k + 1} | ${it.label} | ${it.avgRank} | ${Number.isFinite(Number(it.firstPct)) ? `${it.firstPct}%` : "数据缺失"} | ${Number.isFinite(Number(it.top3Pct)) ? `${it.top3Pct}%` : "数据缺失"} |`);
        });
        if (q.unrankedPct !== null) lines.push(`- 未进入前 N 比例：${q.unrankedPct}%`);
      } else {
        lines.push("- 数据缺失");
      }
    } else if (q.type === "nps") {
      const m = npsMetrics(q);
      if (m.available) {
        lines.push(`- **NPS：${m.nps}**（推荐者 ${m.promoter}% − 贬损者 ${m.detractor}%）`);
        lines.push(`- 推荐者 ${m.promoter}% / 被动者 ${m.passive}% / 贬损者 ${m.detractor}% / 均值 ${m.mean}`);
        lines.push(`- 0-10 分布：${q.distribution.join(" / ")}`);
      } else {
        lines.push("- 数据缺失");
      }
    } else if (q.type === "numeric") {
      const m = numericMetrics(q);
      if (m.available) {
        lines.push(`- 均值：${m.mean}${q.unit || ""} ｜ 中位数：${m.median}${q.unit || ""} ｜ 四分位区间：${m.p25}～${m.p75}${q.unit || ""}`);
        (q.distribution || []).forEach((d) => {
          lines.push(`  - ${d.label}：${Number.isFinite(Number(d.pct)) ? `${d.pct}%` : "数据缺失"}`);
        });
      } else {
        lines.push("- 数据缺失");
      }
    } else if (q.type === "open") {
      (q.themes || []).forEach((t, k) => {
        lines.push(`  - 主题${k + 1}：${t.name}，提及率 ${Number.isFinite(Number(t.pct)) ? `${t.pct}%` : "数据缺失"}${t.summary ? `；${t.summary}` : ""}${t.quotes && t.quotes.length ? `（合成原声示例：${t.quotes[0]}）` : ""}`);
      });
      if (q.otherPct !== null) lines.push(`  - 未归类：${q.otherPct}%`);
    } else if (q.type === "allocation") {
      const m = allocationMetrics(q);
      if (m.available) {
        const header = `| 排名 | 选项 | 平均分配分数 | 占比 |`;
        const sep = `| --- | --- | --- | --- |`;
        lines.push(header, sep);
        m.ranked.forEach((it, k) => {
          lines.push(`| ${k + 1} | ${it.label} | ${it.meanPoints} | ${it.meanPoints && q.totalPoints ? `${Math.round((it.meanPoints / q.totalPoints) * 100)}%` : "—"} |`);
        });
      } else {
        lines.push("- 数据缺失");
      }
    } else {
      (q.optionsArray || []).forEach((o, i) => {
        lines.push(`  - ${o}：${valueText(q.values?.[i])}`);
      });
    }
  });

  if (result.crosstab) {
    const c = result.crosstab;
    lines.push("", "## 六、交叉分析（模拟）");
    lines.push(`> ${c.notice}`);
    lines.push(`行变量：${c.rowText}；分组：${CROSSTAB_GROUP_TYPES.find((g) => g.id === c.colType)?.label || c.colType}`);
    lines.push(`| ${["选项", ...c.groups.map((g) => g.label)].join(" | ")} |`);
    lines.push(`| ${c.groups.map(() => "---").join(" | ")} |`);
    c.rows.forEach((r) => lines.push(`| ${r.label} | ${r.cells.join(" | ")} |`));
    c.metricRows.forEach((r) => lines.push(`| ${r.label} | ${r.cells.join(" | ")} |`));
  }

  if (result.storyline) {
    lines.push("", "## 七、报告故事线");
    (result.storyline.chapters || []).forEach((ch) => {
      lines.push(`### ${ch.title}`);
      (ch.slides || []).forEach((s) => {
        const qs = (s.questionIndexes || []).map((i) => `Q${i + 1}`).join("、");
        lines.push(`- **${s.title}**：${s.conclusion}${qs ? `（对应题目：${qs}，图表：${s.chartType}）` : ""}`);
        (s.evidence || []).forEach((e) => lines.push(`  - 证据：${e}`));
      });
    });
  }

  lines.push("", "> 本报告基于 AI 合成统计结果生成，用于研究设计与假设预验证，不替代真实样本统计推断。");
  return lines.join("\n");
}

// ===== 导出文本（不完整数据不写 0，标记为「未返回」） =====

function cellText(v) {
  return Number.isFinite(Number(v)) ? String(Number(v)) : "未返回";
}

export function buildQuantCsv(questions) {
  const rows = ["题目,类型,选项/指标,频数或均值,百分比/分布,备注"];
  const typeName = (t) => TYPE_LABEL[t] || t;
  (questions || []).forEach((q) => {
    const remark = q.dataStatus !== "complete" ? (q.dataError || "数据缺失") : "";
    const qt = typeName(q.type);
    if (q.type === "scale") {
      for (let i = 0; i < (q.expectedCount || 0); i++) {
        const v = q.distribution?.[i];
        const finite = Number.isFinite(Number(v));
        rows.push(`"${q.text}","${qt}","${i + 1}分",${cellText(v)},${finite ? `${Number(v)}%` : "未返回"},${remark}`);
      }
    } else if (q.type === "matrix") {
      (q.matrix || []).forEach((row) => {
        const dist = Array.isArray(row.distribution) ? row.distribution : [];
        const distStr = dist.length && dist.every((v) => Number.isFinite(Number(v)))
          ? dist.join("/")
          : "未返回";
        rows.push(`"${q.text}","${qt}","${row.row}",${Number.isFinite(Number(row.mean)) ? row.mean : "未返回"},"${distStr}",${remark}`);
      });
    } else if (q.type === "rank") {
      // 排序题：按选项展开为多行，展示平均排名/第一比例/前三比例/名次分布
      (q.items || []).forEach((it) => {
        const rd = (it.rankDistribution || []).every((v) => Number.isFinite(Number(v)))
          ? it.rankDistribution.join("/")
          : "未返回";
        rows.push(`"${q.text}","${qt}","${it.label || "选项"}",${Number.isFinite(Number(it.avgRank)) ? it.avgRank : "未返回"},"均排${cellText(it.avgRank)}/第一${cellText(it.firstPct)}/前三${cellText(it.top3Pct)}/分布${rd}",${remark}`);
      });
    } else if (q.type === "nps") {
      (q.distribution || []).forEach((v, k) => {
        const finite = Number.isFinite(Number(v));
        rows.push(`"${q.text}","${qt}","${k} 分",${cellText(v)},${finite ? `${Number(v)}%` : "未返回"},${remark}`);
      });
      rows.push(`"${q.text}","${qt}","NPS",${Number.isFinite(Number(q.nps)) ? q.nps : "未返回"},"推荐者${cellText(q.promoterPct)}/被动者${cellText(q.passivePct)}/贬损者${cellText(q.detractorPct)}",${remark}`);
    } else if (q.type === "numeric") {
      // 数值题：单行展示统计量 + 分段分布展开
      rows.push(`"${q.text}","${qt}","统计量","均值${cellText(q.mean)}/中位${cellText(q.median)}/P25${cellText(q.p25)}/P75${cellText(q.p75)}/范围${cellText(q.min)}-${cellText(q.max)}","${q.unit || ""}",${remark}`);
      (q.distribution || []).forEach((d) => {
        rows.push(`"${q.text}","${qt}","分段：${d.label}",${cellText(d.pct)},${Number.isFinite(Number(d.pct)) ? `${Number(d.pct)}%` : "未返回"},${remark}`);
      });
    } else if (q.type === "open") {
      // 开放题：主题聚类展开
      (q.themes || []).forEach((t) => {
        rows.push(`"${q.text}","${qt}","主题：${t.name}",${cellText(t.pct)},${Number.isFinite(Number(t.pct)) ? `${Number(t.pct)}%（提及率）` : "未返回"},"${String(t.summary || "").replace(/"/g, "“")}"${remark ? `；${remark}` : ""}`);
      });
    } else if (q.type === "allocation") {
      (q.items || []).forEach((it) => {
        rows.push(`"${q.text}","${qt}","${it.label || "选项"}",${Number.isFinite(Number(it.meanPoints)) ? it.meanPoints : "未返回"},"均分${cellText(it.meanPoints)}/中位${cellText(it.medianPoints)}/占比${Number.isFinite(Number(it.meanPoints)) && q.totalPoints ? `${Math.round((Number(it.meanPoints) / q.totalPoints) * 100)}%` : "未返回"}",${remark}`);
      });
    } else {
      (q.optionsArray || []).forEach((option, i) => {
        const v = q.values?.[i];
        const finite = Number.isFinite(Number(v));
        rows.push(`"${q.text}","${qt}","${option}",${cellText(v)},${finite ? `${Number(v)}%` : "未返回"},${remark}`);
      });
    }
  });
  return rows.join("\n");
}

export function buildQuantAnalysisMarkdown(topic, questions, analysis) {
  const a = analysis || {};
  const rationale = Array.isArray(a.rationale) ? a.rationale : [];
  const incomplete = (questions || []).filter((q) => q.dataStatus !== "complete");
  const rationaleSection = rationale.length > 0
    ? `\n\n## 比例分布说明\n${rationale.map((r) => {
        const idx = typeof r.questionIndex === "number" ? r.questionIndex : -1;
        const q = questions && questions[idx];
        const label = q ? `第 ${idx + 1} 题 · ${q.text}` : `第 ${(idx + 1) || "—"} 题`;
        return `### ${label}\n${r.reasoning || ""}`;
      }).join("\n\n")}`
    : "";
  const qualitySection = incomplete.length > 0
    ? `\n\n## ⚠️ 数据完整度提示\n${incomplete.map((q) => `- 第 ${q.index + 1} 题${q.dataError ? `：${q.dataError}` : "数据不完整"} — 该题需要重新生成，缺失值未被当作 0%`).join("\n")}\n`
    : "";
  return `# ${topic} - 问卷模拟分析\n\n${a.summary || ""}\n\n## 关键发现\n${(a.findings || []).map((f) => `- ${f}`).join("\n")}\n\n## 交叉表预览\n${(a.crosstab || []).map((row) => `- ${row[0]} / ${row[1]}：${row[2]}`).join("\n")}${rationaleSection}${qualitySection}\n\n> 合成数据用于研究设计与假设预验证，不替代真实样本统计推断。`;
}

// ============================================================================
// v53 逐题数据解读（基础统计解读 + AI 深度解读 + 核心题批量）
// ============================================================================

export const INTERPRETATION_PROMPT_VERSION = 1;

// 状态枚举
export const InterpretationStatus = {
  IDLE: "idle",
  GENERATING: "generating",
  READY: "ready",
  OUTDATED: "outdated",
  ERROR: "error"
};

// 解读模式枚举
export const InterpretationMode = {
  RULE: "rule",
  AI: "ai",
  MANUAL: "manual"
};

// 创建空解读槽位（用于 state.questionInterpretations[index]）
export function makeInterpretationSlot(questionIndex) {
  return {
    questionIndex,
    status: InterpretationStatus.IDLE,
    mode: InterpretationMode.RULE,
    generatedAt: "",
    dataHash: "",
    promptVersion: INTERPRETATION_PROMPT_VERSION,
    interpretation: null,
    error: "",
    // 人工编辑相关
    editedAt: "",
    originalAiInterpretation: null
  };
}

// ===== 基础统计解读（规则驱动，不调用 AI）=====

// 生成单选题基础解读
function ruleInterpretSingle(question, metrics) {
  const ranked = metrics.ranked || [];
  if (!ranked.length) return null;
  const top1 = ranked[0];
  const top2 = ranked[1];
  const gap = metrics.gap;
  const top2Sum = metrics.top2Sum;
  const total = ranked.reduce((s, r) => s + (r.value || 0), 0);
  const concentration = metrics.concentrated ? "集中" : "分散";
  const tailCount = metrics.tailCount;
  const hasLongTail = tailCount >= 2;

  // 检查不确定/其他/没有类选项
  const uncertainLabels = ranked.filter((r) => /不确定|不知道|其他|其它|没有|都不|无/.test(String(r.label || "")));
  const hasUncertain = uncertainLabels.length > 0 && uncertainLabels.some((r) => r.value >= 10);

  // 拼接 headline
  let headline = "";
  if (top1.value >= 50) {
    headline = `「${top1.label}」以${top1.value}%占据主导，分布明显集中`;
  } else if (top1.value >= 35 && gap >= 10) {
    headline = `「${top1.label}」以${top1.value}%领先，但整体仍偏${concentration}`;
  } else if (gap < 5) {
    headline = `「${top1.label}」以${top1.value}%微弱领先，需求尚未高度集中`;
  } else {
    headline = `「${top1.label}」以${top1.value}%位居第一，领先第二名${gap}个百分点`;
  }

  // observation
  const obs = [
    `「${top1.label}」${top1.value}%${top2 ? `，其次「${top2.label}」${top2.value}%` : ""}。`,
    `前两选项合计${top2Sum}%，分布${concentration}${hasLongTail ? `，存在${tailCount}个长尾选项` : ""}。`,
    hasUncertain ? `「${uncertainLabels[0].label}」占比${uncertainLabels[0].value}%，存在一定比例的中立或缺失态度。` : `未出现明显的"不确定/其他"类高占比选项。`
  ].join("");

  // evidence（引用当前题的具体数据）
  const evidence = ranked.slice(0, 3).map((r) => ({
    questionIndex: question.index,
    label: r.label,
    value: r.value
  }));

  return {
    headline,
    observation: obs,
    possibleDrivers: [],
    evidence,
    implication: "",
    confidence: "low",
    caveat: "基础统计解读，仅描述数据表现，不代表因果结论。"
  };
}

// 生成多选题基础解读
function ruleInterpretMultiple(question, metrics) {
  const ranked = metrics.ranked || [];
  if (!ranked.length) return null;
  const top1 = ranked[0];
  const top2 = ranked[1];
  const top3 = ranked[2];
  const top3Arr = ranked.slice(0, 3);
  const highRate = ranked.filter((r) => r.value >= 40).length;
  const tailCount = metrics.tailCount;
  const total = ranked.reduce((s, r) => s + (r.value || 0), 0);

  let headline = "";
  if (highRate >= 3) {
    headline = `多选高度集中：${highRate} 个选项选择率≥40%，「${top1.label}」${top1.value}%领先`;
  } else if (top1.value >= 50) {
    headline = `「${top1.label}」${top1.value}%为首选，远高于其他选项`;
  } else {
    headline = `「${top1.label}」${top1.value}%位居第一，整体选择较为分散`;
  }

  const obs = [
    `Top3：「${top3Arr.map((r) => `${r.label} ${r.value}%`).join("、")}」；`,
    `高选择率（≥40%）选项 ${highRate} 个，长尾选项 ${tailCount} 个。`,
    `各选项百分比合计约 ${total}%，符合多选题可合计超过 100% 的特征。`
  ].join("");

  const evidence = top3Arr.map((r) => ({
    questionIndex: question.index,
    label: r.label,
    value: r.value
  }));

  return {
    headline,
    observation: obs,
    possibleDrivers: [],
    evidence,
    implication: "",
    confidence: "low",
    caveat: "基础统计解读，仅描述数据表现，不代表因果结论。多选题百分比可合计超过 100%。"
  };
}

// 生成量表题基础解读
function ruleInterpretScale(question, metrics) {
  if (!metrics.available) return null;
  const mean = metrics.mean;
  const top2 = metrics.top2box;
  const bottom2 = metrics.bottom2box;
  const neutral = metrics.neutral;
  const positive = metrics.positive;
  const negative = metrics.negative;
  const scaleMax = parseInt(String(question.scale || "1-5").split("-")[1] || "5", 10);
  const midPoint = scaleMax / 2;

  let tendency = "中立";
  if (top2 >= 60) tendency = "偏正向";
  else if (bottom2 >= 40) tendency = "偏负向";
  else if (top2 >= 35 && bottom2 >= 35) tendency = "两极化";
  else tendency = "中立";

  // 均值与分布是否一致
  const meanConsistent = (mean >= midPoint + 0.5 && tendency === "偏正向") ||
    (mean <= midPoint - 0.5 && tendency === "偏负向") ||
    (Math.abs(mean - midPoint) < 0.5 && tendency === "中立");

  let headline = "";
  if (tendency === "偏正向") {
    headline = `均值 ${mean}（${scaleMax} 分制），态度偏正向，Top2Box ${top2}%`;
  } else if (tendency === "偏负向") {
    headline = `均值 ${mean}（${scaleMax} 分制），态度偏负向，Bottom2Box ${bottom2}%`;
  } else if (tendency === "两极化") {
    headline = `均值 ${mean}，但分布两极化（Top2 ${top2}% / Bottom2 ${bottom2}%）`;
  } else {
    headline = `均值 ${mean}（${scaleMax} 分制），态度偏中立，Top2 ${top2}% / Bottom2 ${bottom2}%`;
  }

  const obs = [
    `均值 ${mean}（${scaleMax} 分制），中位数 ${metrics.median}。`,
    `Top2Box ${top2}%、Bottom2Box ${bottom2}%、中立 ${neutral}%；正-中立-负向：${positive}% / ${neutral}% / ${negative}%。`,
    `整体态度${tendency}${meanConsistent ? "，均值与分布一致。" : "，但均值与分布存在偏差，需结合分布形态判断。"}`
  ].join("");

  const evidence = [
    { questionIndex: question.index, label: "均值", value: mean },
    { questionIndex: question.index, label: "Top2Box", value: top2 },
    { questionIndex: question.index, label: "Bottom2Box", value: bottom2 }
  ];

  return {
    headline,
    observation: obs,
    possibleDrivers: [],
    evidence,
    implication: "",
    confidence: "low",
    caveat: "基础统计解读，仅描述数据表现，不代表因果结论。"
  };
}

// 生成矩阵题基础解读
function ruleInterpretMatrix(question, metrics) {
  if (!metrics.available) return null;
  const ranked = metrics.ranked || [];
  if (!ranked.length) return null;
  const top3 = metrics.top3 || ranked.slice(0, 3);
  const bottom3 = metrics.bottom3 || ranked.slice(-3).reverse();
  const gap = metrics.gap;
  const topRow = metrics.topRow;
  const bottomRow = metrics.bottomRow;

  let headline = "";
  if (gap >= 1.0) {
    headline = `「${topRow.label}」均值最高（${topRow.mean}），「${bottomRow.label}」最低（${bottomRow.mean}），差距 ${gap}`;
  } else if (gap < 0.4) {
    headline = `各维度均值接近，最高「${topRow.label}」${topRow.mean}，最低「${bottomRow.label}」${bottomRow.mean}`;
  } else {
    headline = `「${topRow.label}」${topRow.mean} 居首，领先最后一名 ${gap} 分`;
  }

  const obs = [
    `Top3：${top3.map((r) => `「${r.label}」${r.mean}`).join("、")}；`,
    `Bottom3：${bottom3.map((r) => `「${r.label}」${r.mean}`).join("、")}；`,
    `第一名与最后一名差距 ${gap}，${gap >= 1.0 ? "维度间差异明显" : gap >= 0.4 ? "维度间存在一定差异" : "各维度接近，无明显短板"}。`
  ].join("");

  const evidence = [
    { questionIndex: question.index, label: `${topRow.label}（最高）`, value: topRow.mean },
    { questionIndex: question.index, label: `${bottomRow.label}（最低）`, value: bottomRow.mean }
  ];

  return {
    headline,
    observation: obs,
    possibleDrivers: [],
    evidence,
    implication: "",
    confidence: "low",
    caveat: "基础统计解读，仅描述数据表现，不代表因果结论。"
  };
}

// v54 新题型基础统计解读
function ruleInterpretRank(question, metrics) {
  if (!metrics.available) return null;
  const top = metrics.ranked[0];
  if (!top) return null;
  const topOpt = question.optionsArray?.[top.optionIndex] || `选项${top.optionIndex + 1}`;
  const headline = metrics.consistent
    ? `「${topOpt}」整体排序最靠前，且首选优势明显`
    : `「${topOpt}」整体排序最靠前，但存在少数用户强偏好`;
  const obs = [
    `「${topOpt}」平均排名 ${top.avgRank}，${Number.isFinite(Number(top.firstPct)) ? `${top.firstPct}% 的样本将其排在第一位` : "第一名比例数据缺失"}。`,
    metrics.stableSecondary
      ? `「${metrics.stableSecondary.label}」前三入选率高但第一名比例有限，属稳定次级需求。`
      : `第一名与平均排名${metrics.consistent ? "一致" : "不一致"}。`,
    metrics.isConcentrated ? "排名高度集中，首选明确。" : "排名较为分散，未见压倒性首选。"
  ].join("");
  return {
    headline,
    observation: obs,
    possibleDrivers: [],
    evidence: [
      { questionIndex: question.index, label: `${topOpt}（平均排名）`, value: top.avgRank },
      { questionIndex: question.index, label: `${topOpt}（第一名比例）`, value: Number.isFinite(Number(top.firstPct)) ? top.firstPct : 0 }
    ],
    implication: "",
    confidence: "low",
    caveat: "基础统计解读，仅描述数据表现，不代表因果结论。"
  };
}

function ruleInterpretNps(question, metrics) {
  if (!metrics.available) return null;
  const headline = metrics.nps >= 30 ? `NPS ${metrics.nps}，推荐者显著领先`
    : metrics.nps > 0 ? `NPS ${metrics.nps}，推荐者略多于贬损者`
    : `NPS ${metrics.nps}，贬损者不弱于推荐者`;
  const obs = [
    `净推荐值 NPS 为 ${metrics.nps}（推荐者 ${metrics.promoter}% − 贬损者 ${metrics.detractor}%）。`,
    `被动者占比 ${metrics.passive}%${metrics.passive >= 30 ? "，存在可观的转化空间" : "，规模适中"}。`,
    metrics.nps < 0 ? "口碑现状偏负，需要优先解决贬损者的核心不满。" : "整体口碑处于可接受区间。"
  ].join("");
  return {
    headline,
    observation: obs,
    possibleDrivers: [],
    evidence: [
      { questionIndex: question.index, label: "NPS", value: metrics.nps },
      { questionIndex: question.index, label: "推荐者比例", value: metrics.promoter },
      { questionIndex: question.index, label: "贬损者比例", value: metrics.detractor }
    ],
    implication: "",
    confidence: "low",
    caveat: "基础统计解读，仅描述数据表现，不代表因果结论。"
  };
}

function ruleInterpretNumeric(question, metrics) {
  if (!metrics.available) return null;
  const headline = metrics.skew
    ? `数值分布${metrics.skew}，均值与中位数存在偏离`
    : `数值集中，均值与中位数接近`;
  const obs = [
    `均值 ${metrics.mean}${metrics.unit || ""}，中位数 ${metrics.median}${metrics.unit || ""}${metrics.skew ? `，${metrics.skew}` : "，分布对称"}。`,
    `四分位区间 ${metrics.p25}~${metrics.p75}${metrics.unit || ""}${metrics.spread !== null ? `（跨度 ${metrics.spread}${metrics.unit || ""}）` : ""}。`,
    metrics.longTail ? "存在明显长尾分段。" : "分段分布无明显长尾。"
  ].join("");
  return {
    headline,
    observation: obs,
    possibleDrivers: [],
    evidence: [
      { questionIndex: question.index, label: "均值", value: metrics.mean },
      { questionIndex: question.index, label: "中位数", value: metrics.median }
    ],
    implication: "",
    confidence: "low",
    caveat: "基础统计解读，仅描述数据表现，不代表因果结论。"
  };
}

function ruleInterpretOpen(question, metrics) {
  if (!metrics.available) return null;
  const top = metrics.top;
  if (!top) return null;
  const headline = `开放反馈集中于「${top.name}」`;
  const obs = [
    `提及率最高的主题为「${top.name}」（${top.pct}%），共聚类 ${metrics.themeCount} 个主题。`,
    metrics.nearN >= 3 ? "前 3 主题提及率均不低于 30%，需求高度集中。" : "主题分布相对分散。",
    metrics.longTail ? `存在 ${metrics.longTail} 个低提及率主题，属长尾反馈。` : "未出现明显长尾主题。"
  ].join("");
  return {
    headline,
    observation: obs,
    possibleDrivers: [],
    evidence: [
      { questionIndex: question.index, label: `${top.name}（提及率）`, value: top.pct }
    ],
    implication: "",
    confidence: "low",
    caveat: "基础统计解读，仅描述数据表现，不代表因果结论。"
  };
}

function ruleInterpretAllocation(question, metrics) {
  if (!metrics.available) return null;
  const top1 = metrics.top1;
  if (!top1) return null;
  const headline = `分配集中于「${top1.label}」`;
  const obs = [
    `「${top1.label}」平均分配 ${top1.meanPoints} 分，占总分 ${metrics.top1Pct ?? Math.round((top1.meanPoints / metrics.total) * 100)}%。`,
    `Top2 合计 ${metrics.top2Sum} 分（占比 ${metrics.top2Pct}%）。`,
    metrics.concentrated ? "分配高度集中，头部因素主导。" : "分配相对均衡，无明显主导因素。"
  ].join("");
  return {
    headline,
    observation: obs,
    possibleDrivers: [],
    evidence: [
      { questionIndex: question.index, label: `${top1.label}（平均分配）`, value: top1.meanPoints },
      { questionIndex: question.index, label: "Top2 合计占比", value: metrics.top2Pct }
    ],
    implication: "",
    confidence: "low",
    caveat: "基础统计解读，仅描述数据表现，不代表因果结论。"
  };
}

// 统一入口：根据题型生成基础统计解读
export function buildRuleBasedInterpretation(question, allQuestions, context) {
  if (!question || question.dataStatus !== "complete") return null;
  const metrics = computeQuestionMetrics(question);
  let interp = null;
  if (question.type === "single") interp = ruleInterpretSingle(question, metrics);
  else if (question.type === "multiple") interp = ruleInterpretMultiple(question, metrics);
  else if (question.type === "scale") interp = ruleInterpretScale(question, metrics);
  else if (question.type === "matrix") interp = ruleInterpretMatrix(question, metrics);
  else if (question.type === "rank") interp = ruleInterpretRank(question, metrics);
  else if (question.type === "nps") interp = ruleInterpretNps(question, metrics);
  else if (question.type === "numeric") interp = ruleInterpretNumeric(question, metrics);
  else if (question.type === "open") interp = ruleInterpretOpen(question, metrics);
  else if (question.type === "allocation") interp = ruleInterpretAllocation(question, metrics);
  if (!interp) return null;
  return {
    ...interp,
    _mode: InterpretationMode.RULE,
    _generatedAt: new Date().toISOString()
  };
}

// ===== 核心题识别 =====
// 默认排除：甄别题、纯人口属性题、纯编程逻辑题、文本为空、数据不完整
const CORE_QUESTION_INCLUDE_PATTERNS = /(使用|场景|需求|痛点|功能|概念|购买|推荐|满意|价格|渠道|期待|原因|处理|频率|搭载|遇到|考虑|重要|评价|意愿|偏好)/;
const CORE_QUESTION_EXCLUDE_PATTERNS = /^(D\d|S\d|D\.|S\.|背景信息|性别|学历|职业|收入|家庭结构|城市|年龄|您家|请问您拥有|编号|ID$|问卷编号)/;

export function identifyCoreQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  const candidates = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => {
      if (!q) return false;
      if (q.dataStatus !== "complete") return false;
      const text = String(q.text || "").trim();
      if (!text) return false;
      if (CORE_QUESTION_EXCLUDE_PATTERNS.test(text)) return false;
      if (!CORE_QUESTION_INCLUDE_PATTERNS.test(text)) return false;
      return true;
    });
  // 优先按出现顺序，限制 5-10 道
  const result = candidates.slice(0, 10).map(({ i }) => i);
  // 如果不足 5 道，放宽条件补充（仍按模块关键词）
  if (result.length < 5) {
    const extra = questions
      .map((q, i) => ({ q, i }))
      .filter(({ q, i }) => {
        if (!q || q.dataStatus !== "complete") return false;
        if (result.includes(i)) return false;
        const text = String(q.text || "").trim();
        if (!text || CORE_QUESTION_EXCLUDE_PATTERNS.test(text)) return false;
        // 放宽：任何非甄别/背景题都可
        return true;
      })
      .slice(0, 5 - result.length)
      .map(({ i }) => i);
    result.push(...extra);
  }
  return result.slice(0, 10);
}

// ===== 相关题选择 =====
// 轻量筛选：同模块 + 关键词匹配 + 题型 + 前后位置
export function selectRelatedQuestions(questionIndex, questions, maxCount = 5) {
  if (!Array.isArray(questions) || !questions[questionIndex]) return [];
  const current = questions[questionIndex];
  const currentText = String(current.text || "");
  const currentModule = current.module || detectQuestionModule(current, questionIndex).id;

  // 提取关键词（2-4字中文词，简化版）
  const keywords = extractKeywords(currentText);

  const scored = questions
    .map((q, i) => {
      if (i === questionIndex) return null;
      if (!q || q.dataStatus !== "complete") return null;
      let score = 0;
      // 同模块加分
      const qModule = q.module || detectQuestionModule(q, i).id;
      if (qModule && qModule === currentModule && qModule !== "other") score += 3;
      // 关键词匹配加分
      const qText = String(q.text || "");
      keywords.forEach((kw) => {
        if (qText.includes(kw)) score += 2;
      });
      // 题型一致性（行为题+态度题组合）
      if ((current.type === "single" || current.type === "multiple") &&
        (q.type === "scale" || q.type === "matrix")) score += 1;
      // 前后题位置加分（紧邻题目可能存在上下文）
      const distance = Math.abs(i - questionIndex);
      if (distance <= 3) score += 1;
      if (distance === 1) score += 1;
      // 使用行为、需求、购买意愿题加分
      if (/(使用|场景|需求|痛点|购买|意愿|偏好|重要)/.test(qText)) score += 1;
      return { i, score };
    })
    .filter(Boolean)
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxCount).map((s) => s.i);
}

// 简单中文关键词提取（按常见业务词分词，非通用分词）
const KEYWORD_PATTERNS = [
  "使用", "场景", "需求", "痛点", "功能", "概念", "购买", "推荐", "满意", "价格", "渠道",
  "口味", "成分", "包装", "品牌", "健康", "安全", "便捷", "体验", "信任", "成本",
  "频率", "次数", "时间", "原因", "考虑", "重要", "评价", "意愿", "偏好", "障碍",
  "期待", "改进", "建议", "频率", "通勤", "通勤", "记录", "监控", "拍摄", "安装"
];
function extractKeywords(text) {
  const t = String(text || "");
  return KEYWORD_PATTERNS.filter((kw) => t.includes(kw));
}

// ===== AI 深度解读提示词 =====
export function buildQuestionInterpretationPrompt(env, question, relatedQuestions, context) {
  const c = env.audienceConfig || {};
  const quotaText = env.quotaPlan && Array.isArray(env.quotaPlan)
    ? buildStructuredQuotaText(env.quotaPlan, env.sampleSize)
    : (env.quotaText || "（未配置配额）");
  const isMock = context?.isMock || false;
  const metrics = computeQuestionMetrics(question);

  // 当前题数据
  const currentData = formatQuestionData(question, metrics);

  // 相关题数据（只发送必要字段）
  const relatedData = (relatedQuestions || [])
    .map((i) => env.questions[i])
    .filter(Boolean)
    .map((q, idx) => {
      const m = computeQuestionMetrics(q);
      return `相关题 ${idx + 1}（Q${q.index + 1}）：${q.text}
- 题型：${TYPE_LABEL[q.type] || q.type}
- 数据：${formatQuestionData(q, m)}`;
    })
    .join("\n\n");

  return `你是一位资深消费者研究分析师。请基于以下问卷题目数据，生成一份"数据解读"，帮助研究者快速理解数据特征与可能的业务含义。

## 研究背景
- 研究主题：${env.topic}
- 目标人群：${c.age}，${c.gender}，${c.city}
- 人群画像：收入 ${c.income}；品类行为 ${c.usage}；价格敏感度 ${c.price}；生活方式 ${c.lifestyle}
- 样本量：N=${env.sampleSize}
- 数据来源：${isMock ? "本地模拟数据（非真实样本）" : "AI 合成数据"}

## 配额设计
${quotaText}

## 当前题目（需解读）
Q${question.index + 1}：${question.text}
- 题型：${TYPE_LABEL[question.type] || question.type}
- 数据状态：${question.dataStatus || "complete"}
- 完整数据：
${currentData}

## 相关题目（最多5道，用于构建证据链，不要编造未列出的题目）
${relatedData || "（无相关题目）"}

## 解读要求
1. 只能引用上述实际存在的题目、选项、数值；不得编造不存在的数据。
2. 解释可能原因时必须使用"可能与……""这可能反映……""一种合理解释是……"等措辞；不得使用"证明了""导致了""一定是因为"等因果断言。
3. 每个原因尽量引用当前题或相关题的具体比例、人群画像或配额特征作为证据。
4. 业务启示要具体、可执行，避免空泛的"加强宣传/提升体验/优化产品"。
5. 不得把边际配额当作真实交叉配额，不得宣称交叉分析结果。
6. 必须明确数据为合成或模拟数据，解释用于研究假设和业务推演。

## 输出格式（严格 JSON，不要 markdown 代码块）
{
  "headline": "不超过35字的一句话结论",
  "observation": "60-120字的数据客观描述",
  "possibleDrivers": ["可能原因1", "可能原因2"],
  "evidence": [
    {"questionIndex": ${question.index}, "label": "选项或指标名称", "value": 68}
  ],
  "implication": "60-120字的业务或研究启示",
  "confidence": "medium",
  "caveat": "该结果为合成数据或模拟数据，解释用于研究假设和业务推演，不代表真实样本因果结论。"
}

要求：
- headline ≤35 字；
- observation 60-120 字；
- possibleDrivers 2-3 条；
- evidence 1-5 条（必须引用实际数据）；
- implication 60-120 字；
- confidence 只能是 "low"、"medium"、"high"；
- 只输出 JSON，不要输出任何其他文字。`;
}

// 格式化题目数据为紧凑文本
function formatQuestionData(question, metrics) {
  if (question.type === "single" || question.type === "multiple") {
    const opts = (question.optionsArray || []).map((label, i) => {
      const v = question.values?.[i];
      return `  - ${label}：${Number.isFinite(Number(v)) ? `${Number(v)}%` : "未返回"}`;
    }).join("\n");
    const extra = metrics.available
      ? `Top1 ${metrics.top1Label} ${metrics.top1}%；Top2 合计 ${metrics.top2Sum}%；差距 ${metrics.gap}；${metrics.concentrated ? "集中" : "分散"}`
      : "（指标不可用）";
    return `选项分布：\n${opts}\n指标：${extra}`;
  }
  if (question.type === "scale") {
    const dist = (question.distribution || []).map((v, i) => `  - 档位 ${i + 1}：${v}%`).join("\n");
    const extra = metrics.available
      ? `均值 ${metrics.mean}；中位数 ${metrics.median}；Top2Box ${metrics.top2box}%；Bottom2Box ${metrics.bottom2box}%`
      : `均值 ${metrics.mean}`;
    return `分布：\n${dist}\n指标：${extra}`;
  }
  if (question.type === "matrix") {
    const rows = (question.matrix || []).map((r) => `  - ${r.row}：均值 ${r.mean}；分布 [${(r.distribution || []).join(",")}]`).join("\n");
    const extra = metrics.available
      ? `Top1 ${metrics.topRow.label} ${metrics.topRow.mean}；Bottom1 ${metrics.bottomRow.label} ${metrics.bottomRow.mean}；差距 ${metrics.gap}`
      : "（指标不可用）";
    return `维度：\n${rows}\n指标：${extra}`;
  }
  if (question.type === "rank") {
    const items = (question.items || []).map((it) => `  - ${it.label}：平均排名 ${it.avgRank}；第一名 ${it.firstPct}%；前三 ${it.top3Pct}%；名次分布 [${(it.rankDistribution || []).join(",")}]`).join("\n");
    const extra = metrics.available
      ? `首选「${metrics.ranked[0]?.label || "—"}」均排 ${metrics.ranked[0]?.avgRank}；第一名比例最高「${metrics.firstLeader?.label || "—"}」${metrics.firstLeader?.firstPct}%；${metrics.stableSecondary ? `稳定次级「${metrics.stableSecondary.label}」` : "无明显稳定次级"}`
      : "（指标不可用）";
    return `排名结果：
${items}
指标：${extra}${question.unrankedPct !== null ? `；未进入前N比例 ${question.unrankedPct}%` : ""}`;
  }
  if (question.type === "nps") {
    const dist = (question.distribution || []).map((v, k) => `  - ${k} 分：${v}%`).join("\n");
    return `分布：
${dist}
指标：NPS ${question.nps}；推荐者 ${question.promoterPct}%；被动者 ${question.passivePct}%；贬损者 ${question.detractorPct}%；均值 ${question.mean}`;
  }
  if (question.type === "numeric") {
    const seg = (question.distribution || []).map((d) => `  - ${d.label}：${d.pct}%`).join("\n");
    return `统计量：均值 ${question.mean}${question.unit || ""}；中位数 ${question.median}${question.unit || ""}；P25 ${question.p25}；P75 ${question.p75}；范围 ${question.min}~${question.max}${question.unit || ""}
分段分布：
${seg || "（无分段）"}`;
  }
  if (question.type === "open") {
    const themes = (question.themes || []).map((t) => `  - ${t.name}：提及率 ${t.pct}%；${t.summary || ""}${t.quotes && t.quotes.length ? `（合成原声：${t.quotes[0]}）` : ""}`).join("\n");
    return `主题聚类：
${themes || "（无主题）"}
未归类：${question.otherPct}%`;
  }
  if (question.type === "allocation") {
    const items = (question.items || []).map((it) => `  - ${it.label}：平均分配 ${it.meanPoints} 分（占 ${question.totalPoints ? Math.round((it.meanPoints / question.totalPoints) * 100) : 0}%）`).join("\n");
    return `分配结果（总分 ${question.totalPoints}）：
${items}`;
  }
  return "（未知题型）";
}

// ===== AI 解读校验 =====
export function validateAiInterpretation(parsed, question, allQuestions) {
  const errors = [];
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, errors: ["AI 返回不是有效 JSON 对象"], normalized: null };
  }
  // 必填字段
  const required = ["headline", "observation", "possibleDrivers", "evidence", "implication", "confidence", "caveat"];
  required.forEach((f) => {
    if (parsed[f] === undefined || parsed[f] === null) {
      errors.push(`缺少字段：${f}`);
    }
  });
  if (errors.length) return { valid: false, errors, normalized: null };

  // 字段类型与长度
  if (typeof parsed.headline !== "string" || parsed.headline.length > 60) {
    errors.push("headline 必须为字符串且不超过 60 字");
  }
  if (typeof parsed.observation !== "string" || parsed.observation.length < 20 || parsed.observation.length > 300) {
    errors.push("observation 必须为字符串且 20-300 字");
  }
  if (!Array.isArray(parsed.possibleDrivers) || parsed.possibleDrivers.length < 1 || parsed.possibleDrivers.length > 5) {
    errors.push("possibleDrivers 必须为 1-5 条数组");
  }
  if (!Array.isArray(parsed.evidence) || parsed.evidence.length < 1 || parsed.evidence.length > 8) {
    errors.push("evidence 必须为 1-8 条数组");
  } else {
    // 校验 evidence.questionIndex 是否越界
    parsed.evidence.forEach((e, i) => {
      if (!e || typeof e !== "object") {
        errors.push(`evidence[${i}] 不是对象`);
        return;
      }
      if (typeof e.questionIndex !== "number" || !Number.isInteger(e.questionIndex)) {
        errors.push(`evidence[${i}].questionIndex 不是整数`);
        return;
      }
      if (!allQuestions || !allQuestions[e.questionIndex]) {
        errors.push(`evidence[${i}].questionIndex=${e.questionIndex} 越界或对应题目不存在`);
      }
      if (typeof e.label !== "string" || !e.label.trim()) {
        errors.push(`evidence[${i}].label 为空`);
      }
      if (typeof e.value !== "number" && typeof e.value !== "string") {
        errors.push(`evidence[${i}].value 类型无效`);
      }
    });
  }
  if (typeof parsed.implication !== "string" || parsed.implication.length < 20 || parsed.implication.length > 300) {
    errors.push("implication 必须为字符串且 20-300 字");
  }
  if (!["low", "medium", "high"].includes(parsed.confidence)) {
    errors.push("confidence 必须为 low/medium/high");
  }
  if (typeof parsed.caveat !== "string" || parsed.caveat.length < 10) {
    errors.push("caveat 必须为字符串且不少于 10 字");
  }

  // 因果断言检查
  const allText = `${parsed.headline || ""} ${parsed.observation || ""} ${(parsed.possibleDrivers || []).join(" ")} ${parsed.implication || ""}`;
  const causalForbidden = [/证明了/, /导致了/, /一定是因为/, /说明所有用户/, /必然引起/, /决定了/];
  causalForbidden.forEach((re) => {
    if (re.test(allText)) {
      errors.push(`出现因果断言：${re.source}（应使用"可能与""这可能反映"等措辞）`);
    }
  });

  if (errors.length) return { valid: false, errors, normalized: null };

  // 归一化
  const normalized = {
    headline: String(parsed.headline).slice(0, 60),
    observation: String(parsed.observation).slice(0, 300),
    possibleDrivers: parsed.possibleDrivers.map((s) => String(s)).slice(0, 5),
    evidence: parsed.evidence.map((e) => ({
      questionIndex: Number(e.questionIndex),
      label: String(e.label),
      value: typeof e.value === "number" ? Number(e.value) : String(e.value)
    })),
    implication: String(parsed.implication).slice(0, 300),
    confidence: parsed.confidence,
    caveat: String(parsed.caveat)
  };
  return { valid: true, errors: [], normalized };
}

// ===== 缓存哈希 =====
// 基于题目数据、研究背景、配额、相关题数据、提示词版本生成稳定 hash
export function computeInterpretationDataHash(question, env, relatedQuestions, promptVersion) {
  const c = env.audienceConfig || {};
  const hashInput = {
    promptVersion,
    topic: env.topic || "",
    audience: `${c.age}|${c.gender}|${c.city}|${c.income}|${c.usage}|${c.price}|${c.lifestyle}`,
    sampleSize: env.sampleSize,
    question: {
      index: question.index,
      text: question.text,
      type: question.type,
      scale: question.scale,
      optionsArray: question.optionsArray,
      values: question.values,
      distribution: question.distribution,
      matrix: question.matrix ? question.matrix.map((r) => ({ row: r.row, mean: r.mean, distribution: r.distribution })) : null,
      dataStatus: question.dataStatus
    },
    related: (relatedQuestions || []).map((i) => {
      const q = env.questions?.[i];
      if (!q) return null;
      return {
        index: q.index,
        text: q.text,
        type: q.type,
        values: q.values,
        distribution: q.distribution,
        matrix: q.matrix ? q.matrix.map((r) => ({ row: r.row, mean: r.mean })) : null
      };
    }),
    quotaPlan: (env.quotaPlan || []).map((d) => ({
      name: d.name,
      enabled: d.enabled,
      items: (d.items || []).map((it) => ({ label: it.label, pct: it.pct }))
    }))
  };
  // 简单稳定 hash（djb2 变体）
  const str = JSON.stringify(hashInput);
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h = h & 0xffffffff;
  }
  // 转 hex（无符号）
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ===== 解读状态辅助 =====
export function isInterpretationOutdated(slot, question, env, relatedQuestions) {
  if (!slot || !slot.interpretation) return false;
  const currentHash = computeInterpretationDataHash(question, env, relatedQuestions, slot.promptVersion);
  return currentHash !== slot.dataHash;
}

// ===== 导出辅助：把解读格式化为 Markdown 段落 =====
export function interpretationToMarkdown(interpretation, questionIndex) {
  if (!interpretation) return "";
  const lines = [];
  lines.push(`### Q${questionIndex + 1} 数据解读`);
  if (interpretation.headline) lines.push(`\n**结论**：${interpretation.headline}`);
  if (interpretation.observation) lines.push(`\n#### 数据表现\n${interpretation.observation}`);
  if (interpretation.possibleDrivers && interpretation.possibleDrivers.length) {
    lines.push(`\n#### 可能原因`);
    interpretation.possibleDrivers.forEach((d) => lines.push(`- ${d}`));
  }
  if (interpretation.evidence && interpretation.evidence.length) {
    lines.push(`\n#### 证据`);
    interpretation.evidence.forEach((e) => lines.push(`- Q${e.questionIndex + 1} ${e.label}：${e.value}`));
  }
  if (interpretation.implication) lines.push(`\n#### 业务启示\n${interpretation.implication}`);
  if (interpretation.caveat) lines.push(`\n> ${interpretation.caveat}`);
  return lines.join("\n");
}
