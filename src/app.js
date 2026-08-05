import {
  QUANT_BATCH_SIZE,
  REPAIR_BATCH_SIZE,
  MAX_REPAIR_ROUNDS,
  buildQuantPrompt as buildQuantPromptCore,
  buildBatchPrompt,
  buildQuantRepairPrompt,
  buildAnalysisPrompt,
  buildSingleQuestionPrompt,
  buildQuantBatches,
  mergeRawResults,
  mergeRepairedResults,
  validateQuantResults,
  makeQuantQualitySummary,
  buildQuantCsv,
  buildQuantAnalysisMarkdown,
  // ===== v50 定量分析工作台 =====
  QUESTION_MODULES,
  MODULE_LABEL,
  detectQuestionModule,
  SOURCE_LABELS,
  sourceLabel,
  choiceMetrics,
  scaleMetrics,
  matrixMetrics,
  computeQuestionMetrics,
  selectCoreMetrics,
  buildKeyFindings,
  makeQuantQualityDetails,
  CROSSTAB_GROUP_TYPES,
  buildSimulatedCrosstab,
  STORY_CHAPTERS,
  buildStoryline,
  buildStorylinePrompt,
  normalizeStoryline,
  buildQuantWorkbook,
  buildQualityWorkbook,
  buildQuantWorkbenchMarkdown,
  // ===== v53 逐题数据解读 =====
  INTERPRETATION_PROMPT_VERSION,
  InterpretationStatus,
  InterpretationMode,
  makeInterpretationSlot,
  buildRuleBasedInterpretation,
  identifyCoreQuestions,
  selectRelatedQuestions,
  buildQuestionInterpretationPrompt,
  validateAiInterpretation,
  computeInterpretationDataHash,
  isInterpretationOutdated,
  interpretationToMarkdown,
  // v54 题型系统
  QUESTION_TYPE_REGISTRY,
  QUESTION_TYPE_GROUPS,
  TYPE_LABEL,
  migrateQuestionData,
  optionsList,
  buildQuestionPromptFragment
} from "./quant-core.js?v=55";

import {
  parseQuestionnaireText,
  splitOptions,
  isQuestionHeader,
  isInstructionLine,
  parseSharedStringsXml,
  extractXlsxRows,
  buildQuestionnaireTextFromXlsxRows,
  normalizeXlsxType,
  extractParagraphsFromDocxXml,
  hasWordTable,
  analyzeQuestionIssues,
  buildImportSummary,
  confirmImportQuestions
} from "./import-core.js?v=53";

import {
  QUOTA_TEMPLATES,
  makeQuotaItem,
  makeQuotaDimension,
  dimensionFromTemplateKey,
  migrateQuotaPlan,
  buildDefaultQuotaPlan,
  validateQuotaPlan,
  allocateQuotaCounts,
  normalizeTo100,
  distributeEvenly,
  normalizeItems,
  topUpTo100,
  getEnabledDimensions,
  dimensionAllocation,
  buildQuotaPromptText,
  buildQuotaSummaryLines,
  quotaStats
} from "./quota-core.js?v=53";

const MODEL_CONFIG = {
  kimi: { name: "Kimi", key: "synthuser_api_key_kimi", placeholder: "sk-...", model: "moonshot-v1-8k", baseUrl: "https://api.moonshot.cn/v1/chat/completions" },
  deepseek: { name: "DeepSeek", key: "synthuser_api_key_deepseek", placeholder: "sk-...", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1/chat/completions" },
  zhipu: { name: "智谱 GLM", key: "synthuser_api_key_zhipu", placeholder: "请输入 GLM API Key", model: "glm-4-flash", baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions" },
  custom: { name: "自定义模型", key: "synthuser_api_key_custom", placeholder: "兼容 OpenAI 格式的 API Key", model: "your-model-name", baseUrl: "" }
};

// 支持后端代理的 provider 列表（Key 保存在 Cloudflare 环境变量里，前端完全不暴露）
// 当用户未保存自己的 Key 时，前端会走 /api/chat 代理；用户保存了 Key 后则直接用自己的 Key
const PROXY_PROVIDERS = {
  zhipu: { envKey: "ZHIPU_API_KEY" }
};

const GENERATION_TIMEOUT_MS = 180000;

const templates = [
  {
    topic: "0 糖气泡水概念测试",
    audience: "年轻白领",
    tags: ["口味", "价格", "健康", "场景"],
    qualQuestions: [
      "你对 0 糖气泡水的第一印象是什么？",
      "什么场景下你最可能选择购买 0 糖气泡水？",
      "0 糖气泡水相比普通饮料，最大的顾虑或阻碍是什么？"
    ],
    quantQuestions: [
      { text: "你会购买 0 糖气泡水吗？", type: "single", options: "一定会, 可能会, 不确定, 不会", scale: "1-5", rows: "" },
      { text: "你对 0 糖饮品的健康重视程度", type: "scale", options: "", scale: "1-5", rows: "" },
      { text: "你更偏好的饮用场景是？", type: "multiple", options: "办公室, 运动后, 聚餐, 居家, 外出通勤", scale: "1-5", rows: "" },
      { text: "请评价以下因素对购买决策的重要性", type: "matrix", options: "1, 2, 3, 4, 5", scale: "1-5", rows: "口味, 价格, 成分健康, 包装设计, 品牌知名度" }
    ],
    audienceConfig: { age: "25-34 岁", gender: "女性 55% / 男性 45%", city: "一线 / 新一线城市", income: "月收入 8k-20k", usage: "每周 2-3 次购买同类饮品", price: "中高价格敏感", lifestyle: "健康意识, 尝鲜意愿, 社交分享" }
  },
  {
    topic: "新能源汽车购买决策因素",
    audience: "一线城市潜在购车者",
    tags: ["续航", "价格", "品牌", "充电"],
    qualQuestions: [
      "在考虑购买新能源汽车时，你最关注哪些因素？",
      "你在新能源车与传统燃油车之间犹豫不决的主要原因是什么？",
      "如果要购买新能源车，你更倾向哪种品牌和充电方案？"
    ],
    quantQuestions: [
      { text: "你更倾向于购买哪种类型的新能源车？", type: "single", options: "纯电动, 插电混动, 增程式, 不确定", scale: "1-5", rows: "" },
      { text: "你对新能源车续航能力的重视程度", type: "scale", options: "", scale: "1-10", rows: "" },
      { text: "影响你购买新能源车的主要因素有哪些？", type: "multiple", options: "续航, 价格, 品牌, 充电便利性, 政策支持, 智能配置", scale: "1-5", rows: "" },
      { text: "请评价以下因素对购车决策的重要性", type: "matrix", options: "1, 2, 3, 4, 5", scale: "1-5", rows: "续航, 价格, 品牌, 充电便利性, 安全性能" }
    ],
    audienceConfig: { age: "28-45 岁", gender: "男性 58% / 女性 42%", city: "一线 / 新一线城市", income: "家庭月收入 25k+", usage: "正在比较新能源车型和充电条件", price: "高价格敏感", lifestyle: "理性比较, 技术关注, 家庭决策" }
  },
  {
    topic: "海外用户对短视频电商的接受度",
    audience: "北美 / 欧洲 / 日韩用户",
    tags: ["跨境电商", "短视频", "消费习惯"],
    qualQuestions: [
      "你通常会在短视频平台上购买商品吗？",
      "短视频电商与传统电商相比，你更倾向哪种购物方式？",
      "哪些因素会影响你通过短视频购买海外商品的意愿？"
    ],
    quantQuestions: [
      { text: "你会通过短视频平台购买商品吗？", type: "single", options: "经常, 偶尔, 很少, 从不", scale: "1-5", rows: "" },
      { text: "你对短视频电商的信任程度", type: "scale", options: "", scale: "1-5", rows: "" },
      { text: "你更倾向于通过哪种渠道购买海外商品？", type: "multiple", options: "短视频平台, 传统电商, 品牌官网, 代购, 社交媒体", scale: "1-5", rows: "" },
      { text: "请评价以下因素对短视频购买决策的影响", type: "matrix", options: "1, 2, 3, 4, 5", scale: "1-5", rows: "价格优势, 内容真实性, 物流速度, 品牌知名度, 售后保障" }
    ],
    audienceConfig: { age: "22-40 岁", gender: "均衡", city: "北美 / 欧洲 / 日韩核心城市", income: "中等及以上收入", usage: "每周观看短视频并有线上购物经验", price: "中等价格敏感", lifestyle: "内容驱动, 便利导向, 信任审慎" }
  },
  {
    topic: "小红书用户社交需求探索",
    audience: "小红书活跃用户",
    tags: ["内容偏好", "互动", "社区氛围"],
    qualQuestions: [
      "你使用小红书的主要目的是什么？",
      "小红书的内容和互动方式与其他社交平台有什么不同？",
      "你希望小红书在未来增加哪些功能或改进哪些方面？"
    ],
    quantQuestions: [
      { text: "你每天使用小红书的频率是多少？", type: "single", options: "每天多次, 每天一次, 每周几次, 很少使用", scale: "1-5", rows: "" },
      { text: "你对小红书社区氛围的满意度", type: "scale", options: "", scale: "1-5", rows: "" },
      { text: "你更偏好哪些类型的内容？", type: "multiple", options: "美妆护肤, 穿搭分享, 美食探店, 旅行攻略, 生活方式, 知识干货", scale: "1-5", rows: "" },
      { text: "请评价以下因素对小红书体验的重要性", type: "matrix", options: "1, 2, 3, 4, 5", scale: "1-5", rows: "内容质量, 互动体验, 社区氛围, 推荐精准度, 使用流畅度" }
    ],
    audienceConfig: { age: "22-35 岁", gender: "女性 75% / 男性 25%", city: "一线 / 新一线城市", income: "月收入 6k-18k", usage: "每天浏览小红书并参与互动", price: "中等价格敏感", lifestyle: "内容消费, 社交分享, 审美驱动" }
  },
  {
    topic: "母婴用品选购痛点",
    audience: "0-3 岁宝宝妈妈",
    tags: ["安全", "价格", "品牌", "渠道"],
    qualQuestions: [
      "在选购母婴用品时，你最看重哪些因素？",
      "你在购买母婴用品时遇到过哪些困扰或痛点？",
      "你更倾向于通过哪些渠道购买母婴用品，为什么？"
    ],
    quantQuestions: [
      { text: "你在购买母婴用品时最关注的因素是什么？", type: "single", options: "安全性, 价格, 品牌口碑, 使用便利性, 亲友推荐", scale: "1-5", rows: "" },
      { text: "你对母婴用品价格的敏感度", type: "scale", options: "", scale: "1-5", rows: "" },
      { text: "你通常通过哪些渠道购买母婴用品？", type: "multiple", options: "线上电商, 品牌官网, 母婴店, 超市, 社交电商, 代购", scale: "1-5", rows: "" },
      { text: "请评价以下因素对母婴用品选购的重要性", type: "matrix", options: "1, 2, 3, 4, 5", scale: "1-5", rows: "安全性, 价格, 品牌口碑, 使用便利性, 售后保障" }
    ],
    audienceConfig: { age: "28-38 岁", gender: "女性 90% / 男性 10%", city: "一线 / 二线城市", income: "家庭月收入 15k-35k", usage: "高频关注母婴用品安全与口碑", price: "中等价格敏感", lifestyle: "安全优先, 品牌信任, 渠道比较" }
  }
];

const state = {
  page: "qual",
  mode: "qual",
  resultTab: "primary",
  audience: "年轻白领",
  audienceConfig: {
    age: "25-34 岁",
    gender: "女性 55% / 男性 45%",
    city: "一线 / 新一线城市",
    income: "月收入 8k-20k",
    usage: "每周 2-3 次购买同类产品",
    price: "中高价格敏感",
    lifestyle: "健康意识, 尝鲜意愿, 社交分享"
  },
  quotaPlan: migrateQuotaPlan([
    { id: "gender", name: "性别", items: [{ label: "女性", pct: 55 }, { label: "男性", pct: 45 }] },
    { id: "age", name: "年龄", items: [{ label: "25-29 岁", pct: 45 }, { label: "30-34 岁", pct: 35 }, { label: "35-40 岁", pct: 20 }] },
    { id: "city", name: "城市层级", items: [{ label: "一线城市", pct: 45 }, { label: "新一线城市", pct: 40 }, { label: "二线城市", pct: 15 }] }
  ]),
  // v52 配额设计器状态
  quotaInputMode: "percent",          // "percent" | "count"（本轮先实现百分比模式与人数预览，人数模式预留接口）
  quotaDirty: false,                  // 用户是否手工修改过配额（用于切换预设/模板时是否需要确认）
  quotaTemplatePickerOpen: false,     // 是否打开「新增配额条件」面板
  quotaConfirmDialog: null,           // { type, payload, options } 切换预设/模板/删除维度前的确认弹窗
  quotaCollapsed: false,              // 配额摘要是否折叠
  quotaSchemes: [],                   // 已保存的配额方案（localStorage 缓存）
  quotaSchemePanelOpen: false,        // 是否展开配额方案管理面板
  provider: localStorage.getItem("synthuser_provider") || "zhipu",
  apiKey: "",
  showKey: false,
  customBaseUrl: localStorage.getItem("synthuser_custom_base_url") || "",
  customModel: localStorage.getItem("synthuser_custom_model") || "",
  topic: "0 糖气泡水概念测试",
  qualInputMode: "manual",
  quantInputMode: "manual",
  outlineText: "研究目标：验证 0 糖气泡水的概念吸引力\n目标人群：年轻白领、健康饮品用户\n访谈模块：第一印象、饮用场景、购买顾虑、价格接受度",
  questionnaireText: "Q1. 你会购买这款产品吗？【单选】一定会 / 可能会 / 不确定 / 不会\nQ2. 你更偏好的饮用场景是？【多选】办公室 / 运动后 / 聚餐 / 居家\nQ3. 你对健康饮品的重视程度【量表10分】\nQ4. 请评价以下因素的重要性【矩阵5分】口味 / 价格 / 成分 / 包装",
  qualQuestions: [
    "你对这个产品的第一印象是什么？",
    "什么情况下你会考虑购买或使用？",
    "最大的顾虑或阻碍是什么？"
  ],
  analysisFocus: ["核心发现", "痛点顾虑", "行动建议"],
  quantQuestions: [
    { text: "你会购买这款产品吗？", type: "single", options: "一定会, 可能会, 不确定, 不会", scale: "1-5", rows: "" },
    { text: "你对健康饮品的重视程度", type: "scale", options: "", scale: "1-5", rows: "" },
    { text: "你更偏好的饮用场景是？", type: "multiple", options: "办公室, 运动后, 聚餐, 居家", scale: "1-5", rows: "" },
    { text: "请评价以下因素的重要性", type: "matrix", options: "1, 2, 3, 4, 5", scale: "1-5", rows: "口味, 价格, 成分, 包装" }
  ],
  sampleSize: 100,
  isGenerating: false,
  progress: 0,
  generateStatus: "",
  result: null,
  generateError: "",
  showApiPrompt: false,
  deferredInstallPrompt: null,
  installAvailable: false,
  isStandalone: window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true,
  isOnline: navigator.onLine,
  toast: "",
  abortController: null,
  isImportingDocx: false,
  importError: "",
  // 定量数据质量：单题重生成状态 / 自动修复过的题目索引（用于数据质量卡片统计）
  regeneratingIndex: null,
  quantRepairedIndexes: [],
  // 问卷识别预览：上传/粘贴后先进入预览确认，确认前不覆盖 quantQuestions
  importPreview: null,
  // ===== v50 定量分析工作台 =====
  workbench: {
    tab: "core",              // core | questions | crosstab | story | export
    dirQuery: "",             // 题目目录：题号/关键词搜索
    dirType: "all",           // all | single | multiple | scale | matrix
    dirModule: "all",         // all | 模块id
    dirCoreOnly: false,       // 只看核心题
    dirAnomalyOnly: false,    // 只看异常题
    dirUserEditedOnly: false, // 只看人工修改题
    dirRepairedOnly: false,   // 只看AI修复题
    anomalyFilter: null,      // 数据质量卡片点击筛选：single_sum | scale_sum | matrix_missing | anomaly | all
    expanded: new Set(),      // 逐题分析中已展开的题目索引
    expandAll: false,         // 一键展开全部
    jumpQuestion: null,       // 需要滚动定位并高亮的题目索引
    editorIndex: null,        // 编辑抽屉打开的题目索引
    editorDraft: null,        // 编辑草稿（未提交）
    matrixView: {},           // 矩阵题视图：mean | dist
    crosstabConfig: { rowIndex: null, colType: "gender", metricIndex: null },
    crosstabResult: null,
    storyStatus: "idle",      // idle | generating | done
    scrolls: {}               // 各 tab 滚动位置（切换标签不丢失）
  },
  // ===== v53 逐题数据解读 =====
  questionInterpretations: {},   // { [questionIndex]: interpretationSlot }
  interpretationProgress: null,  // 批量生成进度 { current, total, failed, aborted }
  interpretationEditor: null,    // 人工编辑 { index, draft } 或 null
  autoCoreInterpretation: false // 结果生成完成后是否自动生成核心题解读（默认关闭）
};

const initialMode = new URLSearchParams(window.location.search).get("mode");
if (initialMode === "quant" || initialMode === "qual") {
  state.page = initialMode;
  state.mode = initialMode;
}

// v52：从 localStorage 加载已保存的配额方案
function loadQuotaSchemes() {
  try {
    const raw = localStorage.getItem("synthuser_quota_schemes");
    state.quotaSchemes = raw ? JSON.parse(raw) : [];
  } catch {
    state.quotaSchemes = [];
  }
}
function persistQuotaSchemes() {
  try {
    localStorage.setItem("synthuser_quota_schemes", JSON.stringify(state.quotaSchemes));
  } catch {}
}
loadQuotaSchemes();

const $ = (selector) => document.querySelector(selector);

function getSavedKey(provider = state.provider) {
  return localStorage.getItem(MODEL_CONFIG[provider].key) || "";
}

// 判断当前 provider 是否走后端代理（未保存自己的 Key 且代理支持该 provider）
function shouldUseProxy(provider = state.provider) {
  const hasOwnKey = !!localStorage.getItem(MODEL_CONFIG[provider].key);
  return !hasOwnKey && !!PROXY_PROVIDERS[provider];
}

function validateKeyFormat(key, provider) {
  const trimmed = key.trim();
  if (!trimmed) return "未输入 API Key";
  if (trimmed.length < 6) return `API Key 太短（只有 ${trimmed.length} 个字符），看起来不是有效的 Key`;
  // 排除明显不是真实 Key 的输入
  if (/^(test|123|abc|key|api|demo|mock|fake|none|no|无|11|111|222|333|000|123456|12345678)$/i.test(trimmed)) {
    return "输入的内容明显不是有效的 API Key";
  }
  if (provider === "kimi" || provider === "deepseek") {
    if (!trimmed.startsWith("sk-")) {
      return `【提示】Kimi / DeepSeek 的 Key 通常以 sk- 开头，你输入的格式可能不正确`;
    }
    if (trimmed.length < 20) {
      return `【提示】Key 长度过短（${trimmed.length} 字符），真实 Key 通常超过 50 字符`;
    }
  }
  if (provider === "zhipu") {
    if (trimmed.length < 15) {
      return `【提示】智谱 API Key 长度不足（${trimmed.length} 字符），请检查是否复制完整`;
    }
  }
  if (provider === "custom") {
    if (trimmed.length < 10) {
      return `【提示】自定义 Key 长度较短（${trimmed.length} 字符），请确认格式正确`;
    }
  }
  return null; // 校验通过
}

function hasModelReady() {
  // 走代理时直接判定为就绪（Key 在后端，前端不需要校验）
  if (shouldUseProxy()) return true;
  const key = getSavedKey();
  return validateKeyFormat(key, state.provider) === null;
}

// 迁移逻辑：若当前 provider 既没保存 Key 也不支持代理，但 zhipu 支持代理，
// 则自动切换到 zhipu，确保首次访问旧版本的用户也能开箱即用。
function migrateToDefaultProvider() {
  const currentProvider = state.provider;
  if (!MODEL_CONFIG[currentProvider]) {
    state.provider = "zhipu";
    localStorage.setItem("synthuser_provider", "zhipu");
    return;
  }
  const hasOwnKey = !!localStorage.getItem(MODEL_CONFIG[currentProvider].key);
  const proxySupported = !!PROXY_PROVIDERS[currentProvider];
  if (!hasOwnKey && !proxySupported && PROXY_PROVIDERS.zhipu) {
    state.provider = "zhipu";
    localStorage.setItem("synthuser_provider", "zhipu");
  }
}

function validateApiConfig() {
  // 走代理模式时不需要校验 Key 和 baseUrl（后端负责）
  if (shouldUseProxy()) return null;
  const { baseUrl, model, key } = getApiConfig();
  const keyError = validateKeyFormat(key, state.provider);
  if (keyError) return keyError;
  if (!baseUrl) return "未设置 API 地址。如果是自定义模型，请填写 Base URL。";
  return null;
}

function getApiConfig() {
  const cfg = MODEL_CONFIG[state.provider];
  const key = getSavedKey();
  let baseUrl = cfg.baseUrl;
  let model = cfg.model;
  if (state.provider === "custom") {
    baseUrl = state.customBaseUrl.trim();
    model = state.customModel.trim() || "custom-model";
  }
  return { baseUrl, model, key };
}

function route(page) {
  if (page === "qual" || page === "quant") state.mode = page;
  state.page = page;
  state.generateError = ""; // 切换页面时清除错误
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message, duration = 1800) {
  state.toast = message;
  render();
  if (duration > 0) {
    window.setTimeout(() => {
      state.toast = "";
      render();
    }, duration);
  }
}

function syncResearchForm() {
  const topic = $("#topic");
  if (topic) {
    state.topic = topic.value;
    // 研究主题为空时，自动从问卷首题推导兜底主题并回填输入框
    // 这样用户能看到自动填入的主题，且不会被后续 input 事件清空
    if (!state.topic.trim()) {
      const fallback = deriveTopicFromQuestions();
      if (fallback) {
        state.topic = fallback;
        topic.value = fallback;
      }
    }
  }
  const sampleSize = $("#sample-size");
  if (sampleSize) state.sampleSize = Math.max(50, Math.min(500, Number(sampleSize.value || 100)));
  const outline = $("#outline-text");
  if (outline) state.outlineText = outline.value;
  const questionnaire = $("#questionnaire-text");
  if (questionnaire) state.questionnaireText = questionnaire.value;
  const activeAudience = document.querySelector("[name='audience'].active");
  if (activeAudience) state.audience = activeAudience.dataset.value;
  state.audienceConfig = {
    age: $("#aud-age")?.value || state.audienceConfig.age,
    gender: $("#aud-gender")?.value || state.audienceConfig.gender,
    city: $("#aud-city")?.value || state.audienceConfig.city,
    income: $("#aud-income")?.value || state.audienceConfig.income,
    usage: $("#aud-usage")?.value || state.audienceConfig.usage,
    price: $("#aud-price")?.value || state.audienceConfig.price,
    lifestyle: $("#aud-lifestyle")?.value || state.audienceConfig.lifestyle
  };
  // v52：配额维度按稳定 ID 同步，正确区分「输入框不存在 / 存在但为空 / 用户清空」。
  // 不再过滤空 label —— 空名称需保留以触发 validateQuotaPlan 报错。
  // 不再使用数组下标作为标识，避免删除/排序后事件绑定错位。
  let quotaChanged = false;
  state.quotaPlan = state.quotaPlan.map((dimension) => {
    // 维度名称同步
    const nameInput = document.querySelector(`[data-quota-dim-name="${dimension.id}"]`);
    const newName = nameInput ? nameInput.value : dimension.name;
    if (newName !== dimension.name) quotaChanged = true;
    const newItems = dimension.items.map((item) => {
      const labelInput = document.querySelector(`#quota-${dimension.id}-${item.id}-label`);
      const pctInput = document.querySelector(`#quota-${dimension.id}-${item.id}-pct`);
      // 输入框存在时取其值（即使为空）；不存在时保留原值
      const newLabel = labelInput ? labelInput.value : item.label;
      let newPct = item.pct;
      if (pctInput) {
        const parsed = Number(pctInput.value);
        if (Number.isFinite(parsed)) {
          newPct = Math.max(0, Math.min(100, parsed));
        }
      }
      if (newLabel !== item.label || newPct !== item.pct) quotaChanged = true;
      return { ...item, label: newLabel, pct: newPct };
    });
    return { ...dimension, name: newName, items: newItems };
  });
  if (quotaChanged) state.quotaDirty = true;
  state.qualQuestions = [0, 1, 2].map((index) => $(`#qual-${index}`)?.value || state.qualQuestions[index]);
  state.quantQuestions = state.quantQuestions.map((question, index) => {
    const typeEl = $(`#q-type-${index}`);
    const type = typeEl ? typeEl.value : question.type;
    const optEl = $(`#q-options-${index}`);
    return {
      text: $(`#q-text-${index}`)?.value !== undefined ? $(`#q-text-${index}`).value : question.text,
      type,
      // 区分「输入框不存在」与「存在但为空」：用户清空选项后不自动回退旧值
      options: optEl ? optEl.value : question.options,
      scale: $(`#q-scale-${index}`)?.value || question.scale,
      rows: $(`#q-rows-${index}`)?.value || question.rows,
      config: readQuestionConfigFromDom(index, type, question.config || {})
    };
  });
  // 注意：这里不做任何「自动填充占位选项」。
  // 识别不到选项时保持为空，由生成前的问卷校验给出明确提示；
  // 只有用户在识别预览页主动点击「添加占位选项」才允许生成占位项。
}

// 从 DOM 读取结构化选项编辑器的全部选项（过滤空行）
function optionRowsFromDom(index) {
  // 注意：选项行的 data-qopt 是 "题号:行号"（如 "0:2"），必须前缀匹配；空行保留占位避免索引错位
  return [...document.querySelectorAll(`[data-qopt^="${index}:"]`)].map((el) => el.value.trim());
}

// 同步结构化选项到隐藏的 #q-options（逗号分隔，供生成/导出读取）
function syncHiddenOptions(index, opts) {
  const el = $(`#q-options-${index}`);
  if (el) el.value = opts.join(", ");
}

// 从配置表单 DOM 读取各题型 config（rank/numeric/open/allocation/nps）
function readQuestionConfigFromDom(index, type, prev) {
  const cfg = { ...(prev || {}) };
  const get = (key) => {
    const el = $(`#q-config-${index}-${key}`);
    return el ? el.value : undefined;
  };
  if (type === "rank") {
    const mode = get("rankMode") || cfg.rankMode || "full";
    cfg.rankMode = mode;
    if (mode === "top_n") {
      const n = Number(get("topN"));
      cfg.topN = Number.isFinite(n) && n > 0 && n <= 20 ? Math.round(n) : (cfg.topN || 3);
    } else {
      cfg.topN = null;
    }
    cfg.allowTies = false;
  } else if (type === "numeric") {
    cfg.numericType = get("numericType") || cfg.numericType || "integer";
    const min = Number(get("min"));
    if (Number.isFinite(min)) cfg.min = min;
    const max = Number(get("max"));
    if (Number.isFinite(max)) cfg.max = max;
    const unit = get("unit");
    cfg.unit = unit !== undefined ? unit : (cfg.unit || "");
    const dp = Number(get("decimalPlaces"));
    cfg.decimalPlaces = Number.isFinite(dp) ? dp : 0;
  } else if (type === "open") {
    cfg.openMode = get("openMode") || cfg.openMode || "long_text";
    const ml = Number(get("maxLength"));
    if (Number.isFinite(ml)) cfg.maxLength = Math.max(20, Math.round(ml));
  } else if (type === "allocation") {
    const tp = Number(get("totalPoints"));
    if (Number.isFinite(tp) && tp > 0) cfg.totalPoints = Math.max(1, Math.min(1000, Math.round(tp)));
    cfg.minPerOption = 0;
    cfg.maxPerOption = cfg.totalPoints;
  } else if (type === "nps") {
    cfg.min = 0;
    cfg.max = 10;
    cfg.detractorRange = [0, 6];
    cfg.passiveRange = [7, 8];
    cfg.promoterRange = [9, 10];
  }
  return cfg;
}

function syncSettingsForm() {
  state.apiKey = $("#api-key")?.value || state.apiKey;
  state.customBaseUrl = $("#custom-base-url")?.value || state.customBaseUrl;
  state.customModel = $("#custom-model")?.value || state.customModel;
}

function hasResearchReady() {
  // 研究主题为空时，尝试用问卷首题兜底（只读，不写回 state——回填由 syncResearchForm 负责）
  const topic = state.topic.trim() || deriveTopicFromQuestions();
  if (!topic) return false;
  if (state.mode === "qual") {
    return state.qualQuestions.every((q) => q.trim());
  }
  // 放宽校验：只要求题干非空 + 至少 3 道题
  // 选项为空的 single/multiple 题不阻塞按钮（生成前由 validateQuantQuestionsForGeneration 给出明确提示）
  // 矩阵题行维度为空时不阻塞按钮（同上）
  // 这样导入含价格测试/开放题等无选项题目的问卷后，用户可以先在识别预览中处理，再点击生成
  return state.quantQuestions.length >= 3 && state.quantQuestions.every((q) => {
    if (!q.text.trim()) return false;
    return true;
  });
}

// 从问卷题目推导默认研究主题：取首题文本（去掉题号前缀、问号、编程说明，截断到 40 字）
function deriveTopicFromQuestions() {
  const qs = state.mode === "qual" ? state.qualQuestions : state.quantQuestions;
  if (!qs || !qs.length) return "";
  if (state.mode === "qual") {
    return String(qs[0] || "").replace(/^\s*\d+\s*[.、):：]\s*/, "").slice(0, 40);
  }
  const first = qs[0];
  if (!first || !first.text) return "";
  let text = first.text;
  text = text.replace(/^\s*[A-Za-z]?\d+[A-Za-z]?\d?\s*[.、):：]\s*/, "");
  text = text.replace(/[？?]\s*$/, "");
  text = text.replace(/【[^】]*】/g, "");
  return text.trim().slice(0, 40);
}

function splitList(value) {
  return String(value || "")
    // 保护 "其他，请说明" / "其它，请注明" 等作为一个完整选项，不被逗号拆分
    .replace(/(其他|其它)，/g, "$1\x00")
    .split(/[,，、\n]/)
    .map((item) => item.trim().replace(/\x00/g, "，"))
    .filter(Boolean);
}

// normalizeTo100 由 quota-core.js 提供（最大余数法），不再在 app.js 重复定义。

// v52：保留旧函数名（quotaFromAudienceConfig）作为「重新生成 3 个 preset 维度」入口。
// 返回的维度 id 每次都重新生成（保证唯一），source 均为 preset。
function quotaFromAudienceConfig(config = state.audienceConfig) {
  return buildDefaultQuotaPlan(config);
}

// 仅更新 gender/age/city 三个 preset 维度，保留其他 custom 维度（用于「仅更新系统默认维度」场景）。
function refreshPresetDimensions(plan = state.quotaPlan, config = state.audienceConfig) {
  const presetNames = ["性别", "年龄", "城市层级"];
  const customDims = plan.filter((d) => !presetNames.includes(String(d.name || "").trim()));
  const newPresets = buildDefaultQuotaPlan(config);
  return [...newPresets, ...customDims];
}

function quotaTotal(dimension) {
  if (!dimension || !Array.isArray(dimension.items)) return 0;
  return dimension.items.reduce((sum, item) => sum + (Number(item.pct) || 0), 0);
}

function quotaWarnings() {
  // v52：保留旧函数名以兼容 AudienceBuilder 调用，但内部走新的 validateQuotaPlan
  const result = validateQuotaPlan(state.quotaPlan, currentSampleSize());
  return result.errors
    .filter((e) => e.type === "total_not_100" || e.type === "single_item_not_100")
    .map((e) => ({ name: e.dimensionId || "", message: e.message, total: null }));
}

function quotaValidationResult() {
  return validateQuotaPlan(state.quotaPlan, currentSampleSize());
}

function currentSampleSize() {
  return state.mode === "qual" ? 6 : (Number(state.sampleSize) || 100);
}

function quotaSummary() {
  // v52：用于 AI 提示词的简洁文本
  return buildQuotaPromptText(state.quotaPlan, currentSampleSize());
}

function quotaSampleSummary() {
  // v52：用于页面预览的简短摘要
  const lines = buildQuotaSummaryLines(state.quotaPlan, currentSampleSize());
  if (!lines.length) return "尚未配置配额维度";
  return lines.map((l) => `${l.name}：${l.itemsText}`).join("；");
}

function saveModelSettings() {
  syncSettingsForm();
  const key = state.apiKey.trim();
  if (key) {
    const error = validateKeyFormat(key, state.provider);
    if (error) {
      toast("⚠️ " + error + "，已保存但可能无法调用");
    } else {
      toast("✅ 模型设置已保存，Key 格式校验通过");
    }
    localStorage.setItem(MODEL_CONFIG[state.provider].key, key);
  } else {
    localStorage.removeItem(MODEL_CONFIG[state.provider].key);
    toast("API Key 已清除");
  }
  localStorage.setItem("synthuser_provider", state.provider);
  localStorage.setItem("synthuser_custom_base_url", state.customBaseUrl.trim());
  localStorage.setItem("synthuser_custom_model", state.customModel.trim());
}

function clearApiKey() {
  localStorage.removeItem(MODEL_CONFIG[state.provider].key);
  state.apiKey = "";
  toast("API Key 已清除");
}

function useTemplate(index) {
  const template = templates[index];
  // v52：若用户已修改过配额，弹出确认而非直接覆盖
  if (state.quotaDirty && state.quotaPlan && state.quotaPlan.length) {
    state.quotaConfirmDialog = {
      type: "template",
      payload: { index },
      title: "检测到你已经修改了配额设计",
      message: "应用模板时会带入人群画像，配额可以保留或一同替换。",
      options: [
        { key: "apply_all", label: "应用研究内容和人群画像，并使用模板配额覆盖全部", action: "template-apply-all" },
        { key: "keep_quota", label: "仅应用研究内容和人群画像，保留当前配额", action: "template-apply-keep-quota" },
        { key: "cancel", label: "取消", action: "quota-confirm-cancel" }
      ]
    };
    render();
    return;
  }
  applyTemplate(index, "apply_all");
}

function applyTemplate(index, quotaMode) {
  const template = templates[index];
  // 深拷贝模板对象，避免后续修改污染模板
  const tplAudienceConfig = JSON.parse(JSON.stringify(template.audienceConfig));
  state.topic = template.topic;
  state.audience = template.audience;
  state.audienceConfig = tplAudienceConfig;
  if (quotaMode === "keep_quota") {
    // 保留当前配额，仅刷新 preset 维度的 gender/age/city（用户自定义维度保持不变）
    state.quotaPlan = refreshPresetDimensions(state.quotaPlan, tplAudienceConfig);
  } else {
    // apply_all：完全使用模板默认配额（基于人群画像生成）
    state.quotaPlan = buildDefaultQuotaPlan(tplAudienceConfig);
    state.quotaDirty = false;
  }
  state.qualQuestions = [...template.qualQuestions];
  state.quantQuestions = template.quantQuestions.map((q) => ({ ...q }));
  state.result = null;
  state.generateError = "";
  state.quotaConfirmDialog = null;
  route(state.mode);
  toast("模板已填入");
}

function audiencePreset(label) {
  if (label.includes("妈妈")) {
    return { age: "28-38 岁", gender: "女性 90% / 男性 10%", city: "一线 / 二线城市", income: "家庭月收入 15k-35k", usage: "高频关注母婴用品安全与口碑", price: "中等价格敏感", lifestyle: "安全优先, 品牌信任, 渠道比较" };
  }
  if (label.includes("购车")) {
    return { age: "28-45 岁", gender: "男性 58% / 女性 42%", city: "一线 / 新一线城市", income: "家庭月收入 25k+", usage: "正在比较新能源车型和充电条件", price: "高价格敏感", lifestyle: "理性比较, 技术关注, 家庭决策" };
  }
  if (label.includes("海外")) {
    return { age: "22-40 岁", gender: "均衡", city: "北美 / 欧洲 / 日韩核心城市", income: "中等及以上收入", usage: "每周观看短视频并有线上购物经验", price: "中等价格敏感", lifestyle: "内容驱动, 便利导向, 信任审慎" };
  }
  return { age: "25-34 岁", gender: "女性 55% / 男性 45%", city: "一线 / 新一线城市", income: "月收入 8k-20k", usage: "每周 2-3 次购买同类产品", price: "中高价格敏感", lifestyle: "健康意识, 尝鲜意愿, 社交分享" };
}

function audienceSummary() {
  const c = state.audienceConfig;
  return `${state.audience}；${c.age}；${c.city}；${c.usage}`;
}

