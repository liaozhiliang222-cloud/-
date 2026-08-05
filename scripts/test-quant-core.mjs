// 定量数据完整性机制测试（可重复执行）
// 运行：npm test  或  node scripts/test-quant-core.mjs
// 覆盖：缺失不补0 / 不完整识别 / 自动修复只请求失败题 / 单题重生成 / 导出不写0 / 数据质量汇总

import assert from "node:assert/strict";
import {
  QUANT_BATCH_SIZE,
  REPAIR_BATCH_SIZE,
  MAX_REPAIR_ROUNDS,
  buildQuantPrompt,
  buildBatchPrompt,
  buildQuantRepairPrompt,
  buildSingleQuestionPrompt,
  buildAnalysisPrompt,
  buildQuantBatches,
  mergeRawResults,
  mergeRepairedResults,
  validateQuantResults,
  makeQuantQualitySummary,
  buildQuantCsv,
  buildQuantAnalysisMarkdown,
  // v50 工作台
  detectQuestionModule,
  QUESTION_MODULES,
  MODULE_LABEL,
  SOURCE_LABELS,
  sourceLabel,
  choiceMetrics,
  scaleMetrics,
  matrixMetrics,
  computeQuestionMetrics,
  selectCoreMetrics,
  buildKeyFindings,
  makeQuantQualityDetails,
  buildSimulatedCrosstab,
  CROSSTAB_GROUP_TYPES,
  buildStoryline,
  buildStorylinePrompt,
  normalizeStoryline,
  STORY_CHAPTERS,
  buildXlsxZip,
  buildQuantWorkbook,
  buildQualityWorkbook,
  buildQuantWorkbenchMarkdown,
  // v53 逐题数据解读
  InterpretationStatus,
  InterpretationMode,
  INTERPRETATION_PROMPT_VERSION,
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
  buildQuestionPromptFragment,
  expectedCountOf,
  rankMetrics,
  npsMetrics,
  numericMetrics,
  openMetrics,
  allocationMetrics
} from "../src/quant-core.js";

let passed = 0;
let failed = 0;
const failures = [];

function section(name) {
  console.log(`\n== ${name} ==`);
}

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}

// ===== 测试问卷 =====
// 0: 4选项单选
// 1: 8选项单选
// 2: 12选项多选
// 3: 5分量表
// 4: 10分量表
// 5: 8行矩阵
// 6: 4选项多选（用于缺失/修复测试）
// 7: 4选项单选（用于重复索引测试）
const questions = [
  { text: "你会购买吗？", type: "single", options: "一定会, 可能会, 不确定, 不会", scale: "1-5", rows: "" },
  { text: "你偏好哪个渠道？", type: "single", options: "线上电商, 品牌官网, 线下门店, 社交电商, 直播间, 熟人推荐, 海外代购, 其他", scale: "1-5", rows: "" },
  { text: "影响购买的因素？", type: "multiple", options: "价格, 品牌, 口碑, 功能, 外观, 售后, 物流, 促销, 赠品, 包装, 环保, 其他", scale: "1-5", rows: "" },
  { text: "健康重视程度", type: "scale", options: "", scale: "1-5", rows: "" },
  { text: "满意度评分", type: "scale", options: "", scale: "1-10", rows: "" },
  { text: "各维度重要性", type: "matrix", options: "1,2,3,4,5", scale: "1-5", rows: "口味, 价格, 成分健康, 包装设计, 品牌知名度, 售后保障, 物流速度, 环保属性" },
  { text: "购买渠道偏好（多选）", type: "multiple", options: "线上, 线下, 代购, 海淘", scale: "1-5", rows: "" },
  { text: "复购意愿", type: "single", options: "会, 不会, 看情况", scale: "1-5", rows: "" }
];

const env = {
  topic: "测试主题",
  audienceConfig: { age: "25-34", gender: "均衡", city: "一线", income: "中高", usage: "每周购买", price: "敏感", lifestyle: "健康" },
  quotaText: "性别：女 50% / 男 50%",
  sampleSize: 100,
  questions
};

const ok8 = [20, 18, 16, 14, 12, 10, 6, 4];           // 8项，合计100
const ok5 = [5, 10, 15, 30, 40];                       // 5分量表，合计100
const ok10 = [2, 3, 5, 8, 12, 16, 20, 18, 10, 6];      // 10分量表，合计100

