// v52 配额设计核心模块测试
// 运行：node scripts/test-quota-core.mjs
// 覆盖：新增/删除/复制/排序维度与选项、校验（合计/小数/空名/重复/负数/超100/非数字/全0/单选项）、
//       人数换算（N=100/101/6/小比例 0 人/严格等于样本量）、状态保护（停用不进提示词/迁移/校验门禁）。

import assert from "node:assert/strict";
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
} from "../src/quota-core.js";

let __pass = 0;
let __fail = 0;
function test(name, fn) {
  try {
    fn();
    __pass += 1;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    __fail += 1;
    console.error(`  ❌ ${name}\n     ${err.message}`);
  }
}

function makeDim(name, items, opts = {}) {
  return makeQuotaDimension({
    name,
    items: items.map(([label, pct]) => ({ label, pct })),
    source: opts.source || "custom",
    enabled: opts.enabled !== false
  });
}

console.log("\n=== 一、新增 / 删除 / 复制 / 排序 ===");

test("1. 新增「收入水平」配额维度", () => {
  const dim = dimensionFromTemplateKey("income");
  assert.equal(dim.name, "收入水平");
  assert.equal(dim.source, "preset");
  assert.equal(dim.items.length, 4);
  assert.ok(dim.id.startsWith("quota_"));
  assert.ok(dim.items.every((it) => it.id && it.id.startsWith("quota_item_")));
});

test("2. 新增自定义「用户类型」维度", () => {
  const dim = makeQuotaDimension({
    name: "用户类型",
    source: "custom",
    items: [
      { label: "现有用户", pct: 50 },
      { label: "潜在用户", pct: 30 },
      { label: "流失用户", pct: 20 }
    ]
  });
  assert.equal(dim.name, "用户类型");
  assert.equal(dim.source, "custom");
  assert.equal(dim.items.length, 3);
  assert.equal(dim.items[0].label, "现有用户");
  assert.equal(dim.items[0].pct, 50);
});

test("3. 删除一个自定义维度后其他维度数据不受影响", () => {
  const plan = [
    makeDim("性别", [["女性", 55], ["男性", 45]], { source: "preset" }),
    makeDim("收入水平", [["低", 30], ["中", 50], ["高", 20]], { source: "custom" }),
    makeDim("用户类型", [["现有", 60], ["潜在", 40]], { source: "custom" })
  ];
  const incomeId = plan[1].id;
  const userTypeItems = JSON.parse(JSON.stringify(plan[2].items));
  const remaining = plan.filter((d) => d.id !== incomeId);
  assert.equal(remaining.length, 2);
  assert.equal(remaining[0].name, "性别");
  assert.equal(remaining[1].name, "用户类型");
  // 用户类型的 items 数据完全一致
  assert.deepEqual(remaining[1].items, userTypeItems);
});

test("4. 复制一个配额维度（深拷贝，ID 不冲突）", () => {
  const src = makeDim("年龄", [["18-24", 30], ["25-34", 70]], { source: "preset" });
  const copy = makeQuotaDimension({
    name: src.name + " 副本",
    source: src.source,
    items: src.items.map((it) => ({ label: it.label, pct: it.pct }))
  });
  assert.notEqual(copy.id, src.id);
  assert.equal(copy.items.length, src.items.length);
  // 名称相同但 ID 不同
  copy.items.forEach((it, i) => {
    assert.equal(it.label, src.items[i].label);
    assert.equal(it.pct, src.items[i].pct);
    assert.notEqual(it.id, src.items[i].id);
  });
});

test("5. 删除维度后其他维度 ID 不变", () => {
  const plan = [
    makeDim("性别", [["女性", 50], ["男性", 50]]),
    makeDim("年龄", [["18-24", 50], ["25-34", 50]]),
    makeDim("城市", [["一线", 50], ["二线", 50]])
  ];
  const genderId = plan[0].id;
  const ageId = plan[1].id;
  const cityId = plan[2].id;
  const remaining = plan.filter((d) => d.id !== ageId);
  assert.equal(remaining[0].id, genderId);
  assert.equal(remaining[1].id, cityId);
});

test("6. 新增、删除、重新排序配额选项", () => {
  let dim = makeDim("测试", [["A", 30], ["B", 30], ["C", 40]]);
  // 新增
  dim.items.push(makeQuotaItem("D", 0));
  assert.equal(dim.items.length, 4);
  // 删除 B
  const bId = dim.items[1].id;
  dim.items = dim.items.filter((it) => it.id !== bId);
  assert.equal(dim.items.length, 3);
  assert.equal(dim.items[0].label, "A");
  assert.equal(dim.items[1].label, "C");
  // 重新排序：交换 A 和 C
  [dim.items[0], dim.items[1]] = [dim.items[1], dim.items[0]];
  assert.equal(dim.items[0].label, "C");
  assert.equal(dim.items[1].label, "A");
  // 选项 ID 在整个过程中保持稳定
  assert.equal(dim.items[0].label, "C");
  assert.ok(dim.items[0].id.startsWith("quota_item_"));
});

