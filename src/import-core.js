// src/import-core.js
// 问卷导入解析与识别质量分析（纯函数，无 DOM 依赖，浏览器与 Node 测试脚本均可复用）：
//   文本解析：parseQuestionnaireText（Word 文本 / 粘贴文本通用）
//   Word：extractParagraphsFromDocxXml（含表格）/ hasWordTable
//   Excel：extractXlsxRows（按单元格 r 属性定位列，修复空列错位）/ buildQuestionnaireTextFromXlsxRows
//   预览：analyzeQuestionIssues / buildImportSummary / confirmImportQuestions
//
// 原则：
// 1. 识别结果先进入「识别预览」，由用户确认后才写入问卷编辑页；
// 2. 识别不到选项时绝不自动生成「选项1, 选项2」占位（只有用户主动添加才允许）；
// 3. Excel 必须按 <c r="C12"> 的列字母定位，不能按出现顺序存列（空单元格被省略会错位）。

// ===== 通用工具 =====

function splitList(value) {
  return String(value || "")
    // 保护 "其他，请说明" / "其它，请注明" 等作为一个完整选项，不被逗号拆分
    .replace(/(其他|其它)，/g, "$1\x00")
    .split(/[,，、\n\t]/)
    .map((item) => item.trim().replace(/\x00/g, "，"))
    .filter(Boolean);
}

// 把 "其他，请说明" / "其它，请注明" 等作为单一选项保留，不再按逗号切分
export function splitOptions(value) {
  const protectedText = String(value || "").replace(/(其他|其它)，/g, "$1__OTHER_COMMA__");
  return splitList(protectedText).map((item) => item.replace(/__OTHER_COMMA__/g, "，"));
}

export function decodeXmlEntities(text) {
  return String(text)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

// ===== 问卷文本解析（Word 段落文本 / 粘贴文本通用） =====

// 判断一行是否为题干：含明确题型标记，或 字母题号前缀，或 纯数字题号+问号
export function isQuestionHeader(line) {
  if (!line) return false;
  // 题型标记同时兼容 【...】 与 （...），且允许括号内题型词后还有附加说明（如"多选，最多选5项"）
  // 支持：单选/多选/可多选/排序/填空/开放题/量表N分/矩阵N分 等
  const hasTypeMarker =
    /[（(]\s*(单选|多选|可多选|多选题|单选题|横向单选|开放题|问答题|填空|排序|量表\d*分?|矩阵\d*分?)[^）)]*[）)]/.test(line) ||
    /【(单选|多选|排序|量表\d*分?|矩阵\d*分?)】/.test(line);
  // 跳过纯系统逻辑/编程说明行（如 S4T：配额归类逻辑、S6T 用户类型归类）——但含题型标记的真正题目不跳过
  if (!hasTypeMarker && /系统自动|配额归类|用户类型归类|无需被访者|程序员注意/.test(line)) return false;
  // 字母题号前缀：S1. / C2a. / FZS4. / B16a. / A12a：等（题号列强信号，选项行是纯数字前缀不会误匹配）
  const hasLetterCodePrefix =
    /^[A-Za-z]+\d+[A-Za-z]?\d?\s*[.、):：]/.test(line) || /^[A-Za-z]+\d+[A-Za-z]?\d?\s+\S/.test(line);
  const hasDigitPrefix = /^\d+\s*[.、):：]/.test(line);
  const hasQuestionMark = /[？?]/.test(line);
  // 强信号 1：任意位置出现题型标记
  if (hasTypeMarker) return true;
  // 强信号 2：字母题号前缀（Excel 题号列直接表明这是题目，如 B11. 请您为这款产品拟定四个价格：）
  if (hasLetterCodePrefix) return true;
  // 纯数字题号 + 问号
  if (hasDigitPrefix && hasQuestionMark) return true;
  return false;
}

// 分节标题：S 甄别部分 / A 部分：... / D 背景信息 等（不作为题目，也不作为选项）
export function isSectionHeader(line) {
  if (!line) return false;
  if (/部分/.test(line) && !/^\d/.test(line)) return true;
  if (/^[A-Z]\s+[\u4e00-\u9fa5]/.test(line)) return true; // "S 甄别部分" / "D 背景信息"
  if (/^[A-Z][\u4e00-\u9fa5]/.test(line) && !/\d/.test(line)) return true; // "P两轮车使用概况..."
  if (/您好|感谢参与|感谢您的宝贵时间|问卷到此结束|样本量|被访者要求|配额设计|人群维度|用户类型维度|合计/.test(line)) return true;
  return false;
}

// 说明性 / 描述性段落：概念描述、研究说明、时间计划表头等（不作为选项）
export function isInstructionLine(line) {
  if (!line) return false;
  if (/请先阅读|概念描述|我们正在开发|图片如下|【需要|注[:：]|说明[:：]|序号|工作项|产出物|调研计划确定|问卷设计与确认|确定概念描述|问卷编程|问卷投放|数据清洗|报告撰写|系统自动|配额归类|用户类型归类|无需被访者/.test(line)) return true;
  // 编程/逻辑说明行：以【仅...】【若...】开头并要求受访者填写说明（如 "【仅S3选3者回答】请说明品牌：______"）
  if (/^【仅[^】]*】.*?(请说明|请注明|请填写|请具体|请写出)|^（仅[^）]*）.*?(请说明|请注明|请填写|请具体|请写出)/.test(line)) return true;
  // 过长且不含问号、不含题型标记 → 视为说明段落
  if (line.length > 80 && !/[？?]/.test(line) && !/[（(]\s*(单选|多选|可多选|量表|矩阵)/.test(line)) return true;
  return false;
}

// 去掉题号前缀：兼容 S1. / C2a. / S4T： / Q1. / 1. / 1* / 4-1* / 27-2 / FZ_Q4_1 / Q27_2__1__open 等
// 题号后允许接标点或空白（如 "1* 您的性别"、"S1 您的年龄"）
export function stripQuestionNumberPrefix(line) {
  const sep = "(?:\\s*[.、):：]\\s*|\\s+)";
  const patterns = [
    new RegExp(`^[A-Za-z]+\\d+[A-Za-z]?\\d?${sep}`),                   // S1. C2a. S4T： S1<空格>
    new RegExp(`^[A-Za-z]+_?Q?\\d+[A-Za-z0-9_]*\\*?${sep}`),           // FZ_Q4_1. Q27_2__1__open.
    new RegExp(`^Q?\\d+(?:[-_]\\d+)*(?:__\\w+)?\\*?${sep}`),            // Q1. 1. 4-1* 27-2 1*
    /^Q?\d+(?:[-_]\d+)*(?:__\w+)?\*?\s*[.、):：]\s*/,                    // 纯数字 + 标点兜底
    /^\d+\s*[.、):：]\s*/                                                // 纯数字 + 标点兜底2
  ];
  for (const p of patterns) {
    const m = line.match(p);
    if (m) return line.substring(m[0].length).trim();
  }
  return line.trim();
}