// ===== 1. 提示词构建 =====
section("提示词构建");
check("buildQuantPrompt 含逐题结构化信息（索引/题型/选项数量/完整选项/强制长度）", () => {
  const p = buildQuantPrompt(env);
  assert.match(p, /题目索引：1/);
  assert.match(p, /题型：单选/);
  assert.match(p, /选项数量：8/);
  assert.match(p, /7\. 其他/);                       // 完整选项列表
  assert.match(p, /expectedCount":8/);               // 强制返回长度
  assert.match(p, /v 必须恰好包含 8 个数值/);
  assert.match(p, /不允许只返回前几个选项/);
  assert.match(p, /dist 必须恰好包含 10 个数值/);    // 量表档位数量
  assert.match(p, /矩阵行数：8/);                    // 矩阵行数
  assert.match(p, /mx 必须恰好包含 8 个元素/);
});

check("buildBatchPrompt 只包含指定批次题目", () => {
  const p = buildBatchPrompt(env, [1, 3]);
  assert.match(p, /题目索引：1/);
  assert.match(p, /题目索引：3/);
  assert.doesNotMatch(p, /题目索引：2/);
  assert.doesNotMatch(p, /题目索引：0/);
});

check("buildSingleQuestionPrompt 只包含目标题目", () => {
  const p = buildSingleQuestionPrompt(env, 1);
  assert.match(p, /题目索引：1/);
  assert.doesNotMatch(p, /题目索引：2/);
  assert.match(p, /共 1 道/);
});

check("buildQuantRepairPrompt 只请求失败题目并说明预期数量", () => {
  const p = buildQuantRepairPrompt(env, [
    { questionIndex: 1, message: "第 2 题应返回 8 个选项数值，实际只返回 5 个" },
    { questionIndex: 2, message: "第 3 题应返回 12 个选项数值，实际只返回 5 个" }
  ]);
  assert.match(p, /题目索引：1/);
  assert.match(p, /题目索引：2/);
  assert.doesNotMatch(p, /题目索引：3/);
  assert.match(p, /第 2 题应返回 8 个选项数值，实际只返回 5 个/);
  assert.match(p, /只输出上列指定题目的 results/);
  assert.match(p, /不要返回分析摘要/);
  assert.match(p, /v 必须恰好包含 12 个数值/);
});

check("buildAnalysisPrompt 传入完整数据且不引用不完整题", () => {
  const merged = mergeRawResults([
    { i: 0, v: [40, 30, 20, 10] },
    { i: 1, v: [30, 25, 20, 15, 10] }  // 不完整（8项只给5项）
  ], questions);
  const p = buildAnalysisPrompt(env, merged);
  assert.match(p, /v=\[40,30,20,10\]/);
  assert.doesNotMatch(p, /v=\[30,25,20,15,10\]/);  // 不完整题不引用
  assert.match(p, /数据完整；其余题目数据不完整/);
});

check("buildQuantBatches 矩阵题单独成批、普通题每批不超过10", () => {
  const many = Array.from({ length: 23 }, (_, i) => ({ text: `Q${i}`, type: i === 7 ? "matrix" : "single", options: "A, B, C, D", scale: "1-5", rows: i === 7 ? "r1, r2" : "" }));
  const batches = buildQuantBatches(many);
  assert.ok(batches.every((b) => b.length <= QUANT_BATCH_SIZE), "每批不超过批大小");
  assert.ok(batches.some((b) => b.length === 1 && many[b[0]].type === "matrix"), "矩阵题单独成批");
  const flat = batches.flat();
  assert.equal(flat.length, 23);
  assert.deepEqual([...flat].sort((a, b) => a - b), [...Array(23).keys()]);
});

// ===== 2. 合并与校验 =====
section("合并与校验：缺失不补 0");

check("用例1：4选项单选返回4个值 → complete", () => {
  const merged = mergeRawResults([{ i: 0, v: [40, 30, 20, 10] }], questions);
  assert.equal(merged[0].dataStatus, "complete");
  assert.deepEqual(merged[0].values, [40, 30, 20, 10]);
  assert.deepEqual(merged[0].dataErrors, []);
  // 全卷校验：该题有效（其余未返回的题会被正确标记为缺失，不影响本题状态）
  const v = validateQuantResults({ results: [{ i: 0, v: [40, 30, 20, 10] }] }, questions, merged);
  assert.ok(v.validQuestionIndexes.includes(0));
  assert.ok(!v.invalidQuestionIndexes.includes(0));
});

check("用例2：8选项单选只返回前5个 → incomplete，缺失项不补0", () => {
  const merged = mergeRawResults([{ i: 1, v: [35, 27, 18, 12, 8] }], questions);
  assert.equal(merged[1].dataStatus, "incomplete");
  assert.deepEqual(merged[1].values, [35, 27, 18, 12, 8]);          // 长度保持5，绝无补0
  assert.equal(merged[1].values.length, 5);
  assert.equal(merged[1].values.some((v) => v === 0), false);
  const err = merged[1].dataErrors.find((e) => e.errorType === "option_count_mismatch");
  assert.ok(err, "存在 option_count_mismatch");
  assert.equal(err.expected, 8);
  assert.equal(err.actual, 5);
  assert.match(merged[1].dataError, /第 2 题应返回 8 个选项数值，实际只返回 5 个/);
  const v = validateQuantResults({ results: [{ i: 1, v: [35, 27, 18, 12, 8] }] }, questions, merged);
  assert.equal(v.valid, false);
  assert.ok(v.invalidQuestionIndexes.includes(1));
});

check("用例3：12选项多选只返回前5个 → incomplete", () => {
  const merged = mergeRawResults([{ i: 2, v: [58, 46, 34, 28, 16] }], questions);
  assert.equal(merged[2].dataStatus, "incomplete");
  assert.equal(merged[2].values.length, 5);                        // 不补0
  assert.equal(merged[2].values.some((v) => v === 0), false);
});

check("用例4：5分量表只返回4个分布值 → incomplete", () => {
  const merged = mergeRawResults([{ i: 3, dist: [10, 20, 30, 40], mean: 3.0, sd: 1.0 }], questions);
  assert.equal(merged[3].dataStatus, "incomplete");
  assert.equal(merged[3].distribution.length, 4);                  // 不补0
  assert.ok(merged[3].dataErrors.some((e) => e.errorType === "scale_count_mismatch"));
});

check("用例5：10分量表返回完整10项 → complete", () => {
  const merged = mergeRawResults([{ i: 4, dist: ok10, mean: 5.6, sd: 2.1 }], questions);
  assert.equal(merged[4].dataStatus, "complete");
  assert.deepEqual(merged[4].distribution, ok10);
});

check("用例6：8行矩阵只返回5行 → incomplete", () => {
  const rows5 = Array.from({ length: 5 }, (_, ri) => ({ m: 4 - ri * 0.2, d: [5, 10, 15, 30, 40] }));
  const merged = mergeRawResults([{ i: 5, mx: rows5 }], questions);
  assert.equal(merged[5].dataStatus, "incomplete");
  assert.equal(merged[5].matrix.length, 8);                        // 保留全部行名，缺失行标记
  assert.equal(merged[5].matrix[5].rowStatus, "missing");
  assert.ok(merged[5].dataErrors.some((e) => e.errorType === "matrix_row_count_mismatch"));
});

check("用例7：缺失某一道题结果 → missing", () => {
  const merged = mergeRawResults([{ i: 0, v: [40, 30, 20, 10] }], questions);  // 未返回第7题(i=6)
  assert.equal(merged[6].dataStatus, "missing");
  assert.deepEqual(merged[6].values, []);
  assert.match(merged[6].dataError, /AI 未返回本题数据/);
  const v = validateQuantResults({ results: [{ i: 0, v: [40, 30, 20, 10] }] }, questions, merged);
  assert.ok(v.invalidQuestionIndexes.includes(6));
});

check("用例8：返回重复题目索引 → duplicate_index", () => {
  const v = validateQuantResults({ results: [{ i: 1, v: ok8 }, { i: 1, v: ok8 }] }, questions);
  assert.ok(v.errors.some((e) => e.errorType === "duplicate_index" && e.questionIndex === 1));
});

check("超出题目范围的索引 → index_out_of_range", () => {
  const v = validateQuantResults({ results: [{ i: 99, v: [1, 2, 3] }] }, questions);
  assert.ok(v.errors.some((e) => e.errorType === "index_out_of_range"));
});

check("用例9：单选合计不等于100（110）→ single_sum_not_100", () => {
  const merged = mergeRawResults([{ i: 0, v: [60, 30, 15, 5] }], questions);  // 合计110
  assert.equal(merged[0].dataStatus, "invalid");
  assert.ok(merged[0].dataErrors.some((e) => e.errorType === "single_sum_not_100"));
  // 数值仍原样保留，不被归一化篡改
  assert.deepEqual(merged[0].values, [60, 30, 15, 5]);
});

check("单选合计 98~102 视为有效（取整误差容差）", () => {
  const merged = mergeRawResults([{ i: 0, v: [41, 29, 19, 11] }], questions);  // 合计100
  assert.equal(merged[0].dataStatus, "complete");
  const merged2 = mergeRawResults([{ i: 0, v: [40, 30, 20, 12] }], questions); // 合计102
  assert.equal(merged2[0].dataStatus, "complete");
});

check("用例10：多选合计超过100但每项合法 → complete", () => {
  const merged = mergeRawResults([{ i: 2, v: [85, 70, 60, 50, 40, 30, 25, 20, 15, 10, 5, 2] }], questions);
  assert.equal(merged[2].dataStatus, "complete");
  const v = validateQuantResults({ results: [{ i: 2, v: [85, 70, 60, 50, 40, 30, 25, 20, 15, 10, 5, 2] }] }, questions, merged);
  assert.ok(!v.invalidQuestionIndexes.includes(2));
});

check("负数 / 超100 / 非数字 → invalid 且保留原值", () => {
  const neg = mergeRawResults([{ i: 0, v: [40, -5, 30, 35] }], questions);
  assert.equal(neg[0].dataStatus, "invalid");
  assert.ok(neg[0].dataErrors.some((e) => e.errorType === "negative_value"));
  assert.deepEqual(neg[0].values, [40, -5, 30, 35]);
  const over = mergeRawResults([{ i: 0, v: [40, 130, 10, 10] }], questions);
  assert.ok(over[0].dataErrors.some((e) => e.errorType === "value_over_100"));
  const nan = mergeRawResults([{ i: 0, v: [40, "abc", 30, 30] }], questions);
  assert.ok(nan[0].dataErrors.some((e) => e.errorType === "invalid_number"));
  assert.ok(Number.isNaN(nan[0].values[1]));
});

check("量表缺 mean/sd → invalid", () => {
  const merged = mergeRawResults([{ i: 3, dist: ok5 }], questions);
  assert.equal(merged[3].dataStatus, "invalid");
  assert.ok(merged[3].dataErrors.some((e) => e.errorType === "missing_mean"));
  assert.ok(merged[3].dataErrors.some((e) => e.errorType === "missing_sd"));
});

check("矩阵行缺均值 → invalid", () => {
  const merged = mergeRawResults([{ i: 5, mx: [{ d: ok5 }, { m: 3.5, d: ok5 }, { m: 3.0, d: ok5 }, { m: 2.5, d: ok5 }, { m: 2.0, d: ok5 }, { m: 1.5, d: ok5 }, { m: 1.0, d: ok5 }, { m: 0.5, d: ok5 }] }], questions);
  assert.ok(merged[5].dataErrors.some((e) => e.errorType === "matrix_row_missing_mean"));
});

// ===== 3. 自动修复 =====
section("自动修复（mergeRepairedResults + 两轮机制）");

check("用例11：修复后恢复完整，且不影响其他题", () => {
  const initialRaw = [{ i: 1, v: [35, 27, 18, 12, 8] }];
  let merged = mergeRawResults(initialRaw, questions);
  assert.equal(merged[1].dataStatus, "incomplete");
  // 修复响应：完整8项
  const repairRaw = [{ i: 1, v: ok8 }];
  merged = mergeRepairedResults(merged, repairRaw, questions);
  assert.equal(merged[1].dataStatus, "complete");
  assert.deepEqual(merged[1].values, ok8);
  // 其他题目保持原样
  assert.equal(merged[6].dataStatus, "missing");
  // 校验时传入的是「修复后的去重结果」（流水线中 rawByIndex 天然去重）
  const v = validateQuantResults({ results: repairRaw }, questions, merged);
  assert.ok(!v.invalidQuestionIndexes.includes(1));
});

check("用例12：修复两次仍失败 → 仍标记不完整", () => {
  let merged = mergeRawResults([{ i: 1, v: [35, 27, 18, 12, 8] }], questions);
  for (let round = 1; round <= MAX_REPAIR_ROUNDS; round++) {
    merged = mergeRepairedResults(merged, [{ i: 1, v: [10, 20, 30] }], questions); // 每次都只给3项
  }
  assert.equal(merged[1].dataStatus, "incomplete");
  const v = validateQuantResults({ results: [{ i: 1, v: [10, 20, 30] }] }, questions, merged);
  assert.ok(v.invalidQuestionIndexes.includes(1));
  assert.equal(MAX_REPAIR_ROUNDS, 2, "修复最多2轮");
});

check("修复批次上限 REPAIR_BATCH_SIZE=5", () => {
  assert.equal(REPAIR_BATCH_SIZE, 5);
});

// ===== 4. 单题重新生成 =====
section("单题重生成（只替换目标题）");

check("单题重生成只请求目标索引", () => {
  const p = buildSingleQuestionPrompt(env, 2);
  assert.match(p, /题目索引：2/);
  assert.doesNotMatch(p, /题目索引：1/);
  assert.doesNotMatch(p, /题目索引：3/);
});

check("单题重生成成功后只替换该题", () => {
  const fullRaw = [
    { i: 0, v: [40, 30, 20, 10] },
    { i: 1, v: [35, 27, 18, 12, 8] },   // 不完整
    { i: 2, v: [80, 70, 60, 50, 40, 30, 20, 10, 8, 6, 4, 2] },
    { i: 3, dist: ok5, mean: 3.2, sd: 0.9 },
    { i: 4, dist: ok10, mean: 5.6, sd: 2.1 },
    { i: 5, mx: Array.from({ length: 8 }, (_, ri) => ({ m: 4 - ri * 0.2, d: ok5 })) },
    { i: 6, v: [60, 30, 8, 2] },
    { i: 7, v: [50, 30, 20] }
  ];
  let merged = mergeRawResults(fullRaw, questions);
  assert.equal(merged[1].dataStatus, "incomplete");
  // 只重新生成第2题(i=1)
  const mergedAll = mergeRawResults([{ i: 1, v: ok8 }], questions);
  merged[1] = mergedAll[1];
  assert.equal(merged[1].dataStatus, "complete");
  assert.equal(merged[0].dataStatus, "complete");   // 其他题不受影响
  assert.equal(merged[6].dataStatus, "complete");
});

// ===== 5. 数据质量汇总 =====
section("数据质量汇总");

check("makeQuantQualitySummary 统计完整/待处理与状态", () => {
  const merged = mergeRawResults([
    { i: 0, v: [40, 30, 20, 10] },
    { i: 1, v: [35, 27, 18, 12, 8] }  // 不完整
  ], questions);
  const summary = makeQuantQualitySummary(merged, 2);
  assert.equal(summary.total, 8);
  assert.equal(summary.complete, 1);
  assert.equal(summary.pending, 7);
  assert.equal(summary.repaired, 2);
  assert.equal(summary.status, "pending");
  const allOk = makeQuantQualitySummary(mergeRawResults(fullOkRaw(), questions), 0);
  assert.equal(allOk.status, "complete");
  const repairedOk = makeQuantQualitySummary(mergeRawResults(fullOkRaw(), questions), 3);
  assert.equal(repairedOk.status, "repaired");
});

function fullOkRaw() {
  return [
    { i: 0, v: [40, 30, 20, 10] },
    { i: 1, v: ok8 },
    { i: 2, v: [80, 70, 60, 50, 40, 30, 20, 10, 8, 6, 4, 2] },
    { i: 3, dist: ok5, mean: 3.2, sd: 0.9 },
    { i: 4, dist: ok10, mean: 5.6, sd: 2.1 },
    { i: 5, mx: Array.from({ length: 8 }, (_, ri) => ({ m: 4 - ri * 0.2, d: ok5 })) },
    { i: 6, v: [60, 30, 8, 2] },
    { i: 7, v: [50, 30, 20] }
  ];
}

// ===== 6. 导出：不完整数据不写 0 =====
section("导出（CSV / Markdown / JSON）");

check("CSV：不完整题目缺失项写「未返回」，不写 0%", () => {
  const merged = mergeRawResults([
    { i: 0, v: [40, 30, 20, 10] },
    { i: 1, v: [35, 27, 18, 12, 8] },   // 8项只给5项
    { i: 4, dist: [2, 3, 5], mean: 5.6, sd: 2.1 }  // 10分量表只给3项
  ], questions);
  const csv = buildQuantCsv(merged);
  const lines = csv.split("\n");
  assert.match(lines[0], /题目,类型,选项\/指标,频数或均值,百分比\/分布,备注/);
  // 第2题(i=1)：前5项有值，后3项为「未返回」；按题干过滤出全部8行
  const q2Lines = lines.filter((l) => l.includes("你偏好哪个渠道？"));
  assert.equal(q2Lines.length, 8, "8个选项全部出现在CSV");
  assert.ok(q2Lines[5].includes("未返回"), "第6项起缺失项写「未返回」而非 0%");
  assert.doesNotMatch(q2Lines.slice(5).join(""), /,0%,/, "缺失项不是 0%");
  assert.ok(q2Lines.some((l) => l.includes("第 2 题应返回 8 个选项数值")), "备注列包含错误说明");
  // 10分量表(i=4)：只返回3档，剩余7档为「未返回」
  const scaleLines = lines.filter((l) => l.includes("满意度评分"));
  assert.equal(scaleLines.length, 10);
  assert.ok(scaleLines[9].includes("未返回"));
  // 完整题目正常导出
  assert.ok(q2Lines[0].includes("35%") || q2Lines[0].includes(",35,"));
});

check("Markdown：不完整题目提示重新生成", () => {
  const merged = mergeRawResults([{ i: 1, v: [35, 27, 18, 12, 8] }], questions);
  const md = buildQuantAnalysisMarkdown("测试主题", merged, { summary: "s", findings: ["f"], crosstab: [["a", "b", "c"]] });
  assert.match(md, /数据完整度提示/);
  assert.match(md, /第 2 题/);
  assert.match(md, /该题需要重新生成/);
  assert.match(md, /缺失值未被当作 0%/);
});

check("JSON：保留 dataStatus / dataError / 缺失项不写 0", () => {
  const merged = mergeRawResults([{ i: 1, v: [35, 27, 18, 12, 8] }], questions);
  const json = JSON.stringify(merged, null, 2);
  assert.match(json, /"dataStatus": "incomplete"/);
  assert.match(json, /"dataError"/);
  assert.doesNotMatch(json, /"v": \[35, 27, 18, 12, 8, 0, 0, 0\]/);  // 无补0数组
  assert.match(json, /"values": \[\s*35,\s*27,\s*18,\s*12,\s*8\s*\]/); // 原样5项
});

// ===== 7. 模拟真实修复流程 =====
section("端到端模拟：分批生成 → 校验 → 修复 → 汇总");

check("模拟完整流程：分批合并 → 修复1道 → 质量卡片数据正确", () => {
  // 第1批：题0-2（第2题不完整）
  const batch1 = [{ i: 0, v: [40, 30, 20, 10] }, { i: 1, v: [35, 27, 18, 12, 8] }, { i: 2, v: [80, 70, 60, 50, 40, 30, 20, 10, 8, 6, 4, 2] }];
  // 第2批：题3-5
  const batch2 = [
    { i: 3, dist: ok5, mean: 3.2, sd: 0.9 },
    { i: 4, dist: ok10, mean: 5.6, sd: 2.1 },
    { i: 5, mx: Array.from({ length: 8 }, (_, ri) => ({ m: 4 - ri * 0.2, d: ok5 })) }
  ];
  // 第3批：题6-7
  const batch3 = [{ i: 6, v: [60, 30, 8, 2] }, { i: 7, v: [50, 30, 20] }];

  const rawByIndex = new Map();
  [...batch1, ...batch2, ...batch3].forEach((r) => rawByIndex.set(r.i, r));
  const rawResults = [...rawByIndex.values()].map((r) => ({ ...r }));
  let merged = mergeRawResults(rawResults, questions);
  let validation = validateQuantResults({ results: rawResults }, questions, merged);

  // 只应有 1 道不完整题（i=1）
  assert.deepEqual(validation.invalidQuestionIndexes, [1]);

  // 修复轮：只发送失败题（流水线中 rawByIndex 覆盖同索引，天然去重）
  const repairedIndexes = new Set();
  const before = new Set(validation.invalidQuestionIndexes);
  const repairRaw = [{ i: 1, v: ok8 }];
  merged = mergeRepairedResults(merged, repairRaw, questions);
  const mergedRaw = new Map();
  [...rawResults, ...repairRaw].forEach((r) => mergedRaw.set(r.i, r));
  validation = validateQuantResults({ results: [...mergedRaw.values()] }, questions, merged);
  const after = new Set(validation.invalidQuestionIndexes);
  [...before].forEach((i) => { if (!after.has(i)) repairedIndexes.add(i); });

  assert.equal(validation.valid, true);
  assert.deepEqual([...repairedIndexes], [1], "自动修复记录该题");
  const summary = makeQuantQualitySummary(merged, repairedIndexes.size);
  assert.equal(summary.complete, 8);
  assert.equal(summary.pending, 0);
  assert.equal(summary.status, "repaired");
  assert.equal(summary.repaired, 1);
});

// ===== 8. v50 工作台：模块识别 / 指标 / 核心指标 / 关键发现 =====
section("v50 模块识别与逐题指标");

check("detectQuestionModule 覆盖 13 个模块", () => {
  const cases = [
    ["S1. 请问您过去6个月内是否购买过该类产品？", "screening"],
    ["D1. 请问您的性别是？", "demographics"],
    ["请问您的家庭月收入范围是？", "demographics"],
    ["Q5. 你通常多久使用一次本产品？", "behavior"],
    ["你知道哪些新能源汽车品牌？", "brand"],
    ["你在使用中最困扰的问题是什么？", "needs"],
    ["你希望产品增加哪些功能？", "features"],
    ["你对本概念的第一印象如何？", "concept"],
    ["你会考虑购买这款产品吗？", "purchase"],
    ["你能接受的价格区间是多少？", "price"],
    ["你通常通过哪些渠道购买？", "channel"],
    ["你对产品整体满意度如何？", "satisfaction"],
    ["你会向朋友推荐本产品吗？", "recommend"],
    ["随便一道没有关键词的题目", "other"]
  ];
  cases.forEach(([text, expected]) => {
    assert.equal(detectQuestionModule({ text }).id, expected, `「${text}」应为 ${expected}`);
  });
  assert.equal(QUESTION_MODULES.length, 13);
  assert.ok(MODULE_LABEL.screening === "甄别题");
});

check("choiceMetrics：排名/Top2/差距/集中度/长尾/平均勾选", () => {
  const q = {
    type: "single", optionsArray: ["A", "B", "C", "D", "E"], values: [55, 25, 10, 6, 4]
  };
  const m = choiceMetrics(q);
  assert.equal(m.ranked[0].label, "A");
  assert.equal(m.top1, 55);
  assert.equal(m.top2Sum, 80);
  assert.equal(m.gap, 30);
  assert.ok(m.concentrated);
  assert.ok(m.longTail);            // 4% 和 6% 两个长尾
  assert.equal(m.tailCount, 2);
  const multi = { type: "multiple", optionsArray: ["A", "B", "C"], values: [80, 60, 30] };
  assert.equal(choiceMetrics(multi).avgSelections, 1.7);
});

check("scaleMetrics：均值/中位数/Top2/Bottom2/正-中立-负向", () => {
  const q = { type: "scale", scale: "1-5", expectedCount: 5, distribution: [5, 10, 15, 30, 40], mean: 3.9, sd: 1.1 };
  const m = scaleMetrics(q);
  assert.equal(m.mean, 3.9);
  assert.equal(m.median, 4);
  assert.equal(m.top2box, 70);
  assert.equal(m.bottom2box, 15);
  assert.equal(m.negative, 15);   // 1-2分
  assert.equal(m.neutral, 15);    // 3分
  assert.equal(m.positive, 70);   // 4-5分
});

check("matrixMetrics：Top3/Bottom3/维度差距", () => {
  const q = {
    type: "matrix",
    matrix: [
      { row: "口味", mean: 4.2, distribution: [1,2,3,4,5] },
      { row: "价格", mean: 3.8, distribution: [1,2,3,4,5] },
      { row: "成分", mean: 3.2, distribution: [1,2,3,4,5] },
      { row: "包装", mean: 2.9, distribution: [1,2,3,4,5] }
    ]
  };
  const m = matrixMetrics(q);
  assert.equal(m.topRow.label, "口味");
  assert.equal(m.bottomRow.label, "包装");
  assert.equal(m.top3.length, 3);
  assert.equal(m.bottom3.length, 3);
  assert.equal(m.gap, 1.3);
});

check("缺失数据指标：available=false 且不产出 0%", () => {
  const q = { type: "single", optionsArray: ["A", "B"], values: [] };
  const m = choiceMetrics(q);
  assert.equal(m.available, false);
  const s = scaleMetrics({ type: "scale", distribution: [] });
  assert.equal(s.available, false);
});

section("v50 核心指标与关键发现");

check("selectCoreMetrics 自动选中购买意愿/满意度等并带关系提示", () => {
  const merged = mergeRawResults([
    { i: 0, v: [60, 25, 10, 5] },
    { i: 1, v: [10, 20, 30, 25, 15] },
    { i: 2, mx: [{ m: 4.1, d: ok5 }, { m: 3.4, d: ok5 }] },
    { i: 3, v: [50, 30, 20] }
  ], questions);
  const metrics = selectCoreMetrics(merged);
  assert.ok(metrics.length >= 1);
  metrics.forEach((m) => {
    assert.ok(m.questionIndex >= 0 && m.questionIndex < 8);
    assert.ok(typeof m.headline === "string" && m.headline.length > 0);
    assert.ok(typeof m.relation === "string" && m.relation.length > 0);
  });
});

check("buildKeyFindings 每条绑定证据（questionIndex/optionIndexes/values）", () => {
  const merged = mergeRawResults([
    { i: 0, v: [40, 30, 20, 10] },
    { i: 1, v: ok8 },
    { i: 2, v: [80, 70, 60, 50, 40, 30, 20, 10, 8, 6, 4, 2] },
    { i: 3, dist: ok5, mean: 3.2, sd: 0.9 },
    { i: 4, dist: ok10, mean: 5.6, sd: 2.1 },
    { i: 5, mx: Array.from({ length: 8 }, (_, ri) => ({ m: 4 - ri * 0.2, d: ok5 })) },
    { i: 6, v: [60, 30, 8, 2] },
    { i: 7, v: [50, 30, 20] }
  ], questions);
  const findings = buildKeyFindings(merged, null, env);
  assert.ok(findings.length >= 1, "至少有一条发现");
  findings.forEach((f) => {
    assert.ok(f.title && f.title.length > 0);
    assert.ok(f.conclusion && f.conclusion.length > 0);
    assert.ok(Array.isArray(f.evidence) && f.evidence.length > 0, "必须绑定证据");
    const ev = f.evidence[0];
    assert.ok(typeof ev.questionIndex === "number", "证据必须含 questionIndex");
    assert.ok(Array.isArray(ev.optionIndexes), "证据必须含 optionIndexes");
    assert.ok(Array.isArray(ev.values) && ev.values.length > 0, "证据必须含数值");
  });
});

section("v50 质量明细与模拟交叉");

check("makeQuantQualityDetails 分类异常（单选合计/量表分布/矩阵缺失）", () => {
  const merged = mergeRawResults([
    { i: 0, v: [80, 80, 0, 0] },        // 单选合计160 → 单选合计异常
    { i: 1, v: ok8 },
    { i: 3, dist: [60, 60, 0, 0, 0], mean: 3, sd: 1 }, // 量表分布异常
    { i: 5, mx: [{ m: 3, d: ok5 }] }    // 矩阵缺行 → 矩阵缺失
  ], questions);
  const d = makeQuantQualityDetails(merged, [1]);
  assert.ok(d.singleSumAnomalies.includes(0));
  assert.ok(d.scaleSumAnomalies.includes(3));
  assert.ok(d.matrixMissing.includes(5));
  assert.equal(d.repaired, 1);
  assert.equal(d.completePct > 0 && d.completePct <= 100, true);
});

check("buildSimulatedCrosstab 确定性输出并标注模拟", () => {
  const merged = mergeRawResults([
    { i: 0, v: [40, 30, 20, 10] },
    { i: 6, v: [60, 30, 8, 2] }
  ], questions);
  const config = { rowIndex: 0, colType: "gender", metricIndex: 6 };
  const result = buildSimulatedCrosstab(merged, config, { ...env, quotaPlan: [{ id: "gender", items: [{ label: "女", pct: 55 }, { label: "男", pct: 45 }] }] });
  assert.ok(result.groups.length === 2);
  assert.equal(result.rows.length, 4);
  assert.equal(result.rows[0].cells.length, 2);
  assert.ok(result.notice.includes("模拟结果"));
  assert.ok(result.metricRows.length >= 1);
  // 确定性：相同输入两次调用结果一致
  const again = buildSimulatedCrosstab(merged, config, { ...env, quotaPlan: [{ id: "gender", items: [{ label: "女", pct: 55 }, { label: "男", pct: 45 }] }] });
  assert.deepEqual(result.rows, again.rows);
  // 单选题：每个分组列的合计接近 100
  result.groups.forEach((_, gi) => {
    const sum = result.rows.reduce((s, r) => s + r.cells[gi], 0);
    assert.ok(Math.abs(sum - 100) < 3, `分组列合计 ${sum}`);
  });
});

section("v50 报告故事线");

check("buildStoryline 10 个固定章节、每页绑定题目与证据", () => {
  const merged = mergeRawResults([
    { i: 0, v: [40, 30, 20, 10] },
    { i: 1, v: ok8 },
    { i: 2, v: [80, 70, 60, 50, 40, 30, 20, 10, 8, 6, 4, 2] },
    { i: 3, dist: ok5, mean: 3.2, sd: 0.9 },
    { i: 4, dist: ok10, mean: 5.6, sd: 2.1 },
    { i: 5, mx: Array.from({ length: 8 }, (_, ri) => ({ m: 4 - ri * 0.2, d: ok5 })) },
    { i: 6, v: [60, 30, 8, 2] },
    { i: 7, v: [50, 30, 20] }
  ], questions);
  merged.forEach((q) => { q.module = detectQuestionModule(q, q.index).id; q.moduleLabel = detectQuestionModule(q, q.index).label; });
  const story = buildStoryline(merged, null, buildKeyFindings(merged, null, env), env, 100);
  assert.equal(story.chapters.length, 10);
  assert.deepEqual(story.chapters.map((c) => c.title), STORY_CHAPTERS.map((c) => c.title));
  story.chapters.forEach((ch) => {
    assert.ok(Array.isArray(ch.slides) && ch.slides.length >= 1, `${ch.title} 至少 1 页`);
    ch.slides.forEach((s) => {
      assert.ok(typeof s.title === "string");
      assert.ok(typeof s.conclusion === "string");
      assert.ok(Array.isArray(s.questionIndexes));
      assert.ok(Array.isArray(s.evidence));
      s.questionIndexes.forEach((i) => assert.ok(i >= 0 && i < 8, "题目索引有效"));
    });
  });
});

check("buildStorylinePrompt 固定章节 + normalizeStoryline 过滤无效索引", () => {
  const merged = mergeRawResults([{ i: 0, v: [40, 30, 20, 10] }], questions);
  const p = buildStorylinePrompt(env, merged, []);
  assert.match(p, /1\. 研究背景/);
  assert.match(p, /10\. 行动建议/);
  assert.match(p, /questionIndexes/);
  const raw = {
    storyline: {
      chapters: [
        { title: "研究背景", slides: [{ title: "背景页", conclusion: "结论", questionIndexes: [0, 999], chartType: "bad", evidence: ["证据1"] }] },
        { title: "核心结论", slides: [{ title: "结论页", conclusion: "c", questionIndexes: [0], chartType: "summary_card", evidence: ["e"] }] },
        { title: "人群特征", slides: [{ title: "人群页", conclusion: "c", questionIndexes: [], chartType: "summary_card", evidence: [] }] }
      ]
    }
  };
  const fallback = buildStoryline(merged, null, [], env, 100);
  const normalized = normalizeStoryline(raw, merged, fallback);
  assert.ok(normalized.generated === "ai");
  const bg = normalized.chapters.find((c) => c.title.includes("研究背景"));
  assert.deepEqual(bg.slides[0].questionIndexes, [0], "无效索引被过滤");
  assert.equal(bg.slides[0].chartType, "summary_card", "非法图表类型回退");
});

section("v50 Excel 与 Markdown 导出");

check("buildXlsxZip 产出合法 ZIP（PK 签名 + EOCD）", () => {
  const zip = buildXlsxZip([{ name: "Sheet1", rows: [["题目", "占比"], ["Q1", 68.5]] }]);
  assert.ok(zip[0] === 0x50 && zip[1] === 0x4b, "PK 签名");
  const n = zip.length;
  assert.equal(zip[n - 22], 0x50);
  assert.equal(zip[n - 21], 0x4b);
  assert.equal(zip[n - 20], 0x05);
  assert.equal(zip[n - 19], 0x06);
  // EOCD 中记录的中央目录偏移应指向 PK\x01\x02
  const cdOffset = zip[n - 6] | (zip[n - 5] << 8) | (zip[n - 4] << 16) | (zip[n - 3] << 24);
  assert.equal(zip[cdOffset], 0x50);
  assert.equal(zip[cdOffset + 1], 0x4b);
  // 内容检查：内联字符串与表头加粗样式
  const str = new TextDecoder().decode(zip).replace(/[^\x20-\x7e\u4e00-\u9fff]/g, "");
  assert.ok(str.includes("Sheet1"));
  assert.ok(str.includes("t=\"inlineStr\""));
});

check("buildQuantWorkbook 8 个 sheet / buildQualityWorkbook 4 个 sheet", () => {
  const merged = mergeRawResults([
    { i: 0, v: [40, 30, 20, 10] },
    { i: 3, dist: ok5, mean: 3.2, sd: 0.9 },
    { i: 5, mx: Array.from({ length: 8 }, (_, ri) => ({ m: 4 - ri * 0.2, d: ok5 })) },
    { i: 6, v: [60, 30, 8, 2] }
  ], questions);
  const result = {
    questions: merged,
    qualityDetails: makeQuantQualityDetails(merged, [1]),
    keyFindings: buildKeyFindings(merged, null, env)
  };
  const workbook = buildQuantWorkbook(result);
  assert.ok(workbook.length > 1000, "工作簿非空");
  const qualityBook = buildQualityWorkbook(result);
  assert.ok(qualityBook.length > 500);
});

check("buildQuantWorkbenchMarkdown 包含全部章节", () => {
  const merged = mergeRawResults([
    { i: 0, v: [40, 30, 20, 10] },
    { i: 3, dist: ok5, mean: 3.2, sd: 0.9 },
    { i: 6, v: [60, 30, 8, 2] }
  ], questions);
  merged.forEach((q) => { q.module = detectQuestionModule(q, q.index).id; q.moduleLabel = MODULE_LABEL[q.module]; });
  const result = {
    questions: merged,
    qualityDetails: makeQuantQualityDetails(merged, []),
    keyFindings: buildKeyFindings(merged, null, env),
    coreMetrics: selectCoreMetrics(merged),
    storyline: null,
    crosstab: null
  };
  const md = buildQuantWorkbenchMarkdown(result, env);
  ["数据质量", "核心指标", "关键发现", "题目与模块", "逐题统计", "数据缺失"].forEach((k) => {
    assert.ok(md.includes(k), `包含 ${k}`);
  });
});

// ===== v53 逐题数据解读 =====
section("v53 逐题数据解读");

// 构建完整数据的测试题目集（共 12 道，含 4 选项单选 / 10 选项单选 / 多选 / 5 分量表 / 10 分量表 / 矩阵 / 不完整题）
const interpQuestions = [
  { text: "你会购买哪个功能？", type: "single", options: "行车记录, 娱乐投屏, 语音助手, 其他", scale: "1-5", rows: "" },
  { text: "你偏好哪个渠道购买？", type: "single", options: "线上电商, 品牌官网, 线下门店, 社交电商, 直播间, 熟人推荐, 海外代购, 社群团购, 内容种草, 其他", scale: "1-5", rows: "" },
  { text: "影响购买的因素有哪些？", type: "multiple", options: "价格, 品牌, 口碑, 功能, 外观, 售后, 物流, 促销, 赠品, 包装", scale: "1-5", rows: "" },
  { text: "产品满意度评分", type: "scale", options: "", scale: "1-5", rows: "" },
  { text: "推荐意愿评分", type: "scale", options: "", scale: "1-10", rows: "" },
  { text: "各功能重要性", type: "matrix", options: "1,2,3,4,5", scale: "1-5", rows: "行车记录, 语音助手, 娱乐投屏, 安全预警, 远程控制" },
  { text: "使用频率", type: "single", options: "每天, 每周, 每月, 偶尔", scale: "1-5", rows: "" },
  { text: "核心需求是什么", type: "multiple", options: "安全记录, 娱乐, 导航, 通讯, 监控", scale: "1-5", rows: "" },
  { text: "购买意愿", type: "single", options: "一定会, 可能会, 不确定, 不会", scale: "1-5", rows: "" },
  { text: "价格接受度", type: "single", options: "200以下, 200-500, 500-1000, 1000以上", scale: "1-5", rows: "" },
  { text: "遇到的主要痛点", type: "multiple", options: "安装复杂, 操作难, 信号差, 价格高, 售后差", scale: "1-5", rows: "" },
  { text: "性别", type: "single", options: "男, 女", scale: "1-5", rows: "" }
];
const interpEnv = {
  topic: "智能行车记录仪需求研究",
  audienceConfig: { age: "25-40", gender: "均衡", city: "一线", income: "中高", usage: "高频通勤", price: "中等敏感", lifestyle: "科技关注" },
  quotaText: "性别：女 50% / 男 50%",
  sampleSize: 200,
  questions: interpQuestions
};
// 合并数据：12 道全完整
const interpMerged = mergeRawResults([
  { i: 0, v: [42, 28, 22, 8] },                                                    // 4选项单选
  { i: 1, v: [18, 12, 10, 9, 8, 7, 6, 5, 4, 21] },                                 // 10选项单选
  { i: 2, v: [55, 40, 35, 30, 25, 20, 18, 15, 12, 10] },                            // 多选合计260%
  { i: 3, dist: [5, 10, 15, 30, 40], mean: 3.9, sd: 1.1 },                          // 5分量表
  { i: 4, dist: [2, 3, 5, 8, 12, 16, 20, 18, 10, 6], mean: 6.2, sd: 1.8 },          // 10分量表
  { i: 5, mx: [{ m: 4.5, d: [5, 10, 15, 30, 40] }, { m: 4.0, d: [8, 12, 20, 30, 30] }, { m: 3.5, d: [10, 15, 25, 30, 20] }, { m: 4.2, d: [6, 10, 18, 32, 34] }, { m: 3.0, d: [15, 20, 30, 25, 10] }] },
  { i: 6, v: [35, 30, 20, 15] },                                                    // 使用频率
  { i: 7, v: [68, 32, 28, 22, 18] },                                                // 核心需求多选
  { i: 8, v: [38, 35, 18, 9] },                                                     // 购买意愿
  { i: 9, v: [25, 40, 25, 10] },                                                    // 价格接受度
  { i: 10, v: [45, 38, 35, 30, 22] },                                                // 痛点多选
  { i: 11, v: [50, 50] }                                                             // 性别
], interpQuestions);

// 1. 四选项单选题基础解读
check("1. 四选项单选题基础解读：包含 headline/observation/evidence", () => {
  const q = interpMerged[0];
  assert.equal(q.dataStatus, "complete");
  const interp = buildRuleBasedInterpretation(q, interpMerged, {});
  assert.ok(interp, "应返回解读");
  assert.ok(interp.headline, "headline 不为空");
  assert.ok(interp.observation, "observation 不为空");
  assert.ok(interp.evidence.length >= 1, "evidence 至少 1 条");
  assert.equal(interp._mode, InterpretationMode.RULE);
  assert.ok(interp.caveat, "包含限制说明");
  // 第一名 42% 应在 headline 或 observation 中
  assert.ok(interp.headline.includes("42") || interp.observation.includes("42"), "引用了第一名占比");
});

// 2. 十选项单选题基础解读
check("2. 十选项单选题基础解读：识别长尾与分布特征", () => {
  const q = interpMerged[1];
  assert.equal(q.optionsArray.length, 10);
  const interp = buildRuleBasedInterpretation(q, interpMerged, {});
  assert.ok(interp, "应返回解读");
  assert.ok(interp.observation.includes("长尾") || interp.headline.includes("分散") || interp.observation.includes("分散"), "提及长尾或分散");
  assert.ok(interp.evidence.length <= 3, "evidence 不超过 3 条");
});

// 3. 多选题合计超过100%
check("3. 多选题合计超过100%不报异常", () => {
  const q = interpMerged[2];
  const total = q.values.reduce((s, v) => s + v, 0);
  assert.ok(total > 100, `多选合计应超过100%（实际 ${total}%）`);
  const interp = buildRuleBasedInterpretation(q, interpMerged, {});
  assert.ok(interp, "多选题应生成解读");
  assert.ok(interp.caveat.includes("多选") || interp.caveat.includes("100%"), "caveat 提及多选特征");
});

// 4. 五分量表
check("4. 五分量表基础解读：含均值/Top2Box/Bottom2Box", () => {
  const q = interpMerged[3];
  const interp = buildRuleBasedInterpretation(q, interpMerged, {});
  assert.ok(interp, "应返回解读");
  assert.ok(interp.headline.includes("3.9"), "headline 包含均值");
  assert.ok(interp.observation.includes("Top2Box"), "observation 含 Top2Box");
  assert.ok(interp.observation.includes("Bottom2Box"), "observation 含 Bottom2Box");
  // 判断倾向
  assert.ok(/偏正向|偏负向|两极化|中立/.test(interp.observation), "包含态度倾向描述");
});

// 5. 十分量表
check("5. 十分量表基础解读", () => {
  const q = interpMerged[4];
  const interp = buildRuleBasedInterpretation(q, interpMerged, {});
  assert.ok(interp, "应返回解读");
  assert.ok(interp.headline.includes("6.2"), "headline 含均值");
  assert.ok(interp.headline.includes("10"), "headline 含量表分制");
});

// 6. 多行矩阵题
check("6. 多行矩阵题基础解读：Top3/Bottom3 且不按原序", () => {
  const q = interpMerged[5];
  assert.equal(q.matrix.length, 5, "矩阵应有5行");
  const interp = buildRuleBasedInterpretation(q, interpMerged, {});
  assert.ok(interp, "应返回解读");
  assert.ok(interp.observation.includes("Top3"), "含 Top3");
  assert.ok(interp.observation.includes("Bottom3"), "含 Bottom3");
  // 最高均值应为 4.5（行车记录），最低 3.0（远程控制，显示为 3 或 3.0）
  assert.ok(interp.headline.includes("4.5") || interp.observation.includes("4.5"), "提及最高均值");
  assert.ok(interp.headline.includes("3.0") || interp.headline.includes("最低") || interp.observation.includes("3.0") || interp.observation.includes("3，") || interp.observation.includes("3）"), "提及最低均值");
});

// 7. 数据不完整题禁止生成深度解读
check("7. 数据不完整题不生成基础解读", () => {
  const incompleteQ = { ...interpMerged[0], dataStatus: "incomplete", values: [] };
  const interp = buildRuleBasedInterpretation(incompleteQ, interpMerged, {});
  assert.equal(interp, null, "不完整题应返回 null");
});

// 8. AI 返回正常 JSON 校验通过
check("8. AI 返回正常 JSON 校验通过", () => {
  const q = interpMerged[0];
  const aiResult = {
    headline: "需求集中在行车记录功能",
    observation: "行车记录以42%位居第一，娱乐投屏28%次之，前两项合计70%，分布偏集中，存在一定长尾需求。",
    possibleDrivers: ["可能与高频通勤用户的安全留证需求相关", "娱乐功能尚未形成明确价值感知"],
    evidence: [
      { questionIndex: 0, label: "行车记录", value: 42 },
      { questionIndex: 7, label: "安全记录", value: 68 }
    ],
    implication: "产品应聚焦行车记录核心功能，娱乐作为增值补充，针对通勤人群强化安全卖点。",
    confidence: "medium",
    caveat: "该结果为合成数据，解释用于研究假设，不代表真实样本因果结论。"
  };
  const { valid, errors, normalized } = validateAiInterpretation(aiResult, q, interpMerged);
  assert.ok(valid, `应校验通过：${errors.join("; ")}`);
  assert.ok(normalized, "normalized 不为空");
  assert.equal(normalized.confidence, "medium");
});

// 9. AI 返回非 JSON
check("9. AI 返回非 JSON（字符串）校验失败", () => {
  const q = interpMerged[0];
  const { valid, errors } = validateAiInterpretation("这不是JSON", q, interpMerged);
  assert.equal(valid, false, "非对象应校验失败");
  assert.ok(errors.length > 0, "应有错误信息");
});

check("9b. AI 返回缺少字段 JSON 校验失败", () => {
  const q = interpMerged[0];
  const incomplete = { headline: "只有结论", observation: "缺少其他字段" };
  const { valid, errors } = validateAiInterpretation(incomplete, q, interpMerged);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("possibleDrivers")), "提示缺少 possibleDrivers");
});

