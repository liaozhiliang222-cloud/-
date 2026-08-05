import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";

const types = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json;charset=utf-8"
};

// ===== dev-only 本地 AI 模拟端点（仅本地开发服务器，生产环境由 Cloudflare Pages functions/api/chat.js 提供）=====
// 用途：无 API Key 时本地跑通「分批生成 → 校验 → 修复 → 分析摘要 → 故事线」完整流水线
// 根据请求中的题目块生成合理统计分布，以 SSE 流式返回（与前端 callAI 解析兼容）

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260804);

function round1(n) {
  return Math.round(n * 10) / 10;
}

// 单选/多选分布：递减 + 抖动；单选校正合计 100
function mockChoiceDist(count, single) {
  let values = Array.from({ length: count }, (_, i) => Math.max(3, Math.round(34 / (i + 1) + rnd() * 12 - 6)));
  if (single) {
    const sum = values.reduce((a, b) => a + b, 0);
    values = values.map((v) => Math.round((v / sum) * 100));
    const diff = 100 - values.reduce((a, b) => a + b, 0);
    values[0] += diff;
  }
  return values;
}

// 量表分布：中高分集中
function mockScaleDist(max) {
  const dist = Array.from({ length: max }, (_, i) => {
    const score = i + 1;
    const center = max * 0.68;
    return Math.max(2, Math.round(100 * Math.exp(-((score - center) ** 2) / (max * 0.9))));
  });
  const sum = dist.reduce((a, b) => a + b, 0);
  const normalized = dist.map((v) => Math.round((v / sum) * 100));
  const diff = 100 - normalized.reduce((a, b) => a + b, 0);
  normalized[0] += diff;
  return normalized.map((v) => Math.max(0, v));
}