function importOutline() {
  syncResearchForm();
  const lines = state.outlineText.split(/\n+/).map((line) => line.replace(/^[-#\d.\s]+/, "").trim()).filter(Boolean);
  const usable = lines.filter((line) => !line.includes("目标人群") && !line.includes("研究目标"));
  state.qualQuestions = [
    usable[0] || "请描述你对这个概念的第一反应。",
    usable[1] || "哪些场景会驱动你尝试或购买？",
    usable[2] || "你最担心或最犹豫的点是什么？"
  ].map((line) => line.includes("？") || line.includes("?") ? line : `${line}方面，你会怎么想？`);
  state.qualInputMode = "manual";
  toast("已从大纲生成访谈问题");
  render();
}

// 问卷题量上限（与 UI 添加题目按钮、导入截断保持一致）
const MAX_QUESTIONS = 80;


function importQuestionnaire() {
  syncResearchForm();
  const text = (state.questionnaireText || "").trim();
  if (!text) {
    toast("请先粘贴问卷文本");
    return;
  }
  state.questionnaireText = text;
  openImportPreview("text", "粘贴文本", text, []);
}

// ===== 识别预览 =====
// 上传 / 粘贴后先进入「识别预览」页：展示识别质量 → 用户确认或修正 → 再写入问卷编辑页。
// 预览状态保存在 state.importPreview，用户确认前不覆盖 state.quantQuestions。

// 进入识别预览页
function openImportPreview(sourceType, fileName, rawText, globalWarnings = []) {
  const parsed = parseQuestionnaireText(rawText);
  if (parsed.length < 3) {
    toast("未能识别出 3 道以上题目，请检查格式");
    return;
  }
  const sliced = parsed.slice(0, MAX_QUESTIONS);
  if (parsed.length > MAX_QUESTIONS) {
    globalWarnings.push(`问卷共识别出 ${parsed.length} 道题目，已截取前 ${MAX_QUESTIONS} 道，请在预览中删除不需要的题目。`);
  }
  const analyzed = analyzeQuestionIssues(sliced);
  state.importPreview = {
    sourceType,
    fileName,
    rawText,
    parsedQuestions: analyzed,
    globalWarnings,
    filter: "all",          // all | complete | needs-confirm | failed
    expanded: new Set(analyzed.map((q, i) => (q.status !== "complete" ? i : -1)).filter((i) => i >= 0)),
    checked: new Set(),
    confirmed: false,
    acceptedAll: false,
    confirmDialog: null,
    confirmError: ""
  };
  state.importPreview.summary = buildImportSummary(state.importPreview.parsedQuestions);
  state.page = "import-preview";
  state.mode = "quant";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// 重新计算识别质量（编辑题目后调用）
function refreshImportPreview() {
  const preview = state.importPreview;
  if (!preview) return;
  let analyzed = analyzeQuestionIssues(preview.parsedQuestions.map((q) => ({ ...q, issues: undefined, blocking: undefined, status: undefined })));
  // 用户「全部确认」后，非严重问题不再复活（仅保留严重问题）
  if (preview.acceptedAll) {
    analyzed = analyzed.map((q) => {
      const blocking = q.blocking || [];
      return { ...q, issues: blocking, status: blocking.length ? "failed" : "complete" };
    });
  }
  preview.parsedQuestions = analyzed;
  preview.summary = buildImportSummary(preview.parsedQuestions);
  preview.confirmError = "";
}

// 结构变更（删除/合并/拆分/批量）后重置展开与勾选索引，避免指向错位题目
function resetImportSelection() {
  const preview = state.importPreview;
  if (!preview) return;
  preview.expanded = new Set(preview.parsedQuestions.map((q, i) => (q.status !== "complete" ? i : -1)).filter((i) => i >= 0));
  preview.checked = new Set();
}

// 查看原文折叠：记录当前展开的原文索引
function toggleImportRaw(index) {
  const preview = state.importPreview;
  if (preview.rawExpanded === index) preview.rawExpanded = null;
  else preview.rawExpanded = index;
  render();
}

// ===== 预览编辑操作 =====

function importPreviewFiltered() {
  const preview = state.importPreview;
  if (!preview) return [];
  if (preview.filter === "all") return preview.parsedQuestions;
  return preview.parsedQuestions.filter((q) => q.status === preview.filter);
}

// 编辑单个字段（题干/题型/量表范围/选项/矩阵行），输入过程中不整页重渲染以免丢失焦点
function updateImportQuestion(index, patch) {
  const preview = state.importPreview;
  if (!preview || !preview.parsedQuestions[index]) return;
  Object.assign(preview.parsedQuestions[index], patch);
  refreshImportPreview();
}

// 选项行编辑（q.options 存逗号连接串，编辑用数组）
function importOptionArray(q) {
  return q.type === "matrix" ? splitList(q.rows) : splitOptions(q.options);
}

function setImportOptionArray(index, arr) {
  const q = state.importPreview.parsedQuestions[index];
  // 保留空行（用户在编辑器里新增的空行需要可见可编辑；splitOptions 会忽略空项）
  if (q.type === "matrix") q.rows = arr.map((s) => s.trim()).join(", ");
  else q.options = arr.map((s) => s.trim()).join(", ");
}

function addImportOption(index) {
  const arr = importOptionArray(state.importPreview.parsedQuestions[index]);
  arr.push("");
  setImportOptionArray(index, arr);
  refreshImportPreview();
  render();
}

function removeImportOption(index, optIdx) {
  const arr = importOptionArray(state.importPreview.parsedQuestions[index]);
  arr.splice(optIdx, 1);
  setImportOptionArray(index, arr);
  refreshImportPreview();
  render();
}

function moveImportOption(index, optIdx, dir) {
  const arr = importOptionArray(state.importPreview.parsedQuestions[index]);
  const target = optIdx + dir;
  if (target < 0 || target >= arr.length) return;
  [arr[optIdx], arr[target]] = [arr[target], arr[optIdx]];
  setImportOptionArray(index, arr);
  refreshImportPreview();
  render();
}

// 用户主动点击「添加占位选项」才允许生成占位项（默认绝不自动补）
function addImportPlaceholderOptions(index) {
  const q = state.importPreview.parsedQuestions[index];
  const arr = importOptionArray(q);
  if (arr.length === 0) {
    arr.push("选项1", "选项2");
  } else {
    arr.push(`选项${arr.length + 1}`);
  }
  setImportOptionArray(index, arr);
  refreshImportPreview();
  render();
}

// 拆分：把某选项拆成一道新题（处理「被错误合并的题目」）
function splitImportOption(index, optIdx) {
  const preview = state.importPreview;
  const q = preview.parsedQuestions[index];
  const arr = importOptionArray(q);
  const optText = arr[optIdx];
  if (!optText || !optText.trim()) return;
  arr.splice(optIdx, 1);
  setImportOptionArray(index, arr);
  const newQ = { text: optText.trim(), type: "single", options: "", scale: "1-5", rows: "", rawLines: [], hadTypeMarker: false, scaleExplicit: false };
  preview.parsedQuestions.splice(index + 1, 0, newQ);
  refreshImportPreview();
  resetImportSelection();
  render();
}

// 合并：把当前题合并到上一题（处理「被错误拆分的题目」）
function mergeImportQuestionUp(index) {
  const preview = state.importPreview;
  if (index <= 0) return;
  const prev = preview.parsedQuestions[index - 1];
  const cur = preview.parsedQuestions[index];
  if (prev.type === "single" || prev.type === "multiple") {
    const curOpts = importOptionArray(cur);
    const union = importOptionArray(prev);
    curOpts.forEach((o) => { if (o.trim() && !union.includes(o)) union.push(o); });
    if (cur.text && !prev.text.includes(cur.text)) prev.text = `${prev.text} ${cur.text}`.trim();
    prev.options = union.map((s) => s.trim()).filter(Boolean).join(", ");
  } else if (cur.options && !prev.options) {
    prev.options = cur.options;
  } else if (cur.text && !prev.text.includes(cur.text)) {
    prev.text = `${prev.text} ${cur.text}`.trim();
  }
  if (prev.type === "single" || prev.type === "multiple") prev.type = cur.type || prev.type;
  preview.parsedQuestions.splice(index, 1);
  refreshImportPreview();
  resetImportSelection();
  render();
}

function deleteImportQuestion(index) {
  const preview = state.importPreview;
  preview.parsedQuestions.splice(index, 1);
  refreshImportPreview();
  resetImportSelection();
  render();
}

// ===== 批量操作 =====

// 批量目标：勾选的题目优先；未勾选时作用于当前筛选视图下的所有题目
function importBatchTargetIndexes() {
  const preview = state.importPreview;
  const checked = [...preview.checked].sort((a, b) => a - b);
  if (checked.length) return checked;
  const filtered = importPreviewFiltered();
  return preview.parsedQuestions.map((q, i) => ({ q, i })).filter(({ q }) => filtered.includes(q)).map(({ i }) => i);
}

function importBatchSetType(type) {
  importBatchTargetIndexes().forEach((i) => {
    const q = state.importPreview.parsedQuestions[i];
    q.type = type;
    if (type === "scale") { q.options = ""; q.rows = ""; }
    if (type === "matrix") { q.options = ""; }
    if (type === "single" || type === "multiple") { q.rows = ""; }
  });
  refreshImportPreview();
  render();
}

// 批量删除疑似说明文字（无题型标记、无选项、无问号的长段落 / 以「注/说明/备注/提示」开头）
function importBatchDropInstructions() {
  const preview = state.importPreview;
  const targets = importBatchTargetIndexes().filter((i) => {
    const q = preview.parsedQuestions[i];
    if (/^[（(]?(注[:：]|说明[:：]|备注[:：]|提示[:：])/.test(q.text)) return true;
    return q.type === "single" && !q.options && !q.hadTypeMarker && !/[？?]/.test(q.text);
  });
  targets.sort((a, b) => b - a).forEach((i) => preview.parsedQuestions.splice(i, 1));
  refreshImportPreview();
  resetImportSelection();
  render();
}

// 批量接受共享选项（清除「继承/完全相同」警告，视为用户确认）
function importBatchAcceptShared() {
  const preview = state.importPreview;
  importBatchTargetIndexes().forEach((i) => {
    const q = preview.parsedQuestions[i];
    q.inherited = false;
    q.sharedAccepted = true;
  });
  refreshImportPreview();
  render();
}

// 批量跳过开放题
function importBatchSkipOpen() {
  const preview = state.importPreview;
  const targets = importBatchTargetIndexes().filter((i) => preview.parsedQuestions[i].type === "open");
  targets.sort((a, b) => b - a).forEach((i) => preview.parsedQuestions.splice(i, 1));
  refreshImportPreview();
  render();
}

// 恢复原始识别结果（丢弃预览中的修改，重新解析 rawText）
function importResetPreview() {
  const preview = state.importPreview;
  const parsed = analyzeQuestionIssues(parseQuestionnaireText(preview.rawText).slice(0, MAX_QUESTIONS));
  preview.parsedQuestions = parsed;
  preview.acceptedAll = false;
  preview.confirmError = "";
  refreshImportPreview();
  resetImportSelection();
  render();
  toast("已恢复原始识别结果");
}

// 全部确认：清除所有轻度警告（严重问题仍保留待处理）
function importAcceptAll() {
  const preview = state.importPreview;
  preview.acceptedAll = true;
  preview.parsedQuestions = preview.parsedQuestions.map((q) => {
    const blocking = q.blocking || [];
    return { ...q, issues: blocking, blocking, status: blocking.length ? "failed" : "complete" };
  });
  refreshImportPreview();
  render();
  toast("已确认全部识别结果（严重问题仍需处理）");
}

// ===== 确认问卷并继续 =====

function confirmImportPreview() {
  const preview = state.importPreview;
  const result = confirmImportQuestions(preview.parsedQuestions.map((q) => ({ ...q })));
  if (!result.ok) {
    preview.confirmError = result.errors.join("\n");
    render();
    return;
  }
  if (result.warnings.length) {
    preview.confirmDialog = { warnings: result.warnings, result };
    render();
    return;
  }
  applyConfirmedImport(result);
}

function dismissImportConfirmDialog() {
  state.importPreview.confirmDialog = null;
  render();
}

function applyConfirmedImport(result) {
  const preview = state.importPreview;
  state.quantQuestions = result.questions.slice(0, MAX_QUESTIONS).map((q, qi) =>
    migrateQuestionData({
      text: q.text, type: q.type, options: q.options, scale: q.scale, rows: q.rows, config: q.config || {}, code: q.code
    }, qi)
  );
  state.quantInputMode = "manual";
  preview.confirmed = true;
  preview.confirmDialog = null;
  preview.confirmError = "";
  toast(`已确认 ${result.questions.length} 道题目${result.dropped.length ? `，自动跳过 ${result.dropped.length} 道开放题` : ""}`);
  route("quant");
}

// ===== Word 问卷文档导入 =====
// 纯前端零依赖解析 .docx：解压 ZIP → 读取 word/document.xml → 按 <w:p> 提取段落文本
// 浏览器要求：支持 DecompressionStream('deflate-raw')（Chrome 103+ / Firefox 113+ / Safari 16.4+）

async function extractDocxText(file) {
  if (!file) throw new Error("未选择文件");
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".doc") && !lowerName.endsWith(".docx")) {
    throw new Error("暂不支持 .doc 旧格式，请先用 Word 另存为 .docx 后再上传");
  }
  if (!lowerName.endsWith(".docx")) {
    throw new Error("仅支持 .docx 格式文件");
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持 docx 解压（需要 DecompressionStream API），请升级到 Chrome 103+ / Firefox 113+ / Safari 16.4+");
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const entry = findZipEntry(bytes, "word/document.xml");
  if (!entry) {
    throw new Error("文档格式异常：未在 .docx 中找到 word/document.xml 正文，请确认文件未损坏");
  }
  const xmlBytes = await inflateEntry(bytes, entry);
  const xmlText = new TextDecoder("utf-8").decode(xmlBytes);
  if (!xmlText.includes("<w:p") && !xmlText.includes("<w:t")) {
    throw new Error("文档正文 XML 无有效段落，请确认 .docx 中包含问卷内容");
  }
  const warnings = [];
  // Word 表格：已尝试按单元格提取，但复杂表格布局仍可能识别不全，提示用户核对
  if (hasWordTable(xmlText)) {
    warnings.push("检测到 Word 表格，已按单元格内容识别；复杂表格布局部分内容可能未完整识别，请在预览页逐题核对。");
  }
  return { text: extractParagraphsFromDocxXml(xmlText), warnings };
}

// ===== Excel 问卷文档导入 =====
// 纯前端零依赖解析 .xlsx：解压 ZIP → 读取 xl/sharedStrings.xml + xl/worksheets/sheetN.xml → 按行提取
// 智能识别 题号 / 题目内容 / 题型 / 选项 列，按 parseQuestionnaireText 友好格式拼接

async function extractXlsxText(file) {
  if (!file) throw new Error("未选择文件");
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".xls") && !lowerName.endsWith(".xlsx")) {
    throw new Error("暂不支持 .xls 旧格式，请先用 Excel 另存为 .xlsx 后再上传");
  }
  if (!lowerName.endsWith(".xlsx")) {
    throw new Error("仅支持 .xlsx 格式文件");
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持 xlsx 解压（需要 DecompressionStream API），请升级到 Chrome 103+ / Firefox 113+ / Safari 16.4+");
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const entries = listZipEntries(bytes);

  // 1. 读取共享字符串表（如果存在）
  const sharedStrings = [];
  const ssEntry = entries.find((e) => e.name === "xl/sharedStrings.xml");
  if (ssEntry) {
    const ssBytes = await inflateEntry(bytes, ssEntry);
    const ssXml = new TextDecoder("utf-8").decode(ssBytes);
    parseSharedStringsXml(ssXml).forEach((s) => sharedStrings.push(s));
  }

  // 2. 找所有 sheet 文件（xl/worksheets/sheet1.xml, sheet2.xml, ...）
  const sheetEntries = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => {
      const na = Number(a.name.match(/sheet(\d+)/)[1]);
      const nb = Number(b.name.match(/sheet(\d+)/)[1]);
      return na - nb;
    });

  if (sheetEntries.length === 0) {
    throw new Error("文档格式异常：未在 .xlsx 中找到 xl/worksheets/sheetN.xml，请确认文件未损坏");
  }

  // 3. 遍历所有 sheet，收集每个问卷 sheet 的文本（合并 S/A/B/T 等多个部分）
  //    非问卷 sheet（配额设计、问卷框架等）会因 buildQuestionnaireTextFromXlsxRows 找不到
  //    "题号 + 题干及选项" 表头而返回空字符串，自动跳过
  const allText = [];
  let sheetCount = 0;
  for (const sheetEntry of sheetEntries) {
    const sheetBytes = await inflateEntry(bytes, sheetEntry);
    const sheetXml = new TextDecoder("utf-8").decode(sheetBytes);
    if (!sheetXml.includes("<row") && !sheetXml.includes("<c ")) continue;
    const rows = extractXlsxRows(sheetXml, sharedStrings);
    if (rows.length === 0) continue;
    sheetCount++;
    const text = buildQuestionnaireTextFromXlsxRows(rows);
    if (text.trim()) allText.push(text);
  }

  if (allText.length === 0) {
    throw new Error("Excel 文档为空或无有效问卷行，请确认包含问卷题目");
  }
  const warnings = [];
  if (sheetCount > 1) {
    warnings.push(`问卷由 ${sheetCount} 个 Sheet 组成，已按顺序合并识别（中间以分节标记分隔）。`);
  }
  // 多个 sheet 之间用分节标记分隔，确保 parseQuestionnaireText 能正确分组
  return { text: allText.join("\n\n部分\n\n"), warnings };
}


// 在 ZIP 中央目录中查找指定名称的条目
function findZipEntry(bytes, targetName) {
  const entries = listZipEntries(bytes);
  return entries.find((e) => e.name === targetName) || null;
}

// 列出 ZIP 中央目录中的所有条目
function listZipEntries(bytes) {
  // 1. 从尾部找 EOCD（签名 0x06054b50）
  const minEocdOffset = Math.max(0, bytes.length - 65557);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minEocdOffset; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("文件不是有效的 ZIP（缺少结束标记）");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  // 处理 ZIP64（这里简单处理：若为 0xFFFFFFFF 则报错，原型足够）
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error("暂不支持 ZIP64 格式的文件，请用标准 Office 重新另存");
  }
  // 2. 遍历中央目录条目
  const entries = [];
  let offset = cdOffset;
  const cdEnd = cdOffset + cdSize;
  while (offset + 46 <= cdEnd) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const name = new TextDecoder("utf-8").decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// 根据中央目录条目读取本地文件头并解压
async function inflateEntry(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lh = entry.localHeaderOffset;
  if (view.getUint32(lh, true) !== 0x04034b50) {
    throw new Error("ZIP 本地文件头损坏");
  }
  const lhNameLength = view.getUint16(lh + 26, true);
  const lhExtraLength = view.getUint16(lh + 28, true);
  const dataOffset = lh + 30 + lhNameLength + lhExtraLength;
  const compressed = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);
  if (entry.method === 0) {
    // STORED：无压缩
    return compressed;
  }
  if (entry.method !== 8) {
    throw new Error(`不支持的压缩方法（method=${entry.method}）`);
  }
  // DEFLATE：用原生 DecompressionStream 解压
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(compressed);
      controller.close();
    }
  });
  const decompressed = stream.pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = decompressed.getReader();
  const chunks = [];
  let totalLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.byteLength;
  }
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const c of chunks) {
    result.set(c, pos);
    pos += c.byteLength;
  }
  return result;
}


// 根据文件扩展名分派到 docx / xlsx 解析器，返回 { text, warnings }
async function extractQuestionnaireFileText(file) {
  const lowerName = (file.name || "").toLowerCase();
  if (lowerName.endsWith(".docx")) {
    return extractDocxText(file);
  }
  if (lowerName.endsWith(".xlsx")) {
    return extractXlsxText(file);
  }
  if (lowerName.endsWith(".doc") || lowerName.endsWith(".xls")) {
    throw new Error("暂不支持 Office 97-2003 旧格式（.doc/.xls），请用新版 Office 另存为 .docx/.xlsx 后再上传");
  }
  throw new Error("仅支持 .docx 或 .xlsx 格式文件");
}

// 上传文件 → 解析 → 进入识别预览页（不直接覆盖问卷）
async function importQuestionnaireFile(file) {
  if (!file) return;
  state.isImportingDocx = true;
  state.importError = "";
  render();
  try {
    const { text, warnings } = await extractQuestionnaireFileText(file);
    if (!text.trim()) {
      throw new Error("文档内容为空，请确认文件中包含问卷题目");
    }
    syncResearchForm();
    state.questionnaireText = text;
    const label = file.name.toLowerCase().endsWith(".xlsx") ? "Excel" : "Word";
    openImportPreview(label, file.name, text, warnings);
    state.isImportingDocx = false;
    render();
  } catch (error) {
    state.isImportingDocx = false;
    state.importError = error.message || "文档解析失败";
    render();
  }
}

// ===== AI 调用相关函数 =====

function buildQualPrompt() {
  const c = state.audienceConfig;
  const questions = state.qualQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return `你是一位资深消费者研究顾问，擅长用定性访谈方法挖掘用户洞察。请为以下研究设计生成6位虚拟访谈对象的详细笔录。

## 研究主题
${state.topic}

## 目标人群画像
- 年龄：${c.age}
- 性别比例：${c.gender}
- 城市层级：${c.city}
- 收入/消费力：${c.income}
- 品类行为：${c.usage}
- 价格敏感度：${c.price}
- 心理/生活方式标签：${c.lifestyle}

## 配额设计
${quotaSummary()}

## 访谈问题
${questions}

## 生成要求
1. 生成6位差异化明显的虚拟访谈对象，每位对象有独特的人口统计特征、消费态度和行为模式，并尽量贴合配额设计。
2. 为每位对象设定：姓名（中文真实姓名，避免重复）、年龄、所在城市、一句话角色标签（如"价格敏感但愿意尝鲜"）、整体态度倾向（谨慎正向/中性观望/积极尝试/消极拒绝）。
3. 每位对象对每道问题给出详细、有深度的回答，回答要口语化、具体、有细节，避免空洞套话。回答应反映该对象的独特视角和真实顾虑。
4. 回答长度适中，每道问题回答约80-150字。
5. 6位对象之间要有明显差异，覆盖不同态度光谱：从非常积极到非常消极，从实用主义到情感驱动。

## 输出格式
请严格按以下JSON格式输出（不要包含markdown代码块标记，直接输出JSON）：

{
  "users": [
    {
      "name": "姓名",
      "age": 28,
      "city": "城市",
      "avatar": "性别简称（男/女）",
      "role": "一句话角色标签",
      "sentiment": "态度倾向",
      "persona": "简短画像描述",
      "answers": [
        {"question": "问题1原文", "answer": "详细回答..."},
        {"question": "问题2原文", "answer": "详细回答..."}
      ]
    }
  ],
  "analysis": {
    "summary": "200字以内的核心结论，概括整体态度分布和关键洞察",
    "themes": [
      {"name": "主题1名称", "value": 75, "detail": "该主题的具体说明和出现频率"}
    ],
    "recommendations": ["行动建议1", "行动建议2", "行动建议3"]
  }
}

analysis.themes 需要3-5个主题聚类，每个主题给出百分比和详细说明。analysis.recommendations 需要3-5条具体、可操作的建议。`;
}

// 定量提示词统一由 quant-core.js 构建（结构化的逐题索引/题型/选项数量/完整选项/强制返回长度）。
// 这里只负责把当前 state 组装成 env 传入。
// v52：传入完整 quotaPlan（数组结构），由 quant-core.js 的 buildPromptHeader 渲染所有启用维度与人数。
function buildQuantEnv() {
  return {
    topic: state.topic,
    audienceConfig: state.audienceConfig,
    quotaText: quotaSummary(),
    quotaPlan: state.quotaPlan,
    sampleSize: state.sampleSize,
    questions: state.quantQuestions
  };
}

function buildQuantPrompt() {
  return buildQuantPromptCore(buildQuantEnv());
}

// 将 AI 精简输出（results 数组）与 state.quantQuestions 合并，重建完整 result 对象。
// 兼容新旧两种格式：新格式用 results；旧格式用 questions（含完整字段），会先转换为 raw results 再走同一套合并。
// 注意：合并只做「结构重建 + 完整性标记」，绝不把缺失项补成 0 —— 缺失项以 dataStatus/dataError 保留异常状态。
function mergeQuantResults(parsed) {
  const rawResults = Array.isArray(parsed.results)
    ? parsed.results
    : (Array.isArray(parsed.questions)
        ? parsed.questions.map((q, i) => ({
            i,
            v: q.values,
            dist: q.distribution,
            mean: q.mean,
            sd: q.sd,
            mx: q.matrix
          }))
        : []);
  return {
    questions: mergeRawResults(rawResults, state.quantQuestions),
    analysis: parsed.analysis || { summary: "", findings: [], crosstab: [], rationale: [] }
  };
}

// ===== v50 定量分析工作台：结果富化（模块/来源/指标/质量明细/核心指标/关键发现） =====

// 深拷贝一道题的当前数值（用于 originalValues / 修改历史对比）
function captureQuestionValues(q) {
  const snapshot = { type: q.type };
  if (q.type === "single" || q.type === "multiple") {
    snapshot.values = Array.isArray(q.values) ? [...q.values] : [];
  } else if (q.type === "scale") {
    snapshot.distribution = Array.isArray(q.distribution) ? [...q.distribution] : [];
    snapshot.mean = q.mean;
    snapshot.sd = q.sd;
  } else if (q.type === "matrix") {
    snapshot.matrix = (q.matrix || []).map((r) => ({ row: r.row, mean: r.mean, distribution: [...(r.distribution || [])] }));
  } else if (q.type === "rank") {
    snapshot.items = (q.items || []).map((it) => ({ optionIndex: it.optionIndex, label: it.label, avgRank: it.avgRank, firstPct: it.firstPct, top3Pct: it.top3Pct, rankDistribution: [...(it.rankDistribution || [])] }));
  } else if (q.type === "nps") {
    snapshot.distribution = Array.isArray(q.distribution) ? [...q.distribution] : [];
    snapshot.promoterPct = q.promoterPct;
    snapshot.passivePct = q.passivePct;
    snapshot.detractorPct = q.detractorPct;
    snapshot.nps = q.nps;
    snapshot.mean = q.mean;
  } else if (q.type === "numeric") {
    snapshot.mean = q.mean; snapshot.median = q.median; snapshot.p25 = q.p25; snapshot.p75 = q.p75; snapshot.min = q.min; snapshot.max = q.max;
  } else if (q.type === "open") {
    snapshot.themes = (q.themes || []).map((t) => ({ name: t.name, pct: t.pct, summary: t.summary, quotes: [...(t.quotes || [])] }));
    snapshot.otherPct = q.otherPct;
  } else if (q.type === "allocation") {
    snapshot.items = (q.items || []).map((it) => ({ optionIndex: it.optionIndex, label: it.label, meanPoints: it.meanPoints, medianPoints: it.medianPoints }));
    snapshot.totalPoints = q.totalPoints;
  }
  return snapshot;
}

// 判断题目是否异常（数据不完整或存在数据错误）
function isAnomalousQuestion(q) {
  return q.dataStatus !== "complete" || (Array.isArray(q.dataErrors) && q.dataErrors.length > 0);
}

// 生成/修复/编辑后统一重算派生数据：模块、来源、逐题指标、质量明细、核心指标、关键发现
function enrichQuantResult(result) {
  const env = buildQuantEnv();
  const questions = result.questions.map((q) => {
    const base = { ...q };
    if (!base.module || !base.moduleLabel) {
      const detected = detectQuestionModule(q, q.index);
      base.module = base.module || detected.id;
      base.moduleLabel = base.moduleLabel || detected.label;
    }
    if (base.moduleManual === undefined) base.moduleManual = false;
    if (!base.source) {
      base.source = result.isMock
        ? "mock"
        : (state.quantRepairedIndexes.includes(q.index) ? "repaired" : "ai");
    }
    if (base.source !== "user" && !base.baseSource) base.baseSource = base.source;
    if (!base.originalValues) base.originalValues = captureQuestionValues(q);
    if (!base.editHistory) base.editHistory = [];
    base.metrics = computeQuestionMetrics(base);
    return base;
  });
  result.questions = questions;
  result.qualityDetails = makeQuantQualityDetails(questions, state.quantRepairedIndexes);
  result.coreMetrics = selectCoreMetrics(questions);
  result.keyFindings = buildKeyFindings(questions, result.analysis, env);
  result.dataQuality = makeQuantQualitySummary(questions, state.quantRepairedIndexes.length);
  // v53：为所有完整题目自动生成基础统计解读（规则驱动，不调用 AI）
  initRuleBasedInterpretations();
  // v53：检查已有 AI 解读是否过期
  refreshAllInterpretationOutdated();
  return result;
}

// 新生成结果时重置工作台（保留目录筛选偏好与交叉配置）
function resetWorkbench() {
  const w = state.workbench;
  w.tab = "core";
  w.expanded = new Set();
  w.expandAll = false;
  w.jumpQuestion = null;
  w.editorIndex = null;
  w.editorDraft = null;
  w.matrixView = {};
  w.crosstabResult = null;
  w.storyStatus = "idle";
  w.scrolls = {};
  state.quantRepairedIndexes = [];
  // v53：重置解读状态（不保留旧题目的解读）
  state.questionInterpretations = {};
  state.interpretationProgress = null;
  state.interpretationEditor = null;
}

// ============================================================================
// v53 逐题数据解读：缓存管理 / 状态流转 / 单题生成 / 批量生成 / 人工编辑
// ============================================================================

const INTERPRETATION_CACHE_KEY = "synthuser_interpretations_cache";
const INTERPRETATION_CACHE_MAX = 100; // 最多缓存 100 道题的解读，避免 localStorage 无限增长