// 去掉选项行的 "1. " / "1、" / "1) " 前缀（保留以数字开头的选项文本，如 1,500元、1台；
// Tab 也是表格行中选项编号与内容的常见分隔符，一并处理）
export function stripOptionPrefix(line) {
  return String(line || "").replace(/^\s*\d+\s*[.、):：\t]\s*/, "").trim();
}

// 去掉问卷编程说明 【针对S2=1询问】【仅S5选6者回答】【程序员注意：...】【终止访问】【需要研极提供...】等
// 以及圆括号形式的出示/询问条件（如 （仅S6T=1现有用户出示）（针对S2=1询问））
export function stripProgrammerNotes(text) {
  return String(text || "")
    // 去掉编程说明 【针对S2=1询问】【仅S5选6者回答】【程序员注意：...】【终止访问】【需要研极提供...】等
    .replace(/【[^】]*?(针对|仅|程序员|终止访问|需要|出示|呈现|若选|当选|跳问|逻辑|后台自动|随机)[^】]*?】/g, "")
    .replace(/【[^】]*?(归类|配额|系统自动|无需)[^】]*?】/g, "")
    // 去掉圆括号形式的出示/询问条件（如 （仅S6T=1现有用户出示）（针对S2=1询问））
    .replace(/[（(][^）)]*?(出示|询问|针对S\d|仅S\d)[^）)]*?[）)]/g, "")
    // 注意：保留 【插入A7选项】【插入B16排序第一选项】等内容占位符（属题干内容，非编程说明）
    // 注意：折叠空白时保留 Tab（表格单元格分隔符），否则 Tab 分隔的选项会被误合并
    .replace(/[^\S\t]+/g, " ")
    .trim();
}

// 从题干/标记中提取新题型的 config（排序模式、数值范围、定和总分等）
export function extractQuestionConfig(text, type) {
  const rest = String(text || "");
  const config = {};
  if (type === "rank") {
    // 排前N/前3项/最重要的N项/Top N → top_n；否则全排序
    const topMatch = rest.match(/(?:前|出|重要的|最重要|选择|选出)\s*(\d+)\s*项|top\s*-?\s*(\d+)/i);
    const topN = topMatch ? Number(topMatch[1] || topMatch[2]) : 0;
    if (topN > 0) {
      config.rankMode = "top_n";
      config.topN = Math.max(1, Math.min(20, topN));
    } else {
      config.rankMode = "full";
    }
    config.allowTies = false;
  } else if (type === "numeric") {
    if (/(金额|价格|多少钱|元)/.test(rest)) config.numericType = "currency";
    else if (/百分比|占比/.test(rest)) config.numericType = "percentage";
    else if (/次数|多少次|数量/.test(rest)) config.numericType = "count";
    else config.numericType = "integer";
    const range = rest.match(/(\d+)\s*[-~—～]\s*(\d+)/);
    if (range) { config.min = Number(range[1]); config.max = Number(range[2]); }
    const unit = rest.match(/([\u4e00-\u9fa5A-Za-z]+?)\s*$/);
    if (/(元|万元|次|个|人|小时|分钟|公里|kg|KG).*$/.test(rest)) {
      const m = rest.match(/(元|万元|次|个|人|小时|分钟|公里|kg|KG)/);
      config.unit = m ? m[1] : "";
    } else {
      config.unit = "";
    }
    config.decimalPlaces = /小数/.test(rest) ? 2 : 0;
  } else if (type === "allocation") {
    const totalMatch = rest.match(/(\d+)\s*分\s*(?:分配|定和)|总分[：:]?\s*(\d+)/);
    config.totalPoints = totalMatch ? Number(totalMatch[1] || totalMatch[2]) || 100 : 100;
    config.minPerOption = 0;
    config.maxPerOption = config.totalPoints;
  } else if (type === "nps") {
    config.min = 0;
    config.max = 10;
    config.detractorRange = [0, 6];
    config.passiveRange = [7, 8];
    config.promoterRange = [9, 10];
  } else if (type === "open") {
    config.openMode = /简答|短/.test(rest) ? "short_text" : "long_text";
    config.maxLength = 500;
  }
  return config;
}

// 规整选项文本：保护 "其他，请说明" / 去掉数字千分位逗号 / 其余逗号转空格 / 去掉填空下划线
// 目的是避免后续 splitList 按 [,，、] 切分时把含逗号的选项拆开
export function sanitizeOptionText(text) {
  return String(text || "")
    .replace(/(其他|其它)，/g, "$1\x00") // 临时保护 "其他，"
    .replace(/(\d),(\d{3})/g, "$1$2")      // 1,500 → 1500
    .replace(/[，、]/g, " ")                 // 中文逗号/顿号 → 空格
    .replace(/,/g, " ")                      // 其余 ASCII 逗号 → 空格
    .replace(/\x00/g, "，")                  // 恢复 "其他，"
    .replace(/[：:]\s*_{2,}\s*[^，,）)\n]*/g, "") // ：______ / ：____岁 → ""
    .replace(/_{2,}/g, "")                        // 独立 ____ → ""
    .replace(/\s+/g, " ")
    .trim();
}

