// 配额设计核心模块（v52）
// 提供动态配额维度的数据结构、校验、人数换算、模板、迁移与摘要构建。
// 该模块为纯函数（无 DOM / localStorage 依赖），可由 app.js 与 node 测试同时引用。

// ===== ID 生成 =====
// 使用计数器 + 时间戳 + 随机后缀，保证同一会话内稳定且唯一。
let __idCounter = 0;
function genQuotaId(prefix = "quota") {
  __idCounter += 1;
  const rand = Math.floor(Math.random() * 0xffffff).toString(36).padStart(4, "0");
  return `${prefix}_${Date.now().toString(36)}_${__idCounter.toString(36)}_${rand}`;
}

// ===== 预设维度模板 =====
// 用户可在「新增配额条件」面板中快速选择这些维度。
// 每个模板包含 name 与默认 items；模板自身不携带 id（实例化时再生成）。
export const QUOTA_TEMPLATES = [
  {
    key: "gender",
    name: "性别",
    items: [
      { label: "女性", pct: 55 },
      { label: "男性", pct: 45 }
    ]
  },
  {
    key: "age",
    name: "年龄",
    items: [
      { label: "18-24 岁", pct: 20 },
      { label: "25-34 岁", pct: 45 },
      { label: "35-44 岁", pct: 25 },
      { label: "45 岁及以上", pct: 10 }
    ]
  },
  {
    key: "city",
    name: "城市层级",
    items: [
      { label: "一线城市", pct: 35 },
      { label: "新一线城市", pct: 35 },
      { label: "二线城市", pct: 20 },
      { label: "三线及以下", pct: 10 }
    ]
  },
  {
    key: "income",
    name: "收入水平",
    items: [
      { label: "8k 以下", pct: 20 },
      { label: "8k-15k", pct: 40 },
      { label: "15k-25k", pct: 25 },
      { label: "25k 以上", pct: 15 }
    ]
  },
  {
    key: "user_type",
    name: "用户类型",
    items: [
      { label: "现有用户", pct: 50 },
      { label: "潜在用户", pct: 30 },
      { label: "流失用户", pct: 20 }
    ]
  },
  {
    key: "usage_freq",
    name: "使用频率",
    items: [
      { label: "高频使用", pct: 30 },
      { label: "中频使用", pct: 40 },
      { label: "低频使用", pct: 30 }
    ]
  },
  {
    key: "brand",
    name: "品牌使用情况",
    items: [
      { label: "本品牌用户", pct: 35 },
      { label: "竞品用户", pct: 40 },
      { label: "未决定", pct: 25 }
    ]
  },
  {
    key: "purchase_stage",
    name: "购买阶段",
    items: [
      { label: "认知阶段", pct: 25 },
      { label: "考虑阶段", pct: 35 },
      { label: "决策阶段", pct: 25 },
      { label: "已购买", pct: 15 }
    ]
  },
  {
    key: "price_sensitivity",
    name: "价格敏感度",
    items: [
      { label: "高敏感", pct: 30 },
      { label: "中敏感", pct: 45 },
      { label: "低敏感", pct: 25 }
    ]
  },
  {
    key: "ownership",
    name: "产品拥有情况",
    items: [
      { label: "已拥有", pct: 40 },
      { label: "计划购买", pct: 35 },
      { label: "暂无计划", pct: 25 }
    ]
  },
  {
    key: "channel",
    name: "渠道偏好",
    items: [
      { label: "线上电商", pct: 45 },
      { label: "线下门店", pct: 30 },
      { label: "社交电商", pct: 25 }
    ]
  },
  {
    key: "custom",
    name: "自定义条件",
    items: [
      { label: "选项 A", pct: 50 },
      { label: "选项 B", pct: 50 }
    ]
  }
];

// ===== 数据结构工厂 =====

export function makeQuotaItem(label = "", pct = 0) {
  return { id: genQuotaId("quota_item"), label: String(label ?? ""), pct: Number(pct) || 0 };
}