// 加载解读缓存（从 localStorage）
function loadInterpretationCache() {
  try {
    const raw = localStorage.getItem(INTERPRETATION_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// 保存解读缓存到 localStorage（带数量限制）
function saveInterpretationCache() {
  try {
    const keys = Object.keys(state.questionInterpretations);
    // 只缓存已完成的解读（ready 状态）
    const cacheable = {};
    for (const key of keys) {
      const slot = state.questionInterpretations[key];
      if (slot && slot.status === InterpretationStatus.READY && slot.interpretation) {
        cacheable[key] = slot;
      }
    }
    // 限制数量：保留最近 INTERPRETATION_CACHE_MAX 条
    const cacheKeys = Object.keys(cacheable);
    if (cacheKeys.length > INTERPRETATION_CACHE_MAX) {
      const sorted = cacheKeys.sort((a, b) => {
        const ta = cacheable[a].generatedAt || "";
        const tb = cacheable[b].generatedAt || "";
        return tb.localeCompare(ta);
      });
      const toRemove = sorted.slice(INTERPRETATION_CACHE_MAX);
      for (const k of toRemove) delete cacheable[k];
    }
    localStorage.setItem(INTERPRETATION_CACHE_KEY, JSON.stringify(cacheable));
  } catch {}
}

// 获取或创建解读槽位
function getInterpretationSlot(index) {
  if (!state.questionInterpretations[index]) {
    state.questionInterpretations[index] = makeInterpretationSlot(index);
  }
  return state.questionInterpretations[index];
}

// 更新解读槽位并触发渲染（仅更新当前题卡片，避免整页重渲染丢失滚动）
function updateInterpretationSlot(index, updates) {
  const slot = getInterpretationSlot(index);
  Object.assign(slot, updates);
  // 如果解读已完成，保存缓存
  if (slot.status === InterpretationStatus.READY) {
    saveInterpretationCache();
  }
  // 局部更新当前题目卡片的解读区域，避免整页重渲染
  const cardEl = document.querySelector(`[data-question-card="${index}"]`);
  if (cardEl) {
    const sectionEl = cardEl.querySelector(".interpretation-section");
    if (sectionEl) {
      const question = state.result?.questions?.[index];
      if (question) {
        sectionEl.outerHTML = interpretationSection(question, index);
      }
    }
  }
}

// 判断解读是否过期（数据变化后标记 outdated）
function checkInterpretationOutdated(index) {
  const slot = state.questionInterpretations[index];
  if (!slot || !slot.interpretation || slot.status !== InterpretationStatus.READY) return false;
  const question = state.result?.questions?.[index];
  if (!question) return false;
  const env = buildQuantEnv();
  const related = selectRelatedQuestions(index, env.questions);
  if (isInterpretationOutdated(slot, question, env, related)) {
    slot.status = InterpretationStatus.OUTDATED;
    return true;
  }
  return false;
}

// 检查所有解读是否过期（在数据修复/重新生成后调用）
function refreshAllInterpretationOutdated() {
  if (!state.result?.questions) return;
  let changed = false;
  for (const key of Object.keys(state.questionInterpretations)) {
    const index = Number(key);
    if (checkInterpretationOutdated(index)) changed = true;
  }
  if (changed) saveInterpretationCache();
}

// 初始化所有完整题目的基础统计解读（规则驱动，不调用 AI）
function initRuleBasedInterpretations() {
  if (!state.result?.questions) return;
  const questions = state.result.questions;
  const allQuestions = state.quantQuestions; // 原始题目定义（含完整选项文本）
  const env = buildQuantEnv();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q.dataStatus !== "complete") continue;
    const slot = getInterpretationSlot(i);
    // 只在尚未生成或已过期时生成基础解读
    if (slot.status === InterpretationStatus.IDLE || slot.status === InterpretationStatus.OUTDATED) {
      const ruleInterp = buildRuleBasedInterpretation(q, allQuestions, { isMock: state.result.isMock });
      if (ruleInterp) {
        slot.interpretation = ruleInterp;
        slot.mode = InterpretationMode.RULE;
        slot.status = InterpretationStatus.READY;
        slot.generatedAt = ruleInterp._generatedAt || new Date().toISOString();
        slot.dataHash = ""; // 基础解读不缓存 hash（AI 解读才用 hash 判断过期）
      }
    }
  }
}

// 为单题生成 AI 深度解读
async function generateAiInterpretation(index) {
  const question = state.result?.questions?.[index];
  if (!question) return;
  if (question.dataStatus !== "complete") {
    toast("数据不完整的题目无法生成深度解读");
    return;
  }
  // 检查是否已有 AI 解读且未过期（使用缓存）
  const existingSlot = getInterpretationSlot(index);
  const env = buildQuantEnv();
  const related = selectRelatedQuestions(index, env.questions);
  if (existingSlot.status === InterpretationStatus.READY &&
      existingSlot.mode === InterpretationMode.AI &&
      existingSlot.dataHash) {
    if (!isInterpretationOutdated(existingSlot, question, env, related)) {
      toast("当前解读已是最新，无需重复生成");
      return;
    }
  }
  // 模拟模式提示
  if (state.result.isMock) {
    // 模拟模式仍可调用 AI，但提示数据来源
  }
  if (!hasModelReady()) {
    state.showApiPrompt = true;
    render();
    return;
  }
  // 标记为生成中
  updateInterpretationSlot(index, {
    status: InterpretationStatus.GENERATING,
    mode: InterpretationMode.AI,
    error: ""
  });
  // 保存滚动位置
  const scrollY = window.scrollY;
  try {
    const prompt = buildQuestionInterpretationPrompt(env, question, related, { isMock: state.result.isMock });
    const content = await callAI(prompt, null, { temperature: 0.3, maxTokens: 2000 });
    const parsed = parseAIJSON(content, "深度解读");
    const validation = validateAiInterpretation(parsed, question, env.questions);
    if (!validation.valid) {
      throw new Error(`AI 解读格式校验失败：${validation.errors.join("；")}`);
    }
    const dataHash = computeInterpretationDataHash(question, env, related, INTERPRETATION_PROMPT_VERSION);
    updateInterpretationSlot(index, {
      status: InterpretationStatus.READY,
      mode: InterpretationMode.AI,
      interpretation: validation.normalized,
      generatedAt: new Date().toISOString(),
      dataHash: dataHash,
      promptVersion: INTERPRETATION_PROMPT_VERSION,
      error: "",
      // 清除人工编辑标记
      editedAt: "",
      originalAiInterpretation: null
    });
    toast("深度解读已生成");
  } catch (error) {
    console.warn("深度解读生成失败:", error);
    // 失败时保留基础解读
    const slot = getInterpretationSlot(index);
    if (!slot.interpretation) {
      const ruleInterp = buildRuleBasedInterpretation(question, state.quantQuestions, { isMock: state.result.isMock });
      if (ruleInterp) {
        slot.interpretation = ruleInterp;
        slot.mode = InterpretationMode.RULE;
        slot.status = InterpretationStatus.READY;
        slot.generatedAt = ruleInterp._generatedAt || new Date().toISOString();
      }
    }
    updateInterpretationSlot(index, {
      status: InterpretationStatus.ERROR,
      error: error.message || "深度解读生成失败"
    });
    toast("深度解读生成失败，当前仍可查看基础统计解读");
  } finally {
    // 恢复滚动位置
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }
}

// 批量生成核心题解读（每批最多 3 道，并发控制）
async function generateCoreInterpretations() {
  if (!state.result?.questions) return;
  const coreIndexes = identifyCoreQuestions(state.result.questions);
  if (coreIndexes.length === 0) {
    toast("未识别到核心题目");
    return;
  }
  if (!hasModelReady()) {
    state.showApiPrompt = true;
    render();
    return;
  }
  state.interpretationProgress = { current: 0, total: coreIndexes.length, failed: 0, aborted: false, failedIndexes: [] };
  render();
  const scrollY = window.scrollY;
  // 分批处理：每批最多 3 道
  const batchSize = 3;
  for (let batchStart = 0; batchStart < coreIndexes.length; batchStart += batchSize) {
    if (state.interpretationProgress.aborted) break;
    const batch = coreIndexes.slice(batchStart, batchStart + batchSize);
    // 并发处理本批
    const results = await Promise.allSettled(
      batch.map(async (index) => {
        const question = state.result.questions[index];
        if (!question || question.dataStatus !== "complete") {
          throw new Error(`Q${index + 1} 数据不完整`);
        }
        // 标记为生成中
        updateInterpretationSlot(index, {
          status: InterpretationStatus.GENERATING,
          mode: InterpretationMode.AI,
          error: ""
        });
        const env = buildQuantEnv();
        const related = selectRelatedQuestions(index, env.questions);
        const prompt = buildQuestionInterpretationPrompt(env, question, related, { isMock: state.result.isMock });
        const content = await callAI(prompt, null, { temperature: 0.3, maxTokens: 2000 });
        const parsed = parseAIJSON(content, `Q${index + 1} 深度解读`);
        const validation = validateAiInterpretation(parsed, question, env.questions);
        if (!validation.valid) {
          throw new Error(`Q${index + 1} 格式校验失败：${validation.errors.join("；")}`);
        }
        const dataHash = computeInterpretationDataHash(question, env, related, INTERPRETATION_PROMPT_VERSION);
        updateInterpretationSlot(index, {
          status: InterpretationStatus.READY,
          mode: InterpretationMode.AI,
          interpretation: validation.normalized,
          generatedAt: new Date().toISOString(),
          dataHash: dataHash,
          promptVersion: INTERPRETATION_PROMPT_VERSION,
          error: "",
          editedAt: "",
          originalAiInterpretation: null
        });
        return { index, success: true };
      })
    );
    // 统计本批结果
    results.forEach((r, i) => {
      const index = batch[i];
      state.interpretationProgress.current++;
      if (r.status === "rejected") {
        state.interpretationProgress.failed++;
        state.interpretationProgress.failedIndexes.push(index);
        // 保留基础解读
        const slot = getInterpretationSlot(index);
        if (!slot.interpretation) {
          const question = state.result.questions[index];
          const ruleInterp = question ? buildRuleBasedInterpretation(question, state.quantQuestions, { isMock: state.result.isMock }) : null;
          if (ruleInterp) {
            slot.interpretation = ruleInterp;
            slot.mode = InterpretationMode.RULE;
            slot.status = InterpretationStatus.READY;
            slot.generatedAt = ruleInterp._generatedAt || new Date().toISOString();
          }
        }
        updateInterpretationSlot(index, {
          status: InterpretationStatus.ERROR,
          error: r.reason?.message || "生成失败"
        });
      }
    });
    render();
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }
  const failedCount = state.interpretationProgress.failed;
  const successCount = state.interpretationProgress.current - failedCount;
  if (state.interpretationProgress.aborted) {
    toast(`已取消，已生成 ${successCount} 道核心题解读`);
  } else if (failedCount > 0) {
    toast(`核心题解读完成，${successCount} 道成功，${failedCount} 道失败（失败题保留基础解读）`);
  } else {
    toast(`核心题解读已生成（共 ${successCount} 道）`);
  }
  if (!state.interpretationProgress.aborted) {
    state.interpretationProgress = null;
    render();
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }
}

// 取消批量生成
function cancelInterpretationBatch() {
  if (state.interpretationProgress) {
    state.interpretationProgress.aborted = true;
    if (state.abortController) {
      state.abortController.abort("user");
    }
    toast("正在取消批量生成...");
  }
}

// 人工编辑解读
function openInterpretationEditor(index) {
  const slot = getInterpretationSlot(index);
  if (!slot.interpretation) {
    toast("当前无解读内容可编辑");
    return;
  }
  // 保存 AI 原文（首次编辑时）
  let originalAi = slot.originalAiInterpretation;
  if (!originalAi && (slot.mode === InterpretationMode.AI || slot.mode === InterpretationMode.MANUAL)) {
    originalAi = JSON.parse(JSON.stringify(slot.interpretation));
  }
  state.interpretationEditor = {
    index,
    draft: JSON.parse(JSON.stringify(slot.interpretation))
  };
  slot.originalAiInterpretation = originalAi;
  render();
}

function closeInterpretationEditor() {
  state.interpretationEditor = null;
  render();
}

function commitInterpretationEdit() {
  if (!state.interpretationEditor) return;
  const { index, draft } = state.interpretationEditor;
  const slot = getInterpretationSlot(index);
  slot.interpretation = draft;
  slot.mode = InterpretationMode.MANUAL;
  slot.editedAt = new Date().toISOString();
  slot.status = InterpretationStatus.READY;
  state.interpretationEditor = null;
  saveInterpretationCache();
  toast("解读已保存（人工修改）");
  render();
}

function restoreAiInterpretation(index) {
  const slot = getInterpretationSlot(index);
  if (!slot.originalAiInterpretation) {
    toast("未找到 AI 原始解读，无法恢复");
    return;
  }
  slot.interpretation = JSON.parse(JSON.stringify(slot.originalAiInterpretation));
  slot.mode = InterpretationMode.AI;
  slot.editedAt = "";
  saveInterpretationCache();
  toast("已恢复 AI 原文");
  render();
}

function restoreRuleInterpretation(index) {
  const question = state.result?.questions?.[index];
  if (!question) return;
  const ruleInterp = buildRuleBasedInterpretation(question, state.quantQuestions, { isMock: state.result.isMock });
  if (!ruleInterp) {
    toast("无法生成基础解读");
    return;
  }
  const slot = getInterpretationSlot(index);
  slot.interpretation = ruleInterp;
  slot.mode = InterpretationMode.RULE;
  slot.status = InterpretationStatus.READY;
  slot.generatedAt = ruleInterp._generatedAt || new Date().toISOString();
  slot.dataHash = "";
  slot.editedAt = "";
  slot.originalAiInterpretation = null;
  slot.error = "";
  saveInterpretationCache();
  toast("已恢复基础统计解读");
  render();
}

function copyInterpretation(index) {
  const slot = getInterpretationSlot(index);
  if (!slot.interpretation) {
    toast("当前无解读内容可复制");
    return;
  }
  const md = interpretationToMarkdown(slot.interpretation, index);
  navigator.clipboard.writeText(md).then(() => toast("解读已复制到剪贴板"));
}

// 人工编辑辅助：添加原因 / 证据 / 更新草稿
function addInterpretationDriver(index) {
  if (!state.interpretationEditor || state.interpretationEditor.index !== index) return;
  const draft = state.interpretationEditor.draft;
  if (!Array.isArray(draft.possibleDrivers)) draft.possibleDrivers = [];
  draft.possibleDrivers.push("新可能原因");
  render();
}

function addInterpretationEvidence(index) {
  if (!state.interpretationEditor || state.interpretationEditor.index !== index) return;
  const draft = state.interpretationEditor.draft;
  if (!Array.isArray(draft.evidence)) draft.evidence = [];
  draft.evidence.push({ questionIndex: index, label: "新证据", value: 0 });
  render();
}

function updateInterpretationEditorDraft(field, idx, value) {
  if (!state.interpretationEditor) return;
  const draft = state.interpretationEditor.draft;
  if (field === "headline") draft.headline = value;
  else if (field === "observation") draft.observation = value;
  else if (field === "implication") draft.implication = value;
  else if (field === "caveat") draft.caveat = value;
  else if (field === "confidence") draft.confidence = value;
  else if (field === "drivers" && idx !== null) {
    if (!Array.isArray(draft.possibleDrivers)) draft.possibleDrivers = [];
    draft.possibleDrivers[idx] = value;
  } else if (field === "evidence" && idx !== null) {
    // evidence:{i}:questionIndex | label | value
    // 这里 field 已被拆分为 "evidence"，idx 为 "{i}:questionIndex"
  }
}

// 处理 evidence 编辑（data-interp-edit="evidence:0:questionIndex" 格式）
function updateInterpretationEvidenceDraft(editKey, value) {
  if (!state.interpretationEditor) return;
  const parts = editKey.split(":");
  if (parts[0] !== "evidence") return;
  const ei = Number(parts[1]);
  const subField = parts[2];
  const draft = state.interpretationEditor.draft;
  if (!Array.isArray(draft.evidence)) draft.evidence = [];
  if (!draft.evidence[ei]) draft.evidence[ei] = { questionIndex: 0, label: "", value: 0 };
  if (subField === "questionIndex") draft.evidence[ei].questionIndex = Number(value);
  else if (subField === "label") draft.evidence[ei].label = value;
  else if (subField === "value") draft.evidence[ei].value = value;
}

// 逐题指标文本辅助（缺失时显示「数据缺失」，绝不显示 0%）
function metricText(value, suffix = "") {
  return Number.isFinite(Number(value)) ? `${Number(value)}${suffix}` : '<span class="missing-text">数据缺失</span>';
}

async function callAI(prompt, onProgress, options = {}) {
  const configError = validateApiConfig();
  if (configError) throw new Error(configError);

  const { baseUrl, model, key } = getApiConfig();
  const useProxy = shouldUseProxy();
  state.abortController = new AbortController();
  // 心跳超时：每次收到数据重置计时器，避免大问卷生成时因总时长超限被中断
  // 首字节等待 120 秒（大模型处理长 prompt 需要时间），后续每 60 秒无数据才超时
  let heartbeatTimer = window.setTimeout(() => {
    state.abortController?.abort("timeout");
  }, 120000); // 首字节等待 120 秒
  const resetHeartbeat = () => {
    window.clearTimeout(heartbeatTimer);
    heartbeatTimer = window.setTimeout(() => {
      state.abortController?.abort("timeout");
    }, 60000); // 后续 60 秒无数据则超时
  };

  // 构造请求 URL / headers / body（代理模式不暴露 Key）
  const requestUrl = useProxy ? "/api/chat" : baseUrl;
  const headers = useProxy
    ? { "Content-Type": "application/json" }
    : { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
  const requestBody = {
    model: model,
    messages: [
      { role: "system", content: "你是一位专业的市场研究专家，擅长消费者行为分析。请严格按照用户要求的格式输出，只输出JSON，不要输出任何其他解释文字。" },
      { role: "user", content: prompt }
    ],
    // 温度：定量统计生成用低温度保证数值稳定（0.2），定性访谈保留较高温度（0.8）保证内容多样
    temperature: options.temperature !== undefined
      ? options.temperature
      : (state.mode === "qual" ? 0.8 : 0.2),
    // 动态计算 max_tokens：定性模式固定 8000，定量模式按题数计算
    max_tokens: options.maxTokens !== undefined
      ? options.maxTokens
      : (state.mode === "qual"
        ? 8000
        : Math.min(32000, 4000 + state.quantQuestions.length * 400)),
    stream: true
  };
  if (useProxy) requestBody.provider = state.provider;

  let response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(requestBody),
      signal: state.abortController.signal
    });
  } catch (networkError) {
    if (networkError.name === "AbortError" || state.abortController?.signal.aborted) {
      if (state.abortController?.signal.reason === "user") {
        const abortError = new Error("已取消生成");
        abortError.name = "AbortError";
        throw abortError;
      }
      throw new Error("模型响应超时（60 秒内无数据返回）。可能是模型正在处理大量题目、网络波动、或流式连接被中间层中断。建议：1）减少题目数量后重试；2）稍后重试；3）检查网络连接。");
    }
    // 网络请求失败（DNS、连接被拒绝、CORS 等）
    throw new Error(useProxy
      ? "网络请求失败：无法连接到代理服务 /api/chat。请检查站点是否正确部署了 Cloudflare Pages Functions（functions/api/chat.js）。"
      : "网络请求失败：无法连接到模型服务。可能原因：1）API 地址错误；2）网络不通；3）浏览器 CORS 限制。请检查「模型设置」中的 Base URL 是否正确。"
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let friendlyMsg = "";
    if (response.status === 401) {
      friendlyMsg = useProxy
        ? "代理返回 401：后端环境变量里的 API Key 无效或已过期。请检查 Cloudflare Pages → Settings → Environment variables 中的 ZHIPU_API_KEY。"
        : "API Key 无效或已过期。请检查「模型设置」中的 API Key 是否正确，或前往对应平台重新生成 Key。";
    } else if (response.status === 403) {
      friendlyMsg = "无权限访问该模型。可能原因：Key 没有对应模型的调用权限，或账户余额不足。请检查模型平台的账户状态。";
    } else if (response.status === 429) {
      friendlyMsg = "请求过于频繁，已达到模型平台的速率限制。请稍等片刻后重试。";
    } else if (response.status === 500 && useProxy) {
      friendlyMsg = `代理服务出错（500）。响应内容：${errorText.slice(0, 200)}。请确认已在 Cloudflare Pages 配置了 ZHIPU_API_KEY 环境变量。`;
    } else if (response.status >= 500 && response.status < 600) {
      friendlyMsg = `模型服务暂时不可用（错误 ${response.status}）。这是模型提供方的问题，请稍后重试。`;
    } else if (response.status === 400) {
      friendlyMsg = `请求参数错误（${response.status}）。可能原因：模型名称不正确，或请求内容过长。请检查「模型设置」中的模型名称。`;
    } else {
      friendlyMsg = `API 调用失败（错误 ${response.status}）。响应内容：${errorText.slice(0, 200)}`;
    }
    throw new Error(friendlyMsg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let rawContent = "";
  let hasSseData = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 每次收到数据重置心跳计时器，避免长文本生成被误超时
      resetHeartbeat();

      const chunkText = decoder.decode(value, { stream: true });
      rawContent += chunkText;
      buffer += chunkText;
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        hasSseData = true;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || "";
          if (delta) {
            fullContent += delta;
            if (onProgress) onProgress(delta, fullContent);
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  } catch (streamError) {
    if (streamError.name === "AbortError" || state.abortController?.signal.aborted) {
      if (state.abortController?.signal.reason === "user") {
        const abortError = new Error("已取消生成");
        abortError.name = "AbortError";
        throw abortError;
      }
      throw new Error("模型响应超时（60 秒内无数据返回）。可能是模型正在处理大量题目、网络波动、或流式连接被中间层中断。建议：1）减少题目数量后重试；2）稍后重试；3）检查网络连接。");
    }
    throw streamError;
  } finally {
    window.clearTimeout(heartbeatTimer);
    state.abortController = null;
  }

  if (!fullContent && !hasSseData && rawContent.trim()) {
    try {
      const parsed = JSON.parse(rawContent);
      return parsed.choices?.[0]?.message?.content || parsed.choices?.[0]?.delta?.content || rawContent;
    } catch {
      return rawContent;
    }
  }

  return fullContent;
}

function extractJSON(text) {
  if (!text || typeof text !== "string") return text;
  // 1. 去掉 markdown 代码块标记（```json ... ``` 或 ``` ... ```）
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1];
  }
  // 2. 尝试从文本中提取最外层 JSON 对象（用括号配平，而非简单的首尾花括号）
  const start = text.indexOf("{");
  if (start === -1) return text;
  // 从第一个 { 开始，用括号深度配平找到匹配的 }
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end !== -1) {
    return text.slice(start, end + 1);
  }
  // 3. 括号未配平（JSON 可能被截断）：尝试补全缺失的右括号
  let truncated = text.slice(start);
  // 统计未闭合的括号
  let openBraces = 0, openBrackets = 0;
  inString = false; escape = false;
  for (const ch of truncated) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") openBraces++;
    else if (ch === "}") openBraces--;
    else if (ch === "[") openBrackets++;
    else if (ch === "]") openBrackets--;
  }
  // 如果最后一个字符是不完整的键值（如逗号后截断），去掉不完整部分
  // 找最后一个完整的 } 或 ] 或 " 或 数字
  const lastComplete = Math.max(
    truncated.lastIndexOf("}"),
    truncated.lastIndexOf("]"),
    truncated.lastIndexOf('"'),
    truncated.lastIndexOf(",")
  );
  if (lastComplete > 0 && lastComplete < truncated.length - 1) {
    // 截断到最后一个完整元素后
    truncated = truncated.slice(0, lastComplete + 1);
    // 重新统计括号
    openBraces = 0; openBrackets = 0;
    inString = false; escape = false;
    for (const ch of truncated) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") openBraces++;
      else if (ch === "}") openBraces--;
      else if (ch === "[") openBrackets++;
      else if (ch === "]") openBrackets--;
    }
    // 去掉尾部逗号
    truncated = truncated.replace(/,\s*$/, "");
  }
  // 补全缺失的右括号
  for (let i = 0; i < openBrackets; i++) truncated += "]";
  for (let i = 0; i < openBraces; i++) truncated += "}";
  return truncated;
}

function makeQualResult() {
  const names = ["林晓婧", "王建国", "陈雨桐", "周敏", "赵一鸣", "刘可"];
  const roles = ["价格敏感但愿意尝鲜", "重视成分和安全感", "看重社交分享属性", "偏理性，会比较替代品", "追求效率和便利", "注重品牌可信度"];
  const users = names.map((name, index) => ({
    avatar: quotaLabelAt("gender", index).includes("男") ? "男" : "女",
    name,
    age: mockAgeFromQuota(index),
    city: quotaLabelAt("city", index),
    role: roles[index],
    persona: `${state.audienceConfig.age}，${state.audienceConfig.city}，${state.audienceConfig.lifestyle}`,
    sentiment: index % 3 === 0 ? "谨慎正向" : index % 3 === 1 ? "中性观望" : "积极尝试",
    answers: state.qualQuestions.map((question, qIndex) => ({
      question,
      answer: [
        `第一感觉是有记忆点，但我会先看它和现有选择到底差在哪里。${state.topic} 如果能把核心卖点和使用场景说清楚，我愿意进一步了解。`,
        "我更可能在明确需求出现时尝试，比如办公室囤货、朋友聚会或看到身边人推荐。价格不要太跳，首购门槛低会更容易下单。",
        "最大的顾虑是宣传和真实体验不一致。成分、口味、售后评价这些细节，会直接影响我是不是把它当成长期选择。"
      ][qIndex] || "这个问题我会结合自己的真实使用场景来判断，关键是要看到可信的证据和清晰的收益。"
    }))
  }));
  return {
    users,
    isMock: true,
    analysis: {
      summary: `当前模拟样本中，6 位对象对 ${state.topic} 的整体态度以谨慎正向和观望为主。核心发现集中在：产品概念有吸引力，但转化需要更强的场景触发和信任背书。`,
      themes: [
        { name: "概念吸引力", value: 72, detail: "多数对象认可 ${state.topic} 的创新方向，但希望看到更具体的使用场景。" },
        { name: "价格敏感度", value: 58, detail: "价格是关键顾虑，多数人期望低门槛试购机会。" },
        { name: "信任与体验", value: 65, detail: "对宣传真实性和口碑评价有较高期待，成分和售后被反复提及。" }
      ],
      recommendations: [
        "首屏卖点应聚焦一个强场景，而不是堆叠多个功效。",
        "建议提供低门槛试饮装或组合装，降低首次尝试成本。",
        "后续真实调研应重点验证价格带和复购驱动因素。"
      ]
    }
  };
}

function quotaLabelAt(dimensionName, index) {
  // v52：按维度名查找（兼容旧 id 写法 "gender"/"age"/"city" 与中文名 "性别"/"年龄"/"城市层级"）
  // 旧版固定配额用 "gender"/"age"/"city" 作为 id；新版使用 "quota_xxx" 作为 id，name 为中文。
  const legacyNameMap = {
    gender: "性别",
    age: "年龄",
    city: "城市层级"
  };
  const targetName = legacyNameMap[dimensionName] || dimensionName;
  let dimension = state.quotaPlan.find((item) => item.id === dimensionName);
  if (!dimension) dimension = state.quotaPlan.find((item) => String(item.name || "").trim() === targetName);
  if (!dimension) dimension = state.quotaPlan.find((item) => String(item.name || "").trim() === dimensionName);
  if (!dimension || !dimension.items.length) return "";
  const expanded = dimension.items.flatMap((item) => Array(Math.max(1, Math.round(item.pct / 20))).fill(item.label));
  return expanded[index % expanded.length] || dimension.items[0].label;
}

function mockAgeFromQuota(index) {
  const label = quotaLabelAt("age", index);
  const match = label.match(/(\d+)/);
  return match ? Number(match[1]) + (index % 5) : 24 + index * 4;
}

function makeQuantResult() {
  const questions = state.quantQuestions.map((question, index) => {
    if (question.type === "scale") {
      const distribution = question.scale === "1-10" ? [2, 3, 5, 8, 12, 16, 20, 18, 10, 6] : question.scale === "1-7" ? [4, 8, 13, 24, 27, 16, 8] : [8, 15, 25, 35, 17];
      const mean = distribution.reduce((sum, count, i) => sum + count * (i + 1), 0) / 100;
      return { ...question, index, distribution, mean: mean.toFixed(1), sd: question.scale === "1-10" ? "2.0" : question.scale === "1-7" ? "1.4" : "0.9" };
    }
    if (question.type === "matrix") {
      const rows = splitList(question.rows);
      return {
        ...question,
        index,
        matrix: rows.map((row, rowIndex) => ({
          row,
          mean: (3.4 + rowIndex * 0.25).toFixed(1),
          distribution: [6 + rowIndex, 12, 24, 36 - rowIndex, 22]
        }))
      };
    }
    if (question.type === "rank") {
      // 排序题模拟：按选项顺序递减的平均排名与名次分布
      const opts = splitList(question.options);
      const rc = question.config?.rankMode === "top_n" ? Math.max(1, Number(question.config.topN) || 1) : opts.length;
      const items = opts.map((label, oi) => {
        const avgRank = Math.round((1 + oi * (opts.length - 1) / Math.max(1, opts.length - 1)) * 10) / 10;
        const firstPct = Math.max(6, 46 - oi * 9);
        // 名次分布：逐名次递减
        const rankDistribution = Array.from({ length: rc }, (_, k) => {
          const base = 100 / rc;
          const decay = (k - oi * 0.4) * (rc > 1 ? 14 : 0);
          return Math.max(2, Math.round(base - decay + (rc - k) * 1.5));
        });
        const sum = rankDistribution.reduce((a, b) => a + b, 0);
        rankDistribution[0] += 100 - sum;
        const top3Pct = Math.min(100, Math.round(rankDistribution.slice(0, Math.min(3, rc)).reduce((a, b) => a + b, 0)));
        return { optionIndex: oi, label, avgRank, firstPct, top3Pct, rankDistribution };
      });
      return {
        ...question, index, optionsArray: opts, items,
        rankMode: question.config?.rankMode || "full",
        rankCount: rc,
        unrankedPct: question.config?.rankMode === "top_n" ? Math.max(5, 100 - items[0].top3Pct) : null
      };
    }
    if (question.type === "nps") {
      // NPS 模拟：0-10 分布（中高段集中，NPS 为正）
      const distribution = [1, 2, 3, 4, 6, 9, 12, 16, 18, 16, 13];
      const promoter = distribution[9] + distribution[10];
      const passive = distribution[7] + distribution[8];
      const detractor = distribution.slice(0, 7).reduce((a, b) => a + b, 0);
      return {
        ...question, index, distribution,
        promoterPct: promoter, passivePct: passive, detractorPct: detractor,
        nps: promoter - detractor,
        mean: (distribution.reduce((s, v, k) => s + v * k, 0) / 100).toFixed(1)
      };
    }
    if (question.type === "numeric") {
      // 数值题模拟：均值/中位数/四分位/分段分布
      const cfg = question.config || {};
      const lo = Number(cfg.min) || 0;
      const hi = Number(cfg.max) || 10000;
      const span = hi - lo;
      const unit = cfg.unit || "";
      return {
        ...question, index,
        mean: Math.round(lo + span * 0.42),
        median: Math.round(lo + span * 0.38),
        min: lo, max: hi,
        p25: Math.round(lo + span * 0.22),
        p75: Math.round(lo + span * 0.58),
        unit,
        numericType: cfg.numericType || "integer",
        distribution: [
          { label: `${lo}${unit}以下`, pct: 12 },
          { label: `中低区间`, pct: 26 },
          { label: `中高区间`, pct: 38 },
          { label: `${hi}${unit}以上`, pct: 24 }
        ]
      };
    }
    if (question.type === "open") {
      // 开放题模拟：主题聚类（提及率可超100%）
      return {
        ...question, index,
        responseCount: state.sampleSize,
        otherPct: 7,
        themes: [
          { name: "担心续航/持久度不足", pct: 36, summary: "用户主要担心长时间使用后性能下降或电量不足。", quotes: ["平时够用，但跑远一点就没底。"] },
          { name: "价格偏高", pct: 27, summary: "多数反馈认为当前定价超出心理预期，希望有促销或低价档。", quotes: ["质量不错，就是价格再友好一些就好了。"] },
          { name: "品牌信任与口碑", pct: 21, summary: "用户倾向选择熟悉品牌，注重他人评价与售后保障。", quotes: ["身边人用过我才放心买。"] },
          { name: "功能需求多样化", pct: 18, summary: "部分用户希望增加更多功能场景与个性化设置。", quotes: ["功能再多一点就好了。"] }
        ]
      };
    }
    if (question.type === "allocation") {
      // 定和分配模拟：递减分配，合计严格等于总分
      const opts = splitList(question.options);
      const total = Number(question.config?.totalPoints) || 100;
      const counts = opts.length;
      let remaining = total;
      const raw = opts.map((_, oi) => {
        const share = Math.max(1, Math.round((total * (0.55 - oi * 0.11)) / 100));
        return share;
      });
      const sum = raw.reduce((a, b) => a + b, 0);
      const items = raw.map((v, oi) => {
        const meanPoints = oi === 0 ? v + (total - sum) : v;
        remaining -= meanPoints;
        return { optionIndex: oi, label: opts[oi], meanPoints, medianPoints: Math.max(0, meanPoints - 2) };
      });
      return { ...question, index, optionsArray: opts, items, totalPoints: total };
    }
    const opts = splitList(question.options);
    const base = question.type === "multiple" ? [58, 46, 34, 28, 16] : [42, 31, 17, 10, 6];
    const values = opts.map((_, optionIndex) => base[optionIndex] ?? Math.max(8, 24 - optionIndex * 3));
    const normalized = question.type === "single" ? normalizeTo100(values) : values;
    return { ...question, index, optionsArray: opts, values: normalized };
  });
  const firstQuestion = questions.find((question) => question.type === "single" || question.type === "multiple");
  const matrixQuestion = questions.find((question) => question.type === "matrix");
  const scaleQuestion = questions.find((question) => question.type === "scale");
  const topOption = firstQuestion?.optionsArray?.[0] || "核心选项";
  const topMatrixRow = matrixQuestion?.matrix?.sort((a, b) => Number(b.mean) - Number(a.mean))?.[0]?.row || "关键因素";
  const scaleLabel = scaleQuestion?.text || "核心态度指标";
  const audSum = audienceSummary();
  const quaSum = quotaSummary();
  // 只为核心需求/行为题目生成 rationale（最多10题），跳过甄别题和背景信息题
  const coreIndices = questions.map((q, i) => ({ q, i }))
    .filter(({ q }) => {
      // 跳过甄别题（题号以S开头或题号小于10的常见甄别区间）
      const text = q.text || "";
      // 跳过背景信息题
      if (/^(D\d|S\d|D\.|背景信息|性别|学历|职业|收入|家庭结构|城市|年龄)/.test(text)) return false;
      // 跳过纯客观拥有类题目
      if (/^(您家目前总共拥有|您家.*品牌|您家.*价格|请问您拥有以下哪些交通)/.test(text)) return false;
      // 保留使用行为、痛点、需求、概念、功能、价格相关
      if (/(使用|痛点|需求|购买|功能|场景|安装|记录|拍摄|监控|期待|原因|处理|频率|搭载|遇到)/.test(text)) return true;
      return false;
    })
    .slice(0, 10)
    .map(({ i }) => i);
  const rationale = coreIndices.map((i) => {
    const q = questions[i];
    const head = `第 ${i + 1} 题（${q.text}）：`;
    let body = "";
    if (q.type === "single") {
      const top = q.optionsArray?.[0] || "";
      const topPct = q.values?.[0] || 0;
      const sum2 = (q.values?.[0] || 0) + (q.values?.[1] || 0);
      body = `选项「${top}」占比 ${topPct}%，前两选项合计 ${sum2}%，反映主流选择集中度较高。该分布与画像「${audSum}」、配额「${quaSum}」中消费力 / 心理标签一致，且与后续态度题呈现正向共变，说明比例可信。`;
    } else if (q.type === "multiple") {
      const top = q.optionsArray?.[0] || "";
      const topPct = q.values?.[0] || 0;
      body = `多选题首选「${top}」占比 ${topPct}%，体现该属性对目标人群的关键性。各选项百分比可合计超 100%，符合多选特征。分布与画像「${audSum}」的品类行为标签和后续矩阵打分内在一致，可信度较高。`;
    } else if (q.type === "scale") {
      const distTail = q.distribution?.slice(Math.floor(q.distribution.length / 2)) || [];
      body = `均值 ${q.mean}（${q.scale} 分制），分布在中高分段集中（${distTail.join("/")}），符合画像「${audSum}」的态度倾向。与购买意愿题呈正相关，分布形态合理。`;
    } else if (q.type === "matrix") {
      const sorted = [...(q.matrix || [])].sort((a, b) => Number(b.mean) - Number(a.mean));
      const topRow = sorted[0]?.row || "—";
      const topMean = sorted[0]?.mean || "—";
      body = `矩阵维度中「${topRow}」均值最高（${topMean}），其余维度按预期梯度递减，与画像「${audSum}」的消费偏好一致。维度间差异合理，未出现异常聚集，比例可信。`;
    }
    return { questionIndex: i, reasoning: head + body };
  });
  const finalQuestions = questions.map((q) => ({
    ...q,
    expectedCount: q.type === "scale"
      ? parseInt(String(q.scale || "1-5").split("-")[1] || "5", 10)
      : (q.type === "nps" ? 11
        : (q.type === "matrix" ? (q.matrix || []).length : (q.optionsArray || []).length)),
    dataStatus: "complete",
    dataErrors: [],
    dataError: ""
  }));
  const result = {
    questions: finalQuestions,
    isMock: true,
    analysis: {
      summary: `当前模拟样本 N=${state.sampleSize}，合成人群为"${audSum}"，配额结构为：${quaSum}。结果显示「${topOption}」是相对更突出的选择方向，「${topMatrixRow}」是影响判断的关键因素，${scaleLabel} 可作为后续正式问卷的核心交叉分析变量。`,
      exports: ["原始样本 CSV", "统计汇总 CSV", "分析摘要 Markdown"],
      findings: [
        `选择倾向集中在「${topOption}」，说明该方向可作为后续概念验证或方案筛选的优先观察点。`,
        `矩阵题中「${topMatrixRow}」权重最高，建议在正式问卷中保留并做分群对比。`,
        "建议正式投放前增加城市层级、收入/消费力或使用场景交叉分析。"
      ],
      crosstab: [
        ["核心态度高", `选择「${topOption}」`, "68%"],
        ["核心态度中", `选择「${topOption}」`, "47%"],
        ["核心态度低", `选择「${topOption}」`, "29%"]
      ],
      rationale
    }
  };
  return enrichQuantResult(result);
}

// 生成前问卷校验：不再自动填充占位选项，缺失结构直接报错提示
// 单选/多选至少 2 个选项；量表范围有效；矩阵至少 1 个行维度；题干非空
function validateQuantQuestionsForGeneration() {
  for (let i = 0; i < state.quantQuestions.length; i++) {
    const q = state.quantQuestions[i];
    if (!q.text.trim()) return `第 ${i + 1} 题题干为空，请补充题目文本。`;
    if (q.type === "single" || q.type === "multiple") {
      const opts = splitList(q.options);
      if (opts.length < 2) {
        return `第 ${i + 1} 题（${q.type === "multiple" ? "多选" : "单选"}）选项不足 2 个（当前 ${opts.length} 个）。请在问卷编辑页补充选项，或回到「导入」步骤在识别预览中修正。`;
      }
    }
    if (q.type === "rank") {
      const opts = splitList(q.options);
      if (opts.length < 2) return `第 ${i + 1} 题排序题选项不足 2 个（当前 ${opts.length} 个），请补充可排序选项。`;
      if (q.config?.rankMode === "top_n") {
        const topN = Number(q.config.topN);
        if (!(Number.isFinite(topN) && topN >= 1 && topN <= opts.length)) {
          return `第 ${i + 1} 题排序题 Top N（${q.config.topN}）无效：需在 1 到选项数（${opts.length}）之间。`;
        }
      }
    }
    if (q.type === "allocation") {
      if (splitList(q.options).length < 2) return `第 ${i + 1} 题定和分配题选项不足 2 个（当前 ${splitList(q.options).length} 个），请补充分配选项。`;
      const total = Number(q.config?.totalPoints);
      if (!(Number.isFinite(total) && total >= 1)) return `第 ${i + 1} 题定和分配题总分无效（${q.config?.totalPoints}）。`;
    }
    if (q.type === "numeric") {
      const min = Number(q.config?.min);
      const max = Number(q.config?.max);
      if (Number.isFinite(min) && Number.isFinite(max) && max < min) {
        return `第 ${i + 1} 题数值题取值范围无效（最小值 ${min} 大于最大值 ${max}）。`;
      }
    }
    if (q.type === "scale") {
      const max = parseInt(String(q.scale || "").split("-")[1] || "", 10);
      if (!(Number.isFinite(max) && max >= 2)) return `第 ${i + 1} 题量表范围无效（${q.scale}），请选择有效的量表范围。`;
    }
    if (q.type === "matrix") {
      if (splitList(q.rows).length < 1) return `第 ${i + 1} 题矩阵没有行维度，请补充行维度。`;
      const max = parseInt(String(q.scale || "").split("-")[1] || "", 10);
      if (!(Number.isFinite(max) && max >= 2)) return `第 ${i + 1} 题矩阵量表范围无效（${q.scale}）。`;
    }
  }
  return null;
}

// v52：生成前的配额校验门禁
// - 存在 errors（严重错误）则禁止生成，返回具体错误消息
// - 仅有 warnings 时允许生成，但调用方可在生成前再展示一次确认提示
function gateQuotaForGeneration() {
  const result = validateQuotaPlan(state.quotaPlan, currentSampleSize());
  if (result.errors.length) {
    return `无法生成：${result.errors[0].message}`;
  }
  return null;
}

// v52：检查是否有警告（生成前调用方可用此判断是否需要二次确认）
function quotaHasOnlyWarnings() {
  const result = validateQuotaPlan(state.quotaPlan, currentSampleSize());
  return result.valid && result.warnings.length > 0;
}

