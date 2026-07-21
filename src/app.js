const MODEL_CONFIG = {
  kimi: { name: "Kimi", key: "synthuser_api_key_kimi", placeholder: "sk-...", model: "moonshot-v1-8k", baseUrl: "https://api.moonshot.cn/v1/chat/completions" },
  deepseek: { name: "DeepSeek", key: "synthuser_api_key_deepseek", placeholder: "sk-...", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1/chat/completions" },
  zhipu: { name: "智谱 GLM", key: "synthuser_api_key_zhipu", placeholder: "请输入 GLM API Key", model: "glm-4-flash", baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions" },
  custom: { name: "自定义模型", key: "synthuser_api_key_custom", placeholder: "兼容 OpenAI 格式的 API Key", model: "your-model-name", baseUrl: "" }
};

// 内置默认 API Key：首次访问时若用户未保存自己的 Key，则自动使用，开箱即用。
// 用户在「模型设置」中保存自己的 Key 后会覆盖默认值。
// 注意：内置 Key 部署到公网后会被访问者看到，仅适用于免费额度 / 测试场景，正式生产请替换为用户自有的 Key。
const DEFAULT_PROVIDER_KEYS = {
  zhipu: "bb32a87bafb94891a4aab4eeff9b48b4.L5NZNKkIWgWWUMRS"
};

const GENERATION_TIMEOUT_MS = 90000;

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
  quotaPlan: [
    { id: "gender", name: "性别", items: [{ label: "女性", pct: 55 }, { label: "男性", pct: 45 }] },
    { id: "age", name: "年龄", items: [{ label: "25-29 岁", pct: 45 }, { label: "30-34 岁", pct: 35 }, { label: "35-40 岁", pct: 20 }] },
    { id: "city", name: "城市层级", items: [{ label: "一线城市", pct: 45 }, { label: "新一线城市", pct: 40 }, { label: "二线城市", pct: 15 }] }
  ],
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
  importError: ""
};

const initialMode = new URLSearchParams(window.location.search).get("mode");
if (initialMode === "quant" || initialMode === "qual") {
  state.page = initialMode;
  state.mode = initialMode;
}

const $ = (selector) => document.querySelector(selector);

function getSavedKey(provider = state.provider) {
  const saved = localStorage.getItem(MODEL_CONFIG[provider].key);
  if (saved) return saved;
  // 用户未保存自己的 Key 时回退到内置默认 Key（开箱即用）
  return DEFAULT_PROVIDER_KEYS[provider] || "";
}

function isUsingDefaultKey(provider = state.provider) {
  return !localStorage.getItem(MODEL_CONFIG[provider].key) && !!DEFAULT_PROVIDER_KEYS[provider];
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
  const key = getSavedKey();
  return validateKeyFormat(key, state.provider) === null;
}

// 迁移逻辑：若当前 provider 既没保存 Key 也没有内置 Key，但 zhipu 有内置 Key，
// 则自动切换到 zhipu，确保首次访问旧版本的用户也能开箱即用。
function migrateToDefaultProvider() {
  const currentProvider = state.provider;
  if (!MODEL_CONFIG[currentProvider]) {
    state.provider = "zhipu";
    localStorage.setItem("synthuser_provider", "zhipu");
    return;
  }
  const hasOwnKey = !!localStorage.getItem(MODEL_CONFIG[currentProvider].key);
  const hasDefault = !!DEFAULT_PROVIDER_KEYS[currentProvider];
  if (!hasOwnKey && !hasDefault && DEFAULT_PROVIDER_KEYS.zhipu) {
    state.provider = "zhipu";
    localStorage.setItem("synthuser_provider", "zhipu");
  }
}

function validateApiConfig() {
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
  if (topic) state.topic = topic.value;
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
  state.quotaPlan = state.quotaPlan.map((dimension) => ({
    ...dimension,
    items: dimension.items.map((item, itemIndex) => ({
      label: $(`#quota-${dimension.id}-${itemIndex}-label`)?.value || item.label,
      pct: Math.max(0, Math.min(100, Number($(`#quota-${dimension.id}-${itemIndex}-pct`)?.value ?? item.pct)))
    })).filter((item) => item.label.trim())
  }));
  state.qualQuestions = [0, 1, 2].map((index) => $(`#qual-${index}`)?.value || state.qualQuestions[index]);
  state.quantQuestions = state.quantQuestions.map((question, index) => ({
    text: $(`#q-text-${index}`)?.value || question.text,
    type: $(`#q-type-${index}`)?.value || question.type,
    options: $(`#q-options-${index}`)?.value || question.options,
    scale: $(`#q-scale-${index}`)?.value || question.scale,
    rows: $(`#q-rows-${index}`)?.value || question.rows
  }));
}

function syncSettingsForm() {
  state.apiKey = $("#api-key")?.value || state.apiKey;
  state.customBaseUrl = $("#custom-base-url")?.value || state.customBaseUrl;
  state.customModel = $("#custom-model")?.value || state.customModel;
}

function hasResearchReady() {
  if (!state.topic.trim()) return false;
  if (state.mode === "qual") {
    return state.qualQuestions.every((q) => q.trim());
  }
  return state.quantQuestions.length >= 3 && state.quantQuestions.every((q) => {
    if (!q.text.trim()) return false;
    if (q.type === "matrix") return q.rows.trim() && q.options.trim();
    if (q.type === "single" || q.type === "multiple") return q.options.trim();
    return true;
  });
}

function splitList(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTo100(values) {
  const safeValues = values.map((value) => Math.max(0, Number(value) || 0));
  const total = safeValues.reduce((sum, value) => sum + value, 0);
  if (!total) return safeValues.map(() => 0);

  const normalized = safeValues.map((value) => Math.round((value / total) * 100));
  const diff = 100 - normalized.reduce((sum, value) => sum + value, 0);
  if (normalized.length) normalized[0] += diff;
  return normalized;
}

function quotaFromAudienceConfig(config = state.audienceConfig) {
  const genderItems = parseQuotaText(config.gender, [
    { label: "女性", pct: 55 },
    { label: "男性", pct: 45 }
  ]);
  const ageItems = parseRangeQuota(config.age, "年龄", [
    { label: config.age || "目标年龄段", pct: 100 }
  ]);
  const cityItems = parseSlashQuota(config.city, [
    { label: config.city || "目标城市", pct: 100 }
  ]);
  return [
    { id: "gender", name: "性别", items: genderItems },
    { id: "age", name: "年龄", items: ageItems },
    { id: "city", name: "城市层级", items: cityItems }
  ];
}

function parseQuotaText(text, fallback) {
  const matches = [...String(text || "").matchAll(/([^/\d%]+?)\s*(\d+)%/g)]
    .map((match) => ({ label: match[1].replace(/[，,、]/g, "").trim(), pct: Number(match[2]) }))
    .filter((item) => item.label && item.pct > 0);
  return matches.length ? normalizeQuotaItems(matches) : fallback;
}

function parseSlashQuota(text, fallback) {
  const items = String(text || "")
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((label) => ({ label, pct: 0 }));
  return items.length ? distributeQuota(items) : fallback;
}

function parseRangeQuota(text, prefix, fallback) {
  const match = String(text || "").match(/(\d+)\s*[-~—]\s*(\d+)/);
  if (!match) return fallback;
  const min = Number(match[1]);
  const max = Number(match[2]);
  const mid = Math.floor((min + max) / 2);
  return distributeQuota([
    { label: `${min}-${mid} 岁`, pct: 0 },
    { label: `${mid + 1}-${max} 岁`, pct: 0 }
  ]);
}

function distributeQuota(items) {
  if (!items.length) return items;
  const base = Math.floor(100 / items.length);
  return items.map((item, index) => ({
    ...item,
    pct: index === 0 ? base + (100 - base * items.length) : base
  }));
}

function normalizeQuotaItems(items) {
  return items.map((item) => ({ ...item, pct: Math.round(item.pct) }));
}

function quotaTotal(dimension) {
  return dimension.items.reduce((sum, item) => sum + (Number(item.pct) || 0), 0);
}

function quotaWarnings() {
  return state.quotaPlan
    .map((dimension) => ({ name: dimension.name, total: quotaTotal(dimension) }))
    .filter((item) => item.total !== 100);
}

function quotaSummary() {
  return state.quotaPlan
    .map((dimension) => `${dimension.name}：${dimension.items.map((item) => `${item.label} ${item.pct}%`).join(" / ")}`)
    .join("；");
}

function quotaSampleSummary() {
  const n = state.mode === "qual" ? 6 : state.sampleSize;
  return state.quotaPlan.map((dimension) => {
    const items = dimension.items.map((item) => `${item.label} ${Math.round(n * item.pct / 100)}人`).join(" / ");
    return `${dimension.name} ${items}`;
  }).join("；");
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
  state.topic = template.topic;
  state.audience = template.audience;
  state.audienceConfig = { ...template.audienceConfig };
  state.quotaPlan = quotaFromAudienceConfig(state.audienceConfig);
  state.qualQuestions = [...template.qualQuestions];
  state.quantQuestions = template.quantQuestions.map((q) => ({ ...q }));
  state.result = null;
  state.generateError = "";
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

// ===== 问卷文本解析 =====

const QUESTION_TYPE_PATTERNS = [
  { re: /【(单选)】/, type: "single" },
  { re: /【(多选)】/, type: "multiple" },
  { re: /【量表(?:(\d+)分)?】/, type: "scale" },
  { re: /【矩阵(?:(\d+)分)?】/, type: "matrix" }
];

function parseQuestionnaireText(text) {
  const lines = String(text || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const questions = [];
  for (const line of lines) {
    const q = parseQuestionLine(line);
    if (q) questions.push(q);
  }
  return questions;
}

function parseQuestionLine(line) {
  // 1. 去掉题号前缀：支持 Q1. / 1. / 1、 / 1) / 1： / 1* / 4-1* / 27-2 / FZ_Q4_1 / Q27_2__1__open 等
  //    题号后允许接标点或空白；(?:__\w+)? 用于兼容 Q27_2__1__open 这种带开放字段后缀的题号
  let rest = line
    .replace(/^\s*(?:Q?\d+(?:[-_]\d+)*(?:__\w+)?\*?|[A-Za-z]+_?Q?\d+(?:[_\d]*\*?))(?:\s*[.、):：]\s*|\s+)/, "")
    .trim();
  // 兜底：纯数字 + 标点
  if (rest === line.trim()) {
    rest = line.replace(/^\s*\d+\s*[.、):：]\s*/, "").trim();
  }
  if (!rest) return null;

  // 2. 识别题型标记 【单选】【多选】【量表5分】【矩阵10分】等
  let type = "single";
  let scale = "1-5";
  let options = "";
  let rows = "";
  let questionText = rest;
  let matchedMarker = null;

  for (const pattern of QUESTION_TYPE_PATTERNS) {
    const m = rest.match(pattern.re);
    if (m) {
      type = pattern.type;
      matchedMarker = m[0];
      if (m[1] && (pattern.type === "scale" || pattern.type === "matrix")) {
        scale = `1-${m[1]}`;
      }
      break;
    }
  }

  if (matchedMarker) {
    const markerIdx = rest.indexOf(matchedMarker);
    questionText = rest.substring(0, markerIdx).trim();
    const after = rest.substring(markerIdx + matchedMarker.length).trim();
    const normalized = after.replace(/\s*[/／]\s*/g, ", ");
    if (type === "matrix") {
      // 矩阵题：后面的内容是评价维度（行），选项为量表刻度
      rows = splitOptions(normalized).join(", ");
      options = scale === "1-10" ? "1, 2, 3, 4, 5, 6, 7, 8, 9, 10" : "1, 2, 3, 4, 5";
    } else if (type === "single" || type === "multiple") {
      options = splitOptions(normalized).join(", ");
    }
    // 量表题不需要 options
  } else {
    // 3. 无题型标记：尝试从问号后的选项列表推断单选题
    const m = rest.match(/^(.+?[？?])\s*[:：]?\s*(.+)$/);
    if (m && /[\/,，、]/.test(m[2]) && m[2].length < 120) {
      questionText = m[1].trim();
      options = splitOptions(m[2].replace(/\s*[/／]\s*/g, ", ")).join(", ");
      type = "single";
    } else {
      // 兜底：作为单选开放题保留
      questionText = rest;
      type = "single";
    }
  }

  if (!questionText) return null;
  return { text: questionText, type, options, scale, rows };
}

// 把 "其他，请说明" / "其它，请注明" 等作为单一选项保留，不再按逗号切分
function splitOptions(value) {
  const protectedText = String(value || "").replace(/(其他|其它)，/g, "$1__OTHER_COMMA__");
  return splitList(protectedText).map((item) => item.replace(/__OTHER_COMMA__/g, "，"));
}

function importQuestionnaire() {
  syncResearchForm();
  const text = (state.questionnaireText || "").trim();
  if (!text) {
    toast("请先粘贴问卷文本");
    return;
  }
  const parsed = parseQuestionnaireText(text);
  if (parsed.length < 3) {
    toast("未能识别出 3 道以上题目，请检查格式");
    return;
  }
  // 上限 8 道题（与 UI 一致）
  state.quantQuestions = parsed.slice(0, 8);
  state.quantInputMode = "manual";
  toast(`已识别 ${parsed.length} 道题目${parsed.length > 8 ? "（已截取前 8 道）" : ""}`);
  render();
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
  return extractParagraphsFromDocxXml(xmlText);
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

  // 3. 解析第一个有内容的 sheet
  for (const sheetEntry of sheetEntries) {
    const sheetBytes = await inflateEntry(bytes, sheetEntry);
    const sheetXml = new TextDecoder("utf-8").decode(sheetBytes);
    if (!sheetXml.includes("<row") && !sheetXml.includes("<c ")) {
      continue;
    }
    const rows = extractXlsxRows(sheetXml, sharedStrings);
    if (rows.length === 0) continue;
    const text = buildQuestionnaireTextFromXlsxRows(rows);
    if (text.trim()) return text;
  }

  throw new Error("Excel 文档为空或无有效问卷行，请确认包含问卷题目");
}

// 解析 sharedStrings.xml：每个 <si> 是一个字符串项，可能包含多个 <r><t> 富文本
function parseSharedStringsXml(xml) {
  const strings = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml)) !== null) {
    const inner = m[1];
    // 富文本：<r><t>...</t></r><r><t>...</t></r>，或者简单：<t>...</t>
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    let text = "";
    while ((tm = tRegex.exec(inner)) !== null) {
      text += decodeXmlEntities(tm[1]);
    }
    strings.push(text);
  }
  return strings;
}