export function makeQuotaDimension({ name = "新配额维度", items = null, source = "custom", enabled = true, type = "categorical" } = {}) {
  const dim = {
    id: genQuotaId("quota"),
    name: String(name ?? ""),
    type,
    enabled: !!enabled,
    source: source === "preset" ? "preset" : "custom",
    items: []
  };
  if (Array.isArray(items) && items.length) {
    dim.items = items.map((it) => makeQuotaItem(it.label, it.pct));
  } else {
    // 默认给两个空选项，便于用户直接编辑
    dim.items = [makeQuotaItem("选项 A", 50), makeQuotaItem("选项 B", 50)];
  }
  return dim;
}

// 通过模板 key 实例化一个维度（每次都生成新 id）
export function dimensionFromTemplateKey(templateKey) {
  const tpl = QUOTA_TEMPLATES.find((t) => t.key === templateKey);
  if (!tpl) return makeQuotaDimension({ name: "自定义条件", source: "custom" });
  return makeQuotaDimension({
    name: tpl.name,
    items: tpl.items.map((it) => ({ label: it.label, pct: it.pct })),
    source: tpl.key === "custom" ? "custom" : "preset"
  });
}

// ===== 迁移旧版固定结构 =====
// 旧结构：[{ id: "gender"|"age"|"city", name, items: [{ label, pct }] }]
// 新结构：[{ id: "quota_xxx", name, type, enabled, source, items: [{ id, label, pct }] }]
export function migrateQuotaPlan(oldPlan) {
  if (!Array.isArray(oldPlan)) return [];
  return oldPlan.map((dim) => {
    // 已是新结构（items 含 id）则原样返回（仅补全字段）
    if (dim.id && String(dim.id).startsWith("quota_") && Array.isArray(dim.items) && dim.items.every((it) => it && it.id)) {
      return {
        id: dim.id,
        name: String(dim.name ?? ""),
        type: dim.type || "categorical",
        enabled: dim.enabled !== false,
        source: dim.source === "preset" ? "preset" : "custom",
        items: dim.items.map((it) => ({ id: it.id, label: String(it.label ?? ""), pct: Number(it.pct) || 0 }))
      };
    }
    // 旧结构 → 新结构
    const source = (dim.id === "gender" || dim.id === "age" || dim.id === "city") ? "preset" : "custom";
    return makeQuotaDimension({
      name: dim.name || dim.id || "未命名维度",
      source,
      items: Array.isArray(dim.items) ? dim.items.map((it) => ({ label: it.label, pct: it.pct })) : []
    });
  });
}

// ===== 从人群画像推导默认维度（不再硬覆盖整个 quotaPlan） =====
// 返回三个 preset 维度（性别/年龄/城市层级），用于初次初始化或「仅更新系统默认维度」场景。
export function buildDefaultQuotaPlan(audienceConfig = {}) {
  return [
    parseGenderDimension(audienceConfig.gender),
    parseAgeDimension(audienceConfig.age),
    parseCityDimension(audienceConfig.city)
  ];
}

function parseGenderDimension(text) {
  const dim = makeQuotaDimension({ name: "性别", source: "preset" });
  const items = parsePercentPairs(text);
  if (items.length) {
    dim.items = items.map((it) => makeQuotaItem(it.label, it.pct));
  } else {
    dim.items = [makeQuotaItem("女性", 55), makeQuotaItem("男性", 45)];
  }
  return dim;
}

function parseAgeDimension(text) {
  const dim = makeQuotaDimension({ name: "年龄", source: "preset" });
  const match = String(text || "").match(/(\d+)\s*[-~—]\s*(\d+)/);
  if (match) {
    const min = Number(match[1]);
    const max = Number(match[2]);
    const mid = Math.floor((min + max) / 2);
    dim.items = [
      makeQuotaItem(`${min}-${mid} 岁`, 50),
      makeQuotaItem(`${mid + 1}-${max} 岁`, 50)
    ];
  } else {
    dim.items = [
      makeQuotaItem("25-29 岁", 45),
      makeQuotaItem("30-34 岁", 35),
      makeQuotaItem("35-40 岁", 20)
    ];
  }
  return dim;
}