// 把各种题型写法映射为 single/multiple/scale/matrix/open/rank/numeric/nps/allocation
// v52：排序题（rank）不再映射为 multiple —— 保留排序语义（平均排名/名次分布）
export function normalizeQuestionType(label, num) {
  const l = String(label || "").trim();
  if (/矩阵|横向|matrix/i.test(l)) {
    return { type: "matrix", scale: num ? `1-${num}` : "1-5" };
  }
  if (/NPS|净推荐/i.test(l)) return { type: "nps" };
  // 0-10 分 + 推荐语义 → NPS（"推荐度0-10分" / "0-10分推荐" 等）
  if (/推荐/i.test(l) && /0\s*[-~—～]\s*10/.test(l)) return { type: "nps" };
  if (/排序|排名|rank|ranking/i.test(l)) return { type: "rank" };
  if (/定和|100\s*分.*分配|总分分配|constant\s*sum|allocation/i.test(l)) return { type: "allocation" };
  if (/(数值|数字填空|金额|次数|数量|百分比|numeric)/i.test(l) && /(填空|题|numeric)/i.test(l)) return { type: "numeric" };
  if (/(数值题|数字填空|金额题|numeric)/i.test(l)) return { type: "numeric" };
  if (/量表|scale|打分|评分/i.test(l)) {
    // 0-10 分 + 推荐语义 → NPS（在 parseQuestionGroup/Line 中结合题干进一步确认）
    if (/推荐/i.test(l) && Number(num) >= 9) return { type: "nps" };
    return { type: "scale", scale: num ? `1-${num}` : "1-5" };
  }
  if (/多选|multiple|checkbox/i.test(l)) return { type: "multiple" };
  if (/单选|single/i.test(l)) return { type: "single" };
  if (/开放|问答|填空|open/i.test(l)) return { type: "open" };
  if (/推荐度|推荐意愿/i.test(l) && Number(num) >= 9) return { type: "nps" };
  return { type: "single" };
}

// 矩阵题选项行解析：识别 "选项：1.必须要有 2.最好要有..." 为刻度，"功能列表：" 之后为行维度
export function parseMatrixOptionLines(optionLines) {
  let scaleOpts = "";
  const rowList = [];
  let inRows = false;
  for (const line of optionLines) {
    const cleaned = stripProgrammerNotes(stripOptionPrefix(line));
    if (!cleaned) continue;
    // "选项：1.xxx 2.xxx ..." → 刻度
    if (/^选项\s*[：:]/.test(cleaned) || /^选项[:：]/.test(cleaned)) {
      const points = cleaned
        .replace(/^选项\s*[：:]\s*/, "")
        .split(/\s*(?=\d+[.、)])/)
        .map((s) => stripOptionPrefix(s).trim())
        .filter(Boolean);
      if (points.length) scaleOpts = points.map(sanitizeOptionText).join(", ");
      continue;
    }
    // "功能列表：" / "维度：" 标记 → 之后的行均为矩阵行
    if (/功能列表|维度列表|评价维度|功能维度/.test(cleaned)) {
      inRows = true;
      continue;
    }
    rowList.push(sanitizeOptionText(cleaned));
    inRows = true;
  }
  return { scaleOpts, rowList };
}

// 解析一个题干 + 若干选项行，返回 { code, text, type, options, scale, rows, rawLines, hadTypeMarker, scaleExplicit }
export function parseQuestionGroup(header, optionLines) {
  const codeMatch = header.match(/^[A-Za-z]+\d+[A-Za-z]?\d?|^[A-Za-z]+_?Q?\d+[A-Za-z0-9_]*|^Q?\d+(?:[-_]\d+)*/);
  const code = codeMatch ? codeMatch[0] : "";

  const rest = stripQuestionNumberPrefix(header);
  if (!rest) return null;

  // 优先匹配 【...】 标记（旧格式），再匹配 （...） 标记（Word 文档常见格式）
  // 支持题型：单选/多选/可多选/排序/填空/开放题/量表N分/矩阵N分/NPS/数值题/定和分配 等
  const bracket = rest.match(/【(单选|多选|排序|NPS|净推荐|量表(\d*)分?|矩阵(\d*)分?)】/);
  const paren = rest.match(/[（(]\s*(单选|多选|可多选|多选题|单选题|横向单选|开放题|问答题|填空|排序|排序题|排名|NPS|净推荐|推荐度|数值题|数字填空|定和分配|定和题|100\s*分分配|总分分配|量表(\d*)分?|矩阵(\d*)分?)[^）)]*[）)]/);

  let type = "single";
  let scale = "1-5";
  let questionText = rest;
  let afterMarker = "";
  let scaleExplicit = false;

  const marker = bracket || paren;
  if (marker) {
    const markerText = marker[0];
    const label = marker[1];
    const num = marker[2] || marker[3];
    const mapped = normalizeQuestionType(markerText, num);
    type = mapped.type;
    if (mapped.scale) scale = mapped.scale;
    if (num) scaleExplicit = true;
    const idx = rest.indexOf(markerText);
    questionText = rest.substring(0, idx);
    afterMarker = rest.substring(idx + markerText.length);
  }

  // 兜底：题干含 "0-10分打分/评分" 等 → 识别为量表题（即使已识别为单选也覆盖）
  // （Excel 中常见 B1/B5/B6/B7 "请用0-10分打分..." 这类评分题，标记是（单选）但本质是量表）
  // 用 1-10 量表（与 UI/mock 生成器的 1-10 分支对齐）
  if (type === "single" && /0-\s*10\s*分.*(?:打分|评分)|(?:打分|评分).*0-\s*10\s*分/.test(rest)) {
    type = "scale";
    scale = "1-10";
    scaleExplicit = true;
  }

  // 清理题干与标记后残留中的编程说明 【针对...】【仅...】【程序员注意：...】【终止访问】等
  // （如 S3 "（单选）【程序员注意：针对S2...】" 中标记后的整段【...】说明不应被当作选项）
  questionText = stripProgrammerNotes(questionText).replace(/\s+/g, " ").trim();
  if (!questionText) return null;
  afterMarker = stripProgrammerNotes(afterMarker);

  let options = "";
  let rows = "";

  // 单行格式：标记后还残留带分隔符的选项文本（如 Q1. ...【单选】A / B / C，Tab 分隔也可）
  const inlineHasOptions = afterMarker && /[\/,，、|\t]/.test(afterMarker);

  if (type === "matrix") {
    if (inlineHasOptions) {
      rows = splitOptions(afterMarker.replace(/\s*[/／]\s*/g, ", ")).join(", ");
    } else {
      const { scaleOpts, rowList } = parseMatrixOptionLines(optionLines);
      if (scaleOpts) options = scaleOpts;
      rows = rowList.join(", ");
    }
    if (!options) {
      options = scale === "1-10" ? "1, 2, 3, 4, 5, 6, 7, 8, 9, 10" : scale === "1-7" ? "1, 2, 3, 4, 5, 6, 7" : "1, 2, 3, 4, 5";
    }
  } else if (type === "scale") {
    options = "";
  } else {
    // single / multiple / open
    if (inlineHasOptions) {
      options = splitOptions(afterMarker.replace(/\s*[/／]\s*/g, ", ")).join(", ");
    } else if (afterMarker && /^\s*\d+[.、)）]/.test(afterMarker)) {
      // 内联编号选项："1. 男 2. 女"（无分隔符，按编号切分）
      const numbered = afterMarker.split(/\s*(?=\d+[.、)）]\s*)/)
        .map(stripOptionPrefix).map(sanitizeOptionText).filter(Boolean);
      if (numbered.length >= 2) options = numbered.join(", ");
    } else {
      options = optionLines
        .flatMap((t) => {
          // v54：单行内多个编号选项（"1. 男 2. 女 3. 其他，请注明"）→ 按编号切分
          // lookbehind 防止把 "10. 渠道10" 在数字中间切开
          const cleaned = stripProgrammerNotes(t);
          if (/^\s*\d+[.、)）]/.test(cleaned)) {
            const numbered = cleaned.split(/(?<!\d)(?=\d+[.、)）]\s*)/)
              .map(stripOptionPrefix)
              .map(sanitizeOptionText)
              .filter(Boolean);
            if (numbered.length >= 2) return numbered;
          }
          return [cleaned];
        })
        .map((t) => stripProgrammerNotes(t))
        .map(sanitizeOptionText)
        .filter((t) => t && !/^[（(].*[）)]$/.test(t)) // 过滤掉仅剩括号说明的行
        .filter(Boolean)
        .join(", ");
    }
  }

  // rawLines 用于预览页「查看原文」对照与识别异常分析
  // v52：NPS 兜底——题干含 0-10 + 推荐语义才识别为 NPS，普通 0-10 满意度（打分/评分）不误判
  if (/(0\s*[-~—～]\s*10)|(0\s*代表[\s\S]{0,40}10\s*代表)/.test(questionText) && /推荐/.test(questionText)) {
    type = "nps";
    scaleExplicit = true;
  }
  const config = extractQuestionConfig(questionText + " " + afterMarker, type);
  return { code, text: questionText, type, options, scale, rows, config, rawLines: [header, ...optionLines], hadTypeMarker: !!marker, scaleExplicit };
}