// 10. AI 引用不存在题目
check("10. AI 引用不存在的题目索引校验失败", () => {
  const q = interpMerged[0];
  const aiResult = {
    headline: "需求集中",
    observation: "行车记录以42%位居第一，娱乐投屏28%次之，分布偏集中，存在长尾需求。",
    possibleDrivers: ["可能与通勤需求相关"],
    evidence: [{ questionIndex: 999, label: "不存在", value: 50 }],  // 越界
    implication: "产品应聚焦核心功能，针对通勤人群强化安全卖点，娱乐作为增值补充。",
    confidence: "low",
    caveat: "该结果为合成数据，解释用于研究假设，不代表真实样本因果结论。"
  };
  const { valid, errors } = validateAiInterpretation(aiResult, q, interpMerged);
  assert.equal(valid, false, "应校验失败");
  assert.ok(errors.some((e) => e.includes("越界") || e.includes("不存在")), "提示题目越界");
});

// 11. 数据变化后解读变为过期
check("11. 数据变化后解读标记为过期", () => {
  const q = interpMerged[0];
  const related = selectRelatedQuestions(0, interpMerged);
  const hash1 = computeInterpretationDataHash(q, interpEnv, related, INTERPRETATION_PROMPT_VERSION);
  const slot = makeInterpretationSlot(0);
  slot.dataHash = hash1;
  slot.status = InterpretationStatus.READY;
  slot.interpretation = { headline: "旧解读" };
  // 数据变化：修改题目数值
  const changedQ = { ...q, values: [50, 25, 15, 10] };
  const outdated = isInterpretationOutdated(slot, changedQ, interpEnv, related);
  assert.ok(outdated, "数据变化后应标记为过期");
  // 原数据未变化时不应过期
  const notOutdated = isInterpretationOutdated(slot, q, interpEnv, related);
  assert.equal(notOutdated, false, "数据未变化时不应过期");
});