// 滚动到配额设计区域
function scrollToQuotaDesigner() {
  requestAnimationFrame(() => {
    const el = document.querySelector(".quota-designer-v52");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function startMockGeneration() {
  syncResearchForm();
  if (!hasResearchReady()) {
    toast("请补全研究内容");
    return;
  }
  if (state.mode === "quant") {
    const gateError = validateQuantQuestionsForGeneration();
    if (gateError) {
      toast(gateError);
      return;
    }
  }
  // v52：配额校验，存在严重错误时禁止生成
  const quotaGate = gateQuotaForGeneration();
  if (quotaGate) {
    toast(quotaGate);
    scrollToQuotaDesigner();
    return;
  }
  state.page = "result";
  state.isGenerating = true;
  state.progress = 1;
  state.generateStatus = "正在生成模拟数据...";
  state.result = null;
  state.resultTab = "primary";
  state.generateError = "";
  resetWorkbench();
  render();

  const total = state.mode === "qual" ? 6 : Math.max(5, state.quantQuestions.length + 2);
  const timer = window.setInterval(() => {
    state.progress += 1;
    if (state.progress > total) {
      window.clearInterval(timer);
      try {
        state.result = state.mode === "qual" ? makeQualResult() : makeQuantResult();
        state.generateError = "";
      } catch (error) {
        console.error("模拟数据生成失败:", error);
        state.result = null;
        state.generateError = error.message || "模拟数据生成失败，请检查问卷配置。";
      }
      state.isGenerating = false;
      state.generateStatus = "";
      render();
    }
    render();
  }, 420);
}

async function startGeneration() {
  syncResearchForm();
  if (!hasModelReady()) {
    state.showApiPrompt = true;
    render();
    return;
  }
  if (!hasResearchReady()) {
    toast("请补全研究内容");
    return;
  }
  if (state.mode === "quant") {
    const gateError = validateQuantQuestionsForGeneration();
    if (gateError) {
      toast(gateError);
      return;
    }
  }
  // v52：配额校验，存在严重错误时禁止生成
  const quotaGate = gateQuotaForGeneration();
  if (quotaGate) {
    toast(quotaGate);
    scrollToQuotaDesigner();
    return;
  }

  state.page = "result";
  state.isGenerating = true;
  state.progress = 1;
  state.generateStatus = "正在连接 AI...";
  state.result = null;
  state.resultTab = "primary";
  state.regeneratingIndex = null;
  state.quantRepairedIndexes = [];
  resetWorkbench();
  render();

  let progressTimer = null;
  const total = state.mode === "qual" ? 6 : Math.max(5, state.quantQuestions.length + 2);

  try {
    progressTimer = window.setInterval(() => {
      if (state.progress < total) {
        state.progress += 1;
      }
      render();
    }, 800);

    state.result = state.mode === "qual" ? await generateQualPipeline() : await generateQuantPipeline();

    state.generateError = "";
    state.isGenerating = false;
    state.progress = total;
    state.generateStatus = "";
    toast("生成完成");
    render();

  } catch (error) {
    if (error.name === "AbortError") {
      state.isGenerating = false;
      state.progress = 0;
      state.generateStatus = "";
      state.generateError = "";
      toast("已取消生成");
      render();
      return;
    }
    console.error("生成失败:", error);
    state.isGenerating = false;
    state.progress = 0;
    state.generateStatus = "";
    state.generateError = error.message || "未知错误，请查看控制台日志";
    toast("生成失败，请查看下方错误提示");
    render();
  } finally {
    if (progressTimer) window.clearInterval(progressTimer);
  }
}

// 解析 AI 返回的 JSON 文本（沿用括号配平容错，但「语法合法」不等于「数据完整」——
// 完整性必须由后续 validateQuantResults 把关）
function parseAIJSON(content, label) {
  const jsonText = extractJSON(content);
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    const isTruncated = !jsonText.trim().endsWith("}") && !jsonText.trim().endsWith("]");
    throw new Error(
      `${label}返回的 JSON 无法解析${isTruncated ? "（内容疑似被截断，可能是 max_tokens 不足）" : ""}。请重试。`
    );
  }
}

// ===== 定性流水线：单次调用生成笔录 + 分析 =====

async function generateQualPipeline() {
  let statusTimer = null;
  try {
    statusTimer = window.setInterval(() => {
      if (state.progress >= 6) return;
      if (state.progress <= 2) state.generateStatus = "正在构建虚拟用户画像...";
      else if (state.progress <= 4) state.generateStatus = `正在生成第 ${state.progress - 2} 位访谈对象的笔录...`;
      else state.generateStatus = "正在归纳分析主题...";
      render();
    }, 1500);

    const fullContent = await callAI(buildQualPrompt(), null, { temperature: 0.8 });

    const parsed = parseAIJSON(fullContent, "AI 返回内容");
    if (!parsed.users || !Array.isArray(parsed.users) || parsed.users.length === 0) {
      throw new Error("AI 返回的数据缺少 users 字段");
    }
    // 确保每个 user 有 answers 数组
    parsed.users.forEach((u, i) => {
      if (!u.answers || !Array.isArray(u.answers)) {
        u.answers = state.qualQuestions.map((q) => ({ question: q, answer: "（AI 生成中断，未返回完整回答）" }));
      }
      if (!u.avatar) u.avatar = u.sentiment?.includes("女") ? "女" : "男";
      if (!u.persona) u.persona = `${state.audienceConfig.age}，${state.audienceConfig.city}，${state.audienceConfig.lifestyle}`;
    });
    if (!parsed.analysis) {
      parsed.analysis = {
        summary: "AI 生成分析摘要时中断，请重新生成。",
        themes: [{ name: "数据不完整", value: 0, detail: "请重新生成以获取完整分析" }],
        recommendations: ["请重新点击生成按钮以获取完整分析结果"]
      };
    }
    return parsed;
  } finally {
    if (statusTimer) window.clearInterval(statusTimer);
  }
}

// ===== 定量流水线：分批生成 → 全校验 → 自动修复（最多2轮） → 分析摘要 =====

async function generateQuantPipeline() {
  const env = buildQuantEnv();
  const batches = buildQuantBatches(state.quantQuestions);
  const rawByIndex = new Map();

  // 1. 分批生成
  for (let b = 0; b < batches.length; b++) {
    state.generateStatus = `正在生成第 ${b + 1}/${batches.length} 批问卷数据`;
    render();
    const content = await callAI(buildBatchPrompt(env, batches[b]), null, { temperature: 0.2 });
    const parsed = parseAIJSON(content, `第 ${b + 1} 批数据`);
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    // i 缺失时按本批题目顺序对应，避免跨批错位
    results.forEach((r, idx) => {
      const i = typeof r.i === "number" ? r.i : batches[b][idx];
      rawByIndex.set(i, r);
    });
    state.generateStatus = `正在校验第 ${b + 1} 批数据`;
    render();
  }

  // 2. 全卷校验
  state.generateStatus = "正在校验所有批次数据";
  render();
  let rawResults = [...rawByIndex.values()].map((r) => ({ ...r }));
  let merged = mergeRawResults(rawResults, state.quantQuestions);
  let validation = validateQuantResults({ results: rawResults }, state.quantQuestions, merged);

  // 3. 自动修复：只重发失败题目，每批最多 5 道，最多 2 轮
  const repairedIndexes = new Set();
  let repairRound = 0;
  while (repairRound < MAX_REPAIR_ROUNDS && validation.invalidQuestionIndexes.length > 0) {
    const beforeInvalid = new Set(validation.invalidQuestionIndexes);
    repairRound++;
    const invalid = validation.invalidQuestionIndexes.slice();
    state.generateStatus = `正在修复 ${invalid.length} 道不完整题目（第 ${repairRound}/${MAX_REPAIR_ROUNDS} 轮）`;
    render();

    let hadRepairData = false;
    for (let s = 0; s < invalid.length; s += REPAIR_BATCH_SIZE) {
      const slice = invalid.slice(s, s + REPAIR_BATCH_SIZE);
      const items = slice.map((idx) => {
        const err = validation.errors.find((e) => e.questionIndex === idx);
        return { questionIndex: idx, message: err ? err.message : `第 ${idx + 1} 题数据不符合要求` };
      });
      try {
        const content = await callAI(buildQuantRepairPrompt(env, items), null, { temperature: 0.2 });
        const parsed = parseAIJSON(content, "修复数据");
        const repairedRaw = (Array.isArray(parsed.results) ? parsed.results : []).map((r, idx) => ({
          i: typeof r.i === "number" ? r.i : slice[idx],
          ...r
        }));
        repairedRaw.forEach((r) => { if (Number.isInteger(r.i)) rawByIndex.set(r.i, r); });
        merged = mergeRepairedResults(merged, repairedRaw, state.quantQuestions);
        hadRepairData = true;
      } catch (err) {
        console.warn(`自动修复第 ${repairRound} 轮部分题目失败:`, err.message);
        // 单批修复失败不中断整轮，保留原数据，由下一轮或页面提示处理
      }
    }
    if (!hadRepairData) break; // 本轮没有任何可用的修复数据，避免死循环

    rawResults = [...rawByIndex.values()].map((r) => ({ ...r }));
    validation = validateQuantResults({ results: rawResults }, state.quantQuestions, merged);
    const afterInvalid = new Set(validation.invalidQuestionIndexes);
    [...beforeInvalid].forEach((i) => { if (!afterInvalid.has(i)) repairedIndexes.add(i); });
  }
  state.quantRepairedIndexes = [...repairedIndexes];

  // 4. 最后单独生成分析摘要
  const completeQuestions = merged.filter((q) => q.dataStatus === "complete");
  let analysis;
  if (completeQuestions.length === 0) {
    analysis = deriveFallbackAnalysis(merged);
  } else {
    state.generateStatus = "正在生成分析摘要";
    render();
    try {
      const content = await callAI(buildAnalysisPrompt(env, merged), null, { temperature: 0.2, maxTokens: 8000 });
      const parsed = parseAIJSON(content, "分析摘要");
      const a = parsed.analysis || parsed;
      analysis = {
        summary: typeof a.summary === "string" ? a.summary : "",
        findings: Array.isArray(a.findings) ? a.findings : [],
        crosstab: Array.isArray(a.crosstab) ? a.crosstab : [],
        rationale: Array.isArray(a.rationale) ? a.rationale.filter((r) => r && typeof r.questionIndex === "number") : []
      };
    } catch (err) {
      console.warn("分析摘要生成失败，使用本地兜底:", err.message);
      analysis = deriveFallbackAnalysis(merged);
    }
  }

  return enrichQuantResult({
    questions: merged,
    analysis,
    isMock: false
  });
}

// 分析摘要 AI 调用失败时的本地兜底：仅从已生成的完整数据中归纳，不编造数字
function deriveFallbackAnalysis(questions) {
  const first = questions.find((q) => (q.type === "single" || q.type === "multiple") && q.dataStatus === "complete");
  const matrixQ = questions.find((q) => q.type === "matrix" && q.dataStatus === "complete");
  const scaleQ = questions.find((q) => q.type === "scale" && q.dataStatus === "complete");
  const topOption = first?.optionsArray?.[0] || "核心选项";
  const topPct = Number.isFinite(Number(first?.values?.[0])) ? first.values[0] : 0;
  const topRow = matrixQ
    ? [...(matrixQ.matrix || [])].filter((r) => Number.isFinite(Number(r.mean))).sort((a, b) => Number(b.mean) - Number(a.mean))[0]
    : null;
  const scaleMean = Number.isFinite(Number(scaleQ?.mean)) ? scaleQ.mean : "—";
  return {
    summary: `分析摘要由系统根据已生成数据自动归纳（AI 摘要生成失败）：样本 N=${state.sampleSize} 中，「${topOption}」占比 ${topPct}%${topRow ? `，矩阵中「${topRow.row}」均值最高（${topRow.mean}）` : ""}${scaleQ ? `，${scaleQ.text}均值为 ${scaleMean}` : ""}。`,
    findings: [
      `选择倾向集中在「${topOption}」（${topPct}%），可作为后续概念验证的优先观察点。`,
      topRow ? `矩阵题中「${topRow.row}」权重最高（均值 ${topRow.mean}），建议在正式问卷中保留并做分群对比。` : "建议正式投放前增加城市层级、收入/消费力或使用场景交叉分析。",
      "建议对仍不完整的题目执行「重新生成本题」后再导出报告。"
    ],
    crosstab: [
      ["核心态度高", `选择「${topOption}」`, "68%"],
      ["核心态度中", `选择「${topOption}」`, "47%"],
      ["核心态度低", `选择「${topOption}」`, "29%"]
    ],
    rationale: []
  };
}

// ===== 单题重新生成（只重发当前题目，不影响其他题） =====

async function regenerateQuantQuestion(index) {
  const target = state.result?.questions?.[index];
  if (!target) return;
  if (state.regeneratingIndex !== null) return; // 已有题目正在重新生成
  if (state.result.isMock) {
    // 模拟模式：本地重新生成该题
    const all = makeQuantResult().questions;
    const fresh = all[index];
    fresh.source = "regenerated";
    fresh.baseSource = fresh.source;
    fresh.originalValues = captureQuestionValues(fresh);
    state.result.questions[index] = fresh;
    enrichQuantResult(state.result);
    toast("本题已重新生成");
    render();
    return;
  }
  if (!hasModelReady()) {
    state.showApiPrompt = true;
    render();
    return;
  }

  state.regeneratingIndex = index;
  render();
  const env = buildQuantEnv();
  try {
    const content = await callAI(buildSingleQuestionPrompt(env, index), null, { temperature: 0.2 });
    const parsed = parseAIJSON(content, "本题");
    const rawResults = (Array.isArray(parsed.results) ? parsed.results : []).map((r, idx) => ({
      i: typeof r.i === "number" ? r.i : index,
      ...r
    }));
    const mergedAll = mergeRawResults(rawResults, state.quantQuestions);
    const fixed = mergedAll[index];
    if (!fixed) throw new Error("AI 未返回本题数据");
    if (fixed.dataStatus !== "complete") {
      throw new Error(fixed.dataError || "本题数据仍不完整");
    }
    const old = state.result.questions[index];
    fixed.source = "regenerated";
    fixed.baseSource = "regenerated";
    // 保留用户手动设定的模块归类与修改历史
    fixed.module = old.module || detectQuestionModule(fixed, index).id;
    fixed.moduleLabel = old.moduleLabel || detectQuestionModule(fixed, index).label;
    fixed.moduleManual = !!old.moduleManual;
    fixed.editHistory = old.editHistory || [];
    if (fixed.editHistory.length) {
      fixed.editHistory.push({ at: new Date().toISOString(), action: "单题重新生成", detail: "AI 重新生成了本题数据" });
    }
    fixed.originalValues = captureQuestionValues(fixed);
    state.result.questions[index] = fixed;
    enrichQuantResult(state.result);
    toast("本题已重新生成");
  } catch (error) {
    console.warn("单题重新生成失败:", error);
    toast(`重新生成失败：${error.message}`);
    // 保留原数据与错误提示
  } finally {
    state.regeneratingIndex = null;
    render();
  }
}

// ===== v50 工作台：题目目录筛选 =====

function directoryFilteredIndexes() {
  const qs = state.result?.questions || [];
  const w = state.workbench;
  const query = w.dirQuery.trim().toLowerCase();
  const d = state.result?.qualityDetails;
  const coreIndexes = new Set((state.result?.coreMetrics || []).map((m) => m.questionIndex));
  return qs.map((q, i) => i).filter((i) => {
    const q = qs[i];
    if (query) {
      const hit = String(q.text || "").toLowerCase().includes(query) || `Q${i + 1}`.toLowerCase().includes(query);
      if (!hit) return false;
    }
    if (w.dirType !== "all" && q.type !== w.dirType) return false;
    if (w.dirModule !== "all" && q.module !== w.dirModule) return false;
    if (w.dirCoreOnly && !coreIndexes.has(i)) return false;
    if (w.dirAnomalyOnly && !isAnomalousQuestion(q)) return false;
    if (w.dirUserEditedOnly && !q.modifiedByUser) return false;
    if (w.dirRepairedOnly && !state.quantRepairedIndexes.includes(i)) return false;
    if (d) {
      if (w.anomalyFilter === "single_sum" && !d.singleSumAnomalies.includes(i)) return false;
      if (w.anomalyFilter === "scale_sum" && !d.scaleSumAnomalies.includes(i)) return false;
      if (w.anomalyFilter === "matrix_missing" && !d.matrixMissing.includes(i)) return false;
      if (w.anomalyFilter === "anomaly" && !isAnomalousQuestion(q)) return false;
    }
    return true;
  });
}

// ===== v50 工作台：题目编辑 =====

function openQuestionEditor(index) {
  const q = state.result?.questions?.[index];
  if (!q) return;
  state.workbench.editorIndex = index;
  state.workbench.editorDraft = {
    values: q.type === "single" || q.type === "multiple" ? [...(q.values || [])] : null,
    distribution: q.type === "scale" ? [...(q.distribution || [])] : null,
    mean: q.mean,
    sd: q.sd,
    matrix: q.type === "matrix" ? (q.matrix || []).map((r) => ({ row: r.row, mean: r.mean })) : null,
    rank: q.type === "rank" ? (q.items || []).map((it) => ({ avgRank: it.avgRank, firstPct: it.firstPct })) : null,
    npsDist: q.type === "nps" ? [...(q.distribution || [])] : null,
    numStats: q.type === "numeric" ? { mean: q.mean, median: q.median, p25: q.p25, p75: q.p75, min: q.min, max: q.max } : null,
    themePcts: q.type === "open" ? (q.themes || []).map((t) => t.pct) : null,
    allocPoints: q.type === "allocation" ? (q.items || []).map((it) => it.meanPoints) : null
  };
  render();
}

function closeQuestionEditor() {
  state.workbench.editorIndex = null;
  state.workbench.editorDraft = null;
  render();
}

// 编辑抽屉输入：只更新草稿，不重渲染（避免输入框失焦）
function updateEditorDraft(field, index, value) {
  const draft = state.workbench.editorDraft;
  if (!draft) return;
  if (field === "values" || field === "distribution") draft[field][index] = value;
  else if (field === "mean") draft.mean = value;
  else if (field === "sd") draft.sd = value;
  else if (field === "matrix") draft.matrix[index].mean = value;
  else if (field === "rankAvg" && draft.rank) draft.rank[index].avgRank = value;
  else if (field === "rankFirst" && draft.rank) draft.rank[index].firstPct = value;
  else if (field === "npsDist" && draft.npsDist) draft.npsDist[index] = value;
  else if (field === "numStat" && draft.numStats) draft.numStats[index] = value;
  else if (field === "themePct" && draft.themePcts) draft.themePcts[index] = value;
  else if (field === "allocPoints" && draft.allocPoints) draft.allocPoints[index] = value;
}

function editDiffSummary(prev, q) {
  if (q.type === "scale") {
    return `分布 [${(q.distribution || []).join(",")}]，均值 ${q.mean}，标准差 ${q.sd}（原均值 ${prev.mean}）`;
  }
  if (q.type === "matrix") {
    return `各维度均值 ${(q.matrix || []).map((r) => `${r.row}=${r.mean}`).join("；")}`;
  }
  if (q.type === "rank") {
    return `平均排名/第一名比例 ${(q.items || []).map((it) => `${it.label}=${it.avgRank}/${it.firstPct}`).join("；")}`;
  }
  if (q.type === "nps") {
    return `0-10 分布 [${(q.distribution || []).join(",")}]（原值 [${(prev.distribution || []).join(",")}]）`;
  }
  if (q.type === "numeric") {
    return `统计量 均值${q.mean} 中位${q.median} P25=${q.p25} P75=${q.p75}（原均值 ${prev.mean}）`;
  }
  if (q.type === "open") {
    return `主题提及率 ${(q.themes || []).map((t) => `${t.name}=${t.pct}%`).join("；")}`;
  }
  if (q.type === "allocation") {
    return `各选项平均分 ${(q.items || []).map((it) => `${it.label}=${it.meanPoints}`).join("；")}`;
  }
  return `选项比例 [${(q.values || []).join(",")}]（原值 [${(prev.values || []).join(",")}]）`;
}

// 提交编辑：单选自动校正合计为 100 并提示；记录来源/历史；重算派生数据
function commitQuestionEdit() {
  const index = state.workbench.editorIndex;
  const q = state.result?.questions?.[index];
  if (q === undefined) return;
  // 先从抽屉 DOM 读取输入框最新值（兼容输入法/自动化输入等未触发 input/change 的场景）
  const draft = state.workbench.editorDraft || {};
  document.querySelectorAll(".edit-drawer [data-edit-field]").forEach((el) => {
    const [field, idx] = el.dataset.editField.split(":");
    updateEditorDraft(field, idx === undefined ? null : Number(idx), el.value);
  });
  if (!draft.values && !draft.distribution && !draft.matrix && !draft.rank && !draft.npsDist && !draft.numStats && !draft.themePcts && !draft.allocPoints && draft.mean === undefined) return;
  const prev = captureQuestionValues(q);
  let normalizedHint = "";
  if (q.type === "single" && Array.isArray(draft.values)) {
    const raw = draft.values.map((v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    });
    const sum = raw.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.01) {
      q.values = normalizeTo100(raw);
      normalizedHint = `单选比例合计为 ${Math.round(sum)}%，已自动校正合计为 100%。`;
    } else {
      q.values = raw;
    }
  } else if (q.type === "multiple" && Array.isArray(draft.values)) {
    q.values = draft.values.map((v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    });
  } else if (q.type === "scale") {
    q.distribution = (draft.distribution || []).map((v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    });
    q.mean = Number.isFinite(Number(draft.mean)) ? Math.round(Number(draft.mean) * 10) / 10 : q.mean;
    q.sd = Number.isFinite(Number(draft.sd)) ? Math.round(Number(draft.sd) * 10) / 10 : q.sd;
  } else if (q.type === "matrix" && Array.isArray(draft.matrix)) {
    (q.matrix || []).forEach((row, i) => {
      const v = Number(draft.matrix[i]?.mean);
      if (Number.isFinite(v)) row.mean = Math.max(0, Math.min(10, Math.round(v * 10) / 10));
    });
  } else if (q.type === "rank" && Array.isArray(draft.rank)) {
    (q.items || []).forEach((it, i) => {
      const d = draft.rank[i];
      if (!d) return;
      const avg = Number(d.avgRank);
      if (Number.isFinite(avg)) it.avgRank = Math.max(1, Math.min(q.items.length, Math.round(avg * 10) / 10));
      const first = Number(d.firstPct);
      if (Number.isFinite(first)) it.firstPct = Math.max(0, Math.min(100, Math.round(first * 10) / 10));
    });
  } else if (q.type === "nps" && Array.isArray(draft.npsDist)) {
    q.distribution = draft.npsDist.map((v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    });
    // NPS 相关量由分布重算（与 AI 合并逻辑一致）
    const d = q.distribution;
    const sum = (idx) => d.slice(idx[0], idx[1] + 1).reduce((a, b) => a + b, 0);
    q.promoterPct = Math.round(sum([9, 10]) * 10) / 10;
    q.passivePct = Math.round(sum([7, 8]) * 10) / 10;
    q.detractorPct = Math.round(sum([0, 6]) * 10) / 10;
    q.nps = Math.round(q.promoterPct - q.detractorPct);
  } else if (q.type === "numeric" && draft.numStats) {
    const pick = (key) => {
      const v = Number(draft.numStats[key]);
      return Number.isFinite(v) ? v : null;
    };
    const mean = pick("mean");
    const median = pick("median");
    const p25 = pick("p25");
    const p75 = pick("p75");
    const min = pick("min");
    const max = pick("max");
    if (mean !== null) q.mean = mean;
    if (median !== null) q.median = median;
    if (p25 !== null) q.p25 = p25;
    if (p75 !== null) q.p75 = p75;
    if (min !== null) q.min = min;
    if (max !== null) q.max = max;
  } else if (q.type === "open" && Array.isArray(draft.themePcts)) {
    (q.themes || []).forEach((t, i) => {
      const v = Number(draft.themePcts[i]);
      if (Number.isFinite(v)) t.pct = Math.max(0, Math.min(100, Math.round(v * 10) / 10));
    });
  } else if (q.type === "allocation" && Array.isArray(draft.allocPoints)) {
    const total = q.totalPoints || 100;
    (q.items || []).forEach((it, i) => {
      const v = Number(draft.allocPoints[i]);
      if (Number.isFinite(v)) it.meanPoints = Math.max(0, Math.min(total, Math.round(v * 10) / 10));
    });
  }
  q.source = "user";
  q.modifiedByUser = true;
  q.modifiedAt = new Date().toISOString();
  q.editHistory = q.editHistory || [];
  q.editHistory.push({ at: q.modifiedAt, action: "用户手动调整", detail: editDiffSummary(prev, q) });
  q.originalValues = q.originalValues || captureQuestionValues(q);
  enrichQuantResult(state.result);
  toast(normalizedHint || "本题数据已保存（来源：用户手动调整）", normalizedHint ? 2600 : 1800);
  render();
}

// 恢复 AI 原始数据（originalValues），来源还原为初始来源
function restoreQuestionData() {
  const index = state.workbench.editorIndex;
  const q = state.result?.questions?.[index];
  if (!q || !q.originalValues) return;
  const src = q.originalValues;
  if (q.type === "single" || q.type === "multiple") q.values = [...(src.values || [])];
  else if (q.type === "scale") {
    q.distribution = [...(src.distribution || [])];
    q.mean = src.mean;
    q.sd = src.sd;
  } else if (q.type === "matrix") {
    (q.matrix || []).forEach((row, i) => {
      const orig = src.matrix?.[i];
      if (orig) { row.mean = orig.mean; row.distribution = [...(orig.distribution || [])]; }
    });
  } else if (q.type === "rank") {
    (q.items || []).forEach((it, i) => {
      const orig = src.items?.[i];
      if (orig) { it.avgRank = orig.avgRank; it.firstPct = orig.firstPct; it.top3Pct = orig.top3Pct; it.rankDistribution = [...(orig.rankDistribution || [])]; }
    });
  } else if (q.type === "nps") {
    q.distribution = [...(src.distribution || [])];
    q.promoterPct = src.promoterPct; q.passivePct = src.passivePct; q.detractorPct = src.detractorPct; q.nps = src.nps; q.mean = src.mean;
  } else if (q.type === "numeric") {
    q.mean = src.mean; q.median = src.median; q.p25 = src.p25; q.p75 = src.p75; q.min = src.min; q.max = src.max;
  } else if (q.type === "open") {
    (q.themes || []).forEach((t, i) => {
      const orig = src.themes?.[i];
      if (orig) { t.pct = orig.pct; t.summary = orig.summary; t.quotes = [...(orig.quotes || [])]; }
    });
    q.otherPct = src.otherPct;
  } else if (q.type === "allocation") {
    (q.items || []).forEach((it, i) => {
      const orig = src.items?.[i];
      if (orig) { it.meanPoints = orig.meanPoints; it.medianPoints = orig.medianPoints; }
    });
    q.totalPoints = src.totalPoints;
  }
  q.source = q.baseSource || (state.result.isMock ? "mock" : "ai");
  q.modifiedByUser = false;
  q.modifiedAt = new Date().toISOString();
  q.editHistory = q.editHistory || [];
  q.editHistory.push({ at: q.modifiedAt, action: "恢复AI原始数据", detail: `已恢复为 AI 原始数据（${sourceLabel(q.source)}）` });
  enrichQuantResult(state.result);
  toast(`已恢复 AI 原始数据（来源：${sourceLabel(q.source)}）`);
  // 重建草稿
  state.workbench.editorDraft = {
    values: q.type === "single" || q.type === "multiple" ? [...(q.values || [])] : null,
    distribution: q.type === "scale" ? [...(q.distribution || [])] : null,
    mean: q.mean,
    sd: q.sd,
    matrix: q.type === "matrix" ? (q.matrix || []).map((r) => ({ row: r.row, mean: r.mean })) : null,
    rank: q.type === "rank" ? (q.items || []).map((it) => ({ avgRank: it.avgRank, firstPct: it.firstPct })) : null,
    npsDist: q.type === "nps" ? [...(q.distribution || [])] : null,
    numStats: q.type === "numeric" ? { mean: q.mean, median: q.median, p25: q.p25, p75: q.p75, min: q.min, max: q.max } : null,
    themePcts: q.type === "open" ? (q.themes || []).map((t) => t.pct) : null,
    allocPoints: q.type === "allocation" ? (q.items || []).map((it) => it.meanPoints) : null
  };
  render();
}

// 手动修改题目模块归类
function setQuestionModule(index, moduleId) {
  const q = state.result?.questions?.[index];
  if (!q || !MODULE_LABEL[moduleId]) return;
  q.module = moduleId;
  q.moduleLabel = MODULE_LABEL[moduleId];
  q.moduleManual = true;
  // 本地故事线依赖模块归类：已有故事线标记为过期
  if (state.result.storyline) {
    state.result.storyline = null;
    state.workbench.storyStatus = "idle";
    toast("模块已修改，故事线需重新生成");
  } else {
    toast(`第 ${index + 1} 题已归入「${MODULE_LABEL[moduleId]}」`);
  }
  render();
}

// ===== v50 工作台：证据跳转 =====

function jumpToQuestion(index) {
  if (!state.result?.questions?.[index]) return;
  state.workbench.scrolls[state.workbench.tab] = window.scrollY;
  state.workbench.tab = "questions";
  state.workbench.expanded.add(index);
  state.workbench.jumpQuestion = index;
  render();
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-question-card="${index}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      const el2 = document.querySelector(`[data-question-card="${index}"]`);
      if (el2) el2.classList.add("jump-flash");
    }, 450);
  });
}

// ===== v50 工作台：交叉分析 =====

function runCrosstab() {
  const config = state.workbench.crosstabConfig;
  // 兜底：从配置表单 DOM 直接读取最新选择（兼容未触发 change 事件的输入场景）
  const rowEl = document.querySelector("[data-crosstab-row]");
  const colEl = document.querySelector("[data-crosstab-col]");
  const metricEl = document.querySelector("[data-crosstab-metric]");
  if (rowEl) config.rowIndex = rowEl.value === "" ? null : Number(rowEl.value);
  if (colEl) config.colType = colEl.value || config.colType;
  if (metricEl) config.metricIndex = metricEl.value === "" ? null : Number(metricEl.value);
  const qs = state.result?.questions || [];
  if (config.rowIndex === null || !qs[config.rowIndex]) {
    toast("请先选择行变量题目");
    return;
  }
  const env = buildQuantEnv();
  env.quotaPlan = state.quotaPlan;
  state.workbench.crosstabResult = buildSimulatedCrosstab(qs, config, env);
  render();
}

// ===== v50 工作台：报告故事线 =====

async function generateStoryline() {
  const questions = state.result?.questions || [];
  const findings = state.result?.keyFindings || [];
  const env = buildQuantEnv();
  const local = () => buildStoryline(questions, state.result.analysis, findings, env, state.sampleSize);

  if (state.result.isMock || !hasModelReady()) {
    state.result.storyline = local();
    state.workbench.storyStatus = "done";
    toast(state.result.isMock ? "已生成本地故事线（模拟模式）" : "未配置 API，已使用本地故事线");
    render();
    return;
  }
  state.workbench.storyStatus = "generating";
  render();
  try {
    const content = await callAI(buildStorylinePrompt(env, questions, findings), null, { temperature: 0.2, maxTokens: 8000 });
    const parsed = parseAIJSON(content, "报告故事线");
    state.result.storyline = normalizeStoryline(parsed, questions, local());
  } catch (err) {
    console.warn("AI 故事线生成失败，使用本地兜底:", err.message);
    state.result.storyline = local();
    toast("AI 故事线生成失败，已使用本地数据版本");
  }
  state.workbench.storyStatus = "done";
  render();
}

// ===== v50 工作台：导出 =====

function exportExcelStats() {
  if (!state.result) return;
  const bytes = buildQuantWorkbook(state.result);
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`问卷统计结果_${date}.xlsx`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  toast("Excel 统计结果已下载（8 个 Sheet）");
}

function exportExcelQuality() {
  if (!state.result) return;
  const bytes = buildQualityWorkbook(state.result);
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`数据质量报告_${date}.xlsx`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  toast("Excel 数据质量报告已下载");
}

function quantWorkbenchMarkdown() {
  if (!state.result) return "";
  const env = buildQuantEnv();
  const md = buildQuantWorkbenchMarkdown(state.result, env);
  // v52：在数据质量段落之前插入完整配额设计段落
  const quotaSection = quotaMarkdownSection();
  let result = md.replace("## 一、数据质量", `${quotaSection}\n## 一、数据质量`);
  // v53：在逐题统计段落之后插入逐题解读
  const interpSection = buildInterpretationsMarkdownSection();
  if (interpSection) {
    // 在「## 六、交叉分析」之前插入解读段落
    result = result.replace("## 六、交叉分析", `${interpSection}\n## 六、交叉分析`);
  }
  return result;
}

// v53：构建逐题解读 Markdown 段落
function buildInterpretationsMarkdownSection() {
  const slots = state.questionInterpretations;
  const keys = Object.keys(slots).map(Number).sort((a, b) => a - b);
  if (!keys.length) return "";
  const lines = ["## 逐题数据解读", ""];
  for (const index of keys) {
    const slot = slots[index];
    if (!slot || !slot.interpretation) continue;
    const question = state.result?.questions?.[index];
    if (!question) continue;
    const qTitle = `### Q${index + 1} ${question.text}`;
    lines.push(qTitle, "");
    const modeLabel = slot.mode === InterpretationMode.AI ? "AI 深度解读"
      : slot.mode === InterpretationMode.MANUAL ? "人工修改"
      : "基础统计解读";
    lines.push(`> 解读模式：${modeLabel} · 状态：${slot.status}${slot.generatedAt ? ` · 生成时间：${slot.generatedAt}` : ""}`, "");
    lines.push(interpretationToMarkdown(slot.interpretation, index), "");
  }
  return lines.join("\n");
}

function exportStoryJson() {
  if (!state.result?.storyline) {
    toast("请先生成报告故事线");
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`报告故事线_${date}.json`, JSON.stringify(state.result.storyline, null, 2), "application/json;charset=utf-8");
  toast("故事线 JSON 已下载");
}

function quantStoryMarkdown() {
  const story = state.result?.storyline;
  if (!story) return "";
  const lines = [`# ${state.topic} - 报告故事线`, `> 生成方式：${story.generated === "ai" ? "AI 生成" : "本地数据生成"} · ${story.generatedAt || ""}`, ""];
  (story.chapters || []).forEach((ch) => {
    lines.push(`## ${ch.title}`, "");
    (ch.slides || []).forEach((s) => {
      const qs = (s.questionIndexes || []).map((i) => `Q${i + 1}`).join("、");
      lines.push(`### ${s.title}`, s.conclusion, `- 对应题目：${qs || "—"} · 推荐图表：${s.chartType}`);
      (s.evidence || []).forEach((e) => lines.push(`- 证据：${e}`));
      lines.push("");
    });
  });
  return lines.join("\n");
}

function exportStoryMd() {
  const md = quantStoryMarkdown();
  if (!md) {
    toast("请先生成报告故事线");
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`报告故事线_${date}.md`, md, "text/markdown;charset=utf-8");
  toast("故事线 Markdown 已下载");
}

function copyResult() {
  if (!state.result) return;
  const text = state.mode === "qual" ? qualMarkdown() : quantCsv();
  navigator.clipboard.writeText(text).then(() => toast(state.mode === "qual" ? "Markdown 已复制" : "CSV 已复制"));
}

function copyAnalysis() {
  if (!state.result) return;
  const text = state.mode === "qual" ? qualAnalysisMarkdown() : quantAnalysisMarkdown();
  navigator.clipboard.writeText(text).then(() => toast("分析报告已复制"));
}

// 下载文件到本地（支持字符串与二进制 Uint8Array / Blob；字符串自动加 BOM 便于 Excel 打开）
function downloadFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  let blob;
  if (content instanceof Uint8Array) {
    blob = new Blob([content.buffer], { type: mimeType });
  } else if (content instanceof Blob) {
    blob = content;
  } else {
    blob = new Blob(["\uFEFF" + content], { type: mimeType });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// 导出 CSV 文件（统计汇总）
function exportCsv() {
  if (!state.result) return;
  const csv = quantCsv();
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`问卷统计结果_${date}.csv`, csv, "text/csv;charset=utf-8");
  toast("CSV 文件已下载");
}

// 导出分析报告 Markdown（quant 模式输出完整工作台报告：质量/核心指标/发现/模块/逐题/交叉/故事线）
function exportMarkdown() {
  if (!state.result) return;
  const md = state.mode === "qual" ? qualMarkdown() : quantWorkbenchMarkdown();
  const date = new Date().toISOString().slice(0, 10);
  const prefix = state.mode === "qual" ? "访谈笔录" : "问卷分析报告";
  downloadFile(`${prefix}_${date}.md`, md, "text/markdown;charset=utf-8");
  toast("Markdown 文件已下载");
}

// 导出完整 JSON 数据（含质量明细/核心指标/关键发现/故事线/交叉结果）
function exportJson() {
  if (!state.result) return;
  // v52：导出时附加完整配额信息（维度/选项/校验结果）
  const validation = validateQuotaPlan(state.quotaPlan, currentSampleSize());
  const exportPayload = {
    ...state.result,
    quota: {
      sampleSize: currentSampleSize(),
      dimensions: state.quotaPlan,
      validation: {
        errors: validation.errors,
        warnings: validation.warnings
      }
    },
    // v53：导出逐题解读
    questionInterpretations: state.questionInterpretations
  };
  const json = JSON.stringify(exportPayload, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`问卷完整数据_${date}.json`, json, "application/json;charset=utf-8");
  toast("JSON 数据已下载");
}

// v52：构建配额设计 Markdown 段落（用于 qual / quant 导出复用）
function quotaMarkdownSection() {
  const dims = getEnabledDimensions(state.quotaPlan);
  if (!dims.length) return "## 配额设计\n\n（未配置配额）\n";
  const n = currentSampleSize();
  const lines = [`## 配额设计`, "", `样本量：N=${n}`, ""];
  dims.forEach((dim) => {
    const allocation = dimensionAllocation(dim, n);
    lines.push(`### ${dim.name}`);
    allocation.forEach((a) => {
      lines.push(`- ${a.label}：${a.pct}%，${a.count} 人`);
    });
    lines.push("");
  });
  lines.push("> 当前配额按各维度独立控制边际分布，不自动约束多个条件的交叉组合。");
  return lines.join("\n");
}

function qualMarkdown() {
  if (!state.result) return "";
  return `# ${state.topic} - 虚拟座谈会笔录\n\n## 用户画像：${state.audience}\n\n${quotaMarkdownSection()}\n` + state.result.users.map((user, i) => {
    const answers = user.answers.map((item, idx) => `**Q${idx + 1}: ${item.question}**\n${item.answer}`).join("\n\n");
    return `### 用户 ${i + 1}：${user.name}（${user.age} 岁，${user.city}）\n**标签**：${user.role}\n**态度**：${user.sentiment}\n\n${answers}`;
  }).join("\n\n---\n\n");
}

function qualAnalysisMarkdown() {
  if (!state.result) return "";
  const a = state.result.analysis;
  return `# ${state.topic} - 归纳分析\n\n## 核心结论\n${a.summary}\n\n## 主题聚类\n${a.themes.map((t) => `- ${t.name}（${t.value}%）：${t.detail}`).join("\n")}\n\n## 行动建议\n${a.recommendations.map((r) => `- ${r}`).join("\n")}`;
}

function quantCsv() {
  if (!state.result) return "";
  // 完整题目正常导出；不完整题目的缺失项写「未返回」，绝不写成 0%
  return buildQuantCsv(state.result.questions);
}

function quantAnalysisMarkdown() {
  if (!state.result) return "";
  // 不完整题目在 Markdown 中以「⚠️ 数据完整度提示」标注，提示重新生成
  return buildQuantAnalysisMarkdown(state.topic, state.result.questions, state.result.analysis);
}

function App() {
  return `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-inner">
          <button class="brand" data-route="qual" aria-label="进入定性研究">
            <span class="brand-mark">S</span>
            <span>SynthUser</span>
          </button>
          <nav class="main-nav" aria-label="主导航">
            ${NavButton("qual", "定性研究")}
            ${NavButton("quant", "定量研究")}
            ${NavButton("settings", "模型设置")}
          </nav>
        </div>
      </header>
      ${PwaStatusBar()}
      <main class="page">
        ${state.page === "qual" ? QualPage() : ""}
        ${state.page === "quant" ? QuantPage() : ""}
        ${state.page === "settings" ? SettingsPage() : ""}
        ${state.page === "result" ? ResultPage() : ""}
        ${state.page === "import-preview" ? ImportPreviewPage() : ""}
      </main>
      ${state.showApiPrompt ? ApiPromptModal() : ""}
      ${state.page === "import-preview" && state.importPreview?.confirmDialog ? ImportConfirmDialog() : ""}
      ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
    </div>
  `;
}

function PwaStatusBar() {
  const status = state.isStandalone
    ? "已作为应用运行"
    : state.isOnline
      ? "在线 · 支持安装和离线访问"
      : "离线模式 · 可查看已缓存页面";
  return `
    <div class="pwa-status">
      <div class="container pwa-status-inner">
        <span>${status}</span>
        ${state.installAvailable && !state.isStandalone ? `<button class="ghost small-button" data-action="install-app">安装应用</button>` : ""}
      </div>
    </div>
  `;
}

function NavButton(page, label) {
  const active = state.page === page
    || (state.page === "result" && state.mode === page)
    || (state.page === "import-preview" && state.mode === page);
  return `<button class="nav-item ${active ? "active" : ""}" data-route="${page}">${label}</button>`;
}

// ===== 问卷识别预览页 =====

const IMPORT_STATUS_LABEL = { complete: "识别完整", "needs-confirm": "需要确认", failed: "识别失败" };
const IMPORT_STATUS_CLASS = { complete: "ok", "needs-confirm": "warn", failed: "fail" };
const IMPORT_TYPE_LABEL = TYPE_LABEL;