// 从提示词中解析题目块并生成统计结果
function mockQuantResults(text) {
  const blocks = [...text.matchAll(/题目索引：(\d+)([\s\S]*?)(?=题目索引：|\n## |$)/g)];
  const results = [];
  for (const [, idx, body] of blocks) {
    const i = Number(idx);
    if (!Number.isInteger(i)) continue;
    if (/题型：量表/.test(body)) {
      const max = Number((body.match(/量表档位数量：(\d+)/) || [])[1] || 5);
      const dist = mockScaleDist(max);
      const mean = dist.reduce((s, v, k) => s + v * (k + 1), 0) / 100;
      results.push({ i, expectedCount: max, dist, mean: round1(mean), sd: round1(Math.max(0.4, max / 6)) });
    } else if (/题型：矩阵/.test(body)) {
      const rows = Number((body.match(/矩阵行数：(\d+)/) || [])[1] || 3);
      const max = Number((body.match(/量表档位数量：(\d+)/) || [])[1] || 5);
      results.push({
        i,
        expectedCount: rows,
        mx: Array.from({ length: rows }, (_, ri) => {
          const d = mockScaleDist(max);
          const m = d.reduce((s, v, k) => s + v * (k + 1), 0) / 100;
          return { m: round1(Math.max(1, Math.min(max, 4.4 - ri * 0.22))), d };
        })
      });
    } else if (/题型：排序题/.test(body)) {
      // v54 排序题：递减平均排名 + 名次分布
      const count = Number((body.match(/选项数量：(\d+)/) || [])[1] || 4);
      const topN = Number((body.match(/可排序名次数：(\d+)/) || [])[1] || count);
      const rankMode = /仅排序前/.test(body) ? "top_n" : "full";
      const items = Array.from({ length: count }, (_, oi) => {
        const avgRank = round1(1 + (oi * (count - 1)) / Math.max(1, count - 1));
        const firstPct = Math.max(5, 44 - oi * 9);
        const rd = Array.from({ length: topN }, (_, k) => Math.max(3, Math.round(100 / topN - (k - oi * 0.4) * (topN > 1 ? 12 : 0))));
        const sum = rd.reduce((a, b) => a + b, 0);
        rd[0] += 100 - sum;
        return { optionIndex: oi, avgRank, firstPct, top3Pct: Math.min(100, Math.round(rd.slice(0, Math.min(3, topN)).reduce((a, b) => a + b, 0))), rankDistribution: rd };
      });
      results.push({ i, type: "rank", rankMode, items, ...(rankMode === "top_n" ? { unrankedPct: 30 } : {}) });
    } else if (/题型：NPS推荐度/.test(body)) {
      // v54 NPS：0-10 分布
      const dist = [1, 2, 3, 4, 6, 9, 12, 16, 18, 16, 13];
      const promoter = dist[9] + dist[10];
      const detractor = dist.slice(0, 7).reduce((a, b) => a + b, 0);
      results.push({
        i, type: "nps", distribution: dist,
        promoterPct: promoter, passivePct: dist[7] + dist[8], detractorPct: detractor,
        nps: promoter - detractor,
        mean: round1(dist.reduce((s, v, k) => s + v * k, 0) / 100)
      });
    } else if (/题型：数值题/.test(body)) {
      // v54 数值题：统计量 + 分段分布（范围从提示词解析）
      const rangeMatch = body.match(/取值范围：(\d+) 到 (\d+)/);
      const lo = rangeMatch ? Number(rangeMatch[1]) : 0;
      const hi = rangeMatch ? Number(rangeMatch[2]) : 10000;
      const span = hi - lo;
      results.push({
        i, type: "numeric",
        mean: Math.round(lo + span * 0.42), median: Math.round(lo + span * 0.38),
        min: lo, max: hi, p25: Math.round(lo + span * 0.22), p75: Math.round(lo + span * 0.58),
        distribution: [
          { label: `${lo}以下`, pct: 12 },
          { label: "中低区间", pct: 26 },
          { label: "中高区间", pct: 38 },
          { label: `${hi}以上`, pct: 24 }
        ]
      });
    } else if (/题型：开放题/.test(body)) {
      results.push({
        i, type: "open", responseCount: 100, otherPct: 7,
        themes: [
          { name: "担心续航/持久度不足", pct: 36, summary: "用户主要担心长时间使用后性能下降或电量不足。", quotes: ["平时够用，但跑远一点就没底。"] },
          { name: "价格偏高", pct: 27, summary: "多数反馈认为当前定价超出心理预期。", quotes: ["质量不错，就是价格再友好一些就好了。"] },
          { name: "品牌信任与口碑", pct: 21, summary: "用户倾向选择熟悉品牌，注重他人评价。", quotes: ["身边人用过我才放心买。"] },
          { name: "功能需求多样化", pct: 18, summary: "部分用户希望增加更多功能场景。", quotes: ["功能再多一点就好了。"] }
        ]
      });
    } else if (/题型：定和分配题/.test(body)) {
      // v54 定和分配：合计=总分
      const count = Number((body.match(/选项数量：(\d+)/) || [])[1] || 4);
      const total = Number((body.match(/总分为 (\d+)/) || [])[1] || 100);
      const base = Array.from({ length: count }, (_, oi) => Math.max(5, Math.round(total * (0.42 - oi * 0.09))));
      const sum = base.reduce((a, b) => a + b, 0);
      const items = base.map((v, oi) => ({
        optionIndex: oi,
        meanPoints: oi === 0 ? v + (total - sum) : v,
        medianPoints: Math.max(0, v - 2)
      }));
      results.push({ i, type: "allocation", totalPoints: total, items });
    } else {
      const count = Number((body.match(/选项数量：(\d+)/) || [])[1] || 4);
      const single = /题型：单选/.test(body);
      results.push({ i, expectedCount: count, v: mockChoiceDist(count, single) });
    }
  }
  return results;
}

// 分析摘要 / 故事线 mock
function mockAnalysis() {
  return {
    analysis: {
      summary: "本地模拟摘要：样本结构符合配额设计，核心选择集中在头部选项，矩阵维度间差异明显，整体数据内部一致性较好。",
      findings: ["头部选项集中度较高，可作为概念验证重点。", "矩阵维度差距明显，建议正式问卷保留分群对比。"],
      crosstab: [["高分组", "头部选项", "62%"], ["中分组", "头部选项", "45%"]],
      rationale: []
    }
  };
}

function mockStoryline() {
  const chapters = [
    { title: "研究背景", slides: [{ title: "研究背景", conclusion: "本报告基于本地模拟数据生成，用于验证工作台流程。", questionIndexes: [], chartType: "summary_card", evidence: ["本地模拟"] }] },
    { title: "核心结论", slides: [{ title: "核心结论", conclusion: "头部选项集中度高。", questionIndexes: [], chartType: "summary_card", evidence: [] }] },
    { title: "人群特征", slides: [{ title: "人群特征", conclusion: "配额符合画像设定。", questionIndexes: [], chartType: "summary_card", evidence: [] }] },
    { title: "使用行为", slides: [{ title: "使用行为", conclusion: "高频使用人群占比较高。", questionIndexes: [], chartType: "summary_card", evidence: [] }] },
    { title: "核心需求", slides: [{ title: "核心需求", conclusion: "需求集中于头部功能。", questionIndexes: [], chartType: "horizontal_bar", evidence: [] }] },
    { title: "主要障碍", slides: [{ title: "主要障碍", conclusion: "价格与习惯是主要障碍。", questionIndexes: [], chartType: "horizontal_bar", evidence: [] }] },
    { title: "概念评价", slides: [{ title: "概念评价", conclusion: "概念整体评价中上。", questionIndexes: [], chartType: "summary_card", evidence: [] }] },
    { title: "购买意愿", slides: [{ title: "购买意愿", conclusion: "购买意愿以观望为主。", questionIndexes: [], chartType: "horizontal_bar", evidence: [] }] },
    { title: "价格和渠道", slides: [{ title: "价格和渠道", conclusion: "价格敏感度中等。", questionIndexes: [], chartType: "summary_card", evidence: [] }] },
    { title: "行动建议", slides: [{ title: "行动建议", conclusion: "优先验证头部需求。", questionIndexes: [], chartType: "summary_card", evidence: [] }] }
  ];
  return { storyline: { chapters } };
}

function sseResponse(response, payload) {
  const fullText = JSON.stringify(payload);
  response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const chunks = [];
  for (let i = 0; i < fullText.length; i += 240) chunks.push(fullText.slice(i, i + 240));
  let k = 0;
  const timer = setInterval(() => {
    if (k >= chunks.length) {
      clearInterval(timer);
      response.write("data: [DONE]\n\n");
      response.end();
      return;
    }
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[k++] } }] })}\n\n`);
  }, 50);
}

// v53：深度解读 mock —— 从提示词中解析当前题目数据，生成结构化解读 JSON
function mockInterpretation(text) {
  // 解析当前题号与数据
  const idxMatch = text.match(/Q(\d+)：/);
  const idx = idxMatch ? Number(idxMatch[1]) - 1 : 0;
  const qTextMatch = text.match(/Q\d+：(.+)/);
  const qText = qTextMatch ? qTextMatch[1].trim() : "核心需求";

  // 从「选项分布」段解析数值
  const dataBlock = text.match(/选项分布：\n([\s\S]*?)\n指标/);
  let options = [];
  if (dataBlock) {
    options = dataBlock[1].split("\n").map((l) => {
      const m = l.match(/-\s*(.+?)：(\d+(?:\.\d+)?)%/);
      return m ? { label: m[1].trim(), value: Number(m[2]) } : null;
    }).filter(Boolean);
  }

  // 从「分布」段解析量表数据
  const scaleBlock = text.match(/分布：\n([\s\S]*?)\n指标/);
  let scaleData = [];
  if (scaleBlock) {
    scaleData = scaleBlock[1].split("\n").map((l) => {
      const m = l.match(/-\s*档位\s*(\d+)：(\d+(?:\.\d+)?)%/);
      return m ? { point: Number(m[1]), value: Number(m[2]) } : null;
    }).filter(Boolean);
  }

  // 从「维度」段解析矩阵数据
  const matrixBlock = text.match(/维度：\n([\s\S]*?)\n指标/);
  let matrixRows = [];
  if (matrixBlock) {
    matrixRows = matrixBlock[1].split("\n").map((l) => {
      const m = l.match(/-\s*(.+?)：均值\s*([\d.]+)/);
      return m ? { label: m[1].trim(), mean: Number(m[2]) } : null;
    }).filter(Boolean);
  }

  const isMock = /本地模拟数据/.test(text);

  // 根据数据类型生成解读
  let headline = "";
  let observation = "";
  let drivers = [];
  let evidence = [];
  let implication = "";

  if (options.length >= 2) {
    const top1 = options[0];
    const top2 = options[1];
    const gap = round1(top1.value - top2.value);
    const top2Sum = round1(top1.value + top2.value);
    headline = `「${top1.label}」以${top1.value}%领先，Top2合计${top2Sum}%`;
    observation = `当前题目中，「${top1.label}」占比${top1.value}%位居第一${top2 ? `，其次「${top2.label}」${top2.value}%` : ""}，Top2 合计 ${top2Sum}%，差距 ${gap} 个百分点。分布${top1.value >= 50 ? "明显集中" : "较为分散"}${options.length > 5 ? "，存在一定长尾" : ""}。`;
    drivers = [
      `目标人群的品类行为偏好可能与「${top1.label}」高度相关，该选择反映了当前阶段的核心需求。`,
      `配额人群画像中的消费力与心理标签，可能使该选项的认知门槛更低。`
    ];
    evidence = options.slice(0, 3).map((o) => ({ questionIndex: idx, label: o.label, value: o.value }));
    implication = `建议将「${top1.label}」作为后续研究的主假设，并在正式问卷中设计交叉验证题目，同时保留「${top2.label}」作为对照组以检验需求集中度。`;
  } else if (scaleData.length >= 2) {
    const n = scaleData.length;
    const top2 = round1(scaleData[n - 1].value + scaleData[n - 2].value);
    const bottom2 = round1(scaleData[0].value + scaleData[1].value);
    const mean = round1(scaleData.reduce((s, d) => s + d.value * d.point, 0) / 100);
    headline = `均值 ${mean}（${n}分制），态度${mean >= n * 0.7 ? "偏正向" : mean <= n * 0.3 ? "偏负向" : "中立"}`;
    observation = `均值 ${mean}（${n} 分制），Top2Box ${top2}%，Bottom2Box ${bottom2}%。分布${top2 >= 60 ? "集中在高分段" : bottom2 >= 40 ? "集中在低分段" : "较为分散"}。`;
    drivers = [
      `目标人群对当前概念/产品的整体态度可能与均值表现一致，反映了该群体的认知阶段。`,
      `配额画像中的生活方式标签可能影响评分倾向，正向态度人群占比与 Top2Box 吻合。`
    ];
    evidence = [
      { questionIndex: idx, label: "均值", value: mean },
      { questionIndex: idx, label: "Top2Box", value: top2 }
    ];
    implication = `均值 ${mean} 可作为后续正式问卷的基准对标值，建议设计分群对比以验证不同人群段的态度差异。`;
  } else if (matrixRows.length >= 2) {
    const sorted = [...matrixRows].sort((a, b) => b.mean - a.mean);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    const gap = round1(top.mean - bottom.mean);
    headline = `「${top.label}」均值最高（${top.mean}），差距${gap}分`;
    observation = `维度中「${top.label}」均值 ${top.mean} 最高，「${bottom.label}」均值 ${bottom.mean} 最低，差距 ${gap} 分。${gap >= 1 ? "维度间差异明显，存在明确优先级。" : "各维度接近，无明显短板。"}`;
    drivers = [
      `目标人群对「${top.label}」的重视可能与使用场景需求直接相关，该维度反映了核心决策因素。`,
      `「${bottom.label}」均值较低，可能反映该维度在当前阶段尚未形成明确价值感知。`
    ];
    evidence = sorted.slice(0, 3).map((r) => ({ questionIndex: idx, label: r.label, value: r.mean }));
    implication = `建议在正式问卷中保留「${top.label}」作为核心测量维度，并针对「${bottom.label}」设计改进方案验证题。`;
  } else {
    headline = "数据分布显示主流选择集中";
    observation = "当前题目数据已完整生成，分布符合预期，可用于后续分析。";
    drivers = ["目标人群的品类行为偏好可能影响分布形态。"];
    evidence = [{ questionIndex: idx, label: "数据完整", value: 100 }];
    implication = "建议结合相关题目交叉分析，验证假设一致性。";
  }

  return {
    headline,
    observation,
    possibleDrivers: drivers,
    evidence,
    implication,
    confidence: evidence.length >= 2 ? "medium" : "low",
    caveat: isMock
      ? "该结果为本地模拟数据，AI 解读仅用于功能预览，不代表真实样本因果结论。"
      : "该结果为合成数据或模拟数据，解释用于研究假设和业务推演，不代表真实样本因果结论。"
  };
}

// 定性笔录 mock：从提示词中解析研究主题与访谈问题，生成6位差异化虚拟访谈对象
function mockQualResult(text) {
  const topicMatch = text.match(/## 研究主题\n([\s\S]*?)(?=\n##|\n$|$)/);
  const topic = (topicMatch?.[1] || "").trim();
  const questionsBlock = text.match(/## 访谈问题\n([\s\S]*?)(?=\n##|$)/);
  const questions = (questionsBlock?.[1] || "")
    .split("\n").map((l) => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);

  const profiles = [
    { name: "林晓婧", age: 27, city: "上海", avatar: "女", role: "价格敏感但愿意尝鲜", sentiment: "谨慎正向" },
    { name: "王建国", age: 31, city: "北京", avatar: "男", role: "重视成分和安全感", sentiment: "中性观望" },
    { name: "陈雨桐", age: 25, city: "杭州", avatar: "女", role: "看重社交分享属性", sentiment: "积极尝试" },
    { name: "周敏", age: 33, city: "广州", avatar: "女", role: "偏理性，会比较替代品", sentiment: "中性观望" },
    { name: "赵一鸣", age: 29, city: "深圳", avatar: "男", role: "追求效率和便利", sentiment: "积极尝试" },
    { name: "刘可", age: 35, city: "成都", avatar: "女", role: "注重品牌可信度", sentiment: "谨慎正向" }
  ];
  const answerPools = [
    "第一感觉是有记忆点，但我会先看它和现有选择到底差在哪里。如果能把核心卖点和使用场景说清楚，我愿意进一步了解。",
    "我更可能在明确需求出现时尝试，比如办公室囤货、朋友聚会或看到身边人推荐。价格不要太跳，首购门槛低会更容易下单。",
    "最大的顾虑是宣传和真实体验不一致。成分、口味、售后评价这些细节，会直接影响我是不是把它当成长期选择。",
    "我觉得概念本身有吸引力，但需要更多真实用户反馈来背书。如果有试用装或者小规格体验款，我会更愿意先试一下。",
    "从实用性角度看，关键看能不能真正解决我的痛点。如果只是噱头大于实质，我可能观望一段时间再做决定。",
    "我比较看重品牌的长期信誉和售后保障。如果品牌在品类里有口碑积累，我的信任度会高很多。"
  ];
  const users = profiles.map((p, idx) => ({
    ...p,
    persona: `${p.role}，${p.sentiment}`,
    answers: questions.length
      ? questions.map((q, qi) => ({
          question: q,
          answer: answerPools[(qi + idx) % answerPools.length]
        }))
      : [{ question: "（未检测到访谈问题）", answer: answerPools[idx % answerPools.length] }]
  }));
  return {
    users,
    analysis: {
      summary: `当前模拟样本中，6 位对象对「${topic || "该产品"}」的整体态度以谨慎正向和观望为主。核心发现集中在：产品概念有吸引力，但转化需要更强的场景触发和信任背书。`,
      themes: [
        { name: "概念吸引力", value: 72, detail: "多数对象认可创新方向，但希望看到更具体的使用场景。" },
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

function handleMockChat(request, response) {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    try {
      const parsed = JSON.parse(body || "{}");
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      const last = [...messages].reverse().find((m) => m && m.role === "user");
      const text = String(last?.content || "");
      if (/报告故事线/.test(text)) {
        sseResponse(response, mockStoryline());
      } else if (/虚拟访谈|资深消费者研究顾问|生成6位/.test(text)) {
        sseResponse(response, mockQualResult(text));
      } else if (/资深消费者研究分析师/.test(text) && /数据解读/.test(text)) {
        // v53：逐题深度解读 mock
        sseResponse(response, mockInterpretation(text));
      } else if (/关键发现|analysis/.test(text) && !/题目索引：/.test(text)) {
        sseResponse(response, mockAnalysis());
      } else {
        sseResponse(response, { results: mockQuantResults(text) });
      }
    } catch (err) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: String(err.message || "bad request") }));
    }
  });
}

// dev-only：noop Service Worker —— 禁用 PWA 缓存，避免本地开发迭代被 Service Worker 缓存困扰
// （仅本地开发服务器生效，生产环境仍使用项目根目录的 sw.js）
const NOOP_SW = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
self.addEventListener("fetch", (event) => {});`;