// 子题共享选项：若某题无选项，则尝试从同块题目的其他题继承
// 向前（原逻辑）：优先级 1a 同前缀后续题（如 C5a←C5b←C5c←C5d 共用价格选项，选项在靠后的子题上）；
//                优先级 2a 紧邻下一题（如 B9←B10 "最喜欢/其次喜欢" 共用颜色选项，选项在下一题上）。
// 向后（增强）：优先级 1b 同前缀前序题（选项列在首个子题上，后续子题留空，问卷中最常见）；
//                优先级 2b 紧邻上一题（同分节字母、同题型）。
// 仅对 single/multiple 生效；scale/matrix/open 不继承。
// 所有继承都标记 q.inherited = true，由识别预览页提示用户确认。
export function inheritSharedOptions(questions) {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q.options) continue;
    if (q.type !== "single" && q.type !== "multiple") continue; // scale/matrix/open 不继承

    const myPrefix = (q.code || "").match(/^[A-Za-z]+\d+/);
    const mySec = (q.code || "").match(/^[A-Za-z]+/);

    // 1a. 同前缀后续题
    if (myPrefix) {
      for (let j = i + 1; j < questions.length; j++) {
        const nq = questions[j];
        const nextPrefix = (nq.code || "").match(/^[A-Za-z]+\d+/);
        if (!nextPrefix || nextPrefix[0] !== myPrefix[0]) break;
        if (nq.options) {
          q.options = nq.options;
          if (nq.type === "single" || nq.type === "multiple") q.type = nq.type;
          q.inherited = true;
          break;
        }
      }
      if (q.options) continue;
    }

    // 1b. 同前缀前序题（选项列在首个子题上，后续子题留空）
    if (myPrefix) {
      for (let j = i - 1; j >= 0; j--) {
        const pq = questions[j];
        const prevPrefix = (pq.code || "").match(/^[A-Za-z]+\d+/);
        if (!prevPrefix || prevPrefix[0] !== myPrefix[0]) break;
        if (pq.options) {
          q.options = pq.options;
          if (pq.type === "single" || pq.type === "multiple") q.type = pq.type;
          q.inherited = true;
          break;
        }
      }
      if (q.options) continue;
    }

    // 2a. 紧邻下一题（前缀不同但同分节字母、同题型，且下一题有选项）
    // 例：B9/B10 "最喜欢/其次喜欢" 共用颜色选项（同为 B 段、同为单选）
    // 防止误继承：T5(城市)←FZT5(城市级别) 会被分节字母不同(T≠F)挡住；
    //             A6(多选)←A7(单选) 会被题型不同挡住
    const next = questions[i + 1];
    const nextSec = next && (next.code || "").match(/^[A-Za-z]+/);
    if (
      next && next.options &&
      next.type === q.type &&
      mySec && nextSec && mySec[0] === nextSec[0]
    ) {
      q.options = next.options;
      q.inherited = true;
      continue;
    }

    // 2b. 紧邻上一题（同分节字母、同题型，且上一题有选项）
    const prev = questions[i - 1];
    const prevSec = prev && (prev.code || "").match(/^[A-Za-z]+/);
    if (
      prev && prev.options &&
      prev.type === q.type &&
      mySec && prevSec && mySec[0] === prevSec[0]
    ) {
      q.options = prev.options;
      q.inherited = true;
    }
  }
}