// 解析 sheet XML，返回二维数组 rows[rowIndex][colIndex]
function extractXlsxRows(sheetXml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRegex.exec(sheetXml)) !== null) {
    const inner = rm[1];
    const cells = [];
    // cell：<c r="A1" t="s"><v>0</v></c> 或 <c r="A1" t="inlineStr"><is><t>...</t></is></c>
    // 也可能是自闭合：<c r="A1"/>（空单元格）
    // 注意：属性顺序不固定（r 和 t 可能互换），用 [^>]* 匹配整个开始标签后单独提取 t
    const cellRegex = /<c\b([^>]*?)>([\s\S]*?)<\/c>|<c\b([^>]*?)\/>/g;
    let cm;
    while ((cm = cellRegex.exec(inner)) !== null) {
      const attrs = cm[1] || cm[3] || "";
      const content = cm[2] || "";
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : null;
      let value = "";
      if (type === "s") {
        // shared string：通过 <v> 中的索引查表
        const vMatch = content.match(/<v>([\s\S]*?)<\/v>/);
        if (vMatch) {
          const idx = Number(vMatch[1]);
          value = sharedStrings[idx] || "";
        }
      } else if (type === "inlineStr" || type === "str") {
        // 内联字符串：找 <is><t>...</t></is> 或 <t>...</t>
        const tMatch = content.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        if (tMatch) value = decodeXmlEntities(tMatch[1]);
      } else {
        // 数字、布尔、日期等：取 <v>
        const vMatch = content.match(/<v>([\s\S]*?)<\/v>/);
        if (vMatch) value = vMatch[1];
      }
      // 注意：cell 的 r 属性（如 "A1"）暗示列位置，空 cell 通常被省略，这里简单按出现顺序存储
      // 缺点：跳过空 cell 后列会错位，但对问卷场景影响较小
      cells.push(value);
    }
    if (cells.some((c) => String(c || "").trim())) {
      rows.push(cells);
    }
  }
  return rows;
}