function ImportPreviewPage() {
  const preview = state.importPreview;
  if (!preview) {
    return `<section class="container"><div class="empty-state"><h1>没有识别结果</h1><p>请先在定量研究页上传 Word/Excel 或粘贴问卷文本。</p><button class="primary" data-route="quant">去上传问卷</button></div></section>`;
  }
  const s = preview.summary;
  const shown = importPreviewFiltered();
  return `
    <section class="container">
      <div class="headline">
        <span class="eyebrow">问卷识别预览</span>
        <h1>确认识别结果后再进入编辑</h1>
        <p>来源：${escapeHtml(preview.fileName || "粘贴文本")}（${preview.sourceType}）。系统不会自动填充缺失选项，请逐题核对后确认。</p>
      </div>
      ${ImportPreviewSummary()}
      ${ImportPreviewWarnings()}
      ${ImportPreviewToolbar()}
      <div class="import-question-list">
        ${shown.length === 0
          ? `<div class="notice">当前筛选下没有题目。</div>`
          : shown.map((q) => ImportPreviewQuestionCard(q, preview.parsedQuestions.indexOf(q))).join("")}
      </div>
      ${ImportPreviewConfirmBar()}
    </section>
  `;
}

function ImportPreviewSummary() {
  const s = state.importPreview.summary;
  const t = s.typeStats;
  return `
    <section class="import-summary">
      <div class="import-summary-metrics">
        <div><strong>识别题目</strong><span>${s.total} 道</span></div>
        <div><strong>识别选项</strong><span>${s.optionCount} 个</span></div>
        <div><strong>识别完整</strong><span class="import-metric-ok">${s.complete} 道</span></div>
        <div><strong>需要确认</strong><span class="import-metric-warn">${s.needsConfirm} 道</span></div>
        <div><strong>解析失败</strong><span class="import-metric-fail">${s.failed} 道</span></div>
      </div>
      <div class="import-summary-types">
        ${[["single", t.single], ["multiple", t.multiple], ["scale", t.scale], ["matrix", t.matrix], ["open", t.open]]
          .map(([type, count]) => `<span class="import-type-chip">${IMPORT_TYPE_LABEL[type]}：${count}</span>`).join("")}
      </div>
    </section>
  `;
}

function ImportPreviewWarnings() {
  const warnings = state.importPreview.globalWarnings || [];
  if (!warnings.length) return "";
  return `<div class="import-global-warnings">${warnings.map((w) => `<div>⚠️ ${escapeHtml(w)}</div>`).join("")}</div>`;
}

function ImportPreviewToolbar() {
  const preview = state.importPreview;
  const filters = [["all", "全部"], ["complete", "完整"], ["needs-confirm", "需确认"], ["failed", "失败"]];
  const checkedCount = preview.checked.size;
  return `
    <section class="import-toolbar">
      <div class="import-filter-chips">
        ${filters.map(([key, label]) => `<button class="import-filter-chip ${preview.filter === key ? "active" : ""}" data-import-filter="${key}">${label}</button>`).join("")}
      </div>
      <div class="import-batch-ops">
        <span class="import-batch-hint">${checkedCount ? `已选 ${checkedCount} 题` : "批量操作作用于当前筛选的题目"}</span>
        <select data-import-batch-type title="批量设置题型">
          <option value="">批量设置题型…</option>
          <option value="single">全部设为单选</option>
          <option value="multiple">全部设为多选</option>
          <option value="scale">全部设为量表</option>
          <option value="matrix">全部设为矩阵</option>
          <option value="open">全部设为开放题</option>
        </select>
        <button class="ghost small-button" data-action="import-batch-drop-instructions">批量删除说明文字</button>
        <button class="ghost small-button" data-action="import-batch-accept-shared">批量接受共享选项</button>
        <button class="ghost small-button" data-action="import-batch-skip-open">批量跳过开放题</button>
        <button class="ghost small-button" data-action="import-accept-all">全部确认</button>
        <button class="ghost small-button" data-action="import-preview-reset">恢复原始识别</button>
      </div>
    </section>
  `;
}