function parseCityDimension(text) {
  const dim = makeQuotaDimension({ name: "城市层级", source: "preset" });
  const labels = String(text || "").split("/").map((s) => s.trim()).filter(Boolean);
  if (labels.length >= 2) {
    const even = Math.floor(100 / labels.length);
    const items = labels.map((label, i) => makeQuotaItem(label, i === 0 ? even + (100 - even * labels.length) : even));
    dim.items = items;
  } else {
    dim.items = [
      makeQuotaItem("一线城市", 45),
      makeQuotaItem("新一线城市", 40),
      makeQuotaItem("二线城市", 15)
    ];
  }
  return dim;
}

// 解析 "女性 55% / 男性 45%" 形式
function parsePercentPairs(text) {
  const matches = [...String(text || "").matchAll(/([^/\d%]+?)\s*(\d+(?:\.\d+)?)\s*%/g)]
    .map((m) => ({ label: m[1].replace(/[，,、]/g, "").trim(), pct: Number(m[2]) }))
    .filter((it) => it.label && Number.isFinite(it.pct) && it.pct > 0);
  return normalizeTo100(matches.map((it) => ({ ...it, pct: Math.round(it.pct) })));
}

// ===== 百分比分布工具 =====

// 按比例归一化到 100%（最大余数法）
export function normalizeTo100(values) {
  const safeValues = values.map((v) => Math.max(0, Number(v) || 0));
  const total = safeValues.reduce((s, v) => s + v, 0);
  if (!total) return safeValues.map(() => 0);
  const normalized = safeValues.map((v) => Math.floor((v / total) * 100));
  const remainder = 100 - normalized.reduce((s, v) => s + v, 0);
  // 按小数余数从大到小补齐
  const fracs = safeValues
    .map((v, i) => ({ i, frac: (v / total) * 100 - Math.floor((v / total) * 100) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) {
    normalized[fracs[k % fracs.length].i] += 1;
  }
  return normalized;
}

// 平均分配（严格合计 100%）
export function distributeEvenly(count) {
  if (!Number.isFinite(count) || count <= 0) return [];
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  const arr = new Array(count).fill(base);
  // 把余数从首项开始补齐
  for (let i = 0; i < remainder; i++) arr[i] += 1;
  return arr;
}

// 给定 items（含 pct），按比例归一化到 100%（修改 pct 值）
export function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length) return items;
  const pcts = items.map((it) => Number(it.pct) || 0);
  const normalized = normalizeTo100(pcts);
  return items.map((it, i) => ({ ...it, pct: normalized[i] }));
}

// 把当前合计补齐到 100%（差值优先加到最后一个有效选项，或指定 itemId）
export function topUpTo100(items, targetItemId = null) {
  if (!Array.isArray(items) || !items.length) return items;
  const validItems = items.filter((it) => Number.isFinite(Number(it.pct)));
  const total = validItems.reduce((s, it) => s + (Number(it.pct) || 0), 0);
  const diff = 100 - total;
  if (diff === 0) return items;
  let targetIndex;
  if (targetItemId) {
    targetIndex = items.findIndex((it) => it.id === targetItemId);
  }
  if (targetIndex === undefined || targetIndex < 0) {
    targetIndex = items.length - 1;
  }
  return items.map((it, i) => i === targetIndex ? { ...it, pct: Math.max(0, (Number(it.pct) || 0) + diff) } : it);
}