// 智能拼接：识别 题号 / 题目内容 / 题型 / 选项 列，按 parseQuestionnaireText 友好格式拼接
function buildQuestionnaireTextFromXlsxRows(rows) {
  if (!rows.length) return "";

  // 1. 尝试识别表头列
  const header = rows[0].map((h) => String(h || "").trim());
  const findCol = (keywords) => header.findIndex((h) => keywords.some((k) => h.includes(k)));
  const idIdx = findCol(["题号", "题目编号", "question id", "q id", "q编号"]);
  const textIdx = findCol(["题目内容", "题干", "question", "题目"]);
  const typeIdx = findCol(["题型", "题目类型", "type"]);
  const optionsIdx = findCol(["选项", "options", "答案选项"]);

  // 2. 无表头识别：每行所有非空 cell 用空格拼接（兼容简单的"题号 + 题目"两列结构）
  if (idIdx < 0 && textIdx < 0) {
    return rows
      .map((r) => r.filter((c) => String(c || "").trim()).join(" "))
      .filter((line) => line.trim())
      .join("\n");
  }

  // 3. 有表头：从第二行开始按列结构拼接
  const lines = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some((c) => String(c || "").trim())) continue;

    const parts = [];
    if (idIdx >= 0 && row[idIdx]) {
      const id = String(row[idIdx]).trim();
      // 标准化为 "Q1." 前缀，方便 parseQuestionLine 剥离
      parts.push(/^Q?[\dA-Za-z]/.test(id) ? `${id}.` : id);
    }
    if (textIdx >= 0 && row[textIdx]) {
      parts.push(String(row[textIdx]).trim());
    }
    const typeStr = typeIdx >= 0 ? String(row[typeIdx] || "").trim() : "";
    const optionsStr = optionsIdx >= 0 ? String(row[optionsIdx] || "").trim() : "";
    if (typeStr) {
      // 标准化题型：单选题 → 单选；多选题 → 多选；量表题 → 量表10分（如果带分值则用分值）
      const normalizedType = normalizeXlsxType(typeStr);
      if (normalizedType) parts.push(`【${normalizedType}】`);
    }
    if (optionsStr) parts.push(optionsStr);

    const line = parts.join(" ").trim();
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