console.log("\n=== 二、校验 ===");

test("7. 维度合计为 100% 通过", () => {
  const plan = [makeDim("性别", [["女性", 55], ["男性", 45]])];
  const r = validateQuotaPlan(plan, 100);
  assert.equal(r.valid, true);
  assert.equal(r.errors.length, 0);
});

test("8. 维度合计为 99% 不通过", () => {
  const plan = [makeDim("性别", [["女性", 55], ["男性", 44]])];
  const r = validateQuotaPlan(plan, 100);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === "total_not_100"));
});

test("9. 维度合计为 101% 不通过", () => {
  const plan = [makeDim("性别", [["女性", 55], ["男性", 46]])];
  const r = validateQuotaPlan(plan, 100);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === "total_not_100"));
});

test("10. 使用小数后合计为 100% 通过", () => {
  const plan = [makeDim("测试", [["A", 33.3], ["B", 33.3], ["C", 33.4]])];
  const r = validateQuotaPlan(plan, 100);
  assert.equal(r.valid, true, `expected valid, got errors: ${JSON.stringify(r.errors)}`);
});

test("11. 选项名称为空时报错", () => {
  const dim = makeDim("测试", [["A", 50], ["B", 50]]);
  dim.items[0].label = "";
  const r = validateQuotaPlan([dim], 100);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === "item_label_empty"));
});

test("12. 选项名称重复时报错", () => {
  const dim = makeDim("测试", [["A", 50], ["A", 50]]);
  const r = validateQuotaPlan([dim], 100);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === "duplicate_item_label"));
});

test("13. 维度名称重复时报错", () => {
  const plan = [
    makeDim("性别", [["女性", 50], ["男性", 50]]),
    makeDim("性别", [["A", 50], ["B", 50]])
  ];
  const r = validateQuotaPlan(plan, 100);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === "duplicate_dimension_name"));
});

test("14. 百分比为负数时报错", () => {
  const dim = makeDim("测试", [["A", 120], ["B", -20]]);
  const r = validateQuotaPlan([dim], 100);
  assert.ok(r.errors.some((e) => e.type === "pct_negative" || e.type === "pct_over_100"));
});

test("15. 百分比大于 100 报错", () => {
  const dim = makeDim("测试", [["A", 150], ["B", -50]]);
  const r = validateQuotaPlan([dim], 100);
  assert.ok(r.errors.some((e) => e.type === "pct_over_100"));
});

test("16. 百分比为非数字时报错", () => {
  const dim = makeDim("测试", [["A", 50], ["B", 50]]);
  dim.items[0].pct = "abc";
  const r = validateQuotaPlan([dim], 100);
  assert.ok(r.errors.some((e) => e.type === "pct_not_number"));
});

test("17. 全部选项为 0 时报错", () => {
  const dim = makeDim("测试", [["A", 0], ["B", 0]]);
  const r = validateQuotaPlan([dim], 100);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === "all_zero" || e.type === "total_not_100"));
});

test("18. 单选项维度不是 100% 报错", () => {
  const dim = makeDim("测试", [["唯一选项", 80]]);
  const r = validateQuotaPlan([dim], 100);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === "single_item_not_100" || e.type === "total_not_100"));
});

console.log("\n=== 三、人数换算 ===");

test("19. N=100，三个选项 33/33/34 严格合计 100", () => {
  const items = [{ id: "a", label: "A", pct: 33 }, { id: "b", label: "B", pct: 33 }, { id: "c", label: "C", pct: 34 }];
  const r = allocateQuotaCounts(items, 100);
  const sum = r.reduce((s, x) => s + x.count, 0);
  assert.equal(sum, 100, `expected 100, got ${sum} (${JSON.stringify(r)})`);
});

test("20. N=101，三个选项 33/33/34 严格合计 101（不能是 100）", () => {
  const items = [{ id: "a", label: "A", pct: 33 }, { id: "b", label: "B", pct: 33 }, { id: "c", label: "C", pct: 34 }];
  const r = allocateQuotaCounts(items, 101);
  const sum = r.reduce((s, x) => s + x.count, 0);
  assert.equal(sum, 101, `expected 101, got ${sum} (${JSON.stringify(r)})`);
});