// ===== 人数换算：最大余数法 =====
// 返回 [{ itemId, label, pct, exactCount, count }]，count 之和严格等于 sampleSize。
// 相同余数使用稳定顺序（按原数组顺序优先），保证每次渲染结果一致。
export function allocateQuotaCounts(items, sampleSize) {
  const safeItems = (items || []).filter((it) => it && Number.isFinite(Number(it.pct)));
  if (!safeItems.length || !Number.isFinite(sampleSize) || sampleSize <= 0) {
    return safeItems.map((it) => ({
      itemId: it.id,
      label: it.label,
      pct: Number(it.pct) || 0,
      exactCount: 0,
      count: 0
    }));
  }
  const n = Math.floor(sampleSize);
  const exact = safeItems.map((it) => {
    const pct = Number(it.pct) || 0;
    const e = (pct / 100) * n;
    return { itemId: it.id, label: it.label, pct, exactCount: e, count: Math.floor(e), frac: e - Math.floor(e), originalIndex: safeItems.indexOf(it) };
  });
  const allocated = exact.reduce((s, it) => s + it.count, 0);
  let remainder = n - allocated;
  if (remainder > 0) {
    // 按小数余数从大到小，相同余数按原数组顺序优先
    const sorted = [...exact].sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac;
      return a.originalIndex - b.originalIndex;
    });
    let k = 0;
    while (remainder > 0 && k < sorted.length) {
      sorted[k].count += 1;
      remainder -= 1;
      k++;
    }
    // 极端情况下仍可能未补满（比如所有 frac 都为 0 但 sampleSize 仍多），继续从头补
    let i = 0;
    while (remainder > 0) {
      exact[i % exact.length].count += 1;
      remainder -= 1;
      i++;
    }
  }
  // 最终兜底：如果分配超出（理论上不会），按从尾到头减一
  let over = exact.reduce((s, it) => s + it.count, 0) - n;
  if (over > 0) {
    let i = exact.length - 1;
    while (over > 0 && i >= 0) {
      if (exact[i].count > 0) {
        exact[i].count -= 1;
        over -= 1;
      }
      i--;
    }
  }
  return exact.map((it) => ({ itemId: it.itemId, label: it.label, pct: it.pct, exactCount: it.exactCount, count: it.count }));
}