// 12. 相同数据重复点击使用缓存（dataHash 一致）
check("12. 相同数据 dataHash 一致（缓存命中）", () => {
  const q = interpMerged[0];
  const related = selectRelatedQuestions(0, interpMerged);
  const hash1 = computeInterpretationDataHash(q, interpEnv, related, INTERPRETATION_PROMPT_VERSION);
  const hash2 = computeInterpretationDataHash(q, interpEnv, related, INTERPRETATION_PROMPT_VERSION);
  assert.equal(hash1, hash2, "相同输入应产生相同 hash");
  assert.equal(typeof hash1, "string");
  assert.ok(hash1.length >= 8, "hash 长度合理");
});

// 13. 人工修改解读标记为 manual
check("13. 人工修改解读标记为 manual 模式", () => {
  const slot = makeInterpretationSlot(0);
  slot.mode = InterpretationMode.AI;
  slot.status = InterpretationStatus.READY;
  slot.interpretation = { headline: "AI 原文", observation: "AI 描述", confidence: "medium" };
  // 模拟人工修改
  slot.originalAiInterpretation = { ...slot.interpretation };
  slot.mode = InterpretationMode.MANUAL;
  slot.editedAt = new Date().toISOString();
  slot.interpretation = { ...slot.interpretation, headline: "人工修改后" };
  assert.equal(slot.mode, InterpretationMode.MANUAL);
  assert.ok(slot.originalAiInterpretation, "保留了 AI 原文");
  assert.ok(slot.editedAt, "记录了编辑时间");
});