// 把 Excel 中常见的题型写法标准化为 parseQuestionLine 能识别的标记
function normalizeXlsxType(typeStr) {
  const s = String(typeStr || "").trim();
  const t = s.toLowerCase().replace(/\s+/g, "");
  const numMatch = t.match(/(\d+)/);
  const num = numMatch ? numMatch[1] : null;

  // 1. 矩阵：识别 "矩阵5分" / "矩阵题 5分" / "matrix 5" 等，带分值时输出 "矩阵N分"
  if (/矩阵|matrix/.test(t)) {
    return num ? `矩阵${num}分` : "矩阵";
  }
  // 2. 量表：识别 "量表10分" / "10分量表" / "scale 7" / "7分打分" 等
  if (/量表|scale|打分|评分/.test(t)) {
    return num ? `量表${num}分` : "量表";
  }
  // 3. 纯题型（无分值）
  if (/单选|single/.test(t)) return "单选";
  if (/多选|multiple|checkbox/.test(t)) return "多选";

  // 4. 直接传入已标准化格式（"单选" / "多选" / "量表5分" / "矩阵10分" 等）
  if (/^(单选|多选|量表\d*分?|矩阵\d*分?)$/.test(s)) return s;

  // 5. 无法识别时保留原文（让 parseQuestionLine 兜底）
  return s || null;
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

// 从 docx 的 word/document.xml 中提取段落文本，按 <w:p> 分行
function extractParagraphsFromDocxXml(xml) {
  // 按顺序遍历段落内的 <w:t>...</w:t>、<w:tab/>、<w:br/> 节点，拼接成段落文本
  // 这样 tab/br 才能正确插入到对应位置（它们在 <w:r> 内但不在 <w:t> 内）
  const paragraphs = [];
  const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let m;
  while ((m = pRegex.exec(xml)) !== null) {
    const inner = m[1];
    let text = "";
    const nodeRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
    let nm;
    while ((nm = nodeRegex.exec(inner)) !== null) {
      // 注意：<w:tab 也以 <w:t 开头，必须先判断 tab/br
      if (nm[0].startsWith("<w:tab")) {
        text += " ";
      } else if (nm[0].startsWith("<w:br")) {
        text += "\n";
      } else {
        // <w:t>...</w:t>
        text += decodeXmlEntities(nm[1]);
      }
    }
    if (text.trim()) paragraphs.push(text.trim());
  }
  return paragraphs.join("\n");
}

function decodeXmlEntities(text) {
  return String(text)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

// 根据文件扩展名分派到 docx / xlsx 解析器
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

async function importQuestionnaireFile(file) {
  if (!file) return;
  state.isImportingDocx = true;
  state.importError = "";
  render();
  try {
    const text = await extractQuestionnaireFileText(file);
    if (!text.trim()) {
      throw new Error("文档内容为空，请确认文件中包含问卷题目");
    }
    syncResearchForm();
    state.questionnaireText = text;
    const parsed = parseQuestionnaireText(text);
    if (parsed.length < 3) {
      state.isImportingDocx = false;
      render();
      toast("已读取文档，但未识别出 3 道以上题目，请检查文本");
      return;
    }
    state.quantQuestions = parsed.slice(0, 8);
    state.quantInputMode = "manual";
    state.isImportingDocx = false;
    const label = file.name.toLowerCase().endsWith(".xlsx") ? "Excel" : "Word";
    toast(`已从 ${label} 识别 ${parsed.length} 道题目${parsed.length > 8 ? "（已截取前 8 道）" : ""}`);
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

function buildQuantPrompt() {
  const c = state.audienceConfig;
  const questions = state.quantQuestions.map((q, i) => {
    let detail = "";
    if (q.type === "single") detail = `【单选】选项：${q.options}`;
    else if (q.type === "multiple") detail = `【多选】选项：${q.options}`;
    else if (q.type === "scale") detail = `【量表】${q.scale}分制`;
    else if (q.type === "matrix") detail = `【矩阵打分】${q.scale}分制，评价维度：${q.rows}`;
    return `${i + 1}. ${q.text} ${detail}`;
  }).join("\n");

  return `你是一位资深市场研究数据分析师，擅长用定量数据模拟消费者行为。请为以下研究设计生成合理的问卷统计结果。

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

## 模拟样本量
N = ${state.sampleSize}

## 问卷结构
${questions}

## 生成要求
1. 为每道题目生成合理的统计分布，数据应反映目标人群的真实消费行为、态度倾向和配额结构。
2. 数据要有内在一致性，不同题目之间应有逻辑关联（例如：重视健康的人购买意愿更高）。
3. 单选题：各选项百分比之和为100%，分布要合理（不要全部平均分配）。
4. 多选题：各选项百分比可超过100%，反映选择该选项的人数比例。
5. 量表题：给出每个分值的频数分布（总和=100%），计算均值和标准差。均值应合理反映整体态度（如偏积极则均值>3）。
6. 矩阵题：给出每个评价维度的均值和分布。维度之间应有差异（如"口味"通常比"包装"得分高）。
7. 分析摘要要包含：
   - 一段200字以内的总结
   - 3-5条关键发现（每条具体、有洞察）
   - 2-3组交叉分析（例如"高健康重视度 vs 购买意愿"）
   - **rationale 数组**：为每道题单独提供一条"比例分布说明"，用于证明数据分布可信。每条必须包含：
     * questionIndex：题目序号（从 0 开始）
     * reasoning：80-150 字说明，需引用：1）人群画像 / 配额特征如何影响该题分布；2）该题与其他题的内在一致性（如"重视健康的人购买意愿更高"）；3）分布形态的商业逻辑（如"前两选项合计 73% 反映主流选择集中度"）。
     拒绝空洞表述，必须落到具体数字和画像特征上。
   顺序与 questions 数组一一对应。

## 输出格式
请严格按以下JSON格式输出（不要包含markdown代码块标记，直接输出JSON）：

{
  "questions": [
    {
      "text": "题目原文",
      "type": "single|multiple|scale|matrix",
      "optionsArray": ["选项A", "选项B"],
      "values": [42, 31, 17, 10]
    }
  ],
  "analysis": {
    "summary": "分析摘要",
    "findings": ["关键发现1", "关键发现2"],
    "crosstab": [
      ["维度A", "维度B描述", "百分比"]
    ],
    "rationale": [
      {"questionIndex": 0, "reasoning": "该题分布说明，结合人群画像、配额、内在一致性与商业逻辑"}
    ]
  }
}

注意：
- single/multiple 类型的 optionsArray 是选项列表，values 是对应百分比
- scale 类型的 optionsArray 为空，distribution 为各分值频数（见下方），mean 为均值，sd 为标准差
- matrix 类型的 matrix 字段为数组，每个元素有 row（维度名）、mean（均值）、distribution（分布）

请为每道题输出完整的数据结构。`;
}

async function callAI(prompt, onProgress) {
  const configError = validateApiConfig();
  if (configError) throw new Error(configError);

  const { baseUrl, model, key } = getApiConfig();
  state.abortController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    state.abortController?.abort("timeout");
  }, GENERATION_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: "你是一位专业的市场研究专家，擅长消费者行为分析。请严格按照用户要求的格式输出，只输出JSON，不要输出任何其他解释文字。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 4000,
        stream: true
      }),
      signal: state.abortController.signal
    });
  } catch (networkError) {
    if (networkError.name === "AbortError" || state.abortController?.signal.aborted) {
      if (state.abortController?.signal.reason === "user") {
        const abortError = new Error("已取消生成");
        abortError.name = "AbortError";
        throw abortError;
      }
      throw new Error("模型响应超时或已中断。可能是当前模型生成时间过长、网络不稳定，或接口没有正常结束流式响应。请稍后重试，或返回修改研究内容后重新生成。");
    }
    // 网络请求失败（DNS、连接被拒绝、CORS 等）
    throw new Error("网络请求失败：无法连接到模型服务。可能原因：1）API 地址错误；2）网络不通；3）浏览器 CORS 限制。请检查「模型设置」中的 Base URL 是否正确。");
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let friendlyMsg = "";
    if (response.status === 401) {
      friendlyMsg = "API Key 无效或已过期。请检查「模型设置」中的 API Key 是否正确，或前往对应平台重新生成 Key。";
    } else if (response.status === 403) {
      friendlyMsg = "无权限访问该模型。可能原因：Key 没有对应模型的调用权限，或账户余额不足。请检查模型平台的账户状态。";
    } else if (response.status === 429) {
      friendlyMsg = "请求过于频繁，已达到模型平台的速率限制。请稍等片刻后重试。";
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
      throw new Error("模型响应超时或已中断。可能是当前模型生成时间过长、网络不稳定，或接口没有正常结束流式响应。请稍后重试，或返回修改研究内容后重新生成。");
    }
    throw streamError;
  } finally {
    window.clearTimeout(timeoutId);
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
  // 尝试从文本中提取 JSON
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
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

function quotaLabelAt(dimensionId, index) {
  const dimension = state.quotaPlan.find((item) => item.id === dimensionId);
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
  const rationale = questions.map((q, i) => {
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
  return {
    questions,
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
}

function startMockGeneration() {
  syncResearchForm();
  if (!hasResearchReady()) {
    toast("请补全研究内容");
    return;
  }
  state.page = "result";
  state.isGenerating = true;
  state.progress = 1;
  state.generateStatus = "正在生成模拟数据...";
  state.result = null;
  state.resultTab = "primary";
  state.generateError = "";
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

  state.page = "result";
  state.isGenerating = true;
  state.progress = 1;
  state.generateStatus = "正在连接 AI...";
  state.result = null;
  state.resultTab = "primary";
  render();

  let progressTimer = null;
  let statusTimer = null;

  try {
    const prompt = state.mode === "qual" ? buildQualPrompt() : buildQuantPrompt();
    const total = state.mode === "qual" ? 6 : Math.max(5, state.quantQuestions.length + 2);

    let fullContent = "";

    // 进度条动画
    progressTimer = window.setInterval(() => {
      if (state.progress < total) {
        state.progress += 1;
      } else {
        state.generateStatus = "模型仍在返回结果，请稍候...";
      }
      render();
    }, 800);

    // 更新状态文字
    statusTimer = window.setInterval(() => {
      if (state.progress >= total) return;
      if (state.mode === "qual") {
        if (state.progress <= 2) state.generateStatus = "正在构建虚拟用户画像...";
        else if (state.progress <= 4) state.generateStatus = `正在生成第 ${state.progress - 2} 位访谈对象的笔录...`;
        else state.generateStatus = "正在归纳分析主题...";
      } else {
        if (state.progress <= 2) state.generateStatus = "正在模拟样本分布...";
        else if (state.progress <= 4) state.generateStatus = "正在生成统计结果...";
        else state.generateStatus = "正在撰写分析摘要...";
      }
      render();
    }, 1500);

    fullContent = await callAI(prompt, (delta, content) => {
      // 流式更新状态（可选）
    });

    window.clearInterval(progressTimer);
    window.clearInterval(statusTimer);
    progressTimer = null;
    statusTimer = null;

    // 解析 JSON
    const jsonText = extractJSON(fullContent);
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error("JSON 解析失败，原始内容:", fullContent);
      throw new Error("AI 返回格式不正确，请重试。原始内容已输出到控制台。");
    }

    // 验证数据结构
    if (state.mode === "qual") {
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
    } else {
      if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        throw new Error("AI 返回的数据缺少 questions 字段");
      }
      // 确保每个 question 有正确的数据结构
      parsed.questions.forEach((q, i) => {
        if (!q.optionsArray) {
          if (q.type === "single" || q.type === "multiple") {
            const opts = state.quantQuestions[i]?.options?.split(/[,，、]/) || ["选项A", "选项B"];
            q.optionsArray = opts.map((o) => o.trim()).filter(Boolean);
          } else {
            q.optionsArray = [];
          }
        }
        if (!q.values && q.type !== "scale" && q.type !== "matrix") {
          q.values = q.optionsArray.map(() => Math.round(100 / q.optionsArray.length));
        }
        if (q.type === "scale" && !q.distribution) {
          const scaleMax = parseInt(q.scale?.split("-")[1] || "5");
          q.distribution = Array.from({ length: scaleMax }, (_, i) => Math.round(100 / scaleMax));
          if (!q.mean) q.mean = (scaleMax + 1) / 2;
          if (!q.sd) q.sd = "1.0";
        }
        if (q.type === "matrix" && !q.matrix) {
          const rows = state.quantQuestions[i]?.rows?.split(/[,，、]/) || ["维度A"];
          q.matrix = rows.map((r) => ({ row: r.trim(), mean: "3.0", distribution: [20, 20, 20, 20, 20] }));
        }
      });
      if (!parsed.analysis) {
        parsed.analysis = {
          summary: "AI 生成分析摘要时中断，请重新生成。",
          findings: ["请重新生成以获取完整分析"],
          crosstab: [["数据", "不完整", "请重试"]],
          rationale: []
        };
      }
    }

    state.generateError = "";
    state.result = parsed;
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
    if (statusTimer) window.clearInterval(statusTimer);
  }
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

function qualMarkdown() {
  if (!state.result) return "";
  return `# ${state.topic} - 虚拟座谈会笔录\n\n## 用户画像：${state.audience}\n\n` + state.result.users.map((user, i) => {
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
  const rows = ["题目,类型,选项/指标,频数或均值,百分比/分布"];
  state.result.questions.forEach((question) => {
    if (question.type === "scale") {
      question.distribution.forEach((value, index) => rows.push(`"${question.text}","量表","${index + 1}分",${value},${value}%`));
    } else if (question.type === "matrix") {
      question.matrix.forEach((row) => rows.push(`"${question.text}","矩阵打分","${row.row}",${row.mean},"${row.distribution.join("/")}"`));
    } else {
      question.optionsArray.forEach((option, index) => rows.push(`"${question.text}","${question.type === "multiple" ? "多选" : "单选"}","${option}",${question.values[index]},${question.values[index]}%`));
    }
  });
  return rows.join("\n");
}

function quantAnalysisMarkdown() {
  if (!state.result) return "";
  const a = state.result.analysis;
  const questions = state.result.questions || [];
  const rationale = Array.isArray(a.rationale) ? a.rationale : [];
  const rationaleSection = rationale.length > 0
    ? `\n\n## 比例分布说明\n${rationale.map((r) => {
        const idx = typeof r.questionIndex === "number" ? r.questionIndex : -1;
        const q = questions[idx];
        const label = q ? `第 ${idx + 1} 题 · ${q.text}` : `第 ${(idx + 1) || "—"} 题`;
        return `### ${label}\n${r.reasoning || ""}`;
      }).join("\n\n")}`
    : "";
  return `# ${state.topic} - 问卷模拟分析\n\n${a.summary}\n\n## 关键发现\n${a.findings.map((f) => `- ${f}`).join("\n")}\n\n## 交叉表预览\n${a.crosstab.map((row) => `- ${row[0]} / ${row[1]}：${row[2]}`).join("\n")}${rationaleSection}\n\n> 合成数据用于研究设计与假设预验证，不替代真实样本统计推断。`;
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
      </main>
      ${state.showApiPrompt ? ApiPromptModal() : ""}
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
  const active = state.page === page || (state.page === "result" && state.mode === page);
  return `<button class="nav-item ${active ? "active" : ""}" data-route="${page}">${label}</button>`;
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
            <button class="primary large-action" data-action="generate" ${hasResearchReady() ? "" : "disabled"}>生成笔录</button>
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
  const warnings = quotaWarnings();
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
      ${QuotaDesigner(warnings)}
      <div class="quota-preview">
        <span>预览</span>
        <strong>${state.mode === "qual" ? "6 位 AI 合成访谈对象" : `${state.sampleSize} 份 AI 模拟样本`}</strong>
        <p>${escapeHtml(audienceSummary())}</p>
        <p>${escapeHtml(quotaSampleSummary())}</p>
      </div>
    </div>
  `;
}

function QuotaDesigner(warnings) {
  return `
    <section class="quota-designer">
      <div class="section-title compact-title">
        <div>
          <h2>配额设计</h2>
          <p>控制合成人群结构。每组配额建议合计 100%，生成结果会按该结构模拟。</p>
        </div>
        <button class="ghost small-button" data-action="reset-quota">重置配额</button>
      </div>
      <div class="quota-grid">
        ${state.quotaPlan.map((dimension) => QuotaDimension(dimension)).join("")}
      </div>
      ${warnings.length ? `<div class="quota-alert">${warnings.map((item) => `${item.name}合计 ${item.total}%`).join("；")}，建议调整为 100%。</div>` : `<div class="quota-ok">配额合计正确，可用于模拟样本结构。</div>`}
    </section>
  `;
}

function QuotaDimension(dimension) {
  const total = quotaTotal(dimension);
  return `
    <article class="quota-card">
      <div class="quota-card-head">
        <strong>${dimension.name}</strong>
        <span class="${total === 100 ? "quota-total ok" : "quota-total"}">${total}%</span>
      </div>
      <div class="quota-items">
        ${dimension.items.map((item, index) => `
          <div class="quota-item">
            <input id="quota-${dimension.id}-${index}-label" value="${escapeHtml(item.label)}" aria-label="${dimension.name}配额名称" />
            <input id="quota-${dimension.id}-${index}-pct" type="number" min="0" max="100" value="${item.pct}" aria-label="${dimension.name}配额比例" />
            <span>%</span>
            <button class="icon-button" title="删除配额项" data-remove-quota="${dimension.id}:${index}" ${dimension.items.length <= 1 ? "disabled" : ""}>×</button>
          </div>
        `).join("")}
      </div>
      <button class="ghost small-button" data-add-quota="${dimension.id}">添加配额项</button>
    </article>
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
          <button class="primary" data-action="import-questionnaire" ${state.isImportingDocx ? "disabled" : ""}>识别题型并生成问卷</button>
        </div>
        <div class="notice">支持识别【单选】、【多选】、【量表5分/7分/10分】、【矩阵5分/10分】；选项可用 / ， 、 分隔；'其他'/'其它' 会作为合法选项保留。</div>
      ` : `
        ${state.quantQuestions.map((question, index) => `
          <div class="question-card">
            <div class="question-row">
              <input id="q-text-${index}" value="${escapeHtml(question.text)}" placeholder="题目 ${index + 1}" />
              <select id="q-type-${index}" data-qtype="${index}">
                <option value="single" ${question.type === "single" ? "selected" : ""}>单选</option>
                <option value="multiple" ${question.type === "multiple" ? "selected" : ""}>多选</option>
                <option value="scale" ${question.type === "scale" ? "selected" : ""}>量表</option>
                <option value="matrix" ${question.type === "matrix" ? "selected" : ""}>矩阵打分</option>
              </select>
              <button class="ghost" data-remove-question="${index}" ${state.quantQuestions.length <= 3 ? "disabled" : ""}>删除</button>
            </div>
            ${QuantQuestionConfig(question, index)}
          </div>
        `).join("")}
        <button class="ghost" data-action="add-question" ${state.quantQuestions.length >= 8 ? "disabled" : ""}>添加题目</button>
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

function QuantQuestionConfig(question, index) {
  if (question.type === "scale") {
    return `<div class="field"><label>量表范围</label><select id="q-scale-${index}"><option value="1-5" ${question.scale === "1-5" ? "selected" : ""}>1-5 分</option><option value="1-7" ${question.scale === "1-7" ? "selected" : ""}>1-7 分</option><option value="1-10" ${question.scale === "1-10" ? "selected" : ""}>1-10 分</option></select></div>`;
  }
  if (question.type === "matrix") {
    return `
      <div class="field"><label>矩阵行，用逗号分隔</label><input id="q-rows-${index}" value="${escapeHtml(question.rows)}" placeholder="口味, 价格, 包装" /></div>
      <div class="field"><label>打分选项</label><input id="q-options-${index}" value="${escapeHtml(question.options)}" placeholder="1, 2, 3, 4, 5" /></div>
    `;
  }
  return `<div class="field"><label>${question.type === "multiple" ? "多选选项" : "单选选项"}，用逗号分隔</label><input id="q-options-${index}" value="${escapeHtml(question.options)}" /></div>`;
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
  if (!isUsingDefaultKey()) return "";
  return `
    <div class="default-key-banner">
      <div class="banner-icon">🔑</div>
      <div class="banner-text">
        <strong>正在使用内置默认 Key（开箱即用）</strong>
        <span>当前 ${escapeHtml(MODEL_CONFIG[state.provider].name)} 使用项目内置的体验 Key，适合轻度试用。如需长期或大量调用，请在上方填入你自己的 API Key 并保存。</span>
      </div>
    </div>
  `;
}

function SettingsPage() {
  const config = MODEL_CONFIG[state.provider];
  if (!state.apiKey) state.apiKey = getSavedKey();
  const key = state.apiKey.trim() || getSavedKey();
  const validationError = key ? validateKeyFormat(key, state.provider) : null;
  const isValid = !validationError;
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
              const hasDefault = !!DEFAULT_PROVIDER_KEYS[key];
              const status = hasOwnKey ? "已保存 Key" : (hasDefault ? "内置 Key" : "未保存 Key");
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
            <div><h2>${config.name}</h2><p>Key 只保存在本地浏览器。不设置 API Key 则无法生成真实结果。</p></div>
            <span class="status-pill" style="${isValid ? 'background:#2EB75B;color:#fff;' : key ? 'background:#E8534A;color:#fff;' : ''}">${key ? (isValid ? "✅ 格式有效" : "⚠️ 格式异常") : "待设置"}</span>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="api-key">API Key ${isUsingDefaultKey() ? '<span class="default-key-tag">内置</span>' : ""}</label>
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
    </section>
  `;
}

function QuantResultPage() {
  const mockTag = state.result?.isMock ? `<span style="display:inline-block;padding:3px 10px;background:#F5A623;color:#fff;border-radius:4px;font-size:12px;margin-left:8px;vertical-align:middle;">模拟数据</span>` : "";
  return `
    <section class="container">
      <div class="headline">
        <span class="eyebrow">${state.result?.isMock ? "模拟" : "AI"} 定量研究结果</span>
        <h1>${escapeHtml(state.topic)}${mockTag}</h1>
        <p>${state.result?.isMock ? "以下统计数据由本地模拟数据生成，用于快速预览原型功能。建议设置真实 API Key 以获得更高质量结果。" : "以下统计数据和分析由 AI 根据你设定的人群画像生成。"}</p>
      </div>
      ${QuotaResultSummary()}
      ${ResultTabs()}
      ${state.resultTab === "primary" ? QuantStats() : ""}
      ${state.resultTab === "analysis" ? QuantAnalysis() : ""}
    </section>
  `;
}

function QuotaResultSummary() {
  return `
    <section class="quota-result">
      <strong>样本配额</strong>
      <span>${escapeHtml(state.mode === "qual" ? "6 位合成访谈对象" : `${state.sampleSize} 份模拟样本`)}</span>
      <p>${escapeHtml(quotaSampleSummary())}</p>
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

function QuantStats() {
  return `
    <div class="actions">
      <button class="secondary" data-action="regenerate">重新生成</button>
      <button class="ghost" data-route="quant">返回修改</button>
    </div>
    <div class="result-list" style="margin-top:18px">
      ${state.result.questions.map((question, index) => QuantQuestionResult(question, index)).join("")}
    </div>
  `;
}

function QuantQuestionResult(question, index) {
  if (question.type === "scale") {
    return `<article class="result-card"><h2>题目 ${index + 1}: ${escapeHtml(question.text)}</h2><p class="audience">均值：${question.mean} | 标准差：${question.sd} | 样本量：${state.sampleSize}</p>${question.distribution.map((value, i) => Bar(`${i + 1} 分`, value)).join("")}</article>`;
  }
  if (question.type === "matrix") {
    return `<article class="result-card"><h2>题目 ${index + 1}: ${escapeHtml(question.text)}</h2><p class="audience">矩阵打分均值</p>${question.matrix.map((row) => Bar(`${row.row} · 均值 ${row.mean}`, Math.round(Number(row.mean) * 20))).join("")}</article>`;
  }
  return `<article class="result-card"><h2>题目 ${index + 1}: ${escapeHtml(question.text)}</h2><p class="audience">${question.type === "multiple" ? "多选题，百分比可合计超过 100%" : "单选题"} | 样本量：${state.sampleSize}</p>${question.optionsArray.map((option, i) => Bar(option, question.values[i])).join("")}</article>`;
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
  const items = type === "qual"
    ? ["访谈笔录 Markdown", "归纳分析 Markdown", "Word 报告结构预览", "PPT 洞察页大纲"]
    : ["原始样本 CSV", "统计汇总 CSV", "交叉表预览", "分析摘要 Markdown"];
  return `
    <section class="panel">
      <div class="section-title"><div><h2>导出</h2><p>原型阶段用复制到剪贴板模拟文件导出，后续可接 Word / PPT / Excel / PDF。</p></div></div>
      <div class="export-grid">
        ${items.map((item, index) => `<button class="export-card" data-action="${index < 2 ? (index === 0 ? "copy" : "copy-analysis") : "copy-analysis"}"><strong>${item}</strong><span>复制到剪贴板</span></button>`).join("")}
      </div>
    </section>
  `;
}

function Bar(label, value) {
  return `<div class="bar-row"><div>${escapeHtml(label)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, value)}%"></div></div><strong>${value}%</strong></div>`;
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
      state.audience = target.dataset.audience;
      state.audienceConfig = audiencePreset(state.audience);
      state.quotaPlan = quotaFromAudienceConfig(state.audienceConfig);
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
    if (target.hasAttribute("data-add-quota")) {
      syncResearchForm();
      const dimension = state.quotaPlan.find((item) => item.id === target.dataset.addQuota);
      if (dimension) dimension.items.push({ label: "新配额", pct: 0 });
      render();
    }
    if (target.hasAttribute("data-remove-quota")) {
      syncResearchForm();
      const [dimensionId, index] = target.dataset.removeQuota.split(":");
      const dimension = state.quotaPlan.find((item) => item.id === dimensionId);
      if (dimension && dimension.items.length > 1) dimension.items.splice(Number(index), 1);
      render();
    }
    if (action === "reset-quota") {
      syncResearchForm();
      state.quotaPlan = quotaFromAudienceConfig(state.audienceConfig);
      render();
    }
    if (action === "add-question") {
      syncResearchForm();
      state.quantQuestions.push({ text: "", type: "single", options: "选项A, 选项B, 选项C, 选项D", scale: "1-5", rows: "" });
      render();
    }
    if (action === "import-outline") importOutline();
    if (action === "import-questionnaire") importQuestionnaire();
    if (action === "save-settings") saveModelSettings();
    if (action === "clear-key") clearApiKey();
    if (action === "toggle-key") {
      syncSettingsForm();
      state.showKey = !state.showKey;
      render();
    }
    if (action === "generate") startGeneration();
    if (action === "generate-mock") startMockGeneration();
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
      syncResearchForm();
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
  });

  document.body.addEventListener("input", () => {
    if (state.page === "qual" || state.page === "quant") {
      syncResearchForm();
      document.querySelectorAll("[data-action='generate'], [data-action='generate-mock']").forEach((button) => {
        button.disabled = !hasResearchReady();
      });
    }
    if (state.page === "settings") syncSettingsForm();
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