// ===== 校验 =====
// 返回 { valid, errors, warnings }
// errors 阻止生成，warnings 仅提示。
export function validateQuotaPlan(quotaPlan, sampleSize) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(quotaPlan) || !quotaPlan.length) {
    return {
      valid: false,
      errors: [{ dimensionId: null, itemId: null, type: "no_dimensions", message: "尚未配置任何配额维度，请先新增配额条件。" }],
      warnings
    };
  }

  const enabledDims = quotaPlan.filter((d) => d && d.enabled !== false);
  const dimNameMap = new Map();
  const dimIdMap = new Map();

  quotaPlan.forEach((dim) => {
    if (!dim) return;
    // 维度 ID 唯一性
    if (dimIdMap.has(dim.id)) {
      errors.push({ dimensionId: dim.id, itemId: null, type: "duplicate_dimension_id", message: `存在重复的维度 ID：${dim.id}` });
    } else {
      dimIdMap.set(dim.id, true);
    }
    // 维度名称非空（仅校验启用维度）
    if (dim.enabled !== false) {
      if (!String(dim.name || "").trim()) {
        errors.push({ dimensionId: dim.id, itemId: null, type: "dimension_name_empty", message: "配额维度名称不能为空。" });
      } else {
        const key = String(dim.name).trim();
        if (dimNameMap.has(key)) {
          errors.push({ dimensionId: dim.id, itemId: null, type: "duplicate_dimension_name", message: `存在重复的维度名称：「${key}」。` });
        } else {
          dimNameMap.set(key, true);
        }
      }
    }
  });

  enabledDims.forEach((dim) => {
    const items = Array.isArray(dim.items) ? dim.items : [];
    const validItems = items.filter((it) => it && Number.isFinite(Number(it.pct)) && Number(it.pct) > 0);
    // 启用维度必须有至少一个有效选项
    if (!items.length) {
      errors.push({ dimensionId: dim.id, itemId: null, type: "no_items", message: `维度「${dim.name || "未命名"}」没有配额选项，请至少新增一个。` });
      return;
    }
    // 选项级校验
    const labelMap = new Map();
    const itemIdMap = new Map();
    let allZero = true;
    let hasEmpty = false;
    items.forEach((it) => {
      if (!it) return;
      if (it.id && itemIdMap.has(it.id)) {
        errors.push({ dimensionId: dim.id, itemId: it.id, type: "duplicate_item_id", message: `维度「${dim.name}」存在重复的选项 ID。` });
      } else if (it.id) {
        itemIdMap.set(it.id, true);
      }
      if (!String(it.label || "").trim()) {
        errors.push({ dimensionId: dim.id, itemId: it.id, type: "item_label_empty", message: `维度「${dim.name}」中有配额选项名称为空，请补充名称。` });
        hasEmpty = true;
      } else {
        const key = String(it.label).trim();
        if (labelMap.has(key)) {
          errors.push({ dimensionId: dim.id, itemId: it.id, type: "duplicate_item_label", message: `维度「${dim.name}」中选项名称「${key}」重复。` });
        } else {
          labelMap.set(key, true);
        }
      }
      const pct = Number(it.pct);
      if (!Number.isFinite(pct)) {
        errors.push({ dimensionId: dim.id, itemId: it.id, type: "pct_not_number", message: `维度「${dim.name}」中选项「${it.label || "未命名"}」的百分比不是有效数字。` });
      } else if (pct < 0) {
        errors.push({ dimensionId: dim.id, itemId: it.id, type: "pct_negative", message: `维度「${dim.name}」中选项「${it.label}」的百分比不能为负数。` });
      } else if (pct > 100) {
        errors.push({ dimensionId: dim.id, itemId: it.id, type: "pct_over_100", message: `维度「${dim.name}」中选项「${it.label}」的百分比不能大于 100。` });
      } else {
        if (pct > 0) allZero = false;
        if (pct === 0) {
          warnings.push({ dimensionId: dim.id, itemId: it.id, type: "pct_zero", message: `维度「${dim.name}」中选项「${it.label}」百分比为 0%，将不会分配样本。` });
        }
      }
    });

    if (allZero && !hasEmpty) {
      errors.push({ dimensionId: dim.id, itemId: null, type: "all_zero", message: `维度「${dim.name}」所有选项百分比都为 0%，无法生成。` });
    }

    // 合计校验（仅当存在有效选项时）
    if (validItems.length) {
      const total = items.reduce((s, it) => s + (Number(it.pct) || 0), 0);
      const diff = total - 100;
      if (Math.abs(diff) > 0.01) {
        if (items.length === 1) {
          errors.push({ dimensionId: dim.id, itemId: null, type: "single_item_not_100", message: `维度「${dim.name}」只有一个选项，百分比必须为 100%（当前 ${total}%）。` });
        } else {
          errors.push({
            dimensionId: dim.id,
            itemId: null,
            type: "total_not_100",
            message: `维度「${dim.name}」配额合计为 ${formatPct(total)}%，需要调整为 100%。`
          });
        }
      }
    }

    // 单选项维度必须为 100%
    if (items.length === 1) {
      const pct = Number(items[0].pct) || 0;
      if (Math.abs(pct - 100) > 0.01) {
        errors.push({ dimensionId: dim.id, itemId: items[0].id, type: "single_item_not_100", message: `维度「${dim.name}」只有一个选项，百分比必须为 100%。` });
      }
    }
  });

  // 样本量校验
  if (Number.isFinite(sampleSize)) {
    const n = Math.floor(sampleSize);
    if (n <= 0) {
      errors.push({ dimensionId: null, itemId: null, type: "invalid_sample_size", message: "样本量必须为正整数。" });
    } else {
      // 检查每个启用维度换算后是否出现 0 人选项
      enabledDims.forEach((dim) => {
        const items = Array.isArray(dim.items) ? dim.items : [];
        const allocation = allocateQuotaCounts(items, n);
        const zeroCountItems = allocation.filter((a) => a.pct > 0 && a.count === 0);
        zeroCountItems.forEach((a) => {
          warnings.push({
            dimensionId: dim.id,
            itemId: a.itemId,
            type: "small_quota_zero_count",
            message: `维度「${dim.name}」中选项「${a.label}」占 ${a.pct}%，但样本量 N=${n} 不足以分配 1 人。`
          });
        });
        // 单选项只有 1 人时给出轻度警告
        allocation.filter((a) => a.count === 1).forEach((a) => {
          warnings.push({
            dimensionId: dim.id,
            itemId: a.itemId,
            type: "only_one_person",
            message: `维度「${dim.name}」中选项「${a.label}」只分配到 1 人，统计稳定性较弱。`
          });
        });
      });

      // 配额维度过多 / 选项过多提示
      const totalOptions = enabledDims.reduce((s, d) => s + (Array.isArray(d.items) ? d.items.filter((it) => Number(it.pct) > 0).length : 0), 0);
      if (enabledDims.length > 4 && totalOptions > n) {
        warnings.push({
          dimensionId: null,
          itemId: null,
          type: "too_many_quotas",
          message: `当前样本量 N=${n}，但启用维度有 ${enabledDims.length} 个、共 ${totalOptions} 个非零配额选项，部分交叉组合的实际人数可能很少。建议提高样本量或减少细分条件。`
        });
      } else if (enabledDims.length > 4) {
        warnings.push({
          dimensionId: null,
          itemId: null,
          type: "many_dimensions",
          message: `当前已启用 ${enabledDims.length} 个配额维度，配额维度较多时，部分交叉组合的实际人数可能很少。`
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function formatPct(n) {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

// ===== 摘要构建 =====

// 取启用且有效的维度
export function getEnabledDimensions(quotaPlan) {
  return (quotaPlan || []).filter((d) => d && d.enabled !== false);
}

// 给定维度与样本量，返回 [{ label, pct, count, exactCount }]
export function dimensionAllocation(dimension, sampleSize) {
  const items = Array.isArray(dimension?.items) ? dimension.items : [];
  return allocateQuotaCounts(items, sampleSize);
}

// 构建 AI 提示词中的配额文本
export function buildQuotaPromptText(quotaPlan, sampleSize) {
  const dims = getEnabledDimensions(quotaPlan);
  if (!dims.length) return "（未配置配额）";
  const lines = [];
  dims.forEach((dim, i) => {
    const allocation = dimensionAllocation(dim, sampleSize);
    const itemLines = allocation.map((a) => `- ${a.label}：${a.pct}%，${a.count} 人`);
    lines.push(`维度${i + 1}：${dim.name}\n${itemLines.join("\n")}`);
  });
  return `样本量：N=${sampleSize}\n\n${lines.join("\n\n")}`;
}

// 构建配额摘要（页面顶部展示）
export function buildQuotaSummaryLines(quotaPlan, sampleSize) {
  const dims = getEnabledDimensions(quotaPlan);
  return dims.map((dim) => {
    const allocation = dimensionAllocation(dim, sampleSize);
    const items = allocation.map((a) => `${a.label} ${a.pct}%（${a.count}人）`).join(" / ");
    return { name: dim.name, itemsText: items, itemCount: allocation.length };
  });
}

// 统计信息：维度数 / 选项数
export function quotaStats(quotaPlan) {
  const dims = getEnabledDimensions(quotaPlan);
  const dimCount = dims.length;
  const itemCount = dims.reduce((s, d) => s + (Array.isArray(d.items) ? d.items.length : 0), 0);
  return { dimCount, itemCount };
}