// 14. 批量生成8道核心题
check("14. 核心题识别返回5-10道且排除人口属性题", () => {
  const core = identifyCoreQuestions(interpMerged);
  assert.ok(core.length >= 5, `核心题至少5道（实际${core.length}）`);
  assert.ok(core.length <= 10, `核心题不超过10道（实际${core.length}）`);
  // 性别题（索引11）应被排除
  assert.ok(!core.includes(11), "性别题应被排除");
  // 包含使用频率、核心需求、购买意愿等
  assert.ok(core.includes(6) || core.includes(7) || core.includes(8), "包含使用/需求/意愿题");
});

// 15. 某一道批量生成失败但其他题成功（单题校验独立）
check("15. 单题校验失败不影响其他题", () => {
  const q0 = interpMerged[0];
  const q1 = interpMerged[1];
  // q0 返回正常
  const goodAi = {
    headline: "需求集中",
    observation: "行车记录42%位居第一，娱乐28%次之，分布偏集中，存在长尾需求。",
    possibleDrivers: ["可能与通勤需求相关"],
    evidence: [{ questionIndex: 0, label: "行车记录", value: 42 }],
    implication: "产品应聚焦核心功能，针对通勤人群强化卖点，娱乐作为增值补充。",
    confidence: "medium",
    caveat: "该结果为合成数据，解释用于研究假设，不代表真实样本因果结论。"
  };
  // q1 返回引用越界题目
  const badAi = {
    ...goodAi,
    evidence: [{ questionIndex: 999, label: "不存在", value: 50 }],
    headline: "渠道分散",
    observation: "线上电商18%微弱领先，各渠道分布较为分散，无明显主导渠道。",
    implication: "应布局多渠道策略，线上电商为主，其他渠道为辅，覆盖不同人群。"
  };
  const r0 = validateAiInterpretation(goodAi, q0, interpMerged);
  const r1 = validateAiInterpretation(badAi, q1, interpMerged);
  assert.ok(r0.valid, "题0应校验通过");
  assert.equal(r1.valid, false, "题1应校验失败");
  assert.ok(r1.errors.some((e) => e.includes("越界")), "题1提示越界");
  // 互不影响
  assert.ok(r0.valid, "题0成功不受题1失败影响");
});