test("21. N=6 定性配额换算严格合计 6", () => {
  const items = [{ id: "a", label: "A", pct: 50 }, { id: "b", label: "B", pct: 30 }, { id: "c", label: "C", pct: 20 }];
  const r = allocateQuotaCounts(items, 6);
  const sum = r.reduce((s, x) => s + x.count, 0);
  assert.equal(sum, 6, `expected 6, got ${sum}`);
  // A 应该是 3，B 应该是 2，C 应该是 1（50%*6=3, 30%*6=1.8→2, 20%*6=1.2→1）
  assert.equal(r[0].count, 3);
  assert.equal(r[1].count, 2);
  assert.equal(r[2].count, 1);
});

test("22. 小比例选项换算为 0 人时给出警告", () => {
  // N=10，1% 选项理论值 0.1，取整后 0
  const plan = [makeDim("测试", [["大", 99], ["小", 1]])];
  const r = validateQuotaPlan(plan, 10);
  assert.ok(r.warnings.some((w) => w.type === "small_quota_zero_count" || w.type === "only_one_person"));
});

test("23. 每个维度换算人数严格等于样本量", () => {
  const plan = [
    makeDim("A", [["a1", 33], ["a2", 33], ["a3", 34]]),
    makeDim("B", [["b1", 25], ["b2", 75]]),
    makeDim("C", [["c1", 10], ["c2", 20], ["c3", 30], ["c4", 40]])
  ];
  const n = 137;
  plan.forEach((dim) => {
    const r = allocateQuotaCounts(dim.items, n);
    const sum = r.reduce((s, x) => s + x.count, 0);
    assert.equal(sum, n, `维度 ${dim.name}: 期望 ${n}, 实际 ${sum}`);
  });
});

console.log("\n=== 四、状态保护 / 提示词 / 迁移 ===");

test("24. 切换人群预设时保留自定义维度（refreshPresetDimensions 模拟）", () => {
  // 模拟 app.js 中的 refreshPresetDimensions 逻辑
  const presetNames = ["性别", "年龄", "城市层级"];
  const plan = [
    makeDim("性别", [["女", 50], ["男", 50]], { source: "preset" }),
    makeDim("收入水平", [["低", 30], ["高", 70]], { source: "custom" }),
    makeDim("用户类型", [["现有", 60], ["潜在", 40]], { source: "custom" })
  ];
  const customDims = plan.filter((d) => !presetNames.includes(d.name.trim()));
  const newPresets = buildDefaultQuotaPlan({ age: "25-34 岁", gender: "女性 60% / 男性 40%", city: "一线 / 二线" });
  const refreshed = [...newPresets, ...customDims];
  assert.equal(refreshed.length, 5); // 3 preset + 2 custom
  // 自定义维度保留
  assert.ok(refreshed.some((d) => d.name === "收入水平"));
  assert.ok(refreshed.some((d) => d.name === "用户类型"));
});

test("25. 旧版固定配额数据可以正常迁移", () => {
  const oldPlan = [
    { id: "gender", name: "性别", items: [{ label: "女性", pct: 55 }, { label: "男性", pct: 45 }] },
    { id: "age", name: "年龄", items: [{ label: "25-29", pct: 50 }, { label: "30-34", pct: 50 }] },
    { id: "city", name: "城市层级", items: [{ label: "一线", pct: 60 }, { label: "二线", pct: 40 }] }
  ];
  const migrated = migrateQuotaPlan(oldPlan);
  assert.equal(migrated.length, 3);
  // 旧 id 不应保留为新 id（应生成 quota_ 前缀）
  assert.ok(migrated[0].id.startsWith("quota_"), `expected quota_, got ${migrated[0].id}`);
  // items 应该都有 id
  assert.ok(migrated[0].items[0].id, "迁移后 item 应该有 id");
  // 性别应该是 preset
  assert.equal(migrated[0].source, "preset");
  // 名称应保留
  assert.equal(migrated[0].name, "性别");
  assert.equal(migrated[1].name, "年龄");
  // 数据值应保留
  assert.equal(migrated[0].items[0].label, "女性");
  assert.equal(migrated[0].items[0].pct, 55);
});

test("26. 停用维度不进入 AI 提示词", () => {
  const plan = [
    makeDim("性别", [["女", 50], ["男", 50]]),
    makeDim("收入水平", [["低", 50], ["高", 50]])
  ];
  plan[1].enabled = false;
  const text = buildQuotaPromptText(plan, 100);
  assert.ok(text.includes("性别"));
  assert.ok(!text.includes("收入水平"));
});