createServer(async (request, response) => {
  try {
    // dev-only：本地 AI 模拟端点（仅本地开发，生产走 Cloudflare functions /api/chat）
    if (request.url?.startsWith("/api/chat")) {
      handleMockChat(request, response);
      return;
    }
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    // dev-only：noop Service Worker，防止 SW 缓存干扰开发
    if (requestPath === "/sw.js") {
      response.writeHead(200, { "Content-Type": "text/javascript;charset=utf-8" });
      response.end(NOOP_SW);
      return;
    }
    // dev-only：?autogen=1 注入调试脚本——自动把 4 道题配置为新题型并点击生成，
    // 用于无法手动操作浏览器的环境端到端验证 v54 题型系统（仅本地开发服务器生效）
    const filePath = normalize(join(root, requestPath));
    if (requestPath === "/index.html" && url.searchParams.has("autogen")) {
      const html = await readFile(filePath, "utf-8");
      const inject = `<script>
window.addEventListener("load", function () {
  setTimeout(function () {
    try {
      var set = function (sel, val) {
        var el = document.querySelector(sel);
        if (el) {
          el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      };
      set("#q-text-0", "请将以下功能按重要程度排序");
      set("#q-options-0", "事故取证, 日常记录, 停车监控, 远程查看");
      set("#q-type-0", "rank");
      set("#q-text-1", "请问你有多大可能向朋友推荐这款产品（0-10分）");
      set("#q-type-1", "nps");
      set("#q-text-2", "你能接受的最高价格是多少元");
      set("#q-type-2", "numeric");
      set("#q-text-3", "请将100分分配给以下购买因素");
      set("#q-options-3", "价格, 品牌, 功能, 售后");
      set("#q-type-3", "allocation");
      setTimeout(function () {
        var b = document.querySelector(".generate-bar [data-action='generate'], .generate-bar [data-action='generate-mock']");
        if (b && !b.disabled) b.click();
      }, 900);
    } catch (e) { console.error("autogen:", e); }
  }, 500);
});
</script>`;
      response.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
      response.end(html.replace("</body>", inject + "</body>"));
      return;
    }
    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain;charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, host, () => {
  console.log(`SynthUser prototype: http://${host}:${port} (dev mock AI endpoint at /api/chat)`);
});