// 16. 导出中包含解读和限制声明
check("16. interpretationToMarkdown 包含解读段落与限制声明", () => {
  const interp = {
    headline: "需求集中在行车记录",
    observation: "行车记录以42%位居第一，前两项合计70%，分布偏集中。",
    possibleDrivers: ["可能与通勤需求相关", "娱乐功能价值感知不足"],
    evidence: [
      { questionIndex: 0, label: "行车记录", value: 42 },
      { questionIndex: 7, label: "安全记录", value: 68 }
    ],
    implication: "产品应聚焦核心功能，针对通勤人群强化安全卖点，娱乐作为增值补充。",
    confidence: "medium",
    caveat: "该结果为合成数据，解释用于研究假设，不代表真实样本因果结论。"
  };
  const md = interpretationToMarkdown(interp, 0);
  assert.ok(md.includes("Q1 数据解读"), "含题目编号");
  assert.ok(md.includes("数据表现"), "含数据表现段");
  assert.ok(md.includes("可能原因"), "含可能原因段");
  assert.ok(md.includes("证据"), "含证据段");
  assert.ok(md.includes("业务启示"), "含业务启示段");
  assert.ok(md.includes("合成数据"), "含限制声明");
});

// 额外：AI 提示词包含因果约束
check("AI 提示词包含因果约束与输出格式要求", () => {
  const q = interpMerged[0];
  const related = selectRelatedQuestions(0, interpMerged);
  const prompt = buildQuestionInterpretationPrompt(interpEnv, q, related, {});
  assert.ok(prompt.includes("资深消费者研究分析师"), "包含角色设定");
  assert.ok(prompt.includes("可能与"), "包含因果约束措辞");
  assert.ok(prompt.includes("不得使用"), "包含禁止措辞");
  assert.ok(prompt.includes("headline"), "包含输出格式字段");
  assert.ok(prompt.includes("confidence"), "包含 confidence 字段");
  assert.ok(prompt.includes("Q1"), "包含当前题号");
});

// 额外：相关题选择返回有效索引
check("相关题选择返回有效且不包含当前题", () => {
  const related = selectRelatedQuestions(0, interpMerged);
  assert.ok(related.length <= 5, "最多5道");
  assert.ok(!related.includes(0), "不包含当前题");
  related.forEach((i) => {
    assert.ok(i >= 0 && i < interpMerged.length, `索引 ${i} 有效`);
    assert.equal(interpMerged[i].dataStatus, "complete", `相关题 ${i} 数据完整`);
  });
});

// ===== v54 题型系统：注册表 / 迁移 / 提示词 / 合并校验 / 指标 / 导出 =====
section("v54 题型注册表与迁移");

check("QUESTION_TYPE_REGISTRY 9 种题型且分组齐全", () => {
  assert.equal(Object.keys(QUESTION_TYPE_REGISTRY).length, 9);
  assert.deepEqual(
    Object.keys(QUESTION_TYPE_REGISTRY).sort(),
    ["allocation", "matrix", "multiple", "nps", "numeric", "open", "rank", "scale", "single"].sort()
  );
  assert.equal(TYPE_LABEL.rank, "排序题");
  assert.equal(TYPE_LABEL.nps, "NPS推荐度");
  assert.equal(TYPE_LABEL.numeric, "数值题");
  assert.equal(TYPE_LABEL.open, "开放题");
  assert.equal(TYPE_LABEL.allocation, "定和分配题");
  assert.equal(QUESTION_TYPE_REGISTRY.rank.category, "choice");
  assert.equal(QUESTION_TYPE_REGISTRY.allocation.resultType, "allocation");
  // 分组
  const allTypes = QUESTION_TYPE_GROUPS.flatMap((g) => g.types);
  assert.equal(allTypes.length, 9);
});

check("migrateQuestionData 补齐 id/code/config（rank TopN 提取）", () => {
  const q = migrateQuestionData({ text: "请将以下功能按重要程度排序（请选出前3项并排序）", type: "rank", options: "A, B, C, D, E" }, 2);
  assert.ok(q.id && q.id.startsWith("question_"), "生成 id");
  assert.equal(q.code, "Q3");
  assert.equal(q.config.rankMode, "top_n");
  assert.equal(q.config.topN, 3);
  const full = migrateQuestionData({ text: "请排序", type: "rank", options: "A, B, C" }, 0);
  assert.equal(full.config.rankMode, "full");
  const nps = migrateQuestionData({ text: "你会推荐吗", type: "nps" }, 1);
  assert.equal(nps.config.max, 10);
  assert.deepEqual(nps.config.promoterRange, [9, 10]);
  const alloc = migrateQuestionData({ text: "100分分配", type: "allocation", options: "A, B, C" }, 3);
  assert.equal(alloc.config.totalPoints, 100);
});

check("optionsList 返回结构化 [{id,label}] 且 id 稳定", () => {
  const q = { type: "rank", options: "事故取证, 日常记录, 停车监控" };
  const list = optionsList(q);
  assert.equal(list.length, 3);
  assert.ok(list.every((o) => o.id && o.label));
  assert.equal(list[0].label, "事故取证");
  // 再次调用保持同一 id（q._opts 缓存）
  const again = optionsList(q);
  assert.equal(again[0].id, list[0].id, "id 稳定不因重新解析变化");
});

section("v54 提示词片段");

check("buildQuestionPromptFragment 各新题型返回独立结构模板", () => {
  const cases = [
    [{ text: "请排序", type: "rank", options: "A, B, C", config: { rankMode: "full" } }, /"type":"rank"/, /rankDistribution/, /avgRank/, /items/],
    [{ text: "你会推荐吗", type: "nps", config: { max: 10 } }, /"type":"nps"/, /distribution/, /promoterPct/],
    [{ text: "你愿意花多少钱", type: "numeric", options: "", config: { min: 0, max: 10000, unit: "元" } }, /"type":"numeric"/, /median/, /p25/, /p75/],
    [{ text: "请说明原因", type: "open", config: {} }, /"type":"open"/, /themes/, /quotes/],
    [{ text: "100分分配", type: "allocation", options: "A, B, C, D", config: { totalPoints: 100 } }, /"type":"allocation"/, /meanPoints/, /totalPoints/]
  ];
  cases.forEach(([q, ...res], idx) => {
    const p = buildQuestionPromptFragment(q, idx);
    res.forEach((re) => assert.ok(re.test(p), `${q.type} 提示词应匹配 ${re}`));
  });
  // TopN 模式要求 unrankedPct
  const rankTopN = buildQuestionPromptFragment({ text: "排前3", type: "rank", options: "A, B, C, D, E", config: { rankMode: "top_n", topN: 3 } }, 0);
  assert.ok(rankTopN.includes("unrankedPct"));
  // 排序题不允许返回普通多选百分比
  assert.ok(buildQuestionPromptFragment({ text: "排", type: "rank", options: "A, B", config: {} }, 0).includes("不得把排序题返回成普通多选百分比"));
});

check("expectedCountOf 新题型返回预期数量", () => {
  assert.equal(expectedCountOf({ type: "rank", optionCount: 6, config: {} }), 6);
  assert.equal(expectedCountOf({ type: "allocation", optionCount: 4, config: {} }), 4);
  assert.equal(expectedCountOf({ type: "nps", config: {} }), 11);
  assert.equal(expectedCountOf({ type: "numeric", config: {} }), 1);
  assert.equal(expectedCountOf({ type: "open", config: {} }), 1);
});

section("v54 合并与校验");

