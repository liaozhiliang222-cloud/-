const MODEL_CONFIG = {
  kimi: { name: "Kimi", key: "synthuser_api_key_kimi", placeholder: "sk-...", model: "moonshot-v1-8k" },
  deepseek: { name: "DeepSeek", key: "synthuser_api_key_deepseek", placeholder: "sk-...", model: "deepseek-chat" },
  zhipu: { name: "智谱 GLM", key: "synthuser_api_key_zhipu", placeholder: "请输入 GLM API Key", model: "glm-4" },
  custom: { name: "自定义模型", key: "synthuser_api_key_custom", placeholder: "兼容 OpenAI 格式的 API Key", model: "your-model-name" }
};

const templates = [
  ["0 糖气泡水概念测试", "年轻白领", ["口味", "价格", "健康", "场景"]],
  ["新能源汽车购买决策因素", "一线城市潜在购车者", ["续航", "价格", "品牌", "充电"]],
  ["海外用户对短视频电商的接受度", "北美 / 欧洲 / 日韩用户", ["跨境电商", "短视频", "消费习惯"]],
  ["小红书用户社交需求探索", "小红书活跃用户", ["内容偏好", "互动", "社区氛围"]],
  ["母婴用品选购痛点", "0-3 岁宝宝妈妈", ["安全", "价格", "品牌", "渠道"]]
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
  result: null,
  showApiPrompt: false,
  deferredInstallPrompt: null,
  installAvailable: false,
  isStandalone: window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true,
  isOnline: navigator.onLine,
  toast: ""
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

function hasModelReady() {
  return Boolean(getSavedKey());
}

function route(page) {
  if (page === "qual" || page === "quant") state.mode = page;
  state.page = page;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message) {
  state.toast = message;
  render();
  window.setTimeout(() => {
    state.toast = "";
    render();
  }, 1800);
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

function saveModelSettings() {
  syncSettingsForm();
  if (state.apiKey.trim()) localStorage.setItem(MODEL_CONFIG[state.provider].key, state.apiKey.trim());
  localStorage.setItem("synthuser_provider", state.provider);
  localStorage.setItem("synthuser_custom_base_url", state.customBaseUrl.trim());
  localStorage.setItem("synthuser_custom_model", state.customModel.trim());
  toast("模型设置已保存");
}

function clearApiKey() {
  localStorage.removeItem(MODEL_CONFIG[state.provider].key);
  state.apiKey = "";
  toast("API Key 已清除");
}

function useTemplate(index) {
  const template = templates[index];
  state.topic = template[0];
  state.audience = template[1];
  state.audienceConfig = audiencePreset(template[1]);
  state.result = null;
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

function importQuestionnaire() {
  syncResearchForm();
  const lines = state.questionnaireText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const parsed = lines.map(parseQuestionLine).filter(Boolean);
  if (parsed.length >= 3) {
    state.quantQuestions = parsed.slice(0, 8);
    state.quantInputMode = "manual";
    toast("已识别问卷题目");
  } else {
    toast("至少需要识别 3 道题");
  }
  render();
}

function parseQuestionLine(line) {
  const clean = line.replace(/^Q?\d+[.、\s]*/i, "").trim();
  if (!clean) return null;
  const bracket = clean.match(/【([^】]+)】/);
  const label = bracket ? bracket[1] : "";
  const text = clean.replace(/【[^】]+】/, "").split(/[:：]/)[0].trim();
  const tail = clean.includes("】") ? clean.split("】").slice(1).join("】") : clean.split(/[:：]/).slice(1).join(" ");
  const options = tail.replace(/[;；]/g, "/").split(/[\/|｜]/).map((item) => item.trim()).filter(Boolean).join(", ");
  if (/矩阵/.test(label)) return { text, type: "matrix", options: /10/.test(label) ? "1, 2, 3, 4, 5, 6, 7, 8, 9, 10" : "1, 2, 3, 4, 5", scale: /10/.test(label) ? "1-10" : "1-5", rows: options || "指标A, 指标B, 指标C" };
  if (/多选/.test(label)) return { text, type: "multiple", options: options || "选项A, 选项B, 选项C", scale: "1-5", rows: "" };
  if (/量表|打分|评分|10分/.test(label)) return { text, type: "scale", options: "", scale: /10/.test(label) ? "1-10" : /7/.test(label) ? "1-7" : "1-5", rows: "" };
  return { text, type: "single", options: options || "选项A, 选项B, 选项C, 选项D", scale: "1-5", rows: "" };
}

function startGeneration() {
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
  state.result = null;
  state.resultTab = "primary";
  render();

  const total = state.mode === "qual" ? 6 : Math.max(5, state.quantQuestions.length + 2);
  const timer = window.setInterval(() => {
    state.progress += 1;
    if (state.progress > total) {
      window.clearInterval(timer);
      state.isGenerating = false;
      state.result = state.mode === "qual" ? makeQualResult() : makeQuantResult();
    }
    render();
  }, 420);
}

function makeQualResult() {
  const names = ["林晓婧", "王建国", "陈雨桐", "周敏", "赵一鸣", "刘可"];
  const cities = ["上海", "成都", "杭州", "广州", "北京", "武汉"];
  const roles = ["价格敏感但愿意尝鲜", "重视成分和安全感", "看重社交分享属性", "偏理性，会比较替代品", "追求效率和便利", "注重品牌可信度"];
  const avatars = ["女", "男", "研", "数", "策", "品"];
  const users = names.map((name, index) => ({
    avatar: avatars[index],
    name,
    age: 24 + index * 4,
    city: cities[index],
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
    analysis: {
      summary: `围绕“${audienceSummary()}”生成的合成人群整体态度偏谨慎正向。用户愿意尝试，但前提是概念表达具体、价格门槛可接受，并且能通过成分、评价或场景证明降低不确定感。`,
      themes: [
        { name: "尝鲜动机", value: 42, detail: "被健康、便利、新口味吸引，但不会盲目复购。" },
        { name: "价格顾虑", value: 33, detail: "用户希望首购低门槛，长期价格不能显著高于替代品。" },
        { name: "信任证据", value: 25, detail: "成分、真实评价、品牌背书是转化关键。" }
      ],
      recommendations: [
        "首屏卖点应聚焦一个强场景，而不是堆叠多个功效。",
        "建议提供低门槛试饮装或组合装，降低首次尝试成本。",
        "后续真实调研应重点验证价格带和复购驱动因素。"
      ]
    }
  };
}

function makeQuantResult() {
  const questions = state.quantQuestions.map((question, index) => {
    if (question.type === "scale") {
      const distribution = question.scale === "1-10" ? [2, 3, 5, 8, 12, 16, 20, 18, 10, 6] : question.scale === "1-7" ? [4, 8, 13, 24, 27, 16, 8] : [8, 15, 25, 35, 17];
      const mean = distribution.reduce((sum, count, i) => sum + count * (i + 1), 0) / 100;
      return { ...question, index, distribution, mean: mean.toFixed(1), sd: question.scale === "1-7" ? "1.4" : "0.9" };
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
    const values = base.slice(0, opts.length);
    const normalized = question.type === "single" ? normalizeTo100(values) : values;
    return { ...question, index, optionsArray: opts, values: normalized };
  });
  return {
    questions,
    analysis: {
      summary: `当前模拟样本 N=${state.sampleSize}，合成人群为“${audienceSummary()}”。结果显示购买意向和健康重视度存在正向关系，多场景触发比单一卖点更适合进入正式问卷验证。`,
      exports: ["原始样本 CSV", "统计汇总 CSV", "分析摘要 Markdown"],
      findings: [
        "购买意向集中在“可能会”，说明概念具备探索价值但仍需强化转化理由。",
        "矩阵题显示口味和成分权重最高，价格是明显的二级影响因素。",
        "建议正式投放前增加城市层级或使用频率交叉分析。"
      ],
      crosstab: [
        ["健康重视高", "一定会/可能会", "68%"],
        ["健康重视中", "一定会/可能会", "47%"],
        ["健康重视低", "一定会/可能会", "29%"]
      ]
    }
  };
}

function splitList(value) {
  return value.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeTo100(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  const mapped = values.map((value) => Math.round((value / total) * 100));
  mapped[mapped.length - 1] = 100 - mapped.slice(0, -1).reduce((sum, value) => sum + value, 0);
  return mapped;
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
  return `# ${state.topic} - 虚拟座谈会笔录\n\n## 用户画像：${state.audience}\n\n` + state.result.users.map((user, i) => {
    const answers = user.answers.map((item, idx) => `**Q${idx + 1}: ${item.question}**\n${item.answer}`).join("\n\n");
    return `### 用户 ${i + 1}：${user.name}（${user.age} 岁，${user.city}）\n**标签**：${user.role}\n**态度**：${user.sentiment}\n\n${answers}`;
  }).join("\n\n---\n\n");
}

function qualAnalysisMarkdown() {
  const a = state.result.analysis;
  return `# ${state.topic} - 归纳分析\n\n## 核心结论\n${a.summary}\n\n## 主题聚类\n${a.themes.map((t) => `- ${t.name}（${t.value}%）：${t.detail}`).join("\n")}\n\n## 行动建议\n${a.recommendations.map((r) => `- ${r}`).join("\n")}`;
}

function quantCsv() {
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
  const status = state.isStandalone ? "已作为应用运行" : state.isOnline ? "在线 · 支持安装和离线访问" : "离线模式 · 可查看已缓存页面";
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
            <span class="eyebrow">虚拟座谈会</span>
            <h1>定性研究：从问题到笔录，再到归纳分析</h1>
            <p>当前版本支持手动问题设计。生成后进入结果页查看访谈笔录、主题聚类和行动建议。</p>
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
  return `
    <section class="container">
      <div class="page-layout">
        ${WorkflowSteps(["问卷设计", "题型配置", "模拟统计", "分析摘要"])}
        <div>
          <div class="headline">
            <span class="eyebrow">问卷模拟器</span>
            <h1>定量研究：支持多题型模拟和分析摘要</h1>
            <p>支持手动配置单选、多选、量表和矩阵打分。生成后进入结果页查看统计结果和分析摘要。</p>
          </div>
          ${TemplatePanel()}
          <section class="panel">
            <div class="section-title">
              <div>
                <h2>问卷结构</h2>
                <p>当前原型模拟 N=${state.sampleSize}，后续可扩展到配额矩阵和真实小样本校准。</p>
              </div>
            </div>
            <div class="field compact-field">
              <label for="sample-size">模拟样本量</label>
              <input id="sample-size" type="number" min="50" max="500" value="${state.sampleSize}" />
            </div>
            ${QuantQuestionForm()}
          </section>
          <div class="generate-bar">
            <button class="primary large-action" data-action="generate" ${hasResearchReady() ? "" : "disabled"}>生成问卷结果</button>
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
          return `<button class="template-card" data-template="${index}"><strong>${item[0]}</strong><span>${item[1]}</span></button>`;
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
          <p>先用轻量画像设定控制生成口径，后续可扩展为配额矩阵和 Excel 导入。</p>
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
      <div class="quota-preview">
        <span>预览</span>
        <strong>${state.mode === "qual" ? "6 位访谈对象" : `${state.sampleSize} 份模拟样本`}</strong>
        <p>${escapeHtml(audienceSummary())}</p>
      </div>
    </div>
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
      <div class="notice">生成后会同时输出访谈笔录和归纳分析，便于直接进入报告撰写。</div>
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
      <div class="notice">合成数据用于研究设计与假设预验证，不替代真实样本统计推断。</div>
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
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="需要设置 API Key">
      <div class="modal">
        <h2>需要先设置 API Key</h2>
        <p>生成会调用你自己的模型账号。请先到模型设置里保存 API Key，再回到这里继续生成。</p>
        <div class="actions">
          <button class="primary" data-action="go-settings">去模型设置</button>
          <button class="ghost" data-action="close-api-prompt">稍后再说</button>
        </div>
      </div>
    </div>
  `;
}

function SettingsPage() {
  const config = MODEL_CONFIG[state.provider];
  if (!state.apiKey) state.apiKey = getSavedKey();
  return `
    <section class="container">
      <div class="headline">
        <span class="eyebrow">模型设置</span>
        <h1>把模型和 Key 独立管理</h1>
        <p>研究任务和模型配置分开，为后续多模型对比、内置额度和本地 Keychain 存储预留位置。</p>
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
            <div><h2>${config.name}</h2><p>Key 只保存在本地浏览器。桌面版可迁移到系统 Keychain。</p></div>
            <span class="status-pill">${getSavedKey() ? "已保存" : "待设置"}</span>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="api-key">API Key</label>
              <div class="input-action">
                <input id="api-key" type="${state.showKey ? "text" : "password"}" value="${escapeHtml(state.apiKey)}" placeholder="${config.placeholder}" />
                <button class="ghost" data-action="toggle-key">${state.showKey ? "隐藏" : "显示"}</button>
              </div>
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
  if (!state.result) return EmptyResult();
  return state.mode === "qual" ? QualResultPage() : QuantResultPage();
}

function LoadingResult() {
  const total = state.mode === "qual" ? 6 : Math.max(5, state.quantQuestions.length + 2);
  return `
    <section class="container loading">
      <div>
        <div class="pulse"><span></span><span></span><span></span></div>
        <h1>${state.mode === "qual" ? "正在生成访谈笔录..." : "正在生成问卷模拟结果..."}</h1>
        <p class="audience">进度 ${Math.min(state.progress, total)}/${total}</p>
        <div class="actions" style="justify-content:center"><button class="ghost" data-action="cancel-generation">取消生成</button></div>
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
  return `
    <section class="container">
      <div class="headline">
        <span class="eyebrow">定性研究结果</span>
        <h1>${escapeHtml(state.topic)}</h1>
        <p>生成结果页独立展示，顶部导航仍只保留常驻模块。</p>
      </div>
      ${ResultTabs()}
      ${state.resultTab === "primary" ? QualTranscripts() : ""}
      ${state.resultTab === "analysis" ? QualAnalysis() : ""}
    </section>
  `;
}

function QuantResultPage() {
  return `
    <section class="container">
      <div class="headline">
        <span class="eyebrow">定量研究结果</span>
        <h1>${escapeHtml(state.topic)}</h1>
        <p>支持单选、多选、量表、矩阵打分的模拟统计与分析导出。</p>
      </div>
      ${ResultTabs()}
      ${state.resultTab === "primary" ? QuantStats() : ""}
      ${state.resultTab === "analysis" ? QuantAnalysis() : ""}
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
      <div class="notice">合成数据用于研究设计与假设预验证，不替代真实样本统计推断。</div>
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
    const target = event.target.closest("button");
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
    if (action === "install-app") installApp();
    if (action === "go-settings") {
      state.showApiPrompt = false;
      route("settings");
    }
    if (action === "close-api-prompt") {
      state.showApiPrompt = false;
      render();
    }
    if (action === "copy") copyResult();
    if (action === "copy-analysis") copyAnalysis();
    if (action === "regenerate") startGeneration();
    if (action === "cancel-generation") {
      state.isGenerating = false;
      state.progress = 0;
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
      const button = document.querySelector("[data-action='generate']");
      if (button) button.disabled = !hasResearchReady();
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
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
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
