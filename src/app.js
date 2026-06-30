const MODEL_CONFIG = {
  kimi: { name: "Kimi", key: "synthuser_api_key_kimi", placeholder: "sk-...", model: "moonshot-v1-8k", baseUrl: "https://api.moonshot.cn/v1/chat/completions" },
  deepseek: { name: "DeepSeek", key: "synthuser_api_key_deepseek", placeholder: "sk-...", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1/chat/completions" },
  zhipu: { name: "智谱 GLM", key: "synthuser_api_key_zhipu", placeholder: "请输入 GLM API Key", model: "glm-4", baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions" },
  custom: { name: "自定义模型", key: "synthuser_api_key_custom", placeholder: "兼容 OpenAI 格式的 API Key", model: "your-model-name", baseUrl: "" }
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
  provider: localStorage.getItem("synthuser_provider") || "kimi",
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
  abortController: null
};

const initialMode = new URLSearchParams(window.location.search).get("mode");
if (initialMode === "quant" || initialMode === "qual") {
  state.page = initialMode;
  state.mode = initialMode;
}

const $ = (selector) => document.querySelector(selector);

function getSavedKey(provider = state.provider) {
  return localStorage.getItem(MODEL_CONFIG[provider].key) || "";
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
  return {
    questions,
    isMock: true,
    analysis: {
      summary: `当前模拟样本 N=${state.sampleSize}，合成人群为"${audienceSummary()}"，配额结构为：${quotaSummary()}。结果显示「${topOption}」是相对更突出的选择方向，「${topMatrixRow}」是影响判断的关键因素，${scaleLabel} 可作为后续正式问卷的核心交叉分析变量。`,
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
      ]
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
          crosstab: [["数据", "不完整", "请重试"]]
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
  return `# ${state.topic} - 问卷模拟分析\n\n${a.summary}\n\n## 关键发现\n${a.findings.map((f) => `- ${f}`).join("\n")}\n\n## 交叉表预览\n${a.crosstab.map((row) => `- ${row[0]} / ${row[1]}：${row[2]}`).join("\n")}\n\n> 合成数据用于研究设计与假设预验证，不替代真实样本统计推断。`;
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
        <div class="field"><label for="aud-city">城市层级</label><input id="aud-city" value="${escapeHtml(c.city)}" /></div>
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

function OutlineForm() {
  return `
    <div class="form-grid">
      ${CommonResearchFields()}
      <div class="field">
        <label for="outline-text">访谈大纲</label>
        <textarea id="outline-text" class="large-textarea">${escapeHtml(state.outlineText)}</textarea>
      </div>
      <div class="actions">
        <button class="secondary" data-action="import-outline">从大纲生成问题</button>
      </div>
      <div class="notice">导入后会把大纲拆成 3 个访谈问题。正式版本可扩展为 Word / Markdown 大纲导入。</div>
    </div>
  `;
}

function QualQuestionForm() {
  return `
    <div class="form-grid">
      ${CommonResearchFields()}
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
    </div>
  `;
}

function QuantQuestionForm() {
  return `
    <div class="form-grid">
      ${CommonResearchFields()}
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
    </div>
  `;
}

function QuestionnaireImportForm() {
  return `
    <div class="form-grid">
      ${CommonResearchFields()}
      <div class="field">
        <label for="questionnaire-text">问卷文本</label>
        <textarea id="questionnaire-text" class="large-textarea">${escapeHtml(state.questionnaireText)}</textarea>
      </div>
      <div class="actions">
        <button class="secondary" data-action="import-questionnaire">识别题型并生成问卷</button>
      </div>
      <div class="notice">支持识别【单选】、【多选】、【量表5分/7分/10分】、【矩阵5分/10分】。正式版本可扩展 Excel / 问卷星文本导入。</div>
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
            ${Object.entries(MODEL_CONFIG).map(([key, item]) => `
              <button class="provider-card ${state.provider === key ? "active" : ""}" data-provider="${key}">
                <strong>${item.name}</strong>
                <span>${getSavedKey(key) ? "已保存 Key" : "未保存 Key"}</span>
              </button>
            `).join("")}
          </div>
        </section>
        <section class="panel">
          <div class="section-title">
            <div><h2>${config.name}</h2><p>Key 只保存在本地浏览器。不设置 API Key 则无法生成真实结果。</p></div>
            <span class="status-pill" style="${isValid ? 'background:#2EB75B;color:#fff;' : key ? 'background:#E8534A;color:#fff;' : ''}">${key ? (isValid ? "✅ 格式有效" : "⚠️ 格式异常") : "待设置"}</span>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="api-key">API Key</label>
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
  return `
    <section class="panel">
      <div class="section-title"><div><h2>分析摘要</h2><p>${a.summary}</p></div></div>
      <div class="analysis-grid">
        ${a.crosstab.map((row) => `<div class="analysis-card"><strong>${row[0]}</strong><span>${row[1]}：${row[2]}</span></div>`).join("")}
      </div>
      <h2>关键发现</h2>
      <ul class="insight-list">${a.findings.map((item) => `<li>${item}</li>`).join("")}</ul>
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