// v54 测试问卷：0=rank 3选项 1=nps 2=numeric 3=open 4=allocation 4选项
const v54Questions = [
  { text: "请将以下功能按重要程度排序", type: "rank", options: "事故取证, 日常记录, 停车监控, 远程查看", config: { rankMode: "full" } },
  { text: "你有多大可能向朋友推荐这款产品（0-10分）", type: "nps", config: { max: 10 } },
  { text: "你能接受的最高价格是多少元", type: "numeric", options: "", config: { numericType: "currency", min: 0, max: 10000, unit: "元" } },
  { text: "请说明你选择的原因", type: "open", options: "", config: { openMode: "long_text" } },
  { text: "请将100分分配给以下购买因素", type: "allocation", options: "价格, 品牌, 功能, 售后", config: { totalPoints: 100 } }
];

const rankOkResult = {
  i: 0, type: "rank", rankMode: "full",
  items: [
    { optionIndex: 0, avgRank: 1.5, firstPct: 42, top3Pct: 90, rankDistribution: [42, 30, 18, 10] },
    { optionIndex: 1, avgRank: 2.4, firstPct: 28, top3Pct: 78, rankDistribution: [28, 34, 16, 22] },
    { optionIndex: 2, avgRank: 3.1, firstPct: 18, top3Pct: 66, rankDistribution: [18, 22, 26, 34] },
    { optionIndex: 3, avgRank: 3.9, firstPct: 12, top3Pct: 40, rankDistribution: [12, 14, 40, 34] }
  ]
};

check("mergeRank 合法结果 → complete", () => {
  const merged = mergeRawResults([rankOkResult], v54Questions);
  assert.equal(merged[0].dataStatus, "complete", JSON.stringify(merged[0].dataErrors));
  assert.equal(merged[0].items.length, 4);
  assert.equal(merged[0].items[0].avgRank, 1.5);
});

check("mergeRank 缺选项结果 → incomplete（不补0）", () => {
  const partial = { i: 0, type: "rank", items: [
    { optionIndex: 0, avgRank: 1.5, firstPct: 42, top3Pct: 90, rankDistribution: [42, 30, 18, 10] },
    { optionIndex: 1, avgRank: 2.4, firstPct: 28, top3Pct: 78, rankDistribution: [28, 34, 16, 22] }
  ] };
  const merged = mergeRawResults([partial], v54Questions);
  assert.equal(merged[0].dataStatus, "incomplete");
  assert.ok(merged[0].dataErrors.some((e) => e.errorType === "rank_items_mismatch"));
  assert.equal(merged[0].items.length, 4, "items 按选项数补齐为缺失结构");
  assert.equal(merged[0].items[2].avgRank, null, "缺失项不补0");
});

check("mergeRank 名次分布长度错误 → incomplete", () => {
  const bad = { i: 0, type: "rank", items: [
    { optionIndex: 0, avgRank: 1.5, firstPct: 42, top3Pct: 90, rankDistribution: [42, 30] },
    { optionIndex: 1, avgRank: 2.4, firstPct: 28, top3Pct: 78, rankDistribution: [28, 34, 16, 22] },
    { optionIndex: 2, avgRank: 3.1, firstPct: 18, top3Pct: 66, rankDistribution: [18, 22, 26, 34] },
    { optionIndex: 3, avgRank: 3.9, firstPct: 12, top3Pct: 40, rankDistribution: [12, 14, 40, 34] }
  ] };
  const merged = mergeRawResults([bad], v54Questions);
  assert.ok(merged[0].dataErrors.some((e) => e.errorType === "rank_dist_mismatch"));
});

check("mergeRank 平均排名越界 → 报错", () => {
  const bad = JSON.parse(JSON.stringify(rankOkResult));
  bad.items[0].avgRank = 9;
  const merged = mergeRawResults([bad], v54Questions);
  assert.ok(merged[0].dataErrors.some((e) => e.errorType === "rank_avg_out_of_range"));
});

check("mergeNps 系统重算 NPS（不信 AI 返回值）", () => {
  // 分布：0-6分 38%，7-8 32%，9-10 30% → NPS = -8
  const dist = [2, 3, 4, 5, 6, 8, 10, 14, 18, 16, 14]; // 贬损=2+3+4+5+6+8+10=38, 被动=14+18=32, 推荐=16+14=30
  const merged = mergeRawResults([{ i: 1, type: "nps", distribution: dist, promoterPct: 99, passivePct: 1, detractorPct: 0, nps: 99, mean: 6.8 }], v54Questions);
  assert.equal(merged[1].dataStatus, "complete", JSON.stringify(merged[1].dataErrors));
  assert.equal(merged[1].promoterPct, 30, "按分布重算推荐者");
  assert.equal(merged[1].detractorPct, 38, "按分布重算贬损者");
  assert.equal(merged[1].nps, -8, "NPS = 推荐者 - 贬损者");
});

check("mergeNps 分布长度错误 → incomplete", () => {
  const merged = mergeRawResults([{ i: 1, type: "nps", distribution: [10, 20, 30, 40], mean: 5 }], v54Questions);
  assert.ok(merged[1].dataErrors.some((e) => e.errorType === "nps_dist_mismatch"));
});

check("mergeNumeric 统计量范围与顺序校验", () => {
  const ok = mergeRawResults([{ i: 2, type: "numeric", mean: 3280, median: 3000, min: 500, max: 8000, p25: 2000, p75: 4500, distribution: [{ label: "2000元以下", pct: 18 }] }], v54Questions);
  assert.equal(ok[2].dataStatus, "complete", JSON.stringify(ok[2].dataErrors));
  const out = mergeRawResults([{ i: 2, type: "numeric", mean: 20000, median: 3000, min: 500, max: 8000, p25: 2000, p75: 4500 }], v54Questions);
  assert.ok(out[2].dataErrors.some((e) => e.errorType === "numeric_out_of_range"), "均值超范围");
  const order = mergeRawResults([{ i: 2, type: "numeric", mean: 3000, median: 2000, min: 500, max: 8000, p25: 4500, p75: 3000 }], v54Questions);
  assert.ok(order[2].dataErrors.some((e) => e.errorType === "numeric_order_bad"), "顺序违反 min≤p25≤median≤p75≤max");
});

check("mergeOpen 主题聚类 + 提及率", () => {
  const merged = mergeRawResults([{ i: 3, type: "open", responseCount: 100, otherPct: 8, themes: [
    { name: "担心续航不足", pct: 36, summary: "担心长距离骑行电量不足", quotes: ["平时通勤够用，但跑远一点就没底。"] },
    { name: "价格偏高", pct: 28, summary: "价格是主要门槛", quotes: [] },
    { name: "品牌信任", pct: 22, summary: "倾向选择熟悉品牌", quotes: [] }
  ] }], v54Questions);
  assert.equal(merged[3].dataStatus, "complete", JSON.stringify(merged[3].dataErrors));
  assert.equal(merged[3].themes.length, 3);
  assert.equal(merged[3].themes[0].pct, 36);
  const missing = mergeRawResults([{ i: 3, type: "open" }], v54Questions);
  assert.ok(missing[3].dataErrors.some((e) => e.errorType === "open_themes_missing"));
});

check("mergeAllocation 平均分合计校验", () => {
  const ok = mergeRawResults([{ i: 4, type: "allocation", totalPoints: 100, items: [
    { optionIndex: 0, meanPoints: 32.5, medianPoints: 30 },
    { optionIndex: 1, meanPoints: 25.8, medianPoints: 25 },
    { optionIndex: 2, meanPoints: 22.1, medianPoints: 20 },
    { optionIndex: 3, meanPoints: 19.6, medianPoints: 20 }
  ] }], v54Questions);
  assert.equal(ok[4].dataStatus, "complete", JSON.stringify(ok[4].dataErrors));
  const bad = mergeRawResults([{ i: 4, type: "allocation", totalPoints: 100, items: [
    { optionIndex: 0, meanPoints: 60, medianPoints: 60 },
    { optionIndex: 1, meanPoints: 60, medianPoints: 60 },
    { optionIndex: 2, meanPoints: 60, medianPoints: 60 },
    { optionIndex: 3, meanPoints: 60, medianPoints: 60 }
  ] }], v54Questions);
  assert.ok(bad[4].dataErrors.some((e) => e.errorType === "allocation_sum_not_total"), "合计240≠100");
});

section("v54 指标计算");

check("rankMetrics 平均排名/第一名/稳定次级/集中度", () => {
  const merged = mergeRawResults([rankOkResult], v54Questions);
  const m = rankMetrics(merged[0]);
  assert.equal(m.available, true);
  assert.equal(m.ranked[0].label, "事故取证");
  assert.equal(m.ranked[0].avgRank, 1.5);
  assert.equal(m.firstLeader.optionIndex, 0);
  assert.ok(m.consistent, "平均排名第一 = 第一名比例最高");
  const stable = mergeRawResults([{ i: 0, type: "rank", items: [
    { optionIndex: 0, avgRank: 2.1, firstPct: 28, top3Pct: 80, rankDistribution: [28, 30, 22, 20] },
    { optionIndex: 1, avgRank: 1.4, firstPct: 42, top3Pct: 92, rankDistribution: [42, 36, 14, 8] },
    { optionIndex: 2, avgRank: 3.2, firstPct: 20, top3Pct: 55, rankDistribution: [20, 24, 11, 45] },
    { optionIndex: 3, avgRank: 3.4, firstPct: 10, top3Pct: 30, rankDistribution: [10, 10, 53, 27] }
  ] }], v54Questions);
  const m2 = rankMetrics(stable[0]);
  assert.ok(m2.stableSecondary && m2.stableSecondary.optionIndex === 0, "识别稳定次级（均排靠前但第一少）");
  assert.equal(m2.consistent, true, "平均排名第一 = 第一名比例最高");
});

check("npsMetrics / numericMetrics / openMetrics / allocationMetrics", () => {
  const merged = mergeRawResults([
    rankOkResult,
    { i: 1, type: "nps", distribution: [2, 3, 4, 5, 6, 8, 10, 14, 18, 16, 14], mean: 6.8 },
    { i: 2, type: "numeric", mean: 3280, median: 3000, min: 500, max: 8000, p25: 2000, p75: 4500, distribution: [{ label: "低", pct: 18 }, { label: "高", pct: 42 }] },
    { i: 3, type: "open", responseCount: 100, otherPct: 8, themes: [
      { name: "续航", pct: 36, summary: "担心续航", quotes: ["q1"] },
      { name: "价格", pct: 28, summary: "价格门槛", quotes: [] },
      { name: "品牌", pct: 22, summary: "品牌信任", quotes: [] }
    ] },
    { i: 4, type: "allocation", totalPoints: 100, items: [
      { optionIndex: 0, meanPoints: 32.5, medianPoints: 30 },
      { optionIndex: 1, meanPoints: 25.8, medianPoints: 25 },
      { optionIndex: 2, meanPoints: 22.1, medianPoints: 20 },
      { optionIndex: 3, meanPoints: 19.6, medianPoints: 20 }
    ] }
  ], v54Questions);
  const nm = npsMetrics(merged[1]);
  assert.equal(nm.nps, -8);
  assert.equal(nm.promoter, 30);
  const numM = numericMetrics(merged[2]);
  assert.equal(numM.mean, 3280);
  assert.equal(numM.skew, "右偏（少数高值拉高均值）");
  const om = openMetrics(merged[3]);
  assert.equal(om.top.name, "续航");
  assert.equal(om.top3.length, 3);
  const am = allocationMetrics(merged[4]);
  assert.equal(am.top1.label, "价格");
  assert.equal(am.top2Pct, 58.3);
  assert.ok(am.concentrated === false);
});