// 单行格式兜底解析（整道题在一行内：题号 + 题干 + 标记 + 选项）
export function parseQuestionLine(line) {
  const rest = stripQuestionNumberPrefix(line);
  if (!rest) return null;

  let type = "single";
  let scale = "1-5";
  let options = "";
  let rows = "";
  let questionText = rest;
  let matchedMarker = null;
  let scaleExplicit = false;

  // 同时识别 【...】 与 （...） 题型标记，括号内题型词后允许附加说明（如"多选，最多选5项"）
  const allMarkers = [
    { re: /[（(]\s*(单选)[^）)]*[）)]/, t: "single" },
    { re: /[（(]\s*(多选|可多选|多选题)[^）)]*[）)]/, t: "multiple" },
    { re: /[（(]\s*(开放题|问答题|填空)[^）)]*[）)]/, t: "open" },
    { re: /[（(]\s*横向单选[^）)]*[）)]/, t: "matrix" },
    { re: /[（(]\s*(排序|排序题|排名)[^）)]*[）)]/, t: "rank" },
    { re: /[（(]\s*(NPS|净推荐|推荐度)[^）)]*[）)]/, t: "nps" },
    { re: /[（(]\s*(数值题|数字填空|金额题)[^）)]*[）)]/, t: "numeric" },
    { re: /[（(]\s*(定和分配|100\s*分分配|50\s*分分配|总分分配|定和题)[^）)]*[）)]/, t: "allocation" },
    { re: /【(单选)】/, t: "single" },
    { re: /【(多选)】/, t: "multiple" },
    { re: /【(排序)】/, t: "rank" },
    { re: /【(NPS|净推荐)】/, t: "nps" },
    { re: /【量表(?:(\d+)分)?】/, t: "scale" },
    { re: /【矩阵(?:(\d+)分)?】/, t: "matrix" },
    { re: /[（(]\s*量表(?:(\d*)分?)?[^）)]*[）)]/, t: "scale" },
    { re: /[（(]\s*矩阵(?:(\d*)分?)?[^）)]*[）)]/, t: "matrix" }
  ];
  let scaleNum = null;
  for (const p of allMarkers) {
    const m = rest.match(p.re);
    if (m) {
      type = p.t;
      matchedMarker = m[0];
      if (m[1] && (p.t === "scale" || p.t === "matrix")) scaleNum = m[1];
      break;
    }
  }
  if (scaleNum) { scale = `1-${scaleNum}`; scaleExplicit = true; }

  if (matchedMarker) {
    const markerIdx = rest.indexOf(matchedMarker);
    questionText = rest.substring(0, markerIdx).trim();
    const after = rest.substring(markerIdx + matchedMarker.length).trim();
    const normalized = after.replace(/\s*[/／]\s*/g, ", ");
    if (type === "matrix") {
      rows = splitOptions(normalized).join(", ");
      options = scale === "1-10" ? "1, 2, 3, 4, 5, 6, 7, 8, 9, 10" : "1, 2, 3, 4, 5";
    } else if (type === "single" || type === "multiple") {
      // 支持 "1. 男 2. 女" 内联编号选项 与 "A / B" 分隔选项
      const numbered = normalized.split(/\s*(?=\d+[.、)）]\s*)/)
        .map(stripOptionPrefix).map(sanitizeOptionText).filter(Boolean);
      options = (numbered.length >= 2 ? numbered : splitOptions(normalized)).map(sanitizeOptionText).join(", ");
    }
  } else {
    // 无题型标记：尝试从问号后的选项列表推断单选题
    const m = rest.match(/^(.+?[？?])\s*[:：]?\s*(.+)$/);
    if (m && /[\/,，、|\t]/.test(m[2]) && m[2].length < 120) {
      questionText = m[1].trim();
      options = splitOptions(m[2].replace(/\s*[/／]\s*/g, ", ")).join(", ");
      type = "single";
    } else {
      questionText = rest;
      type = "single";
    }
  }

  questionText = stripProgrammerNotes(questionText);
  if (!questionText) return null;
  // v52：NPS 兜底——题干含 0-10 + 推荐语义才识别为 NPS，普通 0-10 满意度不误判
  if (type !== "nps" && /(0\s*[-~—～]\s*10)|(0\s*代表[\s\S]{0,40}10\s*代表)/.test(rest) && /推荐/.test(rest)) type = "nps";
  const config = extractQuestionConfig(rest, type);
  return { code: "", text: questionText, type, options, scale, rows, config, rawLines: [line], hadTypeMarker: !!matchedMarker, scaleExplicit };
}

// 文本问卷解析主入口：返回带原始行与识别元数据的题目数组
// 注意：开放题（open）保留原类型，由预览确认流程决定保留/跳过，不在此处静默映射为 single
export function parseQuestionnaireText(text) {
  const lines = String(text || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  // 多行分组：题干行 + 其后若干选项行，直到遇到下一道题干或分节/说明行
  const groups = [];
  let current = null;
  for (const line of lines) {
    if (isQuestionHeader(line)) {
      if (current) groups.push(current);
      current = { header: line, optionLines: [] };
    } else if (isSectionHeader(line) || isInstructionLine(line)) {
      // 分节标题 / 说明性段落：结束当前题目分组，后续行不再归入该题
      if (current) { groups.push(current); current = null; }
    } else if (current) {
      current.optionLines.push(line);
    }
    // 第一个题干之前的所有行（前言、配额、问候等）因 current 仍为 null 被自动跳过
  }
  if (current) groups.push(current);

  const questions = groups
    .map((g) => parseQuestionGroup(g.header, g.optionLines))
    .filter(Boolean);

  // 子题共享选项补全（如价格测试 C5a/C5b/C5c/C5d 共用同一组价格选项；
  // 以及 B9/B10 "最喜欢/其次喜欢" 共用同一组颜色选项但题号前缀不同的情况）
  inheritSharedOptions(questions);

  return questions;
}

// ===== Word 解析 =====

// 从 docx 的 word/document.xml 提取文本：段落按行，表格按「单元格 Tab 分隔」成行
// 兼容：表格中的问卷 / 题干与选项同一段 / 自动编号列表（编号丢失但题干保留）/ Tab 分隔选项 / 换行分隔选项
export function extractParagraphsFromDocxXml(xml) {
  const blocks = [];
  // 按文档顺序同时匹配 表格块 与 段落块
  const blockRegex = /<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>|<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let m;
  while ((m = blockRegex.exec(xml)) !== null) {
    if (m[1] !== undefined) {
      // 表格：每行 <w:tr> 为一组单元格，单元格内文本用 Tab 分隔（选项列之间）
      const trRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
      let trm;
      while ((trm = trRegex.exec(m[1])) !== null) {
        const cells = [];
        const tcRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
        let tcm;
        while ((tcm = tcRegex.exec(trm[1])) !== null) {
          cells.push(extractParagraphsFromDocxXml(tcm[1]).replace(/\n/g, " ").trim());
        }
        const line = cells.filter(Boolean).join("\t").trim();
        if (line) blocks.push(line);
      }
    } else if (m[2] !== undefined) {
      const text = extractDocxParagraphText(m[2]);
      if (text) blocks.push(text);
    }
  }
  return blocks.join("\n");
}

// 单个 <w:p> 段落文本：拼接 <w:t>、<w:tab/>（→Tab）、<w:br/>（→换行）
function extractDocxParagraphText(inner) {
  let text = "";
  const nodeRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
  let nm;
  while ((nm = nodeRegex.exec(inner)) !== null) {
    // 注意：<w:tab 也以 <w:t 开头，必须先判断 tab/br
    if (nm[0].startsWith("<w:tab")) {
      text += "\t";
    } else if (nm[0].startsWith("<w:br")) {
      text += "\n";
    } else {
      text += decodeXmlEntities(nm[1]);
    }
  }
  return text.trim();
}

// 检测 Word 文档是否包含表格（表格布局部分内容可能无法完整识别）
export function hasWordTable(xml) {
  return /<w:tbl\b/i.test(String(xml || ""));
}

// ===== Excel 解析 =====

// 解析 sharedStrings.xml：每个 <si> 是一个字符串项，可能包含多个 <r><t> 富文本
export function parseSharedStringsXml(xml) {
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

// 列字母 → 列索引：A→0, B→1, ..., Z→25, AA→26
export function colLetterToIndex(letters) {
  let idx = 0;
  for (const ch of String(letters || "").toUpperCase()) {
    idx = idx * 26 + (ch.charCodeAt(0) - 64);
  }
  return idx - 1;
}

// 解析 sheet XML，返回二维数组 rows[rowIndex][colIndex]
// 关键修复：必须读取 <c r="C12"> 的 r 属性按列字母定位真实列索引。
// Excel XML 中空单元格会被省略，若按出现顺序存储，遇到空列（如 B 列整列空白被省略）
// 后续单元格会整体左移，导致 题号/题干/题型/选项 各列错位。
export function extractXlsxRows(sheetXml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRegex.exec(sheetXml)) !== null) {
    const inner = rm[1];
    const rowRef = rm[0].match(/\br="(\d+)"/);
    const rowIndex = rowRef ? Number(rowRef[1]) - 1 : rows.length; // r="12" → 第12行（1-based）
    const cells = [];
    // cell：<c r="A1" t="s"><v>0</v></c> 或 <c r="A1" t="inlineStr"><is><t>...</t></is></c>
    // 也可能是自闭合：<c r="A1"/>（空单元格）
    // 注意：属性顺序不固定（r 和 t 可能互换），用 [^>]* 匹配整个开始标签后单独提取
    const cellRegex = /<c\b([^>]*?)>([\s\S]*?)<\/c>|<c\b([^>]*?)\/>/g;
    let cm;
    while ((cm = cellRegex.exec(inner)) !== null) {
      const attrs = cm[1] || cm[3] || "";
      const content = cm[2] || "";
      // r 属性（如 "C12"）→ 真实列索引；缺失时回退到当前出现位置
      const refMatch = attrs.match(/\br="([A-Za-z]+)\d+"/);
      const col = refMatch ? colLetterToIndex(refMatch[1]) : cells.length;
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
      cells[col] = value;
    }
    if (cells.some((c) => String(c || "").trim())) {
      rows[rowIndex] = cells;
    }
  }
  // 稀疏行数组 → 压缩（保留每行的列位置）
  return rows.filter((r) => r !== undefined);
}