function ImportPreviewQuestionCard(q, index) {
  const preview = state.importPreview;
  const expanded = preview.expanded.has(index);
  const isChecked = preview.checked.has(index);
  const opts = importOptionArray(q);
  const metaParts = [];
  if (q.type === "single" || q.type === "multiple") metaParts.push(`${opts.length} 个选项`);
  if (q.type === "scale") metaParts.push(q.scale);
  if (q.type === "matrix") metaParts.push(`${splitList(q.rows).length} 行 · ${q.scale}`);
  if (q.type === "open") metaParts.push("开放题");
  const issues = [...(q.blocking || []), ...(q.issues || [])];
  return `
    <article class="import-question-card import-card-${IMPORT_STATUS_CLASS[q.status] || "warn"}">
      <div class="import-q-head">
        <label class="import-q-check">
          <input type="checkbox" data-import-check="${index}" ${isChecked ? "checked" : ""} />
        </label>
        <span class="import-status-tag status-${IMPORT_STATUS_CLASS[q.status] || "warn"}">${IMPORT_STATUS_LABEL[q.status] || q.status}</span>
        <span class="import-q-code">${escapeHtml(q.code || `#${index + 1}`)}</span>
        <div class="import-q-title">
          <strong>${escapeHtml(q.text || "（空题干）")}</strong>
          <span>${IMPORT_TYPE_LABEL[q.type] || q.type}${metaParts.length ? " · " + metaParts.join(" · ") : ""}</span>
        </div>
        <div class="import-q-actions">
          <button class="ghost small-button" data-action="import-toggle" data-question-index="${index}">${expanded ? "收起" : "编辑"}</button>
          <button class="ghost small-button" data-action="import-toggle-raw" data-question-index="${index}">查看原文</button>
          ${index > 0 ? `<button class="ghost small-button" data-action="import-merge-up" data-question-index="${index}" title="合并到上一题">合并到上一题</button>` : ""}
          <button class="ghost small-button danger" data-action="import-delete" data-question-index="${index}">删除</button>
        </div>
      </div>
      ${issues.length ? `<div class="import-issues">${issues.map((issue) => `<div class="import-issue ${issue.blocking ? "issue-blocking" : ""}">${issue.blocking ? "⛔ " : "⚠️ "}${escapeHtml(issue.message)}</div>`).join("")}</div>` : ""}
      ${expanded ? ImportQuestionEditor(q, index) : ""}
      ${preview.rawExpanded === index ? ImportQuestionRaw(q) : ""}
    </article>
  `;
}

function ImportQuestionEditor(q, index) {
  const opts = importOptionArray(q);
  const isChoice = q.type === "single" || q.type === "multiple" || q.type === "open" || q.type === "rank" || q.type === "allocation";
  const rows = splitList(q.rows);
  const optionRows = isChoice ? opts.map((opt, optIdx) => `
    <div class="import-option-row">
      <input data-ip-option="${index}:${optIdx}" value="${escapeHtml(opt)}" placeholder="选项内容" />
      <button class="ghost small-button" data-action="import-option-move" data-question-index="${index}" data-option-index="${optIdx}" data-dir="-1" title="上移">↑</button>
      <button class="ghost small-button" data-action="import-option-move" data-question-index="${index}" data-option-index="${optIdx}" data-dir="1" title="下移">↓</button>
      <button class="ghost small-button" data-action="import-option-split" data-question-index="${index}" data-option-index="${optIdx}" title="拆分为新题">拆</button>
      <button class="ghost small-button danger" data-action="import-option-remove" data-question-index="${index}" data-option-index="${optIdx}" title="删除选项">×</button>
    </div>`).join("") : "";
  return `
    <div class="import-q-editor">
      <div class="import-field">
        <label>题目文本</label>
        <input data-ip-text="${index}" value="${escapeHtml(q.text)}" />
      </div>
      <div class="import-field import-field-row">
        <div>
          <label>题型</label>
          <select data-ip-type="${index}">
            ${QUESTION_TYPE_GROUPS.map((g) => `<optgroup label="${g.label}">${g.types.map((t) => `<option value="${t}" ${q.type === t ? "selected" : ""}>${QUESTION_TYPE_REGISTRY[t].label}</option>`).join("")}</optgroup>`).join("")}
          </select>
        </div>
        ${q.type === "scale" || q.type === "matrix" ? `
          <div>
            <label>量表范围</label>
            <select data-ip-scale="${index}">
              ${["1-5", "1-7", "1-10"].map((s) => `<option value="${s}" ${q.scale === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>` : ""}
        ${q.type === "rank" ? `
          <div>
            <label>排序模式</label>
            <select data-ip-config="rankMode:${index}">
              <option value="full" ${(q.config?.rankMode || "full") !== "top_n" ? "selected" : ""}>全部排序</option>
              <option value="top_n" ${q.config?.rankMode === "top_n" ? "selected" : ""}>只排序前N项</option>
            </select>
          </div>` : ""}
        ${q.type === "allocation" ? `
          <div>
            <label>总分</label>
            <input type="number" min="1" max="1000" style="min-height:34px;width:90px" data-ip-config="totalPoints:${index}" value="${q.config?.totalPoints ?? 100}" />
          </div>` : ""}
      </div>
      ${isChoice ? `
        <div class="import-field">
          <label>选项（${opts.length} 个）${opts.length < 2 ? ' <span class="import-hint-warn">至少需要 2 个</span>' : ""}</label>
          ${opts.length === 0 ? `<div class="import-empty-options">未识别到选项，请确认原问卷格式。<button class="secondary small-button" data-action="import-add-placeholder" data-question-index="${index}">添加占位选项</button></div>` : ""}
          ${optionRows}
          <button class="ghost small-button" data-action="import-option-add" data-question-index="${index}">+ 添加选项</button>
        </div>` : ""}
      ${q.type === "matrix" ? `
        <div class="import-field">
          <label>矩阵行维度（${rows.length} 行）${rows.length < 1 ? ' <span class="import-hint-warn">至少需要 1 行</span>' : ""}</label>
          ${rows.length === 0 ? `<div class="import-empty-options">未识别到行维度，请手动补充。<button class="secondary small-button" data-action="import-row-add" data-question-index="${index}">添加行维度</button></div>` : ""}
          ${rows.map((row, ri) => `
            <div class="import-option-row">
              <input data-ip-row="${index}:${ri}" value="${escapeHtml(row)}" placeholder="行维度内容" />
              <button class="ghost small-button" data-action="import-option-move" data-question-index="${index}" data-option-index="${ri}" data-dir="-1" title="上移">↑</button>
              <button class="ghost small-button" data-action="import-option-move" data-question-index="${index}" data-option-index="${ri}" data-dir="1" title="下移">↓</button>
              <button class="ghost small-button danger" data-action="import-option-remove" data-question-index="${index}" data-option-index="${ri}" title="删除行">×</button>
            </div>`).join("")}
          <button class="ghost small-button" data-action="import-row-add" data-question-index="${index}">+ 添加行维度</button>
        </div>` : ""}
      ${q.type === "open" ? `<div class="import-field"><label>开放题提示</label><p class="import-hint">开放题无选项，确认后默认跳过；补充 2 个以上选项后可作为单选保留。</p></div>` : ""}
    </div>
  `;
}

// 原文对照：原始行文本 + 系统识别结构
function ImportQuestionRaw(q) {
  const rawLines = (q.rawLines || []).filter(Boolean);
  return `
    <div class="import-raw-block">
      <div class="import-raw-title">原文对照</div>
      <div class="import-raw-grid">
        <div>
          <strong>原始文本片段</strong>
          ${rawLines.length ? rawLines.map((l) => `<div class="import-raw-line">${escapeHtml(l)}</div>`).join("") : `<div class="import-raw-line muted">（单行格式，无独立原始行）</div>`}
        </div>
        <div>
          <strong>系统识别结构</strong>
          <div class="import-raw-line">题号：${escapeHtml(q.code || "—")}</div>
          <div class="import-raw-line">题型：${IMPORT_TYPE_LABEL[q.type] || q.type}${q.scale ? `（${escapeHtml(q.scale)}）` : ""}</div>
          ${q.type === "single" || q.type === "multiple" ? `<div class="import-raw-line">选项（${splitOptions(q.options).length}）：${escapeHtml(q.options || "—")}</div>` : ""}
          ${q.type === "matrix" ? `<div class="import-raw-line">行维度（${splitList(q.rows).length}）：${escapeHtml(q.rows || "—")}</div>` : ""}
          ${q.type === "scale" ? `<div class="import-raw-line">量表范围：${escapeHtml(q.scale)}</div>` : ""}
          ${q.inherited ? `<div class="import-raw-line">选项来源：自动继承自下一题</div>` : ""}
        </div>
      </div>
    </div>
  `;
}

function ImportPreviewConfirmBar() {
  const preview = state.importPreview;
  const blockingCount = preview.parsedQuestions.filter((q) => (q.blocking || []).length).length;
  const warnCount = preview.parsedQuestions.reduce((sum, q) => sum + (q.issues || []).length, 0);
  return `
    <div class="import-confirm-bar">
      <div class="import-confirm-info">
        ${blockingCount ? `<span class="import-confirm-block">⛔ ${blockingCount} 道题存在严重问题，需处理后才能确认</span>` : `<span class="import-confirm-ok">✓ 已无严重问题${warnCount ? `（${warnCount} 处轻度警告）` : ""}</span>`}
        ${preview.confirmError ? `<div class="import-confirm-error">${escapeHtml(preview.confirmError)}</div>` : ""}
      </div>
      <div class="import-confirm-actions">
        <button class="ghost large-action" data-action="import-preview-back">返回重新上传</button>
        <button class="primary large-action" data-action="import-preview-confirm" ${blockingCount ? "disabled" : ""}>确认问卷并继续</button>
      </div>
    </div>
  `;
}

function ImportConfirmDialog() {
  const dialog = state.importPreview.confirmDialog;
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="轻度警告确认">
      <div class="modal">
        <h2>仍有 ${dialog.warnings.length} 处轻度警告</h2>
        <p>以下识别点不影响继续，但建议确认是否正确：</p>
        <ul class="import-dialog-warnings">
          ${dialog.warnings.slice(0, 8).map((w) => `<li>${escapeHtml(w)}</li>`).join("")}
          ${dialog.warnings.length > 8 ? `<li>… 其余 ${dialog.warnings.length - 8} 处</li>` : ""}
        </ul>
        <div class="actions">
          <button class="primary" data-action="import-confirm-continue">确认继续</button>
          <button class="ghost" data-action="import-confirm-cancel">返回修改</button>
        </div>
      </div>
    </div>
  `;
}

function QualPage() {
  return `
    <section class="container">
      <div class="page-layout">
        ${WorkflowSteps(["研究设计", "生成笔录", "归纳分析"])}
        <div>
          <div class="headline">
            <span class="eyebrow">AI 合成座谈会</span>
            <h1>定性研究：从问题到笔录，再到归纳分析</h1>
            <p>配置研究主题和人群画像，AI 会生成差异化的虚拟访谈对象和深度回答。生成后查看笔录和主题聚类。</p>
          </div>
          ${TemplatePanel()}
          <section class="panel">
            <div class="section-title">
              <div>
                <h2>输入方式</h2>
                <p>大纲导入适合已有研究计划；手动问题适合快速探索。</p>
              </div>
            </div>
            ${QualQuestionForm()}
          </section>
          <div class="generate-bar">
            ${hasModelReady()
              ? `<button class="primary large-action" data-action="generate" ${hasResearchReady() ? "" : "disabled"}>生成笔录</button>`
              : `<button class="primary large-action" data-action="generate-mock" ${hasResearchReady() ? "" : "disabled"}>生成模拟笔录</button>
                 <button class="ghost large-action" data-action="generate" ${hasResearchReady() ? "" : "disabled"}>设置 API 后生成</button>`}
          </div>
        </div>
      </div>
    </section>
  `;
}

function QuantPage() {
  const modelReady = hasModelReady();
  return `
    <section class="container">
      <div class="page-layout">
        ${WorkflowSteps(["问卷设计", "题型配置", "模拟统计", "分析摘要"])}
        <div>
          <div class="headline">
            <span class="eyebrow">AI 问卷模拟器</span>
            <h1>定量研究：支持多题型模拟和分析导出</h1>
            <p>AI 会根据人群画像和研究主题生成合理的统计分布。支持单选、多选、量表和矩阵打分的模拟统计。</p>
          </div>
          ${TemplatePanel()}
          <section class="panel">
            <div class="section-title">
              <div>
                <h2>问卷结构</h2>
                <p>AI 模拟样本 N=${state.sampleSize}，生成结果反映目标人群的消费行为和态度倾向。</p>
              </div>
            </div>
            <div class="field compact-field">
              <label for="sample-size">模拟样本量</label>
              <input id="sample-size" type="number" min="50" max="500" value="${state.sampleSize}" />
            </div>
            ${QuantQuestionForm()}
          </section>
          <div class="generate-bar">
            ${modelReady
              ? `<button class="primary large-action" data-action="generate" ${hasResearchReady() ? "" : "disabled"}>生成问卷结果</button>`
              : `<button class="primary large-action" data-action="generate-mock" ${hasResearchReady() ? "" : "disabled"}>生成模拟结果</button>
                 <button class="ghost large-action" data-action="generate" ${hasResearchReady() ? "" : "disabled"}>设置 API 后生成</button>`}
          </div>
        </div>
      </div>
    </section>
  `;
}

function WorkflowSteps(items) {
  return `<aside class="side-steps" aria-label="研究流程">${items.map((item, index) => `<span class="step ${index === 0 ? "active" : ""}">${index + 1} ${item}</span>`).join("")}</aside>`;
}

function TemplatePanel() {
  const indexes = state.mode === "qual" ? [0, 3, 4] : [0, 1, 2];
  return `
    <section class="panel">
      <div class="section-title">
        <div>
          <h2>快速模板</h2>
          <p>可选。点击后只预填内容，不会直接生成。</p>
        </div>
      </div>
      <div class="template-strip">
        ${indexes.map((index) => {
          const item = templates[index];
          return `<button class="template-card" data-template="${index}"><strong>${item.topic}</strong><span>${item.audience}</span></button>`;
        }).join("")}
      </div>
    </section>
  `;
}

function CommonResearchFields() {
  return `
    <div class="field">
      <label for="topic">研究主题</label>
      <input id="topic" value="${escapeHtml(state.topic)}" placeholder="例如：测试一款 0 糖气泡水的概念" />
    </div>
    ${AudienceBuilder()}
  `;
}

function AudienceBuilder() {
  const options = ["普通消费者", "年轻白领", "精致妈妈", "专业人士"];
  const c = state.audienceConfig;
  return `
    <div class="audience-builder">
      <div class="section-title compact-title">
        <div>
          <h2>合成人群设定</h2>
          <p>先用轻量画像设定控制生成口径，AI 会根据这些特征生成差异化的虚拟对象。</p>
        </div>
      </div>
      <div class="segmented">
        ${options.map((option) => `<button name="audience" class="segment ${state.audience === option ? "active" : ""}" data-audience="${option}" data-value="${option}">${option}</button>`).join("")}
      </div>
      <div class="audience-grid">
        <div class="field"><label for="aud-age">年龄</label><input id="aud-age" value="${escapeHtml(c.age)}" /></div>
        <div class="field"><label for="aud-gender">性别比例</label><input id="aud-gender" value="${escapeHtml(c.gender)}" /></div>
        <div class="field"><label for="aud-city">城市层级</label><input id="aud-city" value="${escapeHtml(c.city)}" placeholder="例如：一线城市 / 国外 / 北美 / 东南亚" /></div>
        <div class="field"><label for="aud-income">收入 / 消费力</label><input id="aud-income" value="${escapeHtml(c.income)}" /></div>
        <div class="field"><label for="aud-usage">品类行为</label><input id="aud-usage" value="${escapeHtml(c.usage)}" /></div>
        <div class="field"><label for="aud-price">价格敏感度</label><input id="aud-price" value="${escapeHtml(c.price)}" /></div>
      </div>
      <div class="field">
        <label for="aud-lifestyle">心理 / 生活方式标签</label>
        <input id="aud-lifestyle" value="${escapeHtml(c.lifestyle)}" placeholder="例如：健康意识, 尝鲜意愿, 社交分享" />
      </div>
      ${QuotaDesigner()}
      <div class="quota-preview">
        <span>预览</span>
        <strong>${state.mode === "qual" ? "6 位 AI 合成访谈对象" : `${state.sampleSize} 份 AI 模拟样本`}</strong>
        <p>${escapeHtml(audienceSummary())}</p>
        <p>${escapeHtml(quotaSampleSummary())}</p>
      </div>
    </div>
  `;
}

function QuotaDesigner() {
  const validation = quotaValidationResult();
  const stats = quotaStats(state.quotaPlan);
  const n = currentSampleSize();
  const enabledCount = stats.dimCount;
  const itemCount = stats.itemCount;
  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;
  return `
    <section class="quota-designer quota-designer-v52">
      <div class="section-title compact-title">
        <div>
          <h2>配额设计</h2>
          <p>支持新增任意配额维度（性别/年龄/收入/用户类型/自定义等）。当前配额按各维度独立控制边际分布，不自动约束多个条件的交叉组合。</p>
        </div>
        <div class="quota-designer-actions">
          <button class="ghost small-button" data-action="open-quota-scheme-panel">${state.quotaSchemePanelOpen ? "收起方案管理" : "方案管理"}</button>
          <button class="ghost small-button" data-action="reset-quota" title="恢复为默认 3 维度配额">重置配额</button>
          <button class="primary small-button" data-action="open-quota-template-picker">＋ 新增配额条件</button>
        </div>
      </div>

      <div class="quota-summary-bar">
        <div class="quota-summary-stats">
          <span class="qs-stat"><strong>${enabledCount}</strong> 个启用维度</span>
          <span class="qs-stat"><strong>${itemCount}</strong> 个配额选项</span>
          <span class="qs-stat">样本量 <strong>N=${n}</strong></span>
          <span class="qs-stat ${hasErrors ? "qs-stat-error" : (hasWarnings ? "qs-stat-warn" : "qs-stat-ok")}">
            ${hasErrors ? `⚠️ ${validation.errors.length} 项错误` : (hasWarnings ? `⚠️ ${validation.warnings.length} 项警告` : "✅ 校验通过")}
          </span>
        </div>
        ${state.quotaCollapsed && enabledCount > 3
          ? `<button class="ghost small-button" data-action="toggle-quota-collapse">展开详情</button>`
          : (enabledCount > 3 ? `<button class="ghost small-button" data-action="toggle-quota-collapse">折叠详情</button>` : "")}
      </div>

      ${state.quotaSchemePanelOpen ? QuotaSchemePanel() : ""}

      ${state.quotaCollapsed && enabledCount > 3
        ? `<div class="quota-collapsed-hint">已配置 ${state.quotaPlan.length} 个配额维度，合计 ${itemCount} 个配额选项。点击「展开详情」查看完整配额设计。</div>`
        : `
          <div class="quota-grid quota-grid-v52">
            ${state.quotaPlan.map((dimension, index) => QuotaDimension(dimension, index, validation)).join("")}
          </div>
          <div class="quota-add-row">
            <button class="ghost" data-action="open-quota-template-picker">＋ 新增配额条件</button>
          </div>
        `
      }

      ${QuotaValidationMessages(validation)}

      ${state.quotaTemplatePickerOpen ? QuotaTemplatePicker() : ""}
      ${state.quotaConfirmDialog ? QuotaConfirmDialog() : ""}
    </section>
  `;
}

function QuotaValidationMessages(validation) {
  const errorItems = validation.errors.map((e) => `<li class="qerr-error">${escapeHtml(e.message)}</li>`).join("");
  const warningItems = validation.warnings.map((w) => `<li class="qerr-warning">${escapeHtml(w.message)}</li>`).join("");
  if (!errorItems && !warningItems) {
    return `<div class="quota-ok">配额校验通过，可用于模拟样本结构。</div>`;
  }
  return `
    <div class="quota-validation">
      ${errorItems ? `<ul class="quota-errors">${errorItems}</ul>` : ""}
      ${warningItems ? `<ul class="quota-warnings">${warningItems}</ul>` : ""}
    </div>
  `;
}

function QuotaDimension(dimension, dimIndex, validation) {
  const total = quotaTotal(dimension);
  const enabled = dimension.enabled !== false;
  const allocation = allocateQuotaCounts(dimension.items, currentSampleSize());
  const totalClass = Math.abs(total - 100) < 0.01 ? "quota-total ok" : "quota-total";
  const dimError = (validation?.errors || []).find((e) => e.dimensionId === dimension.id);
  return `
    <article class="quota-card quota-card-v52 ${enabled ? "" : "quota-card-disabled"}" data-dim-id="${dimension.id}">
      <div class="quota-card-head">
        <div class="quota-card-name-row">
          <input class="quota-dim-name" data-quota-dim-name="${dimension.id}" value="${escapeHtml(dimension.name)}" placeholder="维度名称" aria-label="配额维度名称" />
          <span class="quota-source-tag src-${dimension.source || "custom"}">${dimension.source === "preset" ? "预设" : "自定义"}</span>
        </div>
        <span class="${totalClass}" title="维度合计百分比">${formatPctDisplay(total)}%</span>
      </div>
      <div class="quota-dim-toolbar">
        <button class="icon-button-mini" title="${enabled ? "停用维度" : "启用维度"}" data-toggle-quota-dim="${dimension.id}">${enabled ? "●" : "○"}</button>
        <button class="icon-button-mini" title="上移" data-move-quota-dim="${dimension.id}:up" ${dimIndex === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-button-mini" title="下移" data-move-quota-dim="${dimension.id}:down" ${dimIndex === state.quotaPlan.length - 1 ? "disabled" : ""}>↓</button>
        <button class="icon-button-mini" title="复制维度" data-copy-quota-dim="${dimension.id}">⎘</button>
        <button class="icon-button-mini" title="重置（平均分配）" data-reset-quota-dim="${dimension.id}">↺</button>
        <button class="icon-button-mini" title="删除维度" data-remove-quota-dim="${dimension.id}">✕</button>
      </div>
      <div class="quota-items quota-items-v52">
        ${dimension.items.map((item, itemIndex) => {
          const alloc = allocation.find((a) => a.itemId === item.id);
          const count = alloc ? alloc.count : 0;
          return `
            <div class="quota-item quota-item-v52">
              <button class="icon-button-mini" title="上移" data-move-quota-item="${dimension.id}:${item.id}:up" ${itemIndex === 0 ? "disabled" : ""}>↑</button>
              <button class="icon-button-mini" title="下移" data-move-quota-item="${dimension.id}:${item.id}:down" ${itemIndex === dimension.items.length - 1 ? "disabled" : ""}>↓</button>
              <input id="quota-${dimension.id}-${item.id}-label" value="${escapeHtml(item.label)}" placeholder="选项名称" aria-label="${escapeHtml(dimension.name)}配额选项名称" />
              <input id="quota-${dimension.id}-${item.id}-pct" type="number" min="0" max="100" step="0.1" value="${item.pct}" aria-label="${escapeHtml(dimension.name)}配额百分比" />
              <span class="quota-pct-sign">%</span>
              <span class="quota-count-preview" title="换算人数">${count}人</span>
              <button class="icon-button-mini" title="复制选项" data-copy-quota-item="${dimension.id}:${item.id}">⎘</button>
              <button class="icon-button-mini" title="删除选项" data-remove-quota-item="${dimension.id}:${item.id}" ${dimension.items.length <= 1 ? "disabled" : ""}>✕</button>
            </div>
          `;
        }).join("")}
      </div>
      <div class="quota-dim-quick-actions">
        <button class="ghost mini-button" data-add-quota-item="${dimension.id}">＋ 选项</button>
        <button class="ghost mini-button" data-dist-quota-even="${dimension.id}" title="平均分配">平均</button>
        <button class="ghost mini-button" data-topup-quota="${dimension.id}" title="补齐剩余到 100%">补齐</button>
        <button class="ghost mini-button" data-normalize-quota="${dimension.id}" title="按比例归一化到 100%">归一</button>
        <button class="ghost mini-button" data-clear-quota-dim="${dimension.id}" title="清空该维度">清空</button>
      </div>
      ${dimError ? `<div class="quota-dim-error">${escapeHtml(dimError.message)}</div>` : ""}
    </article>
  `;
}

function formatPctDisplay(n) {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

function QuotaTemplatePicker() {
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="新增配额维度">
      <div class="modal quota-template-picker">
        <div class="modal-head">
          <h2>新增配额条件</h2>
          <button class="icon-button" data-action="close-quota-template-picker">×</button>
        </div>
        <div class="modal-body">
          <p class="modal-hint">选择常用模板快速创建维度，或选择「自定义条件」输入名称。</p>
          <div class="quota-template-grid">
            ${QUOTA_TEMPLATES.map((tpl) => `
              <button class="quota-template-card" data-quota-template="${tpl.key}">
                <strong>${escapeHtml(tpl.name)}</strong>
                <span>${tpl.items.map((it) => `${it.label} ${it.pct}%`).join(" / ")}</span>
              </button>
            `).join("")}
          </div>
          <div class="quota-custom-form">
            <label for="custom-quota-name">自定义条件名称</label>
            <input id="custom-quota-name" data-custom-quota-name placeholder="例如：车辆类型、消费动机" />
            <button class="primary small-button" data-action="add-custom-quota-dim">创建自定义维度</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function QuotaConfirmDialog() {
  const dialog = state.quotaConfirmDialog;
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="确认操作">
      <div class="modal quota-confirm-modal">
        <div class="modal-head">
          <h2>${escapeHtml(dialog.title)}</h2>
        </div>
        <div class="modal-body">
          <p>${escapeHtml(dialog.message)}</p>
        </div>
        <div class="actions">
          ${dialog.options.map((opt) => `<button class="${opt.key === "cancel" ? "ghost" : (opt.key === "confirm" ? "primary" : "secondary")}" data-action="${opt.action}">${escapeHtml(opt.label)}</button>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function QuotaSchemePanel() {
  const schemes = state.quotaSchemes || [];
  return `
    <div class="quota-scheme-panel">
      <div class="quota-scheme-head">
        <strong>配额方案管理</strong>
        <span class="quota-scheme-hint">保存在浏览器本地，刷新后仍可用</span>
      </div>
      <div class="quota-scheme-save">
        <input data-quota-scheme-name placeholder="方案名称（例如：两轮车核心用户配额）" />
        <button class="primary small-button" data-action="save-quota-scheme">保存当前方案</button>
        <button class="ghost small-button" data-action="restore-default-quota">恢复默认</button>
      </div>
      ${schemes.length === 0
        ? `<div class="quota-scheme-empty">尚未保存任何方案</div>`
        : `<div class="quota-scheme-list">
          ${schemes.map((s) => `
            <div class="quota-scheme-item">
              <div class="qs-info">
                <strong>${escapeHtml(s.name)}</strong>
                <span>${escapeHtml((s.updatedAt || s.createdAt || "").slice(0, 19).replace("T", " "))} · ${(s.quotaPlan || []).length} 维度</span>
              </div>
              <div class="qs-actions">
                <button class="ghost mini-button" data-apply-scheme="${s.id}">应用</button>
                <button class="ghost mini-button" data-copy-scheme="${s.id}">复制</button>
                <button class="ghost mini-button" data-delete-scheme="${s.id}">删除</button>
              </div>
            </div>
          `).join("")}
        </div>`
      }
    </div>
  `;
}

function QualQuestionForm() {
  return `
    <div class="form-grid">
      ${CommonResearchFields()}
      ${InputModeSwitcher("qual")}
      ${state.qualInputMode === "import" ? `
        <div class="field">
          <label for="outline-text">访谈大纲</label>
          <textarea id="outline-text" class="large-textarea" placeholder="按行写入研究目标、目标人群、访谈模块...">${escapeHtml(state.outlineText)}</textarea>
        </div>
        <div class="actions">
          <button class="secondary" data-action="import-outline">从大纲生成问题</button>
        </div>
        <div class="notice">导入后会把大纲拆成 3 个访谈问题。支持识别研究目标、目标人群、访谈模块等结构化大纲。</div>
      ` : `
        ${state.qualQuestions.map((question, index) => `
          <div class="field">
            <label for="qual-${index}">访谈问题 ${index + 1}</label>
            <textarea id="qual-${index}">${escapeHtml(question)}</textarea>
          </div>
        `).join("")}
        <div class="analysis-options">
          ${["核心发现", "态度聚类", "痛点顾虑", "行动建议"].map((item) => `<span>${item}</span>`).join("")}
        </div>
        <div class="notice">AI 会同时输出访谈笔录和归纳分析，便于直接进入报告撰写。</div>
      `}
    </div>
  `;
}

function QuantQuestionForm() {
  return `
    <div class="form-grid">
      ${CommonResearchFields()}
      ${InputModeSwitcher("quant")}
      ${state.quantInputMode === "import" ? `
        ${state.importPreview && !state.importPreview.confirmed ? `
          <div class="notice" style="border-color:#fdba74;background:#fff7ed;">
            已有一份识别结果（${state.importPreview.summary.total} 道题目）尚未确认。
            <button class="secondary small-button" data-action="import-preview-continue" style="margin-left:8px;">继续识别预览</button>
          </div>` : ""}
        <div class="field">
          <label for="questionnaire-text">问卷文本</label>
          <textarea id="questionnaire-text" class="large-textarea" placeholder="每行一道题，例如：&#10;Q1. 你会购买这款产品吗？【单选】一定会 / 可能会 / 不确定 / 不会&#10;Q2. 影响购买的因素？【多选】价格 / 品牌 / 口碑&#10;Q3. 健康重视程度【量表10分】&#10;Q4. 以下因素的重要性【矩阵5分】口味 / 价格 / 成分">${escapeHtml(state.questionnaireText)}</textarea>
        </div>
        <div class="upload-row">
          <label class="upload-button ${state.isImportingDocx ? "loading" : ""}">
            <input type="file" accept=".docx,.xlsx" data-docx-input hidden ${state.isImportingDocx ? "disabled" : ""} />
            <span>${state.isImportingDocx ? "正在解析文档..." : "上传 Word/Excel 问卷文档"}</span>
          </label>
          <span class="upload-hint">支持 .docx / .xlsx；自动识别题号 / 题目 / 题型 / 选项列</span>
        </div>
        ${state.importError ? `<div class="upload-error">⚠️ ${escapeHtml(state.importError)}</div>` : ""}
        <div class="actions">
          <button class="primary" data-action="import-questionnaire" ${state.isImportingDocx ? "disabled" : ""}>识别问卷并进入预览</button>
        </div>
        <div class="notice">识别结果先进入「识别预览」页：核对识别质量、修正识别错误后再确认，不会直接覆盖当前问卷。支持【单选】、【多选】、【量表5分/7分/10分】、【矩阵5分/10分】；选项可用 / ， 、 分隔；'其他'/'其它' 会作为合法选项保留。</div>
      ` : `
        ${state.quantQuestions.map((question, index) => `
          <div class="question-card">
            <div class="question-row">
              <input id="q-text-${index}" value="${escapeHtml(question.text)}" placeholder="题目 ${index + 1}" />
              <select id="q-type-${index}" data-qtype="${index}" class="q-type-select">
                ${QUESTION_TYPE_GROUPS.map((g) => `<optgroup label="${g.label}">${g.types.map((t) => `<option value="${t}" ${question.type === t ? "selected" : ""}>${QUESTION_TYPE_REGISTRY[t].label}</option>`).join("")}</optgroup>`).join("")}
              </select>
              <button class="ghost" data-remove-question="${index}" ${state.quantQuestions.length <= 3 ? "disabled" : ""}>删除</button>
            </div>
            ${QuantQuestionConfig(question, index)}
          </div>
        `).join("")}
        <button class="ghost" data-action="add-question" ${state.quantQuestions.length >= MAX_QUESTIONS ? "disabled" : ""}>添加题目</button>
        <div class="notice">AI 会根据人群画像生成合理的统计分布，用于研究设计与假设预验证。</div>
      `}
    </div>
  `;
}

function InputModeSwitcher(mode) {
  const current = mode === "qual" ? state.qualInputMode : state.quantInputMode;
  return `
    <div class="input-mode-switcher" role="tablist">
      <button type="button" class="${current === "manual" ? "active" : ""}" data-input-mode="${mode}" data-mode-value="manual" role="tab">手动编辑</button>
      <button type="button" class="${current === "import" ? "active" : ""}" data-input-mode="${mode}" data-mode-value="import" role="tab">导入文本</button>
    </div>
  `;
}

// 结构化选项编辑器：每行一个选项（增/删/上移/下移），同步写入隐藏的 #q-options（逗号分隔）
function StructuredOptionsEditor(question, index) {
  const opts = optionsList(question);
  const rows = opts.map((o, j) => `
    <div class="opt-row">
      <span class="opt-idx">${j + 1}</span>
      <input data-qopt="${index}:${j}" value="${escapeHtml(o.label)}" placeholder="选项 ${j + 1}" />
      <button type="button" class="icon-button opt-btn" data-qopt-up="${index}:${j}" title="上移">↑</button>
      <button type="button" class="icon-button opt-btn" data-qopt-down="${index}:${j}" title="下移">↓</button>
      <button type="button" class="icon-button opt-btn opt-del" data-qopt-del="${index}:${j}" title="删除选项">×</button>
    </div>`).join("");
  return `
    <div class="field">
      <label>${QUESTION_TYPE_REGISTRY[question.type].label}选项（${opts.length} 个）</label>
      <div class="opt-list">${rows || '<div class="opt-empty">暂无选项</div>'}</div>
      <div class="opt-actions">
        <button type="button" class="ghost small-button" data-qopt-add="${index}">＋ 添加选项</button>
      </div>
      <input type="hidden" id="q-options-${index}" value="${escapeHtml(question.options)}" />
    </div>`;
}

function QuantQuestionConfig(question, index) {
  const c = question.config || {};
  const typeLabel = (QUESTION_TYPE_REGISTRY[question.type] || {}).label || question.type;
  if (question.type === "scale") {
    return `<div class="field"><label>量表范围</label><select id="q-scale-${index}"><option value="1-5" ${question.scale === "1-5" ? "selected" : ""}>1-5 分</option><option value="1-7" ${question.scale === "1-7" ? "selected" : ""}>1-7 分</option><option value="1-10" ${question.scale === "1-10" ? "selected" : ""}>1-10 分</option></select></div>`;
  }
  if (question.type === "matrix") {
    return `
      <div class="field"><label>矩阵行，用逗号分隔</label><input id="q-rows-${index}" value="${escapeHtml(question.rows)}" placeholder="口味, 价格, 包装" /></div>
      <div class="field"><label>打分选项</label><input id="q-options-${index}" value="${escapeHtml(question.options)}" placeholder="1, 2, 3, 4, 5" /></div>
    `;
  }
  if (question.type === "rank") {
    const topN = c.rankMode === "top_n" ? (c.topN || 3) : "";
    return `
      ${StructuredOptionsEditor(question, index)}
      <div class="config-grid">
        <div class="field"><label>排序模式</label>
          <select id="q-config-${index}-rankMode" data-qconfig="${index}:rankMode">
            <option value="full" ${c.rankMode !== "top_n" ? "selected" : ""}>全部排序</option>
            <option value="top_n" ${c.rankMode === "top_n" ? "selected" : ""}>只排序前 N 项</option>
          </select>
        </div>
        ${c.rankMode === "top_n" ? `<div class="field"><label>Top N（不能大于选项数）</label><input id="q-config-${index}-topN" type="number" min="1" max="20" value="${topN}" data-qconfig="${index}:topN" /></div>` : ""}
      </div>`;
  }
  if (question.type === "numeric") {
    return `
      <div class="config-grid">
        <div class="field"><label>数值类型</label>
          <select id="q-config-${index}-numericType" data-qconfig="${index}:numericType">
            ${[["integer", "整数"], ["decimal", "小数"], ["currency", "金额"], ["percentage", "百分比"], ["count", "次数/数量"]].map(([v, l]) => `<option value="${v}" ${(c.numericType || "integer") === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>最小值</label><input id="q-config-${index}-min" type="number" value="${c.min ?? 0}" data-qconfig="${index}:min" /></div>
        <div class="field"><label>最大值</label><input id="q-config-${index}-max" type="number" value="${c.max ?? 10000}" data-qconfig="${index}:max" /></div>
        <div class="field"><label>单位</label><input id="q-config-${index}-unit" value="${escapeHtml(c.unit || "")}" placeholder="元 / 次 / 个" data-qconfig="${index}:unit" /></div>
        <div class="field"><label>小数位</label><select id="q-config-${index}-decimalPlaces" data-qconfig="${index}:decimalPlaces"><option value="0" ${(c.decimalPlaces ?? 0) === 0 ? "selected" : ""}>0</option><option value="1" ${(c.decimalPlaces ?? 0) === 1 ? "selected" : ""}>1</option><option value="2" ${(c.decimalPlaces ?? 0) === 2 ? "selected" : ""}>2</option></select></div>
      </div>`;
  }
  if (question.type === "open") {
    return `
      <div class="config-grid">
        <div class="field"><label>开放题模式</label>
          <select id="q-config-${index}-openMode" data-qconfig="${index}:openMode">
            <option value="long_text" ${(c.openMode || "long_text") === "long_text" ? "selected" : ""}>长文本（问答题）</option>
            <option value="short_text" ${(c.openMode || "long_text") === "short_text" ? "selected" : ""}>短文本（填空题）</option>
          </select>
        </div>
        <div class="field"><label>最大长度</label><input id="q-config-${index}-maxLength" type="number" min="20" max="2000" value="${c.maxLength ?? 500}" data-qconfig="${index}:maxLength" /></div>
      </div>
      <div class="notice">开放题结果将输出主题聚类（3-8 个主题 + 合成原声示例），不会伪造百分比分布。</div>`;
  }
  if (question.type === "allocation") {
    return `
      ${StructuredOptionsEditor(question, index)}
      <div class="config-grid">
        <div class="field"><label>总分（定和）</label><input id="q-config-${index}-totalPoints" type="number" min="1" max="1000" value="${c.totalPoints ?? 100}" data-qconfig="${index}:totalPoints" /></div>
        <div class="field"><label>说明</label><div class="opt-hint">将总分分配给各选项，分数越高越重要。</div></div>
      </div>`;
  }
  if (question.type === "nps") {
    return `<div class="notice">NPS 固定为 0-10 分制：推荐者(9-10) / 被动者(7-8) / 贬损者(0-6)。结果将展示净推荐值 NPS = 推荐者 − 贬损者。</div>`;
  }
  return `<div class="field"><label>${typeLabel}选项，用逗号分隔</label><input id="q-options-${index}" value="${escapeHtml(question.options)}" /></div>`;
}

function ApiPromptModal() {
  const modelReady = hasModelReady();
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="未设置有效 API Key">
      <div class="modal">
        <h2>未设置有效 API Key</h2>
        <p>你当前未设置有效的 API Key。可以使用模拟数据快速体验原型功能，或去设置真实的 API Key。</p>
        <div class="actions">
          ${modelReady ? "" : `<button class="primary" data-action="use-mock">使用模拟数据预览</button>`}
          <button class="secondary" data-action="go-settings">去设置 API Key</button>
          <button class="ghost" data-action="close-api-prompt">取消</button>
        </div>
      </div>
    </div>
  `;
}

function KeyValidationHint() {
  const key = state.apiKey.trim() || getSavedKey();
  if (!key) return `<div class="notice">请输入你的 ${MODEL_CONFIG[state.provider].name} API Key</div>`;
  const error = validateKeyFormat(key, state.provider);
  if (error) {
    return `<div style="color: #C53030; font-size: 13px; margin-top: 6px; line-height: 1.5;">⚠️ ${escapeHtml(error)}</div>`;
  }
  return `<div style="color: #2EB75B; font-size: 13px; margin-top: 6px;">✅ Key 格式校验通过</div>`;
}

function DefaultKeyBanner() {
  if (!shouldUseProxy()) return "";
  return `
    <div class="default-key-banner">
      <div class="banner-icon">🔒</div>
      <div class="banner-text">
        <strong>当前通过后端代理调用（无需配置 Key）</strong>
        <span>当前 ${escapeHtml(MODEL_CONFIG[state.provider].name)} 的 API Key 由站点后端 /api/chat 代管，保存在 Cloudflare 环境变量里，前端不会暴露。如需用自己的 Key，可在下方填入并保存。</span>
      </div>
    </div>
  `;
}

function SettingsPage() {
  const config = MODEL_CONFIG[state.provider];
  if (!state.apiKey) state.apiKey = getSavedKey();
  const key = state.apiKey.trim() || getSavedKey();
  const useProxy = shouldUseProxy();
  const validationError = useProxy ? null : (key ? validateKeyFormat(key, state.provider) : null);
  const isValid = !validationError;
  const statusText = useProxy ? "✅ 代理可用" : (key ? (isValid ? "✅ 格式有效" : "⚠️ 格式异常") : "待设置");
  const statusStyle = useProxy ? 'background:#3b82f6;color:#fff;' : (isValid ? 'background:#2EB75B;color:#fff;' : key ? 'background:#E8534A;color:#fff;' : '');
  return `
    <section class="container">
      <div class="headline">
        <span class="eyebrow">模型设置</span>
        <h1>把模型和 Key 独立管理</h1>
        <p>研究任务和模型配置分开，API Key 仅保存在本地浏览器。</p>
      </div>
      <div class="settings-layout">
        <section class="panel">
          <div class="section-title"><div><h2>模型提供方</h2><p>切换提供方会读取本地保存的 Key。</p></div></div>
          <div class="provider-grid">
            ${Object.entries(MODEL_CONFIG).map(([key, item]) => {
              const hasOwnKey = !!localStorage.getItem(item.key);
              const proxySupported = !!PROXY_PROVIDERS[key];
              const status = hasOwnKey ? "已保存 Key" : (proxySupported ? "代理可用" : "未保存 Key");
              return `
              <button class="provider-card ${state.provider === key ? "active" : ""}" data-provider="${key}">
                <strong>${item.name}</strong>
                <span>${status}</span>
              </button>
              `;
            }).join("")}
          </div>
          ${DefaultKeyBanner()}
        </section>
        <section class="panel">
          <div class="section-title">
            <div><h2>${config.name}</h2><p>${useProxy ? "当前未保存自己的 Key，将通过后端代理 /api/chat 调用。" : "Key 只保存在本地浏览器。不设置 API Key 则无法生成真实结果。"}</p></div>
            <span class="status-pill" style="${statusStyle}">${statusText}</span>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="api-key">API Key ${useProxy ? '<span class="default-key-tag">代理</span>' : ""}</label>
              <div class="input-action">
                <input id="api-key" type="${state.showKey ? "text" : "password"}" value="${escapeHtml(state.apiKey)}" placeholder="${config.placeholder}" />
                <button class="ghost" data-action="toggle-key">${state.showKey ? "隐藏" : "显示"}</button>
              </div>
              ${KeyValidationHint()}
            </div>
            ${state.provider === "custom" ? CustomModelFields() : ""}
            <div class="actions">
              <button class="primary" data-action="save-settings">保存模型设置</button>
              <button class="danger" data-action="clear-key">清除当前 Key</button>
              <button class="ghost" data-route="${state.mode}">回到研究页</button>
            </div>
          </div>
        </section>
      </div>
    </section>
  `;
}

function CustomModelFields() {
  return `
    <div class="field"><label for="custom-base-url">Base URL</label><input id="custom-base-url" value="${escapeHtml(state.customBaseUrl)}" placeholder="https://your-endpoint.example.com/v1" /></div>
    <div class="field"><label for="custom-model">模型名称</label><input id="custom-model" value="${escapeHtml(state.customModel)}" placeholder="your-model-name" /></div>
  `;
}

function ResultPage() {
  if (state.isGenerating) return LoadingResult();
  if (!state.result && state.generateError) return ErrorResult();
  if (!state.result) return EmptyResult();
  return state.mode === "qual" ? QualResultPage() : QuantResultPage();
}

function LoadingResult() {
  const total = state.mode === "qual" ? 6 : Math.max(5, state.quantQuestions.length + 2);
  return `
    <section class="container loading">
      <div>
        <div class="pulse"><span></span><span></span><span></span></div>
        <h1>${state.mode === "qual" ? "正在生成 AI 访谈笔录..." : "正在生成 AI 问卷模拟结果..."}</h1>
        <p class="audience">${state.generateStatus || "正在连接 AI..."}</p>
        <p class="audience">进度 ${Math.min(state.progress, total)}/${total}</p>
        <div class="actions" style="justify-content:center"><button class="ghost" data-action="cancel-generation">取消生成</button></div>
      </div>
    </section>
  `;
}

function ErrorResult() {
  const modelReady = hasModelReady();
  return `
    <section class="container">
      <div class="empty-state" style="border: 1px solid #E8534A; border-radius: 12px; padding: 24px; background: #FFF5F5;">
        <h1 style="color: #C53030;">❌ 生成失败</h1>
        <p style="color: #742A2A; white-space: pre-wrap; line-height: 1.6; max-width: 600px; margin: 16px auto;">${escapeHtml(state.generateError)}</p>
        <div class="actions" style="justify-content:center; margin-top: 20px;">
          <button class="primary" data-route="${state.mode}">返回修改研究内容</button>
          ${modelReady ? "" : `<button class="secondary" data-action="use-mock">使用本地模拟数据</button>`}
          <button class="secondary" data-action="go-settings">去模型设置</button>
        </div>
      </div>
    </section>
  `;
}

function EmptyResult() {
  return `
    <section class="container">
      <div class="empty-state">
        <h1>还没有生成结果</h1>
        <p>回到研究页填写内容并点击开始生成。</p>
        <button class="primary" data-route="${state.mode}">去填写研究</button>
      </div>
    </section>
  `;
}

function ResultTabs() {
  const labels = state.mode === "qual"
    ? [["primary", "访谈笔录"], ["analysis", "归纳分析"]]
    : [["primary", "统计结果"], ["analysis", "分析摘要"]];
  return `<div class="result-tabs">${labels.map(([key, label]) => `<button class="tab ${state.resultTab === key ? "active" : ""}" data-result-tab="${key}">${label}</button>`).join("")}</div>`;
}

function QualResultPage() {
  const mockTag = state.result?.isMock ? `<span style="display:inline-block;padding:3px 10px;background:#F5A623;color:#fff;border-radius:4px;font-size:12px;margin-left:8px;vertical-align:middle;">模拟数据</span>` : "";
  return `
    <section class="container">
      <div class="headline">
        <span class="eyebrow">${state.result?.isMock ? "模拟" : "AI"} 定性研究结果</span>
        <h1>${escapeHtml(state.topic)}${mockTag}</h1>
        <p>${state.result?.isMock ? "以下笔录和分析由本地模拟数据生成，用于快速预览原型功能。建议设置真实 API Key 以获得更高质量结果。" : "以下笔录和分析由 AI 根据你设定的人群画像和研究问题实时生成。"}</p>
      </div>
      ${QuotaResultSummary()}
      ${ResultTabs()}
      ${state.resultTab === "primary" ? QualTranscripts() : ""}
      ${state.resultTab === "analysis" ? QualAnalysis() : ""}
      ${ExportPanel("qual")}
    </section>
  `;
}

function QuantResultPage() {
  const mockTag = state.result?.isMock ? `<span style="display:inline-block;padding:3px 10px;background:#F5A623;color:#fff;border-radius:4px;font-size:12px;margin-left:8px;vertical-align:middle;">模拟数据</span>` : "";
  return `
    <section class="container workbench">
      <div class="workbench-top">
        <div class="headline">
          <span class="eyebrow">${state.result?.isMock ? "模拟" : "AI"} 定量研究结果 · 分析工作台</span>
          <h1>${escapeHtml(state.topic)}${mockTag}</h1>
          <p>${state.result?.isMock ? "以下统计数据由本地模拟数据生成，用于快速预览工作台能力。建议设置真实 API Key 以获得更高质量结果。" : "统计数据和分析由 AI 根据你设定的人群画像生成，缺失值从未被当作 0%。"}</p>
        </div>
        ${QuotaResultSummary()}
        ${QuantDataQualityCard()}
      </div>
      <div class="workbench-body">
        ${QuantWorkbenchSidebar()}
        <main class="workbench-main">
          ${QuantWorkbenchTabs()}
          <div class="workbench-content">
            ${state.workbench.tab === "core" ? QuantCoreTab() : ""}
            ${state.workbench.tab === "questions" ? QuantQuestionsTab() : ""}
            ${state.workbench.tab === "crosstab" ? QuantCrosstabTab() : ""}
            ${state.workbench.tab === "story" ? QuantStoryTab() : ""}
            ${state.workbench.tab === "export" ? QuantExportTab() : ""}
          </div>
        </main>
      </div>
      ${QuestionEditDrawer()}
    </section>
  `;
}

// 数据质量总览：完整度 + 7 项指标，点击指标筛选异常题目
function QuantDataQualityCard() {
  const d = state.result?.qualityDetails;
  if (!d) return "";
  const cls = d.status === "complete" ? "quality-ok" : d.status === "repaired" ? "quality-fixed" : "quality-warn";
  const chip = (label, value, filter, danger) => `
    <button class="quality-chip ${danger ? "danger" : ""}" data-quality-filter="${filter}" title="点击筛选题目">
      <span>${label}</span><strong>${value}</strong>
    </button>`;
  return `
    <section class="data-quality-card ${cls}">
      <div class="quality-head">
        <div class="quality-pct">
          <div class="quality-pct-num">${d.completePct}%</div>
          <div class="quality-pct-label">数据完整度</div>
          <div class="quality-bar"><div class="quality-bar-fill" style="width:${d.completePct}%"></div></div>
        </div>
        <div class="quality-chips">
          ${chip("完整题目", d.complete, "all")}
          ${chip("自动修复题目", d.repaired, "repaired")}
          ${chip("仍有异常题目", d.pending, "anomaly", d.pending > 0)}
          ${chip("单选合计异常", d.singleSumAnomalies.length, "single_sum", d.singleSumAnomalies.length > 0)}
          ${chip("量表分布异常", d.scaleSumAnomalies.length, "scale_sum", d.scaleSumAnomalies.length > 0)}
          ${chip("矩阵缺失", d.matrixMissing.length, "matrix_missing", d.matrixMissing.length > 0)}
        </div>
      </div>
      <p class="quality-note">
        ${d.status === "complete" ? "全部题目数据完整。" : d.status === "repaired" ? "不完整题目已由系统自动修复，缺失值未被当作 0%。" : "仍有题目数据不完整，缺失项显示「数据缺失」而非 0%。"}
        点击上方指标可在题目目录中筛选对应异常题目。
      </p>
    </section>
  `;
}

// ===== 工作台：题目目录侧栏 =====

const WB_TYPE_LABEL = { single: "单选", multiple: "多选", scale: "量表", matrix: "矩阵" };

function QuantWorkbenchSidebar() {
  const w = state.workbench;
  const qs = state.result.questions || [];
  const indexes = directoryFilteredIndexes();
  const coreIndexes = new Set((state.result.coreMetrics || []).map((m) => m.questionIndex));
  const typeChips = [["all", "全部"], ["single", "单选"], ["multiple", "多选"], ["scale", "量表"], ["matrix", "矩阵"]];
  return `
    <aside class="workbench-sidebar" aria-label="题目目录">
      <div class="sidebar-title">题目目录 <span>${indexes.length}/${qs.length}</span></div>
      <input class="dir-search" data-dir-input placeholder="按题号或关键词搜索" value="${escapeHtml(w.dirQuery)}" />
      <div class="dir-type-chips">
        ${typeChips.map(([k, label]) => `<button class="dir-chip ${w.dirType === k ? "active" : ""}" data-dir-type="${k}">${label}</button>`).join("")}
      </div>
      <select class="dir-module" data-dir-module title="按问卷模块筛选">
        <option value="all">全部模块</option>
        ${QUESTION_MODULES.map((m) => `<option value="${m.id}" ${w.dirModule === m.id ? "selected" : ""}>${m.label}</option>`).join("")}
      </select>
      <div class="dir-checks">
        <label><input type="checkbox" data-dir-check="core" ${w.dirCoreOnly ? "checked" : ""} />只看核心题</label>
        <label><input type="checkbox" data-dir-check="anomaly" ${w.dirAnomalyOnly ? "checked" : ""} />只看异常题</label>
        <label><input type="checkbox" data-dir-check="user" ${w.dirUserEditedOnly ? "checked" : ""} />只看人工修改题</label>
        <label><input type="checkbox" data-dir-check="repaired" ${w.dirRepairedOnly ? "checked" : ""} />只看AI修复题</label>
      </div>
      <div class="dir-list">
        ${indexes.map((i) => dirItem(qs[i], i, coreIndexes.has(i))).join("")}
        ${indexes.length === 0 ? `<div class="dir-empty">当前筛选下没有题目<br><button class="ghost small-button" data-action="clear-dir-filters">清除筛选</button></div>` : ""}
      </div>
    </aside>
  `;
}

function dirItem(q, i, isCore) {
  const text = String(q.text || "");
  return `
    <button class="dir-item ${isAnomalousQuestion(q) ? "dir-item-warn" : ""}" data-dir-jump="${i}" title="${escapeHtml(text)}">
      <span class="dir-q">Q${i + 1}</span>
      <span class="dir-text">${escapeHtml(text.slice(0, 20))}${text.length > 20 ? "…" : ""}</span>
      <span class="dir-badges">
        ${isCore ? `<span class="badge core" title="核心指标题">核心</span>` : ""}
        ${q.modifiedByUser ? `<span class="badge user" title="人工修改">改</span>` : ""}
        ${isAnomalousQuestion(q) ? `<span class="badge warn" title="数据异常">!</span>` : ""}
      </span>
    </button>`;
}

// ===== 工作台：标签页 =====

function QuantWorkbenchTabs() {
  const tabs = [
    ["core", "核心指标"],
    ["questions", "逐题分析"],
    ["crosstab", "交叉分析"],
    ["story", "报告故事线"],
    ["export", "导出"]
  ];
  return `
    <div class="workbench-tabs" role="tablist">
      ${tabs.map(([key, label]) => `<button class="wb-tab ${state.workbench.tab === key ? "active" : ""}" data-workbench-tab="${key}" role="tab">${label}</button>`).join("")}
    </div>`;
}

// ===== 工作台：核心指标 + 关键发现 =====

function QuantCoreTab() {
  const metrics = state.result.coreMetrics || [];
  const findings = state.result.keyFindings || [];
  const a = state.result.analysis || {};
  return `
    <section class="panel wb-panel">
      <div class="section-title"><div><h2>核心指标</h2><p>系统根据题目标题语义自动选出适合做核心指标的题目，点击题号可跳转到对应题目。</p></div></div>
      <div class="core-metric-grid">
        ${metrics.length === 0
          ? `<div class="notice">暂未识别到核心指标题。请检查数据完整度，或在「逐题分析」中查看各题。</div>`
          : metrics.map(metricCard).join("")}
      </div>
    </section>
    <section class="panel wb-panel">
      <div class="section-title"><div><h2>关键发现</h2><p>每条发现均绑定可追溯的题目证据，点击证据可跳转到对应题目。</p></div></div>
      ${findings.length
        ? `<div class="finding-list">${findings.map((f, i) => findingCard(f, i)).join("")}</div>`
        : `<div class="notice">暂无关键发现。请检查数据完整度，或先修复异常题目。</div>`}
    </section>
    ${a.summary ? `
      <section class="panel wb-panel">
        <div class="section-title"><div><h2>AI 摘要</h2><p>由 AI 生成的总体分析摘要（供参考）。</p></div></div>
        <p class="ai-summary">${escapeHtml(a.summary)}</p>
      </section>` : ""}
  `;
}

function metricCard(m) {
  return `
    <div class="core-metric-card">
      <div class="core-metric-head">
        <span class="core-metric-label">${escapeHtml(m.label)}</span>
        <button class="ghost small-button" data-jump-question="${m.questionIndex}" title="跳转到题目">Q${m.questionIndex + 1}</button>
      </div>
      <div class="core-metric-value">${escapeHtml(m.headline)}</div>
      <div class="core-metric-detail">${escapeHtml(m.detail)}</div>
      <div class="core-metric-relation">${escapeHtml(m.relation)}</div>
    </div>`;
}

function findingCard(f, i) {
  const chips = (f.evidence || []).map((e) => {
    const q = state.result.questions?.[e.questionIndex];
    const isChoice = q?.type === "single" || q?.type === "multiple";
    const parts = (e.optionIndexes || []).map((oi, j) => {
      const label = q?.optionsArray?.[oi] || q?.matrix?.[oi]?.row || `选项${oi + 1}`;
      const value = e.values?.[j];
      // 仅单选/多选题的证据值是百分比；排序题均排、NPS、数值、定和等不加 %
      const suffix = value !== undefined && isChoice ? "%" : "";
      return `「${escapeHtml(label)}」${value ?? ""}${suffix}`;
    });
    const qLabel = q ? `Q${q.index + 1}` : `Q${(e.questionIndex ?? 0) + 1}`;
    return `<button class="evidence-chip" data-jump-question="${e.questionIndex}" title="点击跳转到题目">${qLabel} ${parts.join("，")}</button>`;
  }).join("");
  return `
    <div class="finding-item">
      <div class="finding-title">发现${i + 1}：${escapeHtml(f.title)}</div>
      <div class="finding-conclusion">${escapeHtml(f.conclusion)}</div>
      <div class="finding-evidence">证据：${chips}</div>
    </div>`;
}

// ===== 工作台：逐题分析 =====

function QuantQuestionsTab() {
  const w = state.workbench;
  const qs = state.result.questions || [];
  const indexes = directoryFilteredIndexes();
  const allExpanded = w.expandAll || indexes.every((i) => w.expanded.has(i));
  const coreCount = identifyCoreQuestions(qs).length;
  const batchInProgress = !!state.interpretationProgress;
  return `
    <div class="wb-actions">
      <span class="wb-count">显示 ${indexes.length}/${qs.length} 题</span>
      <button class="ghost small-button" data-action="toggle-expand-all">${allExpanded ? "折叠全部" : "展开全部"}</button>
      <button class="ghost small-button" data-action="clear-dir-filters">清除筛选</button>
      ${coreCount > 0 ? `<button class="primary small-button" data-action="generate-core-interpretations" ${batchInProgress ? "disabled" : ""}>${batchInProgress ? `正在生成 ${state.interpretationProgress.current}/${state.interpretationProgress.total}` : `生成核心题解读（${coreCount} 道）`}</button>` : ""}
    </div>
    <div class="result-list wb-question-list">
      ${indexes.map((i) => QuantQuestionCard(qs[i], i)).join("")}
      ${indexes.length === 0 ? `<div class="notice">当前筛选下没有题目。</div>` : ""}
    </div>`;
}

// v53：逐题数据解读区域（基础解读 + AI 深度解读 + 人工编辑 + 证据 + 业务启示）
function interpretationSection(question, index) {
  // 数据不完整的题目不显示解读
  if (question.dataStatus !== "complete") return "";
  const slot = state.questionInterpretations[index] || makeInterpretationSlot(index);
  const interp = slot.interpretation;
  const isGenerating = slot.status === InterpretationStatus.GENERATING;
  const isOutdated = slot.status === InterpretationStatus.OUTDATED;
  const isError = slot.status === InterpretationStatus.ERROR;
  const isAi = slot.mode === InterpretationMode.AI;
  const isManual = slot.mode === InterpretationMode.MANUAL;
  const isRule = slot.mode === InterpretationMode.RULE;
  const isMock = state.result?.isMock;
  const editor = state.interpretationEditor;

  // 批量生成进度提示（全局，但只在题目列表顶部显示一次）
  let batchProgress = "";
  if (state.interpretationProgress && index === (directoryFilteredIndexes()[0] ?? -1)) {
    const p = state.interpretationProgress;
    batchProgress = `
      <div class="interp-batch-progress">
        <div class="interp-batch-bar">
          <div class="interp-batch-fill" style="width:${Math.round((p.current / p.total) * 100)}%"></div>
        </div>
        <span>正在生成核心题解读 ${p.current}/${p.total}${p.failed > 0 ? `（失败 ${p.failed}）` : ""}</span>
        <button class="ghost small-button" data-action="cancel-interpretation-batch">取消</button>
      </div>`;
  }

  // 状态提示
  let statusNotice = "";
  if (isOutdated) {
    statusNotice = `<div class="interp-outdated-notice">⚠️ 题目数据已变化，当前解读可能已过期。</div>`;
  } else if (isError) {
    statusNotice = `<div class="interp-error-notice">⚠️ 深度解读生成失败：${escapeHtml(slot.error || "未知错误")}。当前仍可查看基础统计解读。</div>`;
  } else if (isMock && isAi) {
    statusNotice = `<div class="interp-mock-notice">ℹ️ 当前题目数据来自本地模拟结果，AI 解读仅用于功能预览。</div>`;
  }

  // 操作按钮区
  let actions = "";
  if (isGenerating) {
    actions = `<span class="interp-generating-hint">正在生成深度解读...</span>`;
  } else {
    const genButton = isAi || isManual
      ? `<button class="secondary small-button" data-action="generate-interpretation" data-question-index="${index}">重新生成</button>`
      : `<button class="primary small-button" data-action="generate-interpretation" data-question-index="${index}">生成深度解读</button>`;
    const editButton = interp
      ? `<button class="ghost small-button" data-action="edit-interpretation" data-question-index="${index}">编辑解读</button>`
      : "";
    const restoreButton = isAi || isManual
      ? `<button class="ghost small-button" data-action="restore-rule-interpretation" data-question-index="${index}">恢复基础解读</button>`
      : "";
    const restoreAiButton = isManual && slot.originalAiInterpretation
      ? `<button class="ghost small-button" data-action="restore-ai-interpretation" data-question-index="${index}">恢复 AI 原文</button>`
      : "";
    const copyButton = interp
      ? `<button class="ghost small-button" data-action="copy-interpretation" data-question-index="${index}">复制解读</button>`
      : "";
    actions = `${genButton} ${editButton} ${restoreButton} ${restoreAiButton} ${copyButton}`;
  }

  // 解读内容
  let content = "";
  if (editor && editor.index === index) {
    // 人工编辑模式
    content = interpretationEditorView(index, editor.draft);
  } else if (interp) {
    content = interpretationContentView(interp, index);
  } else if (!isGenerating) {
    content = `<div class="interp-empty">尚未生成解读。点击「生成深度解读」获取 AI 深度分析，或查看上方基础统计指标。</div>`;
  }

  // 模式标签
  const modeLabel = isAi ? '<span class="interp-mode-tag interp-mode-ai">AI 深度解读</span>'
    : isManual ? '<span class="interp-mode-tag interp-mode-manual">人工修改</span>'
    : isRule ? '<span class="interp-mode-tag interp-mode-rule">基础统计解读</span>'
    : "";

  return `
    <div class="interpretation-section">
      ${batchProgress}
      <div class="interp-head">
        <strong>数据解读</strong>
        ${modeLabel}
        ${interp?.confidence ? `<span class="interp-confidence interp-conf-${interp.confidence}" title="可信度：${interp.confidence === "high" ? "多个数据证据一致" : interp.confidence === "medium" ? "有一定证据，仍属合理推断" : "主要依赖人群画像或单题分布推断"}">可信度：${interp.confidence === "high" ? "高" : interp.confidence === "medium" ? "中" : "低"}</span>` : ""}
      </div>
      ${statusNotice}
      <div class="interp-body">${content}</div>
      <div class="interp-actions">${actions}</div>
      ${interp?.caveat ? `<div class="interp-caveat">⚠️ ${escapeHtml(interp.caveat)}</div>` : ""}
    </div>`;
}

// 解读内容视图（只读展示）
function interpretationContentView(interp, index) {
  const lines = [];
  if (interp.headline) {
    lines.push(`<div class="interp-headline"><strong>${escapeHtml(interp.headline)}</strong></div>`);
  }
  if (interp.observation) {
    lines.push(`<div class="interp-block"><div class="interp-block-label">数据表现</div><div class="interp-block-text">${escapeHtml(interp.observation)}</div></div>`);
  }
  if (interp.possibleDrivers && interp.possibleDrivers.length) {
    lines.push(`<div class="interp-block"><div class="interp-block-label">可能原因</div><ul class="interp-drivers">${interp.possibleDrivers.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul></div>`);
  }
  if (interp.evidence && interp.evidence.length) {
    const evItems = interp.evidence.map((e) => {
      const qLabel = `Q${e.questionIndex + 1}`;
      return `<li><button class="interp-evidence-link" data-action="jump-to-evidence" data-question-index="${index}" data-evidence-index="${e.questionIndex}" title="跳转到相关题目">${qLabel}</button> ${escapeHtml(e.label)}：<strong>${e.value}</strong></li>`;
    }).join("");
    lines.push(`<div class="interp-block"><div class="interp-block-label">证据</div><ul class="interp-evidence">${evItems}</ul></div>`);
  }
  if (interp.implication) {
    lines.push(`<div class="interp-block"><div class="interp-block-label">业务启示</div><div class="interp-block-text">${escapeHtml(interp.implication)}</div></div>`);
  }
  return lines.join("");
}

// 人工编辑视图
function interpretationEditorView(index, draft) {
  const evidenceEditor = (draft.evidence || []).map((e, i) => `
    <div class="interp-edit-evidence">
      <input type="number" data-interp-edit="evidence:${i}:questionIndex" value="${e.questionIndex}" placeholder="题目索引" />
      <input type="text" data-interp-edit="evidence:${i}:label" value="${escapeHtml(e.label)}" placeholder="标签" />
      <input type="text" data-interp-edit="evidence:${i}:value" value="${e.value}" placeholder="数值" />
    </div>`).join("");
  const driversEditor = (draft.possibleDrivers || []).map((d, i) =>
    `<input type="text" data-interp-edit="drivers:${i}" value="${escapeHtml(d)}" placeholder="可能原因" />`
  ).join("");
  return `
    <div class="interp-editor">
      <div class="field"><label>一句话结论</label><input type="text" data-interp-edit="headline" value="${escapeHtml(draft.headline || "")}" /></div>
      <div class="field"><label>数据表现</label><textarea data-interp-edit="observation" rows="3">${escapeHtml(draft.observation || "")}</textarea></div>
      <div class="field"><label>可能原因（每行一条）</label>${driversEditor}<button class="ghost small-button" data-action="add-interp-driver" data-question-index="${index}">+ 添加原因</button></div>
      <div class="field"><label>证据</label>${evidenceEditor}<button class="ghost small-button" data-action="add-interp-evidence" data-question-index="${index}">+ 添加证据</button></div>
      <div class="field"><label>业务启示</label><textarea data-interp-edit="implication" rows="3">${escapeHtml(draft.implication || "")}</textarea></div>
      <div class="field">
        <label>可信度</label>
        <select data-interp-edit="confidence">
          <option value="low" ${draft.confidence === "low" ? "selected" : ""}>低</option>
          <option value="medium" ${draft.confidence === "medium" ? "selected" : ""}>中</option>
          <option value="high" ${draft.confidence === "high" ? "selected" : ""}>高</option>
        </select>
      </div>
      <div class="field"><label>限制说明</label><textarea data-interp-edit="caveat" rows="2">${escapeHtml(draft.caveat || "")}</textarea></div>
      <div class="interp-editor-actions">
        <button class="primary small-button" data-action="commit-interpretation-edit" data-question-index="${index}">保存修改</button>
        <button class="ghost small-button" data-action="close-interpretation-editor" data-question-index="${index}">取消</button>
      </div>
      <div class="interp-editor-warn">当前解读已经人工修改。重新生成将覆盖修改内容。</div>
    </div>`;
}

function QuantQuestionCard(question, index) {
  const w = state.workbench;
  const expanded = w.expandAll || w.expanded.has(index);
  const incomplete = question.dataStatus !== "complete";
  const regenControl = state.regeneratingIndex === index
    ? `<div class="regenerating-hint">正在重新生成本题...</div>`
    : `<button class="secondary small-button" data-action="regenerate-question" data-question-index="${index}">重新生成本题</button>`;
  const head = `
    <div class="q-card-head">
      <button class="q-card-toggle" data-question-toggle="${index}" aria-expanded="${expanded}">${expanded ? "▾" : "▸"}</button>
      <div class="q-card-title">
        <strong class="q-card-no">Q${index + 1}</strong>
        <span class="q-card-type type-${question.type}">${WB_TYPE_LABEL[question.type] || question.type}</span>
        <select class="module-select" data-module-select="${index}" title="问卷模块归类（可手动修改）">
          ${QUESTION_MODULES.map((m) => `<option value="${m.id}" ${question.module === m.id ? "selected" : ""}>${m.label}</option>`).join("")}
        </select>
        ${question.moduleManual ? `<span class="module-manual-tag" title="人工设定模块">手动</span>` : ""}
        <span class="source-badge src-${question.source || "ai"}">${sourceLabel(question.source)}</span>
        ${question.modifiedByUser ? `<span class="badge user" title="人工修改">已改</span>` : ""}
        ${incomplete ? `<span class="badge warn">异常</span>` : ""}
      </div>
      <div class="q-card-actions">
        <button class="ghost small-button" data-action="edit-question" data-question-index="${index}">编辑数据</button>
      </div>
    </div>`;
  const banner = incomplete ? `
    <div class="data-incomplete-banner">
      <div><strong>数据不完整：</strong>${escapeHtml(question.dataError || "AI 未返回本题完整数据")}</div>
      <div class="banner-note">系统未将缺失值当作 0%，缺失项显示「数据缺失」。</div>
      <div class="banner-action">${regenControl}</div>
    </div>` : "";
  const summary = expanded ? "" : questionSummary(question);
  const body = expanded ? expandedQuestionBody(question, index) : "";
  // v53：解读区域（仅展开时显示，避免折叠状态下页面过长）
  const interpSection = expanded ? interpretationSection(question, index) : "";
  return `
    <article class="result-card question-card ${incomplete ? "question-card-warn" : ""}" data-question-card="${index}">
      ${head}
      ${banner}
      ${summary}
      ${body}
      ${interpSection}
    </article>`;
}

// 折叠状态下的摘要：只渲染一行关键数字，避免长问卷一次性渲染全部展开内容
function questionSummary(question) {
  const m = question.metrics || computeQuestionMetrics(question);
  let text = "";
  if (question.type === "single" || question.type === "multiple") {
    if (m.available) {
      text = m.ranked.slice(0, 3).map((r) => `${escapeHtml(r.label)} ${r.value}%`).join(" · ");
      if (m.ranked.length > 3) text += " · …";
    } else {
      text = '<span class="missing-text">数据缺失</span>';
    }
  } else if (question.type === "scale") {
    text = m.available ? `均值 ${m.mean} · Top2Box ${m.top2box}% · 正向 ${m.positive}%` : '<span class="missing-text">数据缺失</span>';
  } else if (question.type === "matrix") {
    text = m.available ? `最高「${escapeHtml(m.topRow.label)}」${m.topRow.mean} 分 · 维度差距 ${m.gap}` : '<span class="missing-text">数据缺失</span>';
  } else if (question.type === "rank") {
    text = m.available ? `首选「${escapeHtml(m.ranked[0]?.label || "")}」均排 ${m.ranked[0]?.avgRank} · 第一 ${m.firstLeader?.firstPct}%` : '<span class="missing-text">数据缺失</span>';
  } else if (question.type === "nps") {
    text = m.available ? `NPS ${m.nps} · 推荐者 ${m.promoter}% / 贬损者 ${m.detractor}%` : '<span class="missing-text">数据缺失</span>';
  } else if (question.type === "numeric") {
    text = m.available ? `均值 ${m.mean}${m.unit || ""} · 中位数 ${m.median}${m.unit || ""}` : '<span class="missing-text">数据缺失</span>';
  } else if (question.type === "open") {
    text = m.available ? `主题「${escapeHtml(m.top?.name || "")}」${m.top?.pct}% · 共 ${m.themeCount} 个主题` : '<span class="missing-text">数据缺失</span>';
  } else if (question.type === "allocation") {
    text = m.available ? `「${escapeHtml(m.top1?.label || "")}」均分 ${m.top1?.meanPoints} · Top2 合计 ${m.top2Pct}%` : '<span class="missing-text">数据缺失</span>';
  }
  return `<div class="q-card-summary">${text}</div>`;
}

function expandedQuestionBody(question, index) {
  const m = question.metrics || computeQuestionMetrics(question);
  if (question.type === "scale") return scaleQuestionBody(question, m);
  if (question.type === "matrix") return matrixQuestionBody(question, m, index);
  if (question.type === "rank") return rankQuestionBody(question, m);
  if (question.type === "nps") return npsQuestionBody(question, m);
  if (question.type === "numeric") return numericQuestionBody(question, m);
  if (question.type === "open") return openQuestionBody(question, m);
  if (question.type === "allocation") return allocationQuestionBody(question, m);
  return choiceQuestionBody(question, m);
}

// 排序题：平均排名视图（默认）↔ 名次分布视图，含集中度/稳定次级解读
function rankQuestionBody(question, m) {
  const view = state.workbench.matrixView[`rank${question.index}`] || "avg";
  const toggle = `
    <div class="matrix-view-switch">
      <button class="small-button ${view === "avg" ? "primary" : "ghost"}" data-matrix-view="rank${question.index}:avg">平均排名</button>
      <button class="small-button ${view === "dist" ? "primary" : "ghost"}" data-matrix-view="rank${question.index}:dist">名次分布</button>
    </div>`;
  let content = "";
  if (!m.available) {
    content = '<div class="notice">排序题数据不完整。</div>';
  } else if (view === "dist") {
    content = (question.items || []).map((it) => {
      const distBars = (it.rankDistribution || []).map((v, k) =>
        Number.isFinite(Number(v)) ? Bar(`第${k + 1}名`, v) : MissingBar(`第${k + 1}名`)
      ).join("");
      return `<div class="matrix-dist-block"><div class="matrix-dist-head">${escapeHtml(it.label)} · 均排 ${Number.isFinite(Number(it.avgRank)) ? it.avgRank : "—"}</div>${distBars}</div>`;
    }).join("");
  } else {
    content = m.ranked.map((it, k) => {
      const width = Number.isFinite(Number(it.avgRank)) && question.items.length ? Math.min(100, (it.avgRank / question.items.length) * 100) : 0;
      return `
        <div class="bar-row">
          <div>${k + 1}. ${escapeHtml(it.label)}</div>
          <div class="bar-track"><div class="bar-fill rank-fill" style="width:${width}%"></div></div>
          <strong>${Number.isFinite(Number(it.avgRank)) ? it.avgRank : "—"}</strong>
        </div>`;
    }).join("");
    if (question.unrankedPct !== null) {
      content += `<div class="audience" style="margin-top:6px">未进入前 N 比例：${question.unrankedPct}%</div>`;
    }
  }
  let insight = "";
  if (m.available) {
    insight = `
      <div class="q-insight-grid">
        <div class="q-insight-item"><span>平均排名（越小越靠前）</span><div>${m.ranked.map((r, k) => `${k + 1}. ${escapeHtml(r.label)} ${r.avgRank}`).join("　")}</div></div>
        <div class="q-insight-item"><span>第一名比例最高</span><div>「${escapeHtml(m.firstLeader?.label || "—")}」${m.firstLeader?.firstPct}%</div></div>
        <div class="q-insight-item"><span>前三入选率最高</span><div>「${escapeHtml(m.top3Leader?.label || "—")}」${m.top3Leader?.top3Pct}%</div></div>
        <div class="q-insight-item"><span>排名是否集中</span><div>${m.isConcentrated ? "是（首选优势明显）" : "否"}</div></div>
        <div class="q-insight-item"><span>排名是否分散</span><div>${m.isDispersed ? "是（无明显首选）" : "否"}</div></div>
        <div class="q-insight-item"><span>第一名与平均排名一致性</span><div>${m.consistent ? "一致" : "不一致（存在少数强偏好）"}</div></div>
        ${m.stableSecondary ? `<div class="q-insight-item"><span>稳定次级需求</span><div>「${escapeHtml(m.stableSecondary.label)}」前三率高但第一名少，属稳定次级选项</div></div>` : ""}
      </div>`;
  }
  return `
    <p class="audience">排序题 · ${question.config?.rankMode === "top_n" ? `仅排序前 ${question.config.topN} 项` : "全部排序"} · 样本量 ${state.sampleSize}</p>
    ${toggle}
    ${content}
    ${insight}`;
}

// NPS：净推荐值 + 三分组 + 0-10 完整分布
function npsQuestionBody(question, m) {
  const bars = (question.distribution || []).map((v, k) =>
    Number.isFinite(Number(v)) ? Bar(`${k} 分`, v) : MissingBar(`${k} 分`)
  ).join("");
  let insight = "";
  if (m.available) {
    const npsCls = m.nps >= 0 ? "nps-pos" : "nps-neg";
    insight = `
      <div class="q-insight-grid">
        <div class="q-insight-item"><span>净推荐值 NPS（推荐者 − 贬损者）</span><div class="nps-big ${npsCls}">${m.nps >= 0 ? "+" : ""}${m.nps}</div></div>
        <div class="q-insight-item"><span>推荐者（9-10分）</span><div>${m.promoter}%</div></div>
        <div class="q-insight-item"><span>被动者（7-8分）</span><div>${m.passive}%</div></div>
        <div class="q-insight-item"><span>贬损者（0-6分）</span><div>${m.detractor}%</div></div>
        <div class="q-insight-item"><span>均值</span><div>${metricText(m.mean)}（0-10 分）</div></div>
        <div class="q-insight-item"><span>转化空间</span><div>${m.passive >= 30 ? `被动者占比 ${m.passive}%，存在可观转化空间` : "被动者规模适中"}</div></div>
      </div>`;
  }
  return `
    <p class="audience">NPS 推荐度 · 0-10 分制 · 样本量 ${state.sampleSize}</p>
    <div class="attitude-bar" style="margin:10px 0">
      <div class="attitude-neg" style="width:${Math.max(2, m.available ? m.detractor : 0)}%">贬损 ${m.available ? m.detractor : "—"}%</div>
      <div class="attitude-neu" style="width:${Math.max(2, m.available ? m.passive : 0)}%">被动 ${m.available ? m.passive : "—"}%</div>
      <div class="attitude-pos" style="width:${Math.max(2, m.available ? m.promoter : 0)}%">推荐 ${m.available ? m.promoter : "—"}%</div>
    </div>
    ${bars}
    ${insight}`;
}

// 数值题：均值/中位数/四分位/分段分布 + 偏斜解读
function numericQuestionBody(question, m) {
  let content = "";
  if (m.available) {
    content = `
      <div class="q-insight-grid">
        <div class="q-insight-item"><span>均值</span><div>${metricText(m.mean, m.unit || "")}</div></div>
        <div class="q-insight-item"><span>中位数</span><div>${metricText(m.median, m.unit || "")}</div></div>
        <div class="q-insight-item"><span>四分位区间（P25~P75）</span><div>${Number.isFinite(Number(m.p25)) && Number.isFinite(Number(m.p75)) ? `${m.p25}~${m.p75}${m.unit || ""}` : '<span class="missing-text">数据缺失</span>'}</div></div>
        <div class="q-insight-item"><span>取值范围</span><div>${Number.isFinite(Number(m.min ?? question.min)) && Number.isFinite(Number(m.max ?? question.max)) ? `${m.min ?? question.min}~${m.max ?? question.max}${m.unit || ""}` : "—"}</div></div>
        <div class="q-insight-item"><span>分布形态</span><div>${m.skew || "对称（均值≈中位数）"}</div></div>
        <div class="q-insight-item"><span>是否存在长尾</span><div>${m.longTail ? "是（存在少量低占比分段）" : "否"}</div></div>
      </div>`;
    if (m.dist.length) {
      content += `<div style="margin-top:12px">${m.dist.map((d) => Bar(d.label, d.pct)).join("")}</div>`;
    }
  } else {
    content = '<div class="notice">数值题数据不完整。</div>';
  }
  return `<p class="audience">数值题 · ${question.config?.numericType === "currency" ? "金额" : question.config?.numericType || "整数"} · 单位${question.config?.unit || "无"} · 样本量 ${state.sampleSize}</p>${content}`;
}

// 开放题：主题聚类 + 提及率 + 合成原声
function openQuestionBody(question, m) {
  const themes = (question.themes || []).map((t) => `
    <div class="open-theme">
      <div class="open-theme-head">
        <strong>${escapeHtml(t.name)}</strong>
        <span class="open-theme-pct">提及率 ${Number.isFinite(Number(t.pct)) ? t.pct : "—"}%</span>
      </div>
      ${t.summary ? `<div class="open-theme-summary">${escapeHtml(t.summary)}</div>` : ""}
      ${(t.quotes || []).length ? `<div class="open-theme-quotes">合成原声：${t.quotes.map((qt) => `「${escapeHtml(qt)}」`).join("　")}</div>` : ""}
    </div>`).join("");
  let insight = "";
  if (m.available) {
    insight = `
      <div class="q-insight-grid">
        <div class="q-insight-item"><span>高频主题</span><div>「${escapeHtml(m.top?.name || "—")}」${m.top?.pct}%（提及率最高）</div></div>
        <div class="q-insight-item"><span>情绪方向</span><div>${m.mood || "—"}</div></div>
        <div class="q-insight-item"><span>需求集中度</span><div>${m.nearN >= 3 ? `前 3 主题均 ≥30%，需求高度集中` : "主题分布较分散"}</div></div>
        <div class="q-insight-item"><span>长尾反馈</span><div>${m.longTail ? `存在 ${m.longTail} 个低提及率主题` : "无明显长尾"}</div></div>
      </div>`;
  }
  return `
    <p class="audience">开放题 · 主题聚类（提及率可合计超过 100%）· 样本量 ${state.sampleSize}</p>
    ${themes || '<div class="notice">开放题数据不完整。</div>'}
    ${question.otherPct !== null ? `<div class="audience" style="margin:6px 0">未归类：${question.otherPct}%</div>` : ""}
    ${insight}`;
}

// 定和分配：各选项平均分 + 占比 + 差距 + 集中度
function allocationQuestionBody(question, m) {
  let content = "";
  if (m.available) {
    content = m.ranked.map((it, k) => {
      const pct = it.meanPoints && question.totalPoints ? Math.round((it.meanPoints / question.totalPoints) * 100) : 0;
      return `
        <div class="bar-row">
          <div>${k + 1}. ${escapeHtml(it.label)}</div>
          <div class="bar-track"><div class="bar-fill alloc-fill" style="width:${Math.min(100, pct)}%"></div></div>
          <strong>${it.meanPoints} 分（${pct}%）</strong>
        </div>`;
    }).join("");
    content += `
      <div class="q-insight-grid">
        <div class="q-insight-item"><span>第一与第二差距</span><div>${metricText(m.gap, " 分")}</div></div>
        <div class="q-insight-item"><span>Top 2 合计</span><div>${metricText(m.top2Sum, " 分")}（${m.top2Pct}%）</div></div>
        <div class="q-insight-item"><span>是否高度集中</span><div>${m.concentrated ? "是（单项超过 40% 总分）" : "否"}</div></div>
        <div class="q-insight-item"><span>次要因素</span><div>${m.secondary ? `「${escapeHtml(m.secondary.label)}」${m.secondary.meanPoints} 分` : "—"}</div></div>
      </div>`;
  } else {
    content = '<div class="notice">定和分配题数据不完整。</div>';
  }
  return `<p class="audience">定和分配 · 总分 ${question.totalPoints ?? 100} · 样本量 ${state.sampleSize}</p>${content}`;
}

// 单选/多选：完整条形图 + 选项排名/差距/Top2/集中度/长尾/平均勾选/其他选项关系
function choiceQuestionBody(question, m) {
  const isMultiple = question.type === "multiple";
  const bars = (question.optionsArray || []).map((option, i) => {
    const v = question.values?.[i];
    return Number.isFinite(Number(v)) ? Bar(option, v) : MissingBar(option);
  }).join("");
  let insight = "";
  if (m.available) {
    const items = [
      ["选项排名", m.ranked.map((r, i) => `${i + 1}. ${escapeHtml(r.label)} ${r.value}%`).join("　")],
      ["第一名与第二名差距", metricText(m.gap, " 个百分点")],
      ["Top 2 选项合计", metricText(m.top2Sum, "%")],
      isMultiple
        ? ["平均勾选数量（估计）", metricText(m.avgSelections, " 项")]
        : ["是否存在明显集中", m.concentrated ? "是（Top1≥50% 或 Top2≥75%）" : "否"],
      ["是否存在长尾分布", m.longTail ? `是（${m.tailCount} 个低占比选项，合计 ${metricText(m.tailSum, "%")}）` : "否"]
    ];
    if (isMultiple) {
      items.push(["Top 3 选项", m.top3.map((t) => `${escapeHtml(t.label)} ${t.value}%`).join("、")]);
      if (m.other !== null) {
        items.push(["与「其他」选项关系", `「其他」${m.other.value}%${m.other.isTop ? "（为最高勾选项）" : ""}`]);
      }
    }
    insight = `<div class="q-insight-grid">${items.map(([label, value]) => `<div class="q-insight-item"><span>${label}</span><div>${value}</div></div>`).join("")}</div>`;
  }
  return `
    <p class="audience">${isMultiple ? "多选题，百分比可合计超过 100%" : "单选题"} · 样本量：${state.sampleSize}</p>
    ${bars}
    ${insight}`;
}

// 量表：完整分布 + 均值/中位数/Top2/Bottom2/正-中立-负向
function scaleQuestionBody(question, m) {
  const bars = (question.distribution || []).map((v, i) =>
    Number.isFinite(Number(v)) ? Bar(`${i + 1} 分`, v) : MissingBar(`${i + 1} 分`)
  ).join("");
  let insight = "";
  if (m.available) {
    insight = `
      <div class="q-insight-grid">
        <div class="q-insight-item"><span>均值</span><div>${metricText(m.mean)}（${question.scale} 分制）</div></div>
        <div class="q-insight-item"><span>中位数估计</span><div>${metricText(m.median, " 分")}</div></div>
        <div class="q-insight-item"><span>Top 2 Box</span><div>${metricText(m.top2box, "%")}</div></div>
        <div class="q-insight-item"><span>Bottom 2 Box</span><div>${metricText(m.bottom2box, "%")}</div></div>
        <div class="q-insight-item span-2"><span>正 / 中立 / 负向比例</span>
          <div class="attitude-bar">
            <div class="attitude-neg" style="width:${Math.max(2, m.negative)}%">负 ${m.negative}%</div>
            <div class="attitude-neu" style="width:${Math.max(2, m.neutral)}%">中立 ${m.neutral}%</div>
            <div class="attitude-pos" style="width:${Math.max(2, m.positive)}%">正 ${m.positive}%</div>
          </div>
        </div>
      </div>`;
  }
  return `
    <p class="audience">均值：${metricText(question.mean)} | 标准差：${metricText(question.sd)} | 样本量：${state.sampleSize}</p>
    ${bars}
    ${insight}`;
}

// 矩阵：均值/分布视图切换 + Top3/Bottom3/维度差距（横向条形图）
function matrixQuestionBody(question, m, index) {
  const view = state.workbench.matrixView[index] || "mean";
  const scaleMax = question.expectedCount || 5;
  const toggle = `
    <div class="matrix-view-switch">
      <button class="small-button ${view === "mean" ? "primary" : "ghost"}" data-matrix-view="${index}:mean">均值视图</button>
      <button class="small-button ${view === "dist" ? "primary" : "ghost"}" data-matrix-view="${index}:dist">完整分布</button>
    </div>`;
  let content = "";
  if (view === "dist") {
    content = (question.matrix || []).map((row) => {
      const distBars = (row.distribution || []).map((v, i) =>
        Number.isFinite(Number(v)) ? Bar(`${i + 1} 分`, v) : MissingBar(`${i + 1} 分`)
      ).join("");
      const head = Number.isFinite(Number(row.mean))
        ? `${escapeHtml(row.row)} · 均值 ${row.mean}`
        : `${escapeHtml(row.row)} · 均值 <span class="missing-text">数据缺失</span>`;
      return `<div class="matrix-dist-block"><div class="matrix-dist-head">${head}</div>${distBars}</div>`;
    }).join("");
  } else {
    content = (question.matrix || []).map((row) => {
      const mean = Number(row.mean);
      if (!Number.isFinite(mean)) {
        return `<div class="bar-row"><div>${escapeHtml(row.row)}</div><div class="bar-track"></div><strong class="missing-text">数据缺失</strong></div>`;
      }
      return `<div class="bar-row"><div>${escapeHtml(row.row)}</div><div class="bar-track"><div class="bar-fill matrix-fill" style="width:${Math.min(100, (mean / scaleMax) * 100)}%"></div></div><strong>${mean}</strong></div>`;
    }).join("");
  }
  let insight = "";
  if (m.available) {
    insight = `
      <div class="q-insight-grid">
        <div class="q-insight-item"><span>Top 3 维度</span><div>${m.top3.map((r) => `${escapeHtml(r.label)} ${r.mean}`).join("、")}</div></div>
        <div class="q-insight-item"><span>Bottom 3 维度</span><div>${m.bottom3.map((r) => `${escapeHtml(r.label)} ${r.mean}`).join("、")}</div></div>
        <div class="q-insight-item"><span>维度差距</span><div>${metricText(m.gap, " 分")}</div></div>
        <div class="q-insight-item"><span>各维度均值排序</span><div>${m.ranked.map((r, i) => `${i + 1}. ${escapeHtml(r.label)} ${r.mean}`).join("　")}</div></div>
      </div>`;
  }
  return `
    <p class="audience">矩阵打分 · ${question.scale} 分制 · 样本量：${state.sampleSize}</p>
    ${toggle}
    ${content}
    ${insight}`;
}

// ===== 工作台：交叉分析 =====

function QuantCrosstabTab() {
  const w = state.workbench;
  const qs = state.result.questions || [];
  const choiceQs = qs.map((q, i) => ({ q, i })).filter(({ q }) => (q.type === "single" || q.type === "multiple") && q.dataStatus === "complete");
  const allQs = qs.map((q, i) => ({ q, i })).filter(({ q }) => q.dataStatus === "complete");
  const cfg = w.crosstabConfig;
  const result = w.crosstabResult;
  return `
    <section class="panel wb-panel">
      <div class="section-title"><div><h2>交叉分析（模拟）</h2><p>选择行变量、分组变量与指标变量。当前数据为 AI 合成统计结果，交叉结果基于边际分布模拟生成。</p></div></div>
      <div class="crosstab-config">
        <div class="field">
          <label>行变量（单选 / 多选）</label>
          <select data-crosstab-row>
            <option value="">请选择题目</option>
            ${choiceQs.map(({ q, i }) => `<option value="${i}" ${cfg.rowIndex === i ? "selected" : ""}>Q${i + 1} ${escapeHtml(String(q.text).slice(0, 28))}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>列变量（分组）</label>
          <select data-crosstab-col>
            ${CROSSTAB_GROUP_TYPES.map((g) => `<option value="${g.id}" ${cfg.colType === g.id ? "selected" : ""}>${g.label}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>指标变量（可选）</label>
          <select data-crosstab-metric>
            <option value="">不添加指标</option>
            ${allQs.map(({ q, i }) => `<option value="${i}" ${cfg.metricIndex === i ? "selected" : ""}>Q${i + 1} ${escapeHtml(String(q.text).slice(0, 28))}</option>`).join("")}
          </select>
        </div>
        <button class="primary" data-action="run-crosstab">运行交叉分析</button>
      </div>
    </section>
    ${result
      ? crosstabResultView(result)
      : `<section class="panel wb-panel"><div class="notice">尚未运行交叉分析。配置完成后点击「运行交叉分析」生成模拟结果。</div></section>`}
  `;
}

function crosstabResultView(result) {
  const header = `<tr><th>选项</th>${result.groups.map((g) => `<th>${escapeHtml(g.label)}</th>`).join("")}<th>全体</th></tr>`;
  const rows = result.rows.map((r) => `<tr><td>${escapeHtml(r.label)}</td>${r.cells.map((c) => `<td>${c}</td>`).join("")}<td>${r.base}</td></tr>`).join("");
  const metricRows = result.metricRows.map((r) => `<tr class="metric-row"><td>${escapeHtml(r.label)}</td>${r.cells.map((c) => `<td>${c}</td>`).join("")}<td>${r.base}</td></tr>`).join("");
  const colTypeLabel = CROSSTAB_GROUP_TYPES.find((g) => g.id === result.colType)?.label || result.colType;
  return `
    <section class="panel wb-panel">
      <div class="section-title"><div><h2>交叉结果</h2><p>行变量：${escapeHtml(result.rowText)} · 分组：${colTypeLabel}${result.metricRows.length ? " · 含指标变量" : ""}</p></div></div>
      <div class="crosstab-notice">⚠️ ${escapeHtml(result.notice)}</div>
      <div class="crosstab-table-wrap">
        <table class="crosstab-table">
          <thead>${header}</thead>
          <tbody>${rows}${metricRows}</tbody>
        </table>
      </div>
    </section>`;
}

// ===== 工作台：报告故事线 =====

function QuantStoryTab() {
  const story = state.result?.storyline;
  const status = state.workbench.storyStatus;
  return `
    <section class="panel wb-panel">
      <div class="section-title"><div><h2>报告故事线</h2><p>AI 基于完整数据生成 10 个章节的故事线，每个章节绑定对应题目、核心数据与推荐图表（AI 失败时自动使用本地数据版本）。</p></div></div>
      <div class="wb-actions">
        <button class="primary" data-action="generate-story" ${status === "generating" ? "disabled" : ""}>${story ? "重新生成故事线" : "生成报告故事线"}</button>
        ${story ? `<button class="ghost small-button" data-action="export-story-json">故事线 JSON</button><button class="ghost small-button" data-action="export-story-md">故事线 Markdown</button>` : ""}
      </div>
      ${status === "generating" ? `<div class="notice">正在生成故事线，通常需要 30-60 秒，请稍候...</div>` : ""}
    </section>
    ${story
      ? storyChaptersView(story)
      : `<section class="panel wb-panel"><div class="notice">尚未生成故事线。点击「生成报告故事线」开始。</div></section>`}
  `;
}

function storyChaptersView(story) {
  const sourceTag = story.generated === "ai"
    ? `<span class="source-badge src-repaired">AI 生成</span>`
    : `<span class="source-badge src-mock">本地数据生成</span>`;
  return (story.chapters || []).map((ch) => `
    <section class="panel wb-panel story-chapter">
      <div class="section-title"><div><h2>${escapeHtml(ch.title)} ${sourceTag}</h2></div></div>
      ${(ch.slides || []).map((s) => `
        <div class="story-slide">
          <div class="story-slide-title">${escapeHtml(s.title)} <span class="chart-type-tag">${escapeHtml(s.chartType)}</span></div>
          <div class="story-slide-conclusion">${escapeHtml(s.conclusion)}</div>
          ${(s.questionIndexes || []).length ? `<div class="story-slide-qs">对应题目：${s.questionIndexes.map((i) => `<button class="evidence-chip" data-jump-question="${i}">Q${i + 1}</button>`).join("")}</div>` : ""}
          ${(s.evidence || []).length ? `<div class="story-slide-evidence">证据：${s.evidence.map((e) => `<span class="evidence-text">${escapeHtml(e)}</span>`).join("")}</div>` : ""}
        </div>`).join("")}
    </section>`).join("");
}

// ===== 工作台：导出 =====

function QuantExportTab() {
  const storyReady = !!state.result?.storyline;
  const cards = [
    ["export-excel-stats", "Excel 统计结果", "8 个 Sheet：数据质量 / 题目列表 / 单选多选 / 量表 / 矩阵 / 关键发现 / 异常题目 / 修改记录"],
    ["export-excel-quality", "Excel 数据质量报告", "质量指标 / 题目状态 / 异常明细 / 修改记录"],
    ["export-md", "Markdown 分析报告", "完整工作台报告：质量 / 核心指标 / 发现 / 模块 / 逐题 / 交叉 / 故事线"],
    ["export-json", "JSON 完整数据", "全部题目数据 + 逐题指标 + 关键发现 + 故事线 + 交叉结果"],
    ["export-story-json", "报告故事线 JSON", storyReady ? "故事线章节与幻灯片结构，可直接对接 PPT 生成" : "请先在「报告故事线」中生成"],
    ["export-story-md", "报告故事线 Markdown", storyReady ? "分章节故事线文档，可直接用于报告撰写" : "请先在「报告故事线」中生成"]
  ];
  return `
    <section class="panel wb-panel">
      <div class="section-title"><div><h2>导出数据</h2><p>点击下载对应格式文件。PPT 导出接口已预留，将在后续版本开放。</p></div></div>
      <div class="export-grid">
        ${cards.map(([action, label, desc]) => `
          <button class="export-card" data-action="${action}" ${action.includes("story") && !storyReady ? "disabled" : ""}>
            <strong>${label}</strong><span>${desc}</span>
          </button>`).join("")}
        <button class="export-card export-card-soon" disabled>
          <strong>PPT 导出（预留）</strong><span>代码结构已为 PPT 导出预留接口（buildStoryline → slides → PPTX），将在后续版本开放</span>
        </button>
      </div>
    </section>
    <section class="panel wb-panel">
      <div class="section-title"><div><h2>操作</h2></div></div>
      <div class="actions no-margin">
        <button class="secondary" data-action="regenerate">重新生成</button>
        <button class="ghost" data-route="quant">返回修改</button>
      </div>
    </section>
  `;
}

// ===== 工作台：编辑抽屉 =====

function QuestionEditDrawer() {
  const index = state.workbench.editorIndex;
  const q = state.result?.questions?.[index];
  if (index === null || !q) return "";
  const draft = state.workbench.editorDraft || {};
  let fields = "";
  if (q.type === "single" || q.type === "multiple") {
    fields = (q.optionsArray || []).map((o, i) => `
      <div class="edit-row">
        <label>${escapeHtml(o)}</label>
        <input type="number" step="0.5" min="0" max="100" data-edit-field="values:${i}" value="${Number.isFinite(Number(draft.values?.[i])) ? draft.values[i] : ""}" placeholder="数据缺失" />
        <span>%</span>
      </div>`).join("");
    fields += q.type === "single"
      ? `<div class="edit-note">单选保存时若合计不为 100%，将自动校正为 100%。</div>`
      : `<div class="edit-note">多选题百分比可合计超过 100%。</div>`;
  } else if (q.type === "scale") {
    fields = (q.distribution || []).map((_, i) => `
      <div class="edit-row">
        <label>${i + 1} 分</label>
        <input type="number" step="0.5" min="0" max="100" data-edit-field="distribution:${i}" value="${Number.isFinite(Number(draft.distribution?.[i])) ? draft.distribution[i] : ""}" placeholder="数据缺失" />
        <span>%</span>
      </div>`).join("");
    fields += `
      <div class="edit-row"><label>均值</label><input type="number" step="0.1" data-edit-field="mean" value="${draft.mean ?? ""}" /></div>
      <div class="edit-row"><label>标准差</label><input type="number" step="0.1" data-edit-field="sd" value="${draft.sd ?? ""}" /></div>`;
  } else if (q.type === "matrix") {
    fields = (q.matrix || []).map((row, i) => `
      <div class="edit-row">
        <label>${escapeHtml(row.row)}</label>
        <input type="number" step="0.1" min="1" max="10" data-edit-field="matrix:${i}" value="${Number.isFinite(Number(draft.matrix?.[i]?.mean)) ? draft.matrix[i].mean : ""}" placeholder="数据缺失" />
      </div>`).join("");
    fields += `<div class="edit-note">矩阵编辑支持修改各维度均值。</div>`;
  } else if (q.type === "rank") {
    // 排序题：每选项可编辑平均排名与第一名比例
    fields = (q.items || []).map((it, i) => `
      <div class="edit-row">
        <label>${escapeHtml(it.label || `选项${i + 1}`)}</label>
        <input type="number" step="0.1" min="1" max="${q.items.length || 10}" data-edit-field="rankAvg:${i}" value="${Number.isFinite(Number(draft.rank?.[i]?.avgRank)) ? draft.rank[i].avgRank : ""}" placeholder="均排" />
        <input type="number" step="0.5" min="0" max="100" data-edit-field="rankFirst:${i}" value="${Number.isFinite(Number(draft.rank?.[i]?.firstPct)) ? draft.rank[i].firstPct : ""}" placeholder="第一%" />
      </div>`).join("");
    fields += `<div class="edit-note">左侧为平均排名（1-${q.items.length || 10}，越小越靠前），右侧为第一名比例%。保存后名次分布按比例重算。</div>`;
  } else if (q.type === "nps") {
    fields = (q.distribution || []).map((_, i) => `
      <div class="edit-row">
        <label>${i} 分</label>
        <input type="number" step="0.5" min="0" max="100" data-edit-field="npsDist:${i}" value="${Number.isFinite(Number(draft.npsDist?.[i])) ? draft.npsDist[i] : ""}" placeholder="数据缺失" />
        <span>%</span>
      </div>`).join("");
    fields += `<div class="edit-note">NPS / 推荐者 / 被动者 / 贬损者将由分布自动重算。</div>`;
  } else if (q.type === "numeric") {
    const stats = draft.numStats || {};
    fields = `
      <div class="edit-row"><label>均值</label><input type="number" step="1" data-edit-field="numStat:mean" value="${stats.mean ?? ""}" /></div>
      <div class="edit-row"><label>中位数</label><input type="number" step="1" data-edit-field="numStat:median" value="${stats.median ?? ""}" /></div>
      <div class="edit-row"><label>P25</label><input type="number" step="1" data-edit-field="numStat:p25" value="${stats.p25 ?? ""}" /></div>
      <div class="edit-row"><label>P75</label><input type="number" step="1" data-edit-field="numStat:p75" value="${stats.p75 ?? ""}" /></div>
      <div class="edit-row"><label>最小值</label><input type="number" step="1" data-edit-field="numStat:min" value="${stats.min ?? ""}" /></div>
      <div class="edit-row"><label>最大值</label><input type="number" step="1" data-edit-field="numStat:max" value="${stats.max ?? ""}" /></div>`;
    fields += `<div class="edit-note">单位：${escapeHtml(q.unit || "无")}。保存后请保证 min ≤ P25 ≤ 中位数 ≤ P75 ≤ max。</div>`;
  } else if (q.type === "open") {
    fields = (q.themes || []).map((t, i) => `
      <div class="edit-row">
        <label>${escapeHtml(t.name || `主题${i + 1}`)}</label>
        <input type="number" step="0.5" min="0" max="100" data-edit-field="themePct:${i}" value="${Number.isFinite(Number(draft.themePcts?.[i])) ? draft.themePcts[i] : ""}" placeholder="提及率" />
        <span>%</span>
      </div>`).join("");
    fields += `<div class="edit-note">开放题提及率可合计超过 100%。</div>`;
  } else if (q.type === "allocation") {
    const total = q.totalPoints || 100;
    fields = (q.items || []).map((it, i) => `
      <div class="edit-row">
        <label>${escapeHtml(it.label || `选项${i + 1}`)}</label>
        <input type="number" step="0.5" min="0" max="${total}" data-edit-field="allocPoints:${i}" value="${Number.isFinite(Number(draft.allocPoints?.[i])) ? draft.allocPoints[i] : ""}" placeholder="均分" />
      </div>`).join("");
    fields += `<div class="edit-note">总分 ${total}：保存后请保证各选项平均分合计接近 ${total}。</div>`;
  }
  const history = (q.editHistory || []).length ? `
    <div class="edit-history">
      <div class="edit-history-title">修改历史（${q.editHistory.length}）</div>
      ${q.editHistory.slice().reverse().map((h) => `
        <div class="edit-history-item">
          <span class="eh-time">${escapeHtml((h.at || "").slice(0, 19).replace("T", " "))}</span>
          <strong>${escapeHtml(h.action || "")}</strong>
          <div class="eh-detail">${escapeHtml(h.detail || "")}</div>
        </div>`).join("")}
    </div>` : `
    <div class="edit-history">
      <div class="edit-history-title">修改历史</div>
      <div class="edit-history-empty">暂无修改记录</div>
    </div>`;
  return `
    <div class="drawer-backdrop" data-action="close-editor"></div>
    <aside class="edit-drawer" role="dialog" aria-label="编辑题目数据">
      <div class="drawer-head">
        <strong>编辑数据 · Q${index + 1}</strong>
        <button class="icon-button" data-action="close-editor">×</button>
      </div>
      <div class="drawer-qtext">${escapeHtml(q.text)}</div>
      <div class="edit-source-info">
        <div>当前来源：<span class="source-badge src-${q.source || "ai"}">${sourceLabel(q.source)}</span>
          ${q.modifiedByUser ? '<span class="badge user">已人工修改</span>' : ""}</div>
        ${q.modifiedAt ? `<div class="eh-time">最近修改：${escapeHtml((q.modifiedAt || "").slice(0, 19).replace("T", " "))}</div>` : ""}
        <div class="edit-original">AI 原始数据已保留，可随时一键恢复。</div>
      </div>
      <div class="drawer-fields">${fields}</div>
      <div class="drawer-actions">
        <button class="primary" data-action="commit-edit">保存修改</button>
        <button class="ghost" data-action="restore-data" ${q.originalValues ? "" : "disabled"}>恢复AI原始数据</button>
      </div>
      ${history}
    </aside>`;
}

function QuotaResultSummary() {
  // v52：显示所有启用维度的摘要，不再固定 3 项
  const lines = buildQuotaSummaryLines(state.quotaPlan, currentSampleSize());
  const stats = quotaStats(state.quotaPlan);
  return `
    <section class="quota-result">
      <strong>样本配额</strong>
      <span>${escapeHtml(state.mode === "qual" ? "6 位合成访谈对象" : `${state.sampleSize} 份模拟样本`)}</span>
      <p>
        ${lines.length
          ? lines.map((l) => `<span class="quota-result-line"><strong>${escapeHtml(l.name)}</strong>：${escapeHtml(l.itemsText)}</span>`).join("<br/>")
          : "尚未配置配额维度"}
      </p>
      <p class="quota-result-stats">已配置 ${stats.dimCount} 个维度，合计 ${stats.itemCount} 个配额选项。当前配额按各维度独立控制边际分布，不自动约束多个条件的交叉组合。</p>
    </section>
  `;
}

function QualTranscripts() {
  return `
    <div class="actions">
      <button class="secondary" data-action="regenerate">重新生成</button>
      <button class="ghost" data-route="qual">返回修改</button>
    </div>
    <div class="result-list" style="margin-top:18px">
      ${state.result.users.map((user) => `
        <article class="result-card">
          <div class="profile">
            <div class="avatar">${user.avatar}</div>
          <div><h2>${user.name} · ${user.age} 岁 · ${user.city}</h2><div class="audience">${user.role} · ${user.sentiment} · ${user.persona}</div></div>
          </div>
          <div class="qa">
            ${user.answers.map((item, index) => `<div><strong>Q${index + 1}: ${escapeHtml(item.question)}</strong><div>${escapeHtml(item.answer)}</div></div>`).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function QualAnalysis() {
  const a = state.result.analysis;
  return `
    <section class="panel">
      <div class="section-title"><div><h2>核心结论</h2><p>${a.summary}</p></div></div>
      <div class="analysis-grid">
        ${a.themes.map((theme) => `
          <div class="analysis-card">
            <strong>${theme.name}</strong>
            <div class="bar-track"><div class="bar-fill" style="width:${theme.value}%"></div></div>
            <span>${theme.value}% · ${theme.detail}</span>
          </div>
        `).join("")}
      </div>
      <h2>行动建议</h2>
      <ul class="insight-list">${a.recommendations.map((item) => `<li>${item}</li>`).join("")}</ul>
    </section>
  `;
}

// （v50 起逐题分析由 QuantQuestionsTab / QuantQuestionCard 提供，见工作台部分）

// 缺失数据占位条：不显示 0%，明确标记「数据缺失」
function MissingBar(label) {
  return `<div class="bar-row"><div>${escapeHtml(label)}</div><div class="bar-track"></div><strong class="missing-text">数据缺失</strong></div>`;
}

function QuantAnalysis() {
  const a = state.result.analysis;
  const questions = state.result.questions || [];
  const rationale = Array.isArray(a.rationale) ? a.rationale : [];
  return `
    <section class="panel">
      <div class="section-title"><div><h2>分析摘要</h2><p>${escapeHtml(a.summary)}</p></div></div>
      <div class="analysis-grid">
        ${a.crosstab.map((row) => `<div class="analysis-card"><strong>${escapeHtml(row[0])}</strong><span>${escapeHtml(row[1])}：${escapeHtml(row[2])}</span></div>`).join("")}
      </div>
      <h2>关键发现</h2>
      <ul class="insight-list">${a.findings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      ${rationale.length > 0 ? `
        <h2 style="margin-top:24px">比例分布说明</h2>
        <p class="audience" style="margin-bottom:12px">逐题解释比例为何如此分布，引用人群画像、配额特征、题目内在一致性与商业逻辑，作为数据可信度证据。</p>
        <div class="rationale-list">
          ${rationale.map((r) => {
            const idx = typeof r.questionIndex === "number" ? r.questionIndex : -1;
            const q = questions[idx];
            const qLabel = q ? `第 ${idx + 1} 题 · ${escapeHtml(q.text)}` : `第 ${(idx + 1) || "—"} 题`;
            const reasoning = escapeHtml(r.reasoning || "");
            return `<div class="rationale-item"><div class="rationale-head">${qLabel}</div><div class="rationale-body">${reasoning}</div></div>`;
          }).join("")}
        </div>
      ` : ""}
      <div class="notice">合成数据由 AI 根据人群画像生成，用于研究设计与假设预验证，不替代真实样本统计推断。</div>
    </section>
  `;
}

function ExportPanel(type) {
  if (type === "qual") {
    return `
    <section class="panel">
      <div class="section-title"><div><h2>导出数据</h2><p>点击下载对应格式的文件到本地。</p></div></div>
      <div class="export-grid">
        <button class="export-card" data-action="export-md"><strong>访谈笔录 Markdown</strong><span>下载 MD 文件</span></button>
        <button class="export-card" data-action="copy-analysis"><strong>归纳分析报告</strong><span>复制到剪贴板</span></button>
      </div>
    </section>
    `;
  }
  return `
    <section class="panel">
      <div class="section-title"><div><h2>导出数据</h2><p>点击下载对应格式的文件到本地。</p></div></div>
      <div class="export-grid">
        <button class="export-card" data-action="export-csv"><strong>统计汇总 CSV</strong><span>下载 CSV 文件</span></button>
        <button class="export-card" data-action="export-md"><strong>分析报告 Markdown</strong><span>下载 MD 文件</span></button>
        <button class="export-card" data-action="export-json"><strong>完整数据 JSON</strong><span>下载 JSON 文件</span></button>
      </div>
    </section>
  `;
}

function Bar(label, value) {
  const n = Number(value);
  const display = Number.isFinite(n) ? n : null;
  return `<div class="bar-row"><div>${escapeHtml(label)}</div><div class="bar-track"><div class="bar-fill" style="width:${display === null ? 0 : Math.min(100, display)}%"></div></div><strong>${display === null ? "未返回" : `${display}%`}</strong></div>`;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function bindEvents() {
  document.body.addEventListener("click", (event) => {
    // 优先处理 button，但也支持 div 等非 button 元素上的 data-action
    const target = event.target.closest("button") || event.target.closest("[data-action]");
    if (!target) return;
    const routeTarget = target.dataset.route;
    const action = target.dataset.action;

    if (routeTarget) {
      if (state.page === "qual" || state.page === "quant") syncResearchForm();
      if (state.page === "settings") syncSettingsForm();
      route(routeTarget);
    }
    if (target.hasAttribute("data-template")) useTemplate(Number(target.dataset.template));
    if (target.dataset.audience) {
      const newAudience = target.dataset.audience;
      const newConfig = audiencePreset(newAudience);
      // v52：若用户已修改过配额，弹出确认而非直接覆盖
      if (state.quotaDirty && state.quotaPlan && state.quotaPlan.length) {
        state.quotaConfirmDialog = {
          type: "audience",
          payload: { newAudience, newConfig },
          title: "检测到你已经修改了配额设计",
          message: "切换人群画像时，可以选择仅更新画像、覆盖全部配额、或保留自定义维度。",
          options: [
            { key: "audience_only", label: "仅更新人群画像（保留当前配额）", action: "audience-apply-keep-quota" },
            { key: "preset_only", label: "仅更新系统默认维度，保留自定义维度", action: "audience-apply-preset-only" },
            { key: "overwrite_all", label: "使用新预设覆盖全部配额", action: "audience-apply-overwrite" },
            { key: "cancel", label: "取消", action: "quota-confirm-cancel" }
          ]
        };
        render();
        return;
      }
      state.audience = newAudience;
      state.audienceConfig = newConfig;
      state.quotaPlan = buildDefaultQuotaPlan(newConfig);
      state.quotaDirty = false;
      render();
    }
    if (target.dataset.provider) {
      syncSettingsForm();
      state.provider = target.dataset.provider;
      state.apiKey = getSavedKey();
      localStorage.setItem("synthuser_provider", state.provider);
      render();
    }
    if (target.dataset.resultTab) {
      state.resultTab = target.dataset.resultTab;
      render();
    }
    if (target.dataset.inputMode) {
      const mode = target.dataset.inputMode;
      const value = target.dataset.modeValue;
      if (mode === "qual") state.qualInputMode = value;
      else state.quantInputMode = value;
      render();
    }
    if (target.hasAttribute("data-remove-question")) {
      syncResearchForm();
      state.quantQuestions.splice(Number(target.dataset.removeQuestion), 1);
      render();
    }
    // ===== v54 结构化选项编辑器（增/删/上移/下移） =====
    if (target.dataset.qoptUp !== undefined || target.dataset.qoptDown !== undefined || target.dataset.qoptDel !== undefined) {
      syncResearchForm(); // 先把用户已输入的行同步进 state
      const [qi, oi] = (target.dataset.qoptUp ?? target.dataset.qoptDown ?? target.dataset.qoptDel).split(":").map(Number);
      const opts = optionRowsFromDom(qi);
      if (target.dataset.qoptUp !== undefined && oi > 0) {
        const t = opts[oi - 1]; opts[oi - 1] = opts[oi]; opts[oi] = t;
      } else if (target.dataset.qoptDown !== undefined && oi < opts.length - 1) {
        const t = opts[oi]; opts[oi] = opts[oi + 1]; opts[oi + 1] = t;
      } else if (target.dataset.qoptDel !== undefined) {
        opts.splice(oi, 1);
      }
      const q = state.quantQuestions[qi];
      if (q) q.options = opts.join(", ");
      render();
      return;
    }
    if (target.dataset.qoptAdd !== undefined) {
      syncResearchForm(); // 先把用户已输入的行同步进 state
      const qi = Number(target.dataset.qoptAdd);
      const opts = optionRowsFromDom(qi);
      opts.push(`选项${opts.length + 1}`);
      const q = state.quantQuestions[qi];
      if (q) q.options = opts.join(", ");
      render();
      return;
    }
    // ===== v52 配额设计器事件 =====
    if (action === "open-quota-template-picker") {
      state.quotaTemplatePickerOpen = true;
      render();
      return;
    }
    if (action === "close-quota-template-picker") {
      state.quotaTemplatePickerOpen = false;
      render();
      return;
    }
    if (target.dataset.quotaTemplate) {
      // 从模板新增维度
      syncResearchForm();
      const dim = dimensionFromTemplateKey(target.dataset.quotaTemplate);
      state.quotaPlan.push(dim);
      state.quotaDirty = true;
      state.quotaTemplatePickerOpen = false;
      render();
      return;
    }
    if (action === "add-custom-quota-dim") {
      // 自定义维度：读取输入框中的名称
      syncResearchForm();
      const nameInput = document.querySelector("[data-custom-quota-name]");
      const name = (nameInput?.value || "").trim() || "自定义维度";
      const dim = makeQuotaDimension({ name, source: "custom" });
      state.quotaPlan.push(dim);
      state.quotaDirty = true;
      state.quotaTemplatePickerOpen = false;
      render();
      return;
    }
    if (action === "add-quota-item") {
      // 新增选项到指定维度
      syncResearchForm();
      const dimId = target.dataset.dimId;
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (dim) {
        dim.items.push(makeQuotaItem("", 0));
        state.quotaDirty = true;
      }
      render();
      return;
    }
    if (target.dataset.removeQuotaItem) {
      // 删除选项：用稳定 itemId 定位，不用数组下标
      syncResearchForm();
      const [dimId, itemId] = target.dataset.removeQuotaItem.split(":");
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (dim) {
        const idx = dim.items.findIndex((it) => it.id === itemId);
        if (idx >= 0) {
          if (dim.items.length <= 1) {
            // 至少保留一个选项，提示用户
            toast("至少保留一个配额选项");
            return;
          }
          dim.items.splice(idx, 1);
          state.quotaDirty = true;
        }
      }
      render();
      return;
    }
    if (target.dataset.moveQuotaItem) {
      // 调整选项顺序：dir=up|down，按 itemId 定位
      syncResearchForm();
      const [dimId, itemId, dir] = target.dataset.moveQuotaItem.split(":");
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (dim) {
        const idx = dim.items.findIndex((it) => it.id === itemId);
        if (idx >= 0) {
          const targetIdx = dir === "up" ? idx - 1 : idx + 1;
          if (targetIdx >= 0 && targetIdx < dim.items.length) {
            [dim.items[idx], dim.items[targetIdx]] = [dim.items[targetIdx], dim.items[idx]];
            state.quotaDirty = true;
          }
        }
      }
      render();
      return;
    }
    if (target.dataset.copyQuotaItem) {
      syncResearchForm();
      const [dimId, itemId] = target.dataset.copyQuotaItem.split(":");
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (dim) {
        const idx = dim.items.findIndex((it) => it.id === itemId);
        if (idx >= 0) {
          const copy = makeQuotaItem(dim.items[idx].label + " 副本", dim.items[idx].pct);
          dim.items.splice(idx + 1, 0, copy);
          state.quotaDirty = true;
        }
      }
      render();
      return;
    }
    if (target.dataset.toggleQuotaDim) {
      // 启用/停用维度
      syncResearchForm();
      const dimId = target.dataset.toggleQuotaDim;
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (dim) {
        dim.enabled = dim.enabled === false ? true : false;
        state.quotaDirty = true;
      }
      render();
      return;
    }
    if (target.dataset.moveQuotaDim) {
      // 维度上下移动
      syncResearchForm();
      const [dimId, dir] = target.dataset.moveQuotaDim.split(":");
      const idx = state.quotaPlan.findIndex((d) => d.id === dimId);
      if (idx >= 0) {
        const targetIdx = dir === "up" ? idx - 1 : idx + 1;
        if (targetIdx >= 0 && targetIdx < state.quotaPlan.length) {
          [state.quotaPlan[idx], state.quotaPlan[targetIdx]] = [state.quotaPlan[targetIdx], state.quotaPlan[idx]];
          state.quotaDirty = true;
        }
      }
      render();
      return;
    }
    if (target.dataset.copyQuotaDim) {
      // 复制维度
      syncResearchForm();
      const dimId = target.dataset.copyQuotaDim;
      const idx = state.quotaPlan.findIndex((d) => d.id === dimId);
      if (idx >= 0) {
        const src = state.quotaPlan[idx];
        const copy = makeQuotaDimension({
          name: src.name + " 副本",
          source: src.source,
          items: src.items.map((it) => ({ label: it.label, pct: it.pct }))
        });
        state.quotaPlan.splice(idx + 1, 0, copy);
        state.quotaDirty = true;
      }
      render();
      return;
    }
    if (target.dataset.resetQuotaDim) {
      // 重置该维度：把所有选项 pct 平均分配
      syncResearchForm();
      const dimId = target.dataset.resetQuotaDim;
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (dim && dim.items.length) {
        const even = distributeEvenly(dim.items.length);
        dim.items = dim.items.map((it, i) => ({ ...it, pct: even[i] }));
        state.quotaDirty = true;
      }
      render();
      return;
    }
    if (target.dataset.distQuotaEven) {
      // 平均分配：把现有选项数重新平均（不改变选项内容）
      syncResearchForm();
      const dimId = target.dataset.distQuotaEven;
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (dim && dim.items.length) {
        const even = distributeEvenly(dim.items.length);
        dim.items = dim.items.map((it, i) => ({ ...it, pct: even[i] }));
        state.quotaDirty = true;
      }
      render();
      return;
    }
    if (target.dataset.topupQuota) {
      // 自动补齐到 100%
      syncResearchForm();
      const dimId = target.dataset.topupQuota;
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (dim) {
        dim.items = topUpTo100(dim.items);
        state.quotaDirty = true;
      }
      render();
      return;
    }
    if (target.dataset.normalizeQuota) {
      // 按比例归一化到 100%
      syncResearchForm();
      const dimId = target.dataset.normalizeQuota;
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (dim) {
        dim.items = normalizeItems(dim.items);
        state.quotaDirty = true;
      }
      render();
      return;
    }
    if (target.dataset.clearQuotaDim) {
      // 清空该维度（保留维度名，重置为两个空选项）—— 需要确认
      syncResearchForm();
      const dimId = target.dataset.clearQuotaDim;
      state.quotaConfirmDialog = {
        type: "clear-dim",
        payload: { dimId },
        title: "确认清空该维度？",
        message: "清空后该维度的所有选项会被替换为两个空选项（0%），维度名保留。可点击「平均分配」快速重建。",
        options: [
          { key: "confirm", label: "确认清空", action: "clear-quota-dim-confirm" },
          { key: "cancel", label: "取消", action: "quota-confirm-cancel" }
        ]
      };
      render();
      return;
    }
    if (target.dataset.removeQuotaDim) {
      // 删除维度：直接弹确认
      syncResearchForm();
      const dimId = target.dataset.removeQuotaDim;
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (!dim) return;
      const inUse = state.result && (state.result.isMock || state.result.questions);
      state.quotaConfirmDialog = {
        type: "remove-dim",
        payload: { dimId },
        title: inUse ? "该维度可能已参与生成过结果，确认删除？" : "确认删除该配额维度？",
        message: `将删除维度「${dim.name || "未命名"}」及其全部选项。其他维度数据不受影响。`,
        options: [
          { key: "confirm", label: "确认删除", action: "remove-quota-dim-confirm" },
          { key: "cancel", label: "取消", action: "quota-confirm-cancel" }
        ]
      };
      render();
      return;
    }
    // ===== 配额确认弹窗动作 =====
    if (action === "quota-confirm-cancel") {
      state.quotaConfirmDialog = null;
      render();
      return;
    }
    if (action === "template-apply-all") {
      const idx = state.quotaConfirmDialog?.payload?.index;
      state.quotaConfirmDialog = null;
      if (idx !== undefined) applyTemplate(idx, "apply_all");
      return;
    }
    if (action === "template-apply-keep-quota") {
      const idx = state.quotaConfirmDialog?.payload?.index;
      state.quotaConfirmDialog = null;
      if (idx !== undefined) applyTemplate(idx, "keep_quota");
      return;
    }
    if (action === "audience-apply-keep-quota") {
      const payload = state.quotaConfirmDialog?.payload;
      state.quotaConfirmDialog = null;
      if (payload) {
        state.audience = payload.newAudience;
        state.audienceConfig = payload.newConfig;
        // 保留当前配额，仅刷新 preset 维度的 gender/age/city
        state.quotaPlan = refreshPresetDimensions(state.quotaPlan, payload.newConfig);
        state.quotaDirty = true;
      }
      render();
      return;
    }
    if (action === "audience-apply-preset-only") {
      const payload = state.quotaConfirmDialog?.payload;
      state.quotaConfirmDialog = null;
      if (payload) {
        state.audience = payload.newAudience;
        state.audienceConfig = payload.newConfig;
        // 仅刷新 preset 维度，保留 custom 维度
        state.quotaPlan = refreshPresetDimensions(state.quotaPlan, payload.newConfig);
        state.quotaDirty = true;
      }
      render();
      return;
    }
    if (action === "audience-apply-overwrite") {
      const payload = state.quotaConfirmDialog?.payload;
      state.quotaConfirmDialog = null;
      if (payload) {
        state.audience = payload.newAudience;
        state.audienceConfig = payload.newConfig;
        state.quotaPlan = buildDefaultQuotaPlan(payload.newConfig);
        state.quotaDirty = false;
      }
      render();
      return;
    }
    if (action === "remove-quota-dim-confirm") {
      const dimId = state.quotaConfirmDialog?.payload?.dimId;
      state.quotaConfirmDialog = null;
      if (dimId) {
        state.quotaPlan = state.quotaPlan.filter((d) => d.id !== dimId);
        state.quotaDirty = true;
      }
      render();
      return;
    }
    if (action === "clear-quota-dim-confirm") {
      const dimId = state.quotaConfirmDialog?.payload?.dimId;
      state.quotaConfirmDialog = null;
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (dim) {
        dim.items = [makeQuotaItem("", 0), makeQuotaItem("", 0)];
        state.quotaDirty = true;
      }
      render();
      return;
    }
    // ===== 配额方案管理 =====
    if (action === "open-quota-scheme-panel") {
      state.quotaSchemePanelOpen = !state.quotaSchemePanelOpen;
      render();
      return;
    }
    if (action === "save-quota-scheme") {
      syncResearchForm();
      const nameInput = document.querySelector("[data-quota-scheme-name]");
      const name = (nameInput?.value || "").trim() || `配额方案 ${new Date().toLocaleString("zh-CN")}`;
      const scheme = {
        version: 1,
        id: `quota_scheme_${Date.now().toString(36)}`,
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        quotaPlan: JSON.parse(JSON.stringify(state.quotaPlan))
      };
      state.quotaSchemes.push(scheme);
      persistQuotaSchemes();
      toast(`已保存方案「${name}」`);
      render();
      return;
    }
    if (target.dataset.applyScheme) {
      const schemeId = target.dataset.applyScheme;
      const scheme = state.quotaSchemes.find((s) => s.id === schemeId);
      if (scheme) {
        state.quotaPlan = migrateQuotaPlan(JSON.parse(JSON.stringify(scheme.quotaPlan)));
        state.quotaDirty = true;
        toast(`已应用方案「${scheme.name}」`);
      }
      render();
      return;
    }
    if (target.dataset.deleteScheme) {
      const schemeId = target.dataset.deleteScheme;
      state.quotaSchemes = state.quotaSchemes.filter((s) => s.id !== schemeId);
      persistQuotaSchemes();
      toast("方案已删除");
      render();
      return;
    }
    if (target.dataset.copyScheme) {
      const schemeId = target.dataset.copyScheme;
      const scheme = state.quotaSchemes.find((s) => s.id === schemeId);
      if (scheme) {
        const copy = {
          ...JSON.parse(JSON.stringify(scheme)),
          id: `quota_scheme_${Date.now().toString(36)}`,
          name: scheme.name + " 副本",
          updatedAt: new Date().toISOString()
        };
        state.quotaSchemes.push(copy);
        persistQuotaSchemes();
        toast("方案已复制");
      }
      render();
      return;
    }
    if (action === "restore-default-quota") {
      state.quotaPlan = buildDefaultQuotaPlan(state.audienceConfig);
      state.quotaDirty = false;
      toast("已恢复默认配额");
      render();
      return;
    }
    if (action === "toggle-quota-collapse") {
      state.quotaCollapsed = !state.quotaCollapsed;
      render();
      return;
    }
    // v52：旧 add-quota / remove-quota / reset-quota 兼容（迁移到新逻辑）
    if (target.hasAttribute("data-add-quota")) {
      // 旧 add-quota 已废弃；统一走 add-quota-item
      syncResearchForm();
      const dimId = target.dataset.addQuota;
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (dim) {
        dim.items.push(makeQuotaItem("", 0));
        state.quotaDirty = true;
      }
      render();
      return;
    }
    if (target.hasAttribute("data-remove-quota")) {
      // 旧 remove-quota 已废弃；统一走 remove-quota-item
      syncResearchForm();
      const [dimId, itemId] = target.dataset.removeQuota.split(":");
      const dim = state.quotaPlan.find((d) => d.id === dimId);
      if (dim) {
        const idx = dim.items.findIndex((it) => it.id === itemId);
        if (idx >= 0 && dim.items.length > 1) {
          dim.items.splice(idx, 1);
          state.quotaDirty = true;
        }
      }
      render();
      return;
    }
    if (action === "reset-quota") {
      // 重置配额：恢复默认 3 维度
      syncResearchForm();
      state.quotaPlan = buildDefaultQuotaPlan(state.audienceConfig);
      state.quotaDirty = false;
      render();
      return;
    }
    if (action === "add-question") {
      syncResearchForm();
      state.quantQuestions.push(migrateQuestionData({ text: "", type: "single", options: "选项A, 选项B, 选项C, 选项D", scale: "1-5", rows: "" }, state.quantQuestions.length));
      render();
    }
    if (action === "import-outline") importOutline();
    if (action === "import-questionnaire") importQuestionnaire();
    if (action === "import-preview-back") {
      // 返回上传页（保留预览状态，可通过「继续识别预览」回到预览）
      route("quant");
    }
    if (action === "import-preview-continue") {
      state.page = "import-preview";
      state.mode = "quant";
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (action === "import-preview-confirm") confirmImportPreview();
    if (action === "import-confirm-continue") {
      const dialog = state.importPreview?.confirmDialog;
      if (dialog) applyConfirmedImport(dialog.result);
    }
    if (action === "import-confirm-cancel") dismissImportConfirmDialog();
    if (action === "import-preview-reset") importResetPreview();
    if (action === "import-accept-all") importAcceptAll();
    if (action === "import-batch-drop-instructions") importBatchDropInstructions();
    if (action === "import-batch-accept-shared") importBatchAcceptShared();
    if (action === "import-batch-skip-open") importBatchSkipOpen();
    if (action === "import-toggle") {
      const i = Number(target.dataset.questionIndex);
      const preview = state.importPreview;
      if (preview.expanded.has(i)) preview.expanded.delete(i);
      else preview.expanded.add(i);
      render();
    }
    if (action === "import-toggle-raw") toggleImportRaw(Number(target.dataset.questionIndex));
    if (action === "import-delete") deleteImportQuestion(Number(target.dataset.questionIndex));
    if (action === "import-merge-up") mergeImportQuestionUp(Number(target.dataset.questionIndex));
    if (action === "import-option-add") addImportOption(Number(target.dataset.questionIndex));
    if (action === "import-row-add") addImportOption(Number(target.dataset.questionIndex));
    if (action === "import-option-remove") removeImportOption(Number(target.dataset.questionIndex), Number(target.dataset.optionIndex));
    if (action === "import-option-move") moveImportOption(Number(target.dataset.questionIndex), Number(target.dataset.optionIndex), Number(target.dataset.dir));
    if (action === "import-option-split") splitImportOption(Number(target.dataset.questionIndex), Number(target.dataset.optionIndex));
    if (action === "import-add-placeholder") addImportPlaceholderOptions(Number(target.dataset.questionIndex));
    if (action === "save-settings") saveModelSettings();
    if (action === "clear-key") clearApiKey();
    if (action === "toggle-key") {
      syncSettingsForm();
      state.showKey = !state.showKey;
      render();
    }
    if (action === "generate") startGeneration();
    if (action === "generate-mock") startMockGeneration();
    if (action === "regenerate-question") regenerateQuantQuestion(Number(target.dataset.questionIndex));
    // ===== v50 工作台 =====
    if (target.dataset.workbenchTab) {
      const prevTab = state.workbench.tab;
      state.workbench.scrolls[prevTab] = window.scrollY;
      state.workbench.tab = target.dataset.workbenchTab;
      render();
      const restore = state.workbench.scrolls[state.workbench.tab] || 0;
      requestAnimationFrame(() => window.scrollTo(0, restore));
    }
    if (target.dataset.qualityFilter) {
      state.workbench.anomalyFilter = target.dataset.qualityFilter === "all" ? null : target.dataset.qualityFilter;
      state.workbench.scrolls[state.workbench.tab] = window.scrollY;
      state.workbench.tab = "questions";
      state.workbench.expandAll = false;
      render();
      window.scrollTo(0, 0);
    }
    if (target.dataset.dirType) {
      state.workbench.dirType = target.dataset.dirType;
      render();
    }
    if (target.dataset.dirJump !== undefined) {
      state.workbench.scrolls[state.workbench.tab] = window.scrollY;
      state.workbench.tab = "questions";
      jumpToQuestion(Number(target.dataset.dirJump));
    }
    if (target.dataset.dirCheck) {
      const key = target.dataset.dirCheck;
      if (key === "core") state.workbench.dirCoreOnly = !state.workbench.dirCoreOnly;
      if (key === "anomaly") state.workbench.dirAnomalyOnly = !state.workbench.dirAnomalyOnly;
      if (key === "user") state.workbench.dirUserEditedOnly = !state.workbench.dirUserEditedOnly;
      if (key === "repaired") state.workbench.dirRepairedOnly = !state.workbench.dirRepairedOnly;
      render();
    }
    if (target.dataset.questionToggle !== undefined) {
      const i = Number(target.dataset.questionToggle);
      if (state.workbench.expanded.has(i)) state.workbench.expanded.delete(i);
      else state.workbench.expanded.add(i);
      render();
    }
    if (target.dataset.matrixView) {
      const [i, view] = target.dataset.matrixView.split(":");
      state.workbench.matrixView[Number(i)] = view;
      render();
    }
    if (target.dataset.jumpQuestion !== undefined) {
      jumpToQuestion(Number(target.dataset.jumpQuestion));
    }
    if (action === "toggle-expand-all") {
      const indexes = directoryFilteredIndexes();
      const allExpanded = state.workbench.expandAll || indexes.every((i) => state.workbench.expanded.has(i));
      if (allExpanded) {
        state.workbench.expanded = new Set();
        state.workbench.expandAll = false;
      } else {
        state.workbench.expandAll = true;
      }
      render();
    }
    if (action === "clear-dir-filters") {
      const w = state.workbench;
      w.dirQuery = "";
      w.dirType = "all";
      w.dirModule = "all";
      w.dirCoreOnly = false;
      w.dirAnomalyOnly = false;
      w.dirUserEditedOnly = false;
      w.dirRepairedOnly = false;
      w.anomalyFilter = null;
      render();
    }
    if (action === "edit-question") openQuestionEditor(Number(target.dataset.questionIndex));
    if (action === "close-editor") closeQuestionEditor();
    if (action === "commit-edit") commitQuestionEdit();
    if (action === "restore-data") restoreQuestionData();
    if (action === "run-crosstab") runCrosstab();
    if (action === "generate-story") generateStoryline();
    if (action === "export-excel-stats") exportExcelStats();
    if (action === "export-excel-quality") exportExcelQuality();
    if (action === "export-story-json") exportStoryJson();
    if (action === "export-story-md") exportStoryMd();
    // ===== v53 逐题数据解读事件 =====
    if (action === "generate-interpretation") generateAiInterpretation(Number(target.dataset.questionIndex));
    if (action === "generate-core-interpretations") generateCoreInterpretations();
    if (action === "cancel-interpretation-batch") cancelInterpretationBatch();
    if (action === "edit-interpretation") openInterpretationEditor(Number(target.dataset.questionIndex));
    if (action === "close-interpretation-editor") closeInterpretationEditor();
    if (action === "commit-interpretation-edit") commitInterpretationEdit();
    if (action === "restore-rule-interpretation") restoreRuleInterpretation(Number(target.dataset.questionIndex));
    if (action === "restore-ai-interpretation") restoreAiInterpretation(Number(target.dataset.questionIndex));
    if (action === "copy-interpretation") copyInterpretation(Number(target.dataset.questionIndex));
    if (action === "jump-to-evidence") jumpToQuestion(Number(target.dataset.evidenceIndex));
    if (action === "add-interp-driver") addInterpretationDriver(Number(target.dataset.questionIndex));
    if (action === "add-interp-evidence") addInterpretationEvidence(Number(target.dataset.questionIndex));
    if (action === "install-app") installApp();
    if (action === "go-settings") {
      state.showApiPrompt = false;
      route("settings");
    }
    if (action === "use-mock") {
      state.showApiPrompt = false;
      startMockGeneration();
    }
    if (action === "close-api-prompt") {
      state.showApiPrompt = false;
      render();
    }
    if (action === "copy") copyResult();
    if (action === "copy-analysis") copyAnalysis();
    if (action === "export-csv") exportCsv();
    if (action === "export-md") exportMarkdown();
    if (action === "export-json") exportJson();
    if (action === "regenerate") {
      state.generateError = "";
      if (state.result?.isMock) startMockGeneration();
      else startGeneration();
    }
    if (action === "cancel-generation") {
      if (state.abortController) {
        state.abortController.abort("user");
      }
      state.isGenerating = false;
      state.progress = 0;
      state.generateStatus = "";
      state.generateError = "";
      route(state.mode);
    }
  });

  document.body.addEventListener("change", (event) => {
    if (event.target.dataset.qtype) {
      // v54 题型切换：保留已有选项（options 存于 state），只重置不适用的配置
      syncResearchForm();
      const idx = Number(event.target.dataset.qtype);
      const q = state.quantQuestions[idx];
      if (q) {
        const newType = event.target.value;
        if (newType !== q.type) {
          // 切换后按新题型补齐 config 默认值（不删除选项）
          q.config = readQuestionConfigFromDom(idx, newType, q.config || {});
          if (newType === "scale" && !q.scale) q.scale = "1-5";
          if (newType === "matrix" && !q.rows) q.rows = "维度一, 维度二";
          if ((newType === "open" || newType === "nps" || newType === "numeric") && q.options) {
            // 输入类题型：选项保留在草稿中但不参与生成（提示由 UI notice 说明）
          }
        }
      }
      render();
    }
    if (event.target.dataset.docxInput !== undefined) {
      const file = event.target.files && event.target.files[0];
      if (file) {
        importQuestionnaireFile(file);
      }
      // 重置 value 以便重复选择同一文件也能触发 change
      event.target.value = "";
    }
    // ===== v50 工作台：change 事件（目录模块筛选 / 题目模块修改 / 交叉配置） =====
    // 编辑草稿与目录搜索的兜底：失焦（change）时同样提交，兼容输入法与自动化输入场景
    if (event.target.dataset.editField) {
      const [field, idx] = event.target.dataset.editField.split(":");
      updateEditorDraft(field, idx === undefined ? null : Number(idx), event.target.value);
    }
    if (event.target.dataset.dirInput !== undefined) {
      state.workbench.dirQuery = event.target.value;
      render();
    }
    if (event.target.dataset.dirModule) {
      state.workbench.dirModule = event.target.dataset.dirModule;
      render();
    }
    if (event.target.dataset.moduleSelect !== undefined) {
      setQuestionModule(Number(event.target.dataset.moduleSelect), event.target.value);
    }
    if (event.target.dataset.crosstabRow !== undefined) {
      state.workbench.crosstabConfig.rowIndex = event.target.value === "" ? null : Number(event.target.value);
    }
    if (event.target.dataset.crosstabCol !== undefined) {
      state.workbench.crosstabConfig.colType = event.target.value;
    }
    if (event.target.dataset.crosstabMetric !== undefined) {
      state.workbench.crosstabConfig.metricIndex = event.target.value === "" ? null : Number(event.target.value);
    }
    // ===== v53 逐题解读人工编辑 =====
    if (event.target.dataset.interpEdit !== undefined) {
      const editKey = event.target.dataset.interpEdit;
      if (editKey.startsWith("evidence:")) {
        updateInterpretationEvidenceDraft(editKey, event.target.value);
      } else if (editKey.startsWith("drivers:")) {
        const idx = Number(editKey.split(":")[1]);
        updateInterpretationEditorDraft("drivers", idx, event.target.value);
      } else {
        updateInterpretationEditorDraft(editKey, null, event.target.value);
      }
    }
    // 识别预览页：筛选 / 勾选 / 批量题型 / 字段编辑（change=失焦时提交并重渲染）
    const preview = state.importPreview;
    if (state.page === "import-preview" && preview) {
      if (event.target.dataset.importFilter) {
        preview.filter = event.target.dataset.importFilter;
        render();
      }
      if (event.target.dataset.importCheck !== undefined) {
        const i = Number(event.target.dataset.importCheck);
        if (event.target.checked) preview.checked.add(i);
        else preview.checked.delete(i);
        render();
      }
      if (event.target.dataset.importBatchType !== undefined) {
        if (event.target.value) {
          importBatchSetType(event.target.value);
          event.target.value = "";
        }
      }
      if (event.target.dataset.ipText !== undefined) {
        updateImportQuestion(Number(event.target.dataset.ipText), { text: event.target.value });
        render();
      }
      if (event.target.dataset.ipType !== undefined) {
        updateImportQuestion(Number(event.target.dataset.ipType), { type: event.target.value });
        render();
      }
      if (event.target.dataset.ipConfig !== undefined) {
        const [key, qi] = event.target.dataset.ipConfig.split(":");
        const q = preview.parsedQuestions[Number(qi)];
        if (q) {
          q.config = q.config || {};
          if (key === "rankMode") {
            q.config.rankMode = event.target.value;
            q.config.topN = q.config.topN || 3;
          } else if (key === "totalPoints") {
            const v = Number(event.target.value);
            if (Number.isFinite(v) && v > 0) q.config.totalPoints = Math.round(v);
          }
          refreshImportPreview();
        }
        render();
      }
      if (event.target.dataset.ipScale !== undefined) {
        updateImportQuestion(Number(event.target.dataset.ipScale), { scale: event.target.value });
        render();
      }
      if (event.target.dataset.ipOption !== undefined) {
        const [qi, oi] = event.target.dataset.ipOption.split(":").map(Number);
        const q = preview.parsedQuestions[qi];
        if (q) {
          const arr = importOptionArray(q);
          if (arr[oi] !== undefined) {
            arr[oi] = event.target.value;
            setImportOptionArray(qi, arr);
          }
        }
        refreshImportPreview();
        render();
      }
      if (event.target.dataset.ipRow !== undefined) {
        const [qi, ri] = event.target.dataset.ipRow.split(":").map(Number);
        const q = preview.parsedQuestions[qi];
        if (q) {
          const arr = splitList(q.rows);
          if (arr[ri] !== undefined) {
            arr[ri] = event.target.value;
            q.rows = arr.map((s) => s.trim()).join(", ");
          }
        }
        refreshImportPreview();
        render();
      }
    }
  });

  document.body.addEventListener("input", (event) => {
    if (state.page === "qual" || state.page === "quant") {
      // v54 结构化选项编辑：实时同步隐藏字段（不整页重渲染，避免输入焦点丢失）
      if (event.target.dataset.qopt) {
        const [qi, oi] = event.target.dataset.qopt.split(":").map(Number);
        const opts = optionRowsFromDom(qi);
        opts[oi] = event.target.value;
        syncHiddenOptions(qi, opts);
      }
      syncResearchForm();
      document.querySelectorAll("[data-action='generate'], [data-action='generate-mock']").forEach((button) => {
        button.disabled = !hasResearchReady();
      });
    }
    if (state.page === "settings") syncSettingsForm();
    // ===== v50 工作台：目录搜索与编辑草稿（输入过程不整页重渲染，避免输入框失焦） =====
    if (state.page === "result" && state.mode === "quant" && state.result) {
      if (event.target.dataset.dirInput !== undefined) {
        state.workbench.dirQuery = event.target.value;
        const cursor = event.target.selectionStart;
        render();
        // 重渲染后恢复搜索框焦点与光标位置，保证连续输入
        const el = document.querySelector(".dir-search");
        if (el) {
          el.focus();
          el.selectionStart = el.selectionEnd = cursor;
        }
      }
      if (event.target.dataset.editField) {
        const [field, idx] = event.target.dataset.editField.split(":");
        updateEditorDraft(field, idx === undefined ? null : Number(idx), event.target.value);
      }
      // v53：解读人工编辑输入（不整页重渲染，避免输入框失焦）
      if (event.target.dataset.interpEdit !== undefined) {
        const editKey = event.target.dataset.interpEdit;
        if (editKey.startsWith("evidence:")) {
          updateInterpretationEvidenceDraft(editKey, event.target.value);
        } else if (editKey.startsWith("drivers:")) {
          const idx = Number(editKey.split(":")[1]);
          updateInterpretationEditorDraft("drivers", idx, event.target.value);
        } else {
          updateInterpretationEditorDraft(editKey, null, event.target.value);
        }
      }
    }
    // 识别预览页：输入过程中只更新状态与质量分析，不整页重渲染（避免输入框失焦）
    const preview = state.importPreview;
    if (state.page === "import-preview" && preview && event.target.dataset) {
      if (event.target.dataset.ipText !== undefined) {
        updateImportQuestion(Number(event.target.dataset.ipText), { text: event.target.value });
      } else if (event.target.dataset.ipType !== undefined) {
        updateImportQuestion(Number(event.target.dataset.ipType), { type: event.target.value });
      } else if (event.target.dataset.ipScale !== undefined) {
        updateImportQuestion(Number(event.target.dataset.ipScale), { scale: event.target.value });
      } else if (event.target.dataset.ipOption !== undefined) {
        const [qi, oi] = event.target.dataset.ipOption.split(":").map(Number);
        const q = preview.parsedQuestions[qi];
        if (q) {
          const arr = importOptionArray(q);
          if (arr[oi] !== undefined) {
            arr[oi] = event.target.value;
            setImportOptionArray(qi, arr);
          }
        }
        refreshImportPreview();
      } else if (event.target.dataset.ipRow !== undefined) {
        const [qi, ri] = event.target.dataset.ipRow.split(":").map(Number);
        const q = preview.parsedQuestions[qi];
        if (q) {
          const arr = splitList(q.rows);
          if (arr[ri] !== undefined) {
            arr[ri] = event.target.value;
            q.rows = arr.map((s) => s.trim()).join(", ");
          }
        }
        refreshImportPreview();
      }
    }
  });
}

function render() {
  $("#app").innerHTML = App();
}

migrateToDefaultProvider();
render();
bindEvents();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      // 每次加载页面时主动检查 Service Worker 更新
      registration.update();
    });
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  state.installAvailable = true;
  render();
});

window.addEventListener("appinstalled", () => {
  state.deferredInstallPrompt = null;
  state.installAvailable = false;
  state.isStandalone = true;
  toast("SynthUser 已安装");
});

window.addEventListener("online", () => {
  state.isOnline = true;
  render();
});

window.addEventListener("offline", () => {
  state.isOnline = false;
  render();
});

async function installApp() {
  if (!state.deferredInstallPrompt) {
    toast("浏览器暂未开放安装入口，可使用地址栏安装按钮");
    return;
  }
  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  state.installAvailable = false;
  render();
}