section("v54 关键发现与导出");

check("buildKeyFindings 支持 NPS 与排序题发现", () => {
  const merged = mergeRawResults([
    rankOkResult,
    { i: 1, type: "nps", distribution: [2, 3, 4, 5, 6, 8, 10, 14, 18, 16, 14], mean: 6.8 }
  ], v54Questions);
  const findings = buildKeyFindings(merged, null, env);
  assert.ok(findings.some((f) => f.title.includes("NPS")), "包含 NPS 发现");
  assert.ok(findings.some((f) => f.title.includes("排序")), "包含排序题发现");
  findings.forEach((f) => assert.ok(f.evidence.length > 0));
});

check("buildQuantCsv 新题型多行展开且不压成百分比数组", () => {
  const merged = mergeRawResults([
    rankOkResult,
    { i: 1, type: "nps", distribution: [2, 3, 4, 5, 6, 8, 10, 14, 18, 16, 14], mean: 6.8 },
    { i: 2, type: "numeric", mean: 3280, median: 3000, min: 500, max: 8000, p25: 2000, p75: 4500, distribution: [{ label: "低", pct: 18 }] },
    { i: 3, type: "open", responseCount: 100, otherPct: 8, themes: [{ name: "续航", pct: 36, summary: "担心续航", quotes: [] }] },
    { i: 4, type: "allocation", totalPoints: 100, items: [
      { optionIndex: 0, meanPoints: 32.5, medianPoints: 30 },
      { optionIndex: 1, meanPoints: 25.8, medianPoints: 25 },
      { optionIndex: 2, meanPoints: 22.1, medianPoints: 20 },
      { optionIndex: 3, meanPoints: 19.6, medianPoints: 20 }
    ] }
  ], v54Questions);
  const csv = buildQuantCsv(merged);
  assert.ok(csv.includes("排序题"), "包含排序题型");
  assert.ok(csv.includes("均排"), "排序行含平均排名");
  assert.ok(csv.includes("NPS"), "NPS 行");
  assert.ok(csv.includes("提及率"), "开放题主题提及率");
  assert.ok(csv.includes("定和分配") || csv.includes("均分"), "定和分配行");
});

check("buildQuantWorkbenchMarkdown 新题型展示格式", () => {
  const merged = mergeRawResults([
    rankOkResult,
    { i: 1, type: "nps", distribution: [2, 3, 4, 5, 6, 8, 10, 14, 18, 16, 14], mean: 6.8 },
    { i: 2, type: "numeric", mean: 3280, median: 3000, min: 500, max: 8000, p25: 2000, p75: 4500, distribution: [] },
    { i: 3, type: "open", responseCount: 100, otherPct: 8, themes: [{ name: "续航", pct: 36, summary: "担心续航", quotes: [] }] },
    { i: 4, type: "allocation", totalPoints: 100, items: [
      { optionIndex: 0, meanPoints: 32.5, medianPoints: 30 },
      { optionIndex: 1, meanPoints: 25.8, medianPoints: 25 },
      { optionIndex: 2, meanPoints: 22.1, medianPoints: 20 },
      { optionIndex: 3, meanPoints: 19.6, medianPoints: 20 }
    ] }
  ], v54Questions);
  merged.forEach((q) => { q.module = detectQuestionModule(q, q.index).id; q.moduleLabel = MODULE_LABEL[q.module]; });
  const md = buildQuantWorkbenchMarkdown({ questions: merged, qualityDetails: makeQuantQualityDetails(merged, []), keyFindings: buildKeyFindings(merged, null, env), coreMetrics: [], storyline: null, crosstab: null }, env);
  assert.ok(md.includes("平均排名"), "排序题表格");
  assert.ok(md.includes("NPS：-8"), "NPS 数值");
  assert.ok(md.includes("四分位区间"), "数值题区间");
  assert.ok(md.includes("提及率"), "开放题主题");
  assert.ok(md.includes("平均分配分数"), "定和分配表");
});

check("buildQuantWorkbook 新增题型 Sheet 内容", () => {
  const merged = mergeRawResults([
    rankOkResult,
    { i: 1, type: "nps", distribution: [2, 3, 4, 5, 6, 8, 10, 14, 18, 16, 14], mean: 6.8 },
    { i: 2, type: "numeric", mean: 3280, median: 3000, min: 500, max: 8000, p25: 2000, p75: 4500, distribution: [] },
    { i: 3, type: "open", responseCount: 100, otherPct: 8, themes: [{ name: "续航", pct: 36, summary: "担心续航", quotes: [] }] },
    { i: 4, type: "allocation", totalPoints: 100, items: [
      { optionIndex: 0, meanPoints: 32.5, medianPoints: 30 },
      { optionIndex: 1, meanPoints: 25.8, medianPoints: 25 },
      { optionIndex: 2, meanPoints: 22.1, medianPoints: 20 },
      { optionIndex: 3, meanPoints: 19.6, medianPoints: 20 }
    ] }
  ], v54Questions);
  const wb = buildQuantWorkbook({ questions: merged, qualityDetails: makeQuantQualityDetails(merged, []), keyFindings: [] });
  const str = new TextDecoder().decode(wb).replace(/[^\x20-\x7e\u4e00-\u9fff]/g, "");
  assert.ok(str.includes("排序题结果"), "含排序题 Sheet");
  assert.ok(str.includes("数值/开放/定和"), "含高级题型 Sheet");
});

section("v54 深度解读支持新题型");

check("buildQuestionInterpretationPrompt 新题型输出真实数据（非「未知题型」）", () => {
  const merged = mergeRawResults([
    rankOkResult,
    { i: 1, type: "nps", distribution: [2, 3, 4, 5, 6, 8, 10, 14, 18, 16, 14], mean: 6.8 },
    { i: 2, type: "numeric", mean: 3280, median: 3000, min: 500, max: 8000, p25: 2000, p75: 4500, distribution: [{ label: "低", pct: 18 }] },
    { i: 3, type: "open", responseCount: 100, otherPct: 8, themes: [{ name: "续航", pct: 36, summary: "担心续航", quotes: ["q"] }] },
    { i: 4, type: "allocation", totalPoints: 100, items: [
      { optionIndex: 0, meanPoints: 32.5, medianPoints: 30 },
      { optionIndex: 1, meanPoints: 25.8, medianPoints: 25 },
      { optionIndex: 2, meanPoints: 22.1, medianPoints: 20 },
      { optionIndex: 3, meanPoints: 19.6, medianPoints: 20 }
    ] }
  ], v54Questions);
  const env = { topic: "t", audienceConfig: { age: "a", gender: "g", city: "c" }, sampleSize: 100, questions: merged };
  const p0 = buildQuestionInterpretationPrompt(env, merged[0], [], { isMock: true });
  assert.ok(p0.includes("平均排名 1.5"), "排序题提示词含平均排名");
  assert.ok(p0.includes("名次分布"), "排序题提示词含名次分布");
  assert.doesNotMatch(p0, /未知题型/, "不再输出「未知题型」");
  const p1 = buildQuestionInterpretationPrompt(env, merged[1], [], { isMock: true });
  assert.ok(p1.includes("NPS -8"), "NPS 提示词含 NPS 值");
  const p2 = buildQuestionInterpretationPrompt(env, merged[2], [], { isMock: true });
  assert.ok(p2.includes("中位数 3000"), "数值题提示词含中位数");
  const p3 = buildQuestionInterpretationPrompt(env, merged[3], [], { isMock: true });
  assert.ok(p3.includes("主题聚类"), "开放题提示词含主题聚类");
  const p4 = buildQuestionInterpretationPrompt(env, merged[4], [], { isMock: true });
  assert.ok(p4.includes("平均分配 32.5"), "定和分配提示词含均分");
});

check("buildRuleBasedInterpretation 新题型基础解读", () => {
  const merged = mergeRawResults([
    rankOkResult,
    { i: 1, type: "nps", distribution: [2, 3, 4, 5, 6, 8, 10, 14, 18, 16, 14], mean: 6.8 },
    { i: 2, type: "numeric", mean: 3280, median: 3000, min: 500, max: 8000, p25: 2000, p75: 4500, distribution: [] },
    { i: 3, type: "open", responseCount: 100, otherPct: 8, themes: [
      { name: "续航", pct: 36, summary: "s", quotes: [] },
      { name: "价格", pct: 27, summary: "s2", quotes: [] },
      { name: "品牌", pct: 21, summary: "s3", quotes: [] }
    ] },
    { i: 4, type: "allocation", totalPoints: 100, items: [
      { optionIndex: 0, meanPoints: 40, medianPoints: 38 },
      { optionIndex: 1, meanPoints: 30, medianPoints: 28 },
      { optionIndex: 2, meanPoints: 20, medianPoints: 20 },
      { optionIndex: 3, meanPoints: 10, medianPoints: 10 }
    ] }
  ], v54Questions);
  const r0 = buildRuleBasedInterpretation(merged[0], v54Questions, { isMock: true });
  assert.ok(r0 && r0.headline.includes("事故取证"), "排序题基础解读");
  const r1 = buildRuleBasedInterpretation(merged[1], v54Questions, { isMock: true });
  assert.ok(r1 && r1.headline.includes("NPS"), "NPS 基础解读");
  const r2 = buildRuleBasedInterpretation(merged[2], v54Questions, { isMock: true });
  assert.ok(r2 && r2.headline.includes("数值"), "数值题基础解读");
  const r3 = buildRuleBasedInterpretation(merged[3], v54Questions, { isMock: true });
  assert.ok(r3 && r3.headline.includes("续航"), "开放题基础解读");
  const r4 = buildRuleBasedInterpretation(merged[4], v54Questions, { isMock: true });
  assert.ok(r4 && r4.headline.includes("价格"), "定和分配基础解读（top1=价格40分）");
  [r0, r1, r2, r3, r4].forEach((r) => {
    assert.ok(r.observation.length > 20, "observation 满足长度要求");
    assert.ok(r.evidence.length >= 1, "绑定证据");
  });
});

// ===== 汇总 =====
console.log(`\n========== 结果：${passed} 通过，${failed} 失败 ==========`);
if (failed > 0) {
  console.log("失败明细:");
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.err.message}`));
  process.exit(1);
}