// 表头识别：题号列 / 题干列 / 题型列 / 选项列
// 注意：题干列正则不能匹配「题目编号」（含"题目"但不含"题干/题目内容"）；选项列不能匹配「题干及选项」
function findXlsxHeaderCols(cells) {
  const labels = cells.map((c) => String(c || "").trim());
  const idCol = labels.findIndex((c) => /题号|题目编号|问题编号|编号|question\s*id|qid/i.test(c));
  const textCol = labels.findIndex((c) => /题干及选项|题干|题目内容|问题内容|question/i.test(c));
  const typeCol = labels.findIndex((c) => /题型|类型|type/i.test(c) && idCol !== -1 && labels.indexOf(c) !== idCol);
  const optCol = labels.findIndex((c) => (/选项|options/i.test(c) && !/题干/.test(c)) && c !== (labels[idCol] || "") && c !== (labels[textCol] || "") && c !== (labels[typeCol] || ""));
  return { idCol, textCol, typeCol, optCol };
}

// 智能拼接：识别 "题号 + 题干及选项(+题型+选项)" 表头，按行结构输出 parseQuestionnaireText 友好的文本
// 规则：字母题号（S1/A1/B1/FZS4...）→ 题干行（题型列内容会转成（单选）等标记拼入）；
//       纯数字题号（1/2/97/99）+ 题干非空 → 选项行；纯数字 ≥100 或题干为空 → 编程参考号，跳过；
//       题号为空但有文字 → 段落说明，跳过
export function buildQuestionnaireTextFromXlsxRows(rows) {
  if (!rows || !rows.length) return "";

  // 1. 在前 6 行中查找表头
  let headerIdx = -1;
  let cols = { idCol: -1, textCol: -1, typeCol: -1, optCol: -1 };
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const found = findXlsxHeaderCols(rows[i]);
    if (found.idCol >= 0 && found.textCol >= 0 && found.idCol !== found.textCol) {
      headerIdx = i; cols = found; break;
    }
  }

  // 1b. 表头没有题型列时，从数据行探测：某列（非题号/题干列）多次出现 单选/多选/量表/矩阵 等值
  //     处理「B 列整列空白被 Excel 省略、题型列只有数据行才有内容」的错位场景
  if (headerIdx >= 0 && cols.typeCol < 0) {
    const candidates = new Map();
    for (let i = headerIdx + 1; i < Math.min(rows.length, headerIdx + 8); i++) {
      (rows[i] || []).forEach((cell, ci) => {
        if (ci === cols.idCol || ci === cols.textCol) return;
        const normalized = normalizeXlsxType(cell);
        if (normalized && /单选|多选|量表|矩阵/.test(normalized)) {
          candidates.set(ci, (candidates.get(ci) || 0) + 1);
        }
      });
    }
    let best = -1, bestCount = 0;
    candidates.forEach((count, ci) => { if (count > bestCount) { best = ci; bestCount = count; } });
    if (bestCount >= 1) cols.typeCol = best;
  }

  // 2. 无问卷表头：回退到逐行拼接（兼容简单的"题号 + 题目"两列结构）
  if (headerIdx < 0) {
    return rows
      .map((r) => r.filter((c) => String(c || "").trim()).join(" "))
      .filter((line) => line.trim())
      .join("\n");
  }

  // 3. 按列结构拼接
  const lines = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const id = String(row[cols.idCol] || "").trim();
    let text = String(row[cols.textCol] || "").trim();
    if (!id && !text) continue; // 空行

    if (/^[A-Za-z]/.test(id)) {
      // 题干行：字母题号（S1 / A12a / FZS4 / B16a 等）
      let line = `${id}. ${text}`;
      // 题型列：把 "单选/多选/量表10分/矩阵5分" 等转成（单选）标记拼入，供文本解析器识别
      let typeMarker = "";
      if (cols.typeCol >= 0) {
        const typeRaw = String(row[cols.typeCol] || "").trim();
        if (typeRaw) {
          const normalized = normalizeXlsxType(typeRaw);
          if (normalized && !line.includes("(" + normalized) && !line.includes("（" + normalized)) {
            typeMarker = `（${normalized}）`;
          }
        }
      }
      line = `${line}${typeMarker}`;
      // 选项列：题干列与选项列并存时合并（避免重复）
      if (cols.optCol >= 0) {
        const optText = String(row[cols.optCol] || "").trim();
        if (optText && !text.includes(optText.slice(0, 10))) {
          const optItems = splitOptions(optText);
          if (optItems.length > 1) {
            // 选项单独成列：题干行不带选项，选项以编号行输出，供文本解析器按选项行识别
            lines.push(line);
            optItems.forEach((o, oi) => lines.push(`${oi + 1}. ${o}`));
            continue;
          }
          line = `${line} ${optText}`;
        }
      }
      lines.push(line);
    } else if (/^\d+$/.test(id)) {
      const num = Number(id);
      // 编程参考号（142/199/263/369/434-459 等大数字）→ 跳过
      if (num >= 100) continue;
      // 题干为空的纯数字行（孤立编程号）→ 跳过
      if (!text) continue;
      // 选项行：1/2/.../97/99
      lines.push(`${id}. ${text}`);
    } else {
      // 题号为其它文字或空、但有正文 → 段落说明/分节介绍，跳过（避免污染上一题选项）
      continue;
    }
  }
  return lines.join("\n");
}