test("27. 自定义维度正确进入 AI 提示词", () => {
  const plan = [
    makeDim("性别", [["女", 50], ["男", 50]], { source: "preset" }),
    makeDim("用户类型", [["现有用户", 50], ["潜在用户", 30], ["流失用户", 20]], { source: "custom" })
  ];
  const text = buildQuotaPromptText(plan, 300);
  assert.ok(text.includes("性别"));
  assert.ok(text.includes("用户类型"));
  assert.ok(text.includes("现有用户"));
  assert.ok(text.includes("300"));
});

test("28. 配额错误时禁止生成（gateQuotaForGeneration 等价校验）", () => {
  const plan = [makeDim("测试", [["A", 80], ["B", 30]])]; // 合计 110
  const r = validateQuotaPlan(plan, 100);
  assert.equal(r.valid, false);
  assert.ok(r.errors.length > 0);
  // 等价于 app.js gateQuotaForGeneration 的返回值
  const gateMessage = r.errors.length ? `无法生成：${r.errors[0].message}` : null;
  assert.ok(gateMessage);
  assert.ok(gateMessage.includes("无法生成"));
});

console.log("\n=== 五、便捷工具 ===");

test("29. 平均分配严格合计 100", () => {
  const even3 = distributeEvenly(3);
  const sum = even3.reduce((s, v) => s + v, 0);
  assert.equal(sum, 100);
  // 3 个选项应为 34/33/33
  assert.equal(even3[0], 34);
  assert.equal(even3[1], 33);
  assert.equal(even3[2], 33);
});

test("30. 自动补齐到 100%", () => {
  const items = [{ id: "1", label: "A", pct: 30 }, { id: "2", label: "B", pct: 30 }, { id: "3", label: "C", pct: 35 }];
  const topped = topUpTo100(items);
  const sum = topped.reduce((s, x) => s + x.pct, 0);
  assert.equal(sum, 100);
  // 差值 5 应该加到最后一个
  assert.equal(topped[2].pct, 40);
});

test("31. 按比例归一化到 100%", () => {
  const items = [{ id: "1", label: "A", pct: 20 }, { id: "2", label: "B", pct: 30 }, { id: "3", label: "C", pct: 30 }];
  const normalized = normalizeItems(items);
  const sum = normalized.reduce((s, x) => s + x.pct, 0);
  assert.equal(sum, 100);
  // 20/80=25, 30/80=37.5→37 或 38, 30/80=37.5→37 或 38，合计 100
});

test("32. normalizeTo100 处理空数组与全 0 数组", () => {
  assert.deepEqual(normalizeTo100([]), []);
  assert.deepEqual(normalizeTo100([0, 0, 0]), [0, 0, 0]);
  const r = normalizeTo100([25, 25, 25, 25]);
  const sum = r.reduce((s, v) => s + v, 0);
  assert.equal(sum, 100);
});

console.log("\n=== 六、稳定性 ===");

test("33. 相同余数时使用稳定顺序（多次渲染结果一致）", () => {
  const items = [
    { id: "a", label: "A", pct: 33 },
    { id: "b", label: "B", pct: 33 },
    { id: "c", label: "C", pct: 34 }
  ];
  const r1 = allocateQuotaCounts(items, 101);
  const r2 = allocateQuotaCounts(items, 101);
  assert.deepEqual(
    r1.map((x) => x.count),
    r2.map((x) => x.count)
  );
});

test("34. quotaStats 统计启用维度与选项数", () => {
  const plan = [
    makeDim("A", [["a1", 50], ["a2", 50]]),
    makeDim("B", [["b1", 50], ["b2", 50]]),
    makeDim("C", [["c1", 50], ["c2", 50]])
  ];
  plan[1].enabled = false;
  const stats = quotaStats(plan);
  assert.equal(stats.dimCount, 2); // 启用 2 个
  assert.equal(stats.itemCount, 4); // 2 + 2 = 4
});

test("35. buildQuotaSummaryLines 返回所有启用维度", () => {
  const plan = [
    makeDim("性别", [["女", 60], ["男", 40]]),
    makeDim("年龄", [["18-24", 50], ["25-34", 50]])
  ];
  const lines = buildQuotaSummaryLines(plan, 100);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].name, "性别");
  assert.ok(lines[0].itemsText.includes("女"));
  assert.ok(lines[0].itemsText.includes("60%"));
});

console.log(`\n=== 测试结果：${__pass} 通过 / ${__fail} 失败 ===`);
if (__fail > 0) {
  process.exit(1);
}