// 把 Excel 中常见的题型写法标准化为 parseQuestionLine 能识别的标记
export function normalizeXlsxType(typeStr) {
  const s = String(typeStr || "").trim();
  const t = s.toLowerCase().replace(/\s+/g, "");
  const numMatch = t.match(/(\d+)/);
  const num = numMatch ? numMatch[1] : null;

  // 1. 矩阵：识别 "矩阵5分" / "矩阵题 5分" / "matrix 5" 等，带分值时输出 "矩阵N分"
  if (/矩阵|matrix/.test(t)) {
    return num ? `矩阵${num}分` : "矩阵";
  }
  // 2. NPS / 推荐度 → 需要结合题干判断，标记词带 NPS/净推荐 直接输出；否则回落量表
  if (/nps|净推荐/.test(t)) return "NPS";
  // 3. 排序题：排序/排名/ranking → 排序（不再映射为多选）
  if (/排序|排名|rank|ranking/.test(t)) return "排序";
  // 4. 定和分配
  if (/定和|constant\s*sum|allocation|100\s*分.*分配/.test(t)) return "定和分配";
  // 5. 数值题
  if (/数值题|数字填空|金额题|numeric/.test(t)) return "数值题";
  // 6. 量表：识别 "量表10分" / "10分量表" / "scale 7" / "7分打分" 等
  if (/量表|scale|打分|评分/.test(t)) {
    return num ? `量表${num}分` : "量表";
  }
  // 7. 纯题型（无分值）
  if (/单选|single/.test(t)) return "单选";
  if (/多选|multiple|checkbox/.test(t)) return "多选";

  // 8. 直接传入已标准化格式
  if (/^(单选|多选|量表\d*分?|矩阵\d*分?|排序|NPS|净推荐|数值题|定和分配)$/.test(s)) return s;

  // 9. 无法识别时保留原文（让 parseQuestionLine 兜底）
  return s || null;
}

// ===== 识别质量分析（预览页） =====

function truncate(text, max) {
  const t = String(text || "").replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// 逐题识别质量分析：返回 { ...q, status, blocking, issues }
// status: "complete"（识别完整）| "needs-confirm"（需要确认，轻度）| "failed"（识别失败，阻塞确认）
// blocking: 严重问题数组（确认前必须处理）
export function analyzeQuestionIssues(questions) {
  const seenCodes = new Map();
  const prevNumBySection = {};
  let prevOptions = "";
  return questions.map((q, i) => {
    const blocking = [];
    const issues = [];

    // 题干为空
    if (!q.text || !q.text.trim()) {
      blocking.push({ type: "empty_text", message: "题干为空，无法识别为题。" });
    }

    // 单选 / 多选
    if (q.type === "single" || q.type === "multiple") {
      const opts = splitOptions(q.options);
      if (opts.length === 0) {
        blocking.push({ type: "no_options", message: "未识别到选项，请确认原问卷格式。" });
      } else if (opts.length === 1) {
        blocking.push({ type: "single_option", message: `仅识别到 1 个选项（「${truncate(opts[0], 20)}」），单选/多选至少需要 2 个选项。` });
      } else if (opts.length > 12) {
        issues.push({ type: "too_many_options", message: `选项数量异常多（${opts.length} 个），请检查是否误把下一题内容识别成选项。` });
      }
      if (q.sharedAccepted) {
        // 用户已主动接受共享选项，不再重复警告
      } else if (q.inherited) {
        issues.push({ type: "inherited_options", message: "选项为共享选项（自动继承自下一题），请确认是否正确。" });
      } else if (prevOptions && prevOptions === q.options && opts.length > 1) {
        issues.push({ type: "identical_options", message: "与上一题识别出完全相同的选项，请确认是否为共享选项或误识别。" });
      }
      // 选项行中的疑似异常：含问号的短行（可能是丢了题号的下一题题干）
      const optLines = (q.rawLines || []).slice(1);
      optLines.forEach((line, li) => {
        if (isQuestionHeader(line) || (/[？?]/.test(line) && line.length < 60)) {
          issues.push({ type: "next_question_as_option", message: `疑似把下一题题干识别成选项：第 ${li + 1} 行「${truncate(line, 26)}」。` });
        } else if (isInstructionLine(line)) {
          issues.push({ type: "instruction_as_option", message: `疑似把说明文字识别成选项：第 ${li + 1} 行「${truncate(line, 26)}」。` });
        }
      });
    }

    // 量表
    if (q.type === "scale" && !q.scaleExplicit) {
      blocking.push({ type: "scale_unknown", message: `量表范围无法判断（当前默认 ${q.scale}），请确认量表范围。` });
    }

    // 矩阵
    if (q.type === "matrix") {
      const rows = splitList(q.rows);
      if (rows.length === 0) {
        blocking.push({ type: "matrix_no_rows", message: "矩阵没有行维度，请补充行维度。" });
      }
      if (!q.scaleExplicit) {
        issues.push({ type: "matrix_scale_unknown", message: `矩阵量表范围未标注（默认 ${q.scale}），请确认。` });
      }
    }

    // 开放题
    if (q.type === "open") {
      issues.push({ type: "open_question", message: "开放题：确认后默认跳过（如需保留请补充选项或修改题型）。" });
    }

    // v52 新题型校验
    if (q.type === "rank") {
      const opts = splitOptions(q.options);
      if (opts.length < 2) {
        blocking.push({ type: "rank_no_options", message: "排序题至少需要 2 个可排序选项。" });
      }
      const topN = q.config && q.config.topN;
      if (q.config && q.config.rankMode === "top_n" && topN > opts.length) {
        blocking.push({ type: "rank_topn_too_large", message: `排序题 Top N（${topN}）大于选项数（${opts.length}）。` });
      }
    }
    if (q.type === "allocation") {
      if (splitOptions(q.options).length < 2) {
        blocking.push({ type: "allocation_no_options", message: "定和分配题至少需要 2 个分配选项。" });
      }
      const total = q.config && q.config.totalPoints;
      if (!(Number.isFinite(Number(total)) && Number(total) > 0)) {
        issues.push({ type: "allocation_total_bad", message: "定和分配总分未识别（默认 100），请确认。" });
      }
    }
    if (q.type === "numeric") {
      const min = q.config && q.config.min;
      const max = q.config && q.config.max;
      if (Number.isFinite(Number(min)) && Number.isFinite(Number(max)) && Number(max) < Number(min)) {
        blocking.push({ type: "numeric_range_bad", message: `数值题取值范围无效（${min} > ${max}）。` });
      }
    }

    // 题号重复 / 顺序异常
    const code = q.code || "";
    if (code) {
      if (seenCodes.has(code)) {
        blocking.push({ type: "duplicate_code", message: `题号 ${code} 重复出现（第 ${seenCodes.get(code) + 1} 题已使用）。` });
      }
      seenCodes.set(code, i);
      const sec = code.match(/^[A-Za-z]+/);
      const num = code.match(/\d+/);
      if (sec && num) {
        const n = Number(num[0]);
        const prevN = prevNumBySection[sec[0]];
        if (prevN !== undefined && n < prevN) {
          issues.push({ type: "code_order", message: `题号顺序异常：${code} 出现在 ${prevN} 之后。` });
        }
        prevNumBySection[sec[0]] = n;
      }
    }

    prevOptions = q.options || "";
    const status = blocking.length ? "failed" : issues.length ? "needs-confirm" : "complete";
    return { ...q, issues, blocking, status };
  });
}

// 识别摘要：题目数 / 选项数 / 状态分布 / 题型统计
export function buildImportSummary(questions) {
  const summary = { total: 0, optionCount: 0, complete: 0, needsConfirm: 0, failed: 0, typeStats: { single: 0, multiple: 0, rank: 0, scale: 0, nps: 0, matrix: 0, numeric: 0, open: 0, allocation: 0 } };
  questions.forEach((q) => {
    summary.total++;
    if (q.type === "single" || q.type === "multiple" || q.type === "rank" || q.type === "allocation") {
      summary.optionCount += splitOptions(q.options).length;
    } else if (q.type === "matrix") {
      summary.optionCount += splitList(q.rows).length;
    }
    if (summary.typeStats[q.type] !== undefined) summary.typeStats[q.type]++;
    if (q.status === "complete") summary.complete++;
    else if (q.status === "needs-confirm") summary.needsConfirm++;
    else summary.failed++;
  });
  return summary;
}

// 确认规则：至少3道有效题目；所有严重错误已处理；单选/多选至少2个选项；量表范围有效；矩阵至少1行；题干不为空
// 开放题（无选项）默认跳过（用户可主动补充选项或修改题型后保留）
// 返回 { ok, errors[], warnings[], questions[], dropped[] }
export function confirmImportQuestions(questions) {
  const errors = [];
  const warnings = [];
  const dropped = [];
  const kept = [];
  let n = 0;

  questions.forEach((q) => {
    n++;
    const label = `第 ${q.code || n} 题`;
    const errs = [];
    if (!q.text || !q.text.trim()) {
      errors.push(`${label}：题干为空`);
      return;
    }
    if (q.type === "open") {
      // 开放题：无选项 → 跳过；有选项（用户补充或改题型）→ 保留
      if (splitOptions(q.options).length === 0) {
        dropped.push(q);
        return;
      }
      q.type = "single";
    }
    if (q.type === "single" || q.type === "multiple") {
      const opts = splitOptions(q.options);
      if (opts.length < 2) {
        errs.push(`${label}「${truncate(q.text, 24)}」：单选/多选至少需要 2 个选项（当前 ${opts.length} 个）。`);
      }
    }
    if (q.type === "rank" || q.type === "allocation") {
      const opts = splitOptions(q.options);
      if (opts.length < 2) {
        errs.push(`${label}「${truncate(q.text, 24)}」：${q.type === "rank" ? "排序题" : "定和分配题"}至少需要 2 个选项（当前 ${opts.length} 个）。`);
      }
      if (q.type === "rank" && q.config && q.config.rankMode === "top_n" && q.config.topN > opts.length) {
        errs.push(`${label}「${truncate(q.text, 24)}」：排序 Top N（${q.config.topN}）大于选项数（${opts.length}）。`);
      }
    }
    if (q.type === "numeric" && q.config) {
      const min = Number(q.config.min);
      const max = Number(q.config.max);
      if (Number.isFinite(min) && Number.isFinite(max) && max < min) {
        errs.push(`${label}「${truncate(q.text, 24)}」：数值题取值范围无效（${min} > ${max}）。`);
      }
    }
    if (q.type === "scale" || q.type === "matrix") {
      const numMatch = String(q.scale || "").match(/^1-(\d+)$/);
      const max = numMatch ? Number(numMatch[1]) : NaN;
      if (!(Number.isFinite(max) && max >= 2 && max <= 100)) {
        errs.push(`${label}「${truncate(q.text, 24)}」：量表范围无效（${q.scale}）。`);
      }
    }
    if (q.type === "matrix" && splitList(q.rows).length < 1) {
      errs.push(`${label}「${truncate(q.text, 24)}」：矩阵没有行维度。`);
    }
    if (errs.length) {
      errors.push(...errs);
      return;
    }
    (q.issues || []).forEach((issue) => {
      if (!issue.blocking) warnings.push(`${label}：${issue.message}`);
    });
    kept.push(q);
  });

  if (kept.length < 3) {
    errors.push(`有效题目不足 3 道（当前 ${kept.length} 道）。`);
  }
  if (errors.length) {
    return { ok: false, errors: [...new Set(errors)], warnings, questions: [], dropped };
  }
  return { ok: true, errors: [], warnings, questions: kept, dropped };
}
