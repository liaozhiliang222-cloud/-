// 问卷识别预览机制测试（可重复执行）
// 运行：npm test  或  node scripts/test-import-core.mjs
// 覆盖：Word 标准/表格问卷、Excel 两列/空列/空单元格、8+选项、共享选项、开放题、矩阵、
//       价格测试、编程说明、多 Sheet、识别质量分析（状态/摘要/确认规则）

import assert from "node:assert/strict";
import {
  parseQuestionnaireText,
  splitOptions,
  analyzeQuestionIssues,
  buildImportSummary,
  confirmImportQuestions,
  extractParagraphsFromDocxXml,
  hasWordTable,
  parseSharedStringsXml,
  extractXlsxRows,
  buildQuestionnaireTextFromXlsxRows,
  normalizeXlsxType,
  normalizeQuestionType,
  extractQuestionConfig,
  colLetterToIndex
} from "../src/import-core.js";

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

// 标准 Word 问卷（段落文本模拟）
const standardWordText = `
S 甄别部分
S1. 您的性别？（单选）
1. 男
2. 女
S2. 您的年龄？（单选）
1. 18-24 岁
2. 25-34 岁
3. 35-44 岁
4. 45 岁以上
A1. 您对健康饮品的重视程度（量表10分）
A2. 请评价以下因素的重要性（矩阵5分）
选项：1. 非常不重要 2. 不重要 3. 一般 4. 重要 5. 非常重要
功能列表：
口味
价格
成分
B1. 你会购买这款产品吗？（单选）一定会 / 可能会 / 不确定 / 不会
B2. 影响购买的因素？（多选）价格 / 品牌 / 口碑 / 功能
B3. 您还有什么想补充的？（开放题）
`;

// ===== 1. 标准 Word 问卷 =====
section("标准 Word 问卷");
check("解析出 7 道题且题型正确", () => {
  const qs = parseQuestionnaireText(standardWordText);
  assert.equal(qs.length, 7);
  assert.equal(qs[0].code, "S1");
  assert.equal(qs[0].type, "single");
  assert.equal(splitOptions(qs[0].options).length, 2);
  assert.equal(qs[2].type, "scale");
  assert.equal(qs[2].scale, "1-10");
  assert.equal(qs[3].type, "matrix");
  assert.equal(splitOptions(qs[3].rows).length, 3);
  assert.equal(qs[4].type, "single");   // 单行内联选项
  assert.equal(splitOptions(qs[4].options).length, 4);
  assert.equal(qs[5].type, "multiple");
  assert.equal(qs[6].type, "open");     // 开放题保留原类型
});

check("识别质量：标准问卷无异常（开放题按设计标记为需确认）", () => {
  const analyzed = analyzeQuestionIssues(parseQuestionnaireText(standardWordText));
  assert.ok(analyzed.filter((q) => q.status === "failed").length === 0, JSON.stringify(analyzed.filter((q) => q.status === "failed").map((q) => ({ t: q.text, s: q.status }))));
  assert.equal(analyzed.filter((q) => q.status === "complete").length, 6);
  assert.equal(analyzed.filter((q) => q.status === "needs-confirm").length, 1); // B3 开放题
});

// ===== 2. Word 表格问卷 =====
section("Word 表格问卷");
check("表格单元格按行识别，hasWordTable 检测表格", () => {
  const xml = `<w:document><w:body>
    <w:p><w:r><w:t>您好，以下是问卷：</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>题号</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>题干及选项</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>C1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>您通常在哪里购买？（多选）线上电商\t线下门店\t直播间</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>C2</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>您的满意度（量表7分）</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:t>D1. 您的收入？（单选）5千以下 / 5千-1万 / 1万以上</w:t></w:r></w:p>
  </w:body></w:document>`;
  assert.equal(hasWordTable(xml), true);
  const text = extractParagraphsFromDocxXml(xml);
  assert.match(text, /您好，以下是问卷/);
  assert.match(text, /C1\t您通常在哪里购买/);
  assert.match(text, /线上电商\t线下门店\t直播间/);
  assert.match(text, /C2\t您的满意度/);
  assert.match(text, /D1\. 您的收入/);
  // 表格内容能进入文本解析
  const qs = parseQuestionnaireText(text);
  assert.equal(qs.length, 3);
  assert.equal(qs[0].type, "multiple");
  assert.equal(splitOptions(qs[0].options).length, 3);
  assert.equal(qs[1].type, "scale");
  assert.equal(qs[1].scale, "1-7");
});

check("换行符分隔选项（w:br）", () => {
  const xml = `<w:document><w:body><w:p><w:r><w:t>E1. 您的职业？（单选）</w:t></w:r><w:r><w:br/><w:t>学生</w:t></w:r><w:r><w:br/><w:t>上班族</w:t></w:r></w:p></w:body></w:document>`;
  const text = extractParagraphsFromDocxXml(xml);
  const qs = parseQuestionnaireText(text);
  assert.equal(qs.length, 1);
  assert.equal(splitOptions(qs[0].options).length, 2);
});

// ===== 3. 标准 Excel 两列问卷 =====
section("Excel 解析（按 r 属性定位列）");
check("colLetterToIndex：A→0 / Z→25 / AA→26", () => {
  assert.equal(colLetterToIndex("A"), 0);
  assert.equal(colLetterToIndex("Z"), 25);
  assert.equal(colLetterToIndex("AA"), 26);
  assert.equal(colLetterToIndex("C"), 2);
});

check("标准两列问卷（题号 + 题干及选项 + 选项行）", () => {
  const xml = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>题号</t></is></c><c r="B1" t="inlineStr"><is><t>题干及选项</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>S1</t></is></c><c r="B2" t="inlineStr"><is><t>您的性别？（单选）男 / 女</t></is></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>S2</t></is></c><c r="B3" t="inlineStr"><is><t>您的年龄？（单选）18-24 / 25-34 / 35-44</t></is></c></row>
  </sheetData></worksheet>`;
  const rows = extractXlsxRows(xml, []);
  const text = buildQuestionnaireTextFromXlsxRows(rows);
  assert.match(text, /S1\. 您的性别/);
  assert.match(text, /S2\. 您的年龄/);
  const qs = parseQuestionnaireText(text);
  assert.equal(qs.length, 2);
  assert.equal(splitOptions(qs[0].options).length, 2);
});

check("用例4：Excel 中间存在空列（B 列整列省略）不产生错位", () => {
  // 表头行：A=题号，B 空（省略），C=题干及选项
  // 数据行：A=题号，B=题型，C=题干 —— 若按出现顺序存储会错位
  const xml = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>题号</t></is></c><c r="C1" t="inlineStr"><is><t>题干及选项</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>S1</t></is></c><c r="B2" t="inlineStr"><is><t>单选</t></is></c><c r="C2" t="inlineStr"><is><t>您的性别？</t></is></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>1</t></is></c><c r="C3" t="inlineStr"><is><t>男</t></is></c></row>
    <row r="4"><c r="A4" t="inlineStr"><is><t>2</t></is></c><c r="C4" t="inlineStr"><is><t>女</t></is></c></row>
  </sheetData></worksheet>`;
  const rows = extractXlsxRows(xml, []);
  // 行2：id=A列，题型=B列，题干=C列
  assert.equal(rows[1][0], "S1");
  assert.equal(rows[1][1], "单选");
  assert.equal(rows[1][2], "您的性别？");
  const text = buildQuestionnaireTextFromXlsxRows(rows);
  assert.match(text, /S1\. 您的性别？（单选）/);
  assert.match(text, /^1\. 男$/m);
  assert.match(text, /^2\. 女$/m);
  const qs = parseQuestionnaireText(text);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].type, "single");
  assert.equal(splitOptions(qs[0].options).length, 2);
});

check("用例5：Excel 部分单元格为空（题干缺失的选项行被跳过）", () => {
  const xml = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>题号</t></is></c><c r="B1" t="inlineStr"><is><t>题干及选项</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>S1</t></is></c><c r="B2" t="inlineStr"><is><t>您的性别？（单选）</t></is></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>1</t></is></c><c r="B3" t="inlineStr"><is><t>男</t></is></c></row>
    <row r="4"><c r="A4" t="inlineStr"><is><t>2</t></is></c><c r="B4" t="inlineStr"><is><t>女</t></is></c></row>
    <row r="5"><c r="A5" t="inlineStr"><is><t>142</t></is></c><c r="B5" t="inlineStr"><is><t>编程参考号行</t></is></c></row>
    <row r="6"><c r="A6" t="inlineStr"><is><t>S2</t></is></c><c r="B6" t="inlineStr"><is><t>您的年龄？（单选）18-24 / 25-34</t></is></c></row>
  </sheetData></worksheet>`;
  const rows = extractXlsxRows(xml, []);
  const text = buildQuestionnaireTextFromXlsxRows(rows);
  assert.doesNotMatch(text, /142/);           // 编程参考号跳过
  const qs = parseQuestionnaireText(text);
  assert.equal(qs.length, 2);
  assert.equal(splitOptions(qs[0].options).length, 2);
});

check("题型列 + 选项列接入：normalizeXlsxType 生效", () => {
  const xml = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>题目编号</t></is></c><c r="B1" t="inlineStr"><is><t>题目内容</t></is></c><c r="C1" t="inlineStr"><is><t>题型</t></is></c><c r="D1" t="inlineStr"><is><t>选项</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Q1</t></is></c><c r="B2" t="inlineStr"><is><t>您的购买意愿</t></is></c><c r="C2" t="inlineStr"><is><t>量表10分</t></is></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Q2</t></is></c><c r="B3" t="inlineStr"><is><t>影响购买的因素</t></is></c><c r="C3" t="inlineStr"><is><t>多选</t></is></c><c r="D3" t="inlineStr"><is><t>价格 / 品牌 / 口碑</t></is></c></row>
  </sheetData></worksheet>`;
  const rows = extractXlsxRows(xml, []);
  const text = buildQuestionnaireTextFromXlsxRows(rows);
  const qs = parseQuestionnaireText(text);
  assert.equal(qs.length, 2);
  assert.equal(qs[0].type, "scale", "题型列 量表10分 生效");
  assert.equal(qs[0].scale, "1-10");
  assert.equal(qs[1].type, "multiple", "题型列 多选 生效");
  assert.equal(splitOptions(qs[1].options).length, 3, "选项列内容合并");
  assert.equal(normalizeXlsxType("矩阵5分"), "矩阵5分");
  assert.equal(normalizeXlsxType("10分量表"), "量表10分");
  assert.equal(normalizeXlsxType("single"), "单选");
});

check("sharedStrings 解析（含富文本）", () => {
  const xml = `<sst><si><t>题号</t></si><si><r><rPr><b/></rPr><t>题干及选项</t></r><r><t>（多选）</t></r></si></sst>`;
  const ss = parseSharedStringsXml(xml);
  assert.deepEqual(ss, ["题号", "题干及选项（多选）"]);
});

// ===== 6. 8 个以上选项 =====
section("8+ 选项题目");
check("10 选项单选题正常识别（≤12 不告警）", () => {
  const lines = [
    "F1. 您通常通过哪些渠道购买？（单选）",
    ...Array.from({ length: 10 }, (_, i) => `${i + 1}. 渠道${i + 1}`)
  ];
  const qs = parseQuestionnaireText(lines.join("\n"));
  assert.equal(qs.length, 1);
  assert.equal(splitOptions(qs[0].options).length, 10);
  const analyzed = analyzeQuestionIssues(qs);
  assert.equal(analyzed[0].status, "complete");
});

check("14 选项 → 需要确认（选项数量异常多）", () => {
  const lines = [
    "F2. 所有渠道？（多选）",
    ...Array.from({ length: 14 }, (_, i) => `${i + 1}. 渠道${i + 1}`)
  ];
  const qs = analyzeQuestionIssues(parseQuestionnaireText(lines.join("\n")));
  assert.equal(qs[0].status, "needs-confirm");
  assert.ok(qs[0].issues.some((i) => i.type === "too_many_options"));
});

// ===== 7. 共享选项子题 =====
section("共享选项子题");
check("B9/B10 共用选项自动继承并标注 inherited", () => {
  const text = `
B9. 您最喜欢的颜色？（单选）
1. 红色
2. 蓝色
3. 绿色
B10. 您其次喜欢的颜色？（单选）
`;
  const qs = parseQuestionnaireText(text);
  assert.equal(qs.length, 2);
  assert.equal(qs[1].options, qs[0].options, "B10 继承 B9 选项");
  assert.equal(qs[1].inherited, true);
  const analyzed = analyzeQuestionIssues(qs);
  assert.ok(analyzed[1].issues.some((i) => i.type === "inherited_options"), "继承标记为需要确认");
  // 批量接受共享选项后不再告警
  analyzed[1].sharedAccepted = true;
  const reAnalyzed = analyzeQuestionIssues(analyzed);
  assert.ok(!reAnalyzed[1].issues.some((i) => i.type === "inherited_options"));
});

check("完全相同选项连续出现 → 需要确认", () => {
  const text = `
G1. 您对价格的重视程度？（单选）
1. 非常重视
2. 一般
3. 不重视
G2. 您对品牌的重视程度？（单选）
1. 非常重视
2. 一般
3. 不重视
`;
  const analyzed = analyzeQuestionIssues(parseQuestionnaireText(text));
  assert.equal(analyzed[1].status, "needs-confirm");
  assert.ok(analyzed[1].issues.some((i) => i.type === "identical_options"));
});

// ===== 8. 开放题 =====
section("开放题");
check("开放题保留 open 类型，确认时默认跳过", () => {
  const qs = parseQuestionnaireText("H1. 您还有什么建议？（开放题）\nH2. 您对产品的第一印象？（单选）1. 好 2. 一般 3. 差\nH3. 您会推荐吗？（单选）1. 会 2. 不会\nH4. 您会再次购买吗？（单选）1. 会 2. 不会");
  assert.equal(qs[0].type, "open");
  const result = confirmImportQuestions(qs);
  assert.equal(result.ok, true);
  assert.equal(result.dropped.length, 1);
  assert.equal(result.dropped[0].code, "H1");
  assert.equal(result.questions.length, 3);
  assert.equal(result.questions[0].code, "H2");
});

// ===== 9. 矩阵题 =====
section("矩阵题");
check("矩阵行/刻度识别 + 无行维度 → 失败", () => {
  const text = `
I1. 请评价以下因素的重要性（矩阵5分）
选项：1. 很不重要 2. 不重要 3. 一般 4. 重要 5. 很重要
功能列表：
价格
品牌
`;
  const qs = parseQuestionnaireText(text);
  assert.equal(qs[0].type, "matrix");
  assert.equal(splitOptions(qs[0].rows).length, 2);
  const noRows = parseQuestionnaireText("I2. 矩阵题（矩阵5分）\nI3. 正常题（单选）会 / 不会");
  const analyzed = analyzeQuestionIssues(noRows);
  assert.equal(analyzed[0].type, "matrix");
  assert.equal(analyzed[0].status, "failed");
  assert.ok(analyzed[0].blocking.some((i) => i.type === "matrix_no_rows"));
});

// ===== 10. 价格测试题 =====
section("价格测试题（C5a/b/c/d 共享价格选项）");
check("同前缀子题共享选项继承", () => {
  const text = `
C5a. 如果定价 9.9 元，您的购买意愿？（单选）
1. 一定会
2. 可能会
3. 不会
C5b. 如果定价 19.9 元，您的购买意愿？（单选）
C5c. 如果定价 29.9 元，您的购买意愿？（单选）
C5d. 如果定价 39.9 元，您的购买意愿？（单选）
`;
  const qs = parseQuestionnaireText(text);
  assert.equal(qs.length, 4);
  assert.ok(qs[1].options && qs[2].options && qs[3].options, "C5b/c/d 均继承价格选项");
  assert.equal(qs[3].options, qs[0].options);
});

// ===== 11. 编程说明 =====
section("编程说明");
check("编程说明不污染选项，说明文字不误识别为题目", () => {
  const text = `
S3. 您目前使用的手机品牌？（单选）【针对S2=1询问】
1. 苹果
2. 华为
3. 其他
【仅S3选3者回答】请说明品牌：______
S4. 您的换机频率？（单选）
1. 每年
2. 每两年
3. 更久
S4T. 用户类型归类逻辑【系统自动】
说明：此处不需要被访者回答。
`;
  const qs = parseQuestionnaireText(text);
  assert.equal(qs.length, 2, "S4T/说明行不识别为题目");
  assert.equal(splitOptions(qs[0].options).length, 3);
  assert.doesNotMatch(qs[0].options, /请说明品牌/, "编程说明不作为选项");
  assert.doesNotMatch(qs[1].options, /用户类型归类/);
});

check("疑似把下一题题干识别成选项 → 需要确认", () => {
  // Word 自动编号丢失后，无题号的题干行（含问号）会被当成上一题选项
  const text = `
J1. 您最喜欢的品牌？（单选）
1. A 品牌
2. B 品牌
您为什么喜欢它？质量 / 价格
`;
  const analyzed = analyzeQuestionIssues(parseQuestionnaireText(text));
  const j1 = analyzed[0];
  assert.ok(j1.issues.some((i) => i.type === "next_question_as_option"), "含问号的题干行混入选项应被提示");
});

// ===== 12. 多 Sheet =====
section("多 Sheet 合并");
check("两个 sheet 各自识别后合并（分节标记分隔）", () => {
  const sheet1Xml = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>题号</t></is></c><c r="B1" t="inlineStr"><is><t>题干及选项</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>S1</t></is></c><c r="B2" t="inlineStr"><is><t>您的性别？（单选）男 / 女</t></is></c></row>
  </sheetData></worksheet>`;
  const sheet2Xml = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>题号</t></is></c><c r="B1" t="inlineStr"><is><t>题干及选项</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>B1</t></is></c><c r="B2" t="inlineStr"><is><t>您的收入？（单选）5千以下 / 5千-1万 / 1万以上</t></is></c></row>
  </sheetData></worksheet>`;
  const text = [buildQuestionnaireTextFromXlsxRows(extractXlsxRows(sheet1Xml, [])), buildQuestionnaireTextFromXlsxRows(extractXlsxRows(sheet2Xml, []))]
    .filter(Boolean)
    .join("\n\n部分\n\n");
  const qs = parseQuestionnaireText(text);
  assert.equal(qs.length, 2);
  assert.equal(qs[0].code, "S1");
  assert.equal(qs[1].code, "B1");
});

// ===== 13. 识别质量分析 =====
section("识别质量分析与确认规则");
check("无选项单选 → 识别失败（阻塞确认），且绝不自动补选项", () => {
  // 相邻题为量表/题型不同，共享选项继承不会介入 → 无选项保持为严重问题
  const qs = parseQuestionnaireText("K1. 您的偏好？（单选）\nK2. 您的年龄？（量表5分）\nK3. 您的性别？（单选）1. 男 2. 女\nK4. 您的收入？（单选）1. 低 2. 中 3. 高");
  const analyzed = analyzeQuestionIssues(qs);
  assert.equal(analyzed[0].status, "failed");
  assert.equal(analyzed[0].options, "", "未识别到选项时保持为空，不生成占位");
  const result = confirmImportQuestions(analyzed);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("至少需要 2 个选项")));
});

check("确认规则：有效题目不足 3 道 → 拒绝", () => {
  const qs = parseQuestionnaireText("L1. 问题一？（单选）1. A 2. B\nL2. 问题二？（单选）1. A 2. B");
  const result = confirmImportQuestions(analyzeQuestionIssues(qs));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("不足 3 道")));
});

check("确认规则：轻度警告可继续但返回 warnings", () => {
  const text = `
M1. 您对价格的态度？（单选）
1. 很重视
2. 一般
M2. 您对质量的态度？（单选）
1. 很重视
2. 一般
M3. 您的性别？（单选）1. 男 2. 女
`;
  const result = confirmImportQuestions(analyzeQuestionIssues(parseQuestionnaireText(text)));
  assert.equal(result.ok, true);
  assert.ok(result.warnings.length > 0, "完全相同选项产生轻度警告");
});

check("确认规则：矩阵无行维度 → 拒绝；补充后通过", () => {
  const qs = analyzeQuestionIssues(parseQuestionnaireText(
    "N1. 矩阵题（矩阵5分）\nN2. 问题二？（单选）1. A 2. B\nN3. 问题三？（单选）1. A 2. B"
  ));
  assert.equal(confirmImportQuestions(qs).ok, false);
  qs[0].rows = "口味, 价格";
  const result = confirmImportQuestions(qs);
  assert.equal(result.ok, true);
  assert.equal(result.questions.length, 3);
});

check("buildImportSummary 统计正确", () => {
  const qs = parseQuestionnaireText(standardWordText);
  const analyzed = analyzeQuestionIssues(qs);
  const s = buildImportSummary(analyzed);
  assert.equal(s.total, 7);
  assert.equal(s.complete, 6);
  assert.equal(s.needsConfirm, 1);   // B3 开放题
  assert.equal(s.failed, 0);
  assert.equal(s.typeStats.single, 3);   // S1 S2 B1
  assert.equal(s.typeStats.multiple, 1); // B2
  assert.equal(s.typeStats.scale, 1);    // A1
  assert.equal(s.typeStats.matrix, 1);   // A2
  assert.equal(s.typeStats.open, 1);     // B3
});

check("题号重复 / 顺序异常检测", () => {
  const text = `
P1. 问题一？（单选）1. A 2. B
P1. 问题二？（单选）1. A 2. B
P3. 问题三？（单选）1. A 2. B
P2. 问题四？（单选）1. A 2. B
`;
  const analyzed = analyzeQuestionIssues(parseQuestionnaireText(text));
  assert.ok(analyzed[1].blocking.some((i) => i.type === "duplicate_code"), "P1 重复");
  assert.ok(analyzed[3].issues.some((i) => i.type === "code_order"), "P3→P2 顺序异常");
});

check("量表范围无法判断 → 识别失败（默认 1-5）", () => {
  const text = `
R1. 您的满意度（量表）
R2. 问题二？（单选）1. A 2. B
R3. 问题三？（单选）1. A 2. B
`;
  const analyzed = analyzeQuestionIssues(parseQuestionnaireText(text));
  assert.equal(analyzed[0].type, "scale");
  assert.equal(analyzed[0].status, "failed");
  assert.ok(analyzed[0].blocking.some((i) => i.type === "scale_unknown"));
  // 用户确认量表范围后通过
  analyzed[0].scaleExplicit = true;
  analyzed[0].scale = "1-7";
  const re = analyzeQuestionIssues(analyzed);
  assert.equal(re[0].status, "complete");
});

// ===== v54 题型识别 =====
section("v54 新题型导入识别");

check("排序题不再映射为多选（rank）", () => {
  const qs = parseQuestionnaireText(`B5. 请将以下功能按照重要程度排序（排序题）
1. 事故取证 2. 日常记录 3. 停车监控`);
  assert.equal(qs[0].type, "rank");
  assert.equal(qs[0].config.rankMode, "full");
});

check("排序题 Top N 识别（前3项）", () => {
  const qs = parseQuestionnaireText(`C2. 请选出最重要的3项，并按照重要程度排序（排序题）
1. A 2. B 3. C 4. D 5. E`);
  assert.equal(qs[0].type, "rank");
  assert.equal(qs[0].config.rankMode, "top_n");
  assert.equal(qs[0].config.topN, 3);
});

check("NPS 识别：0-10 + 推荐 → nps；普通 0-10 满意度不误判", () => {
  const nps = parseQuestionnaireText(`Q1. 请问您有多大可能向朋友推荐本产品？0代表完全不会推荐，10代表一定会推荐（推荐度0-10分）
0 / 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 / 10`);
  assert.equal(nps[0].type, "nps", "含推荐语义的 0-10 题应识别为 NPS");
  const sat = parseQuestionnaireText(`Q2. 请为本次服务体验打分，0-10 分（量表10分）
0 / 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 / 10`);
  assert.equal(sat[0].type, "scale", "普通 0-10 满意度不应误判为 NPS");
});

check("数值题与定和分配识别", () => {
  const qs = parseQuestionnaireText(`Q1. 您能接受的最高价格是多少元（数值题）
Q2. 请将100分分配给以下购买因素（100分分配）
1. 价格 2. 品牌 3. 功能 4. 售后`);
  assert.equal(qs[0].type, "numeric");
  assert.equal(qs[1].type, "allocation");
  assert.equal(qs[1].config.totalPoints, 100);
});

check("「其他，请注明」作为选项时不误判为开放题", () => {
  const qs = parseQuestionnaireText(`Q1. 您通常通过哪些渠道购买？（多选）
1. 线上 2. 线下 3. 其他，请注明`);
  assert.equal(qs[0].type, "multiple", "含「其他，请注明」选项的多选仍是多选");
  assert.equal(splitOptions(qs[0].options).length, 3);
});

check("normalizeQuestionType / normalizeXlsxType 新题型", () => {
  assert.equal(normalizeQuestionType("排序").type, "rank");
  assert.equal(normalizeQuestionType("Ranking").type, "rank");
  assert.equal(normalizeQuestionType("NPS").type, "nps");
  assert.equal(normalizeQuestionType("定和分配").type, "allocation");
  assert.equal(normalizeQuestionType("数值题").type, "numeric");
  assert.equal(normalizeXlsxType("排序题"), "排序");
  assert.equal(normalizeXlsxType("NPS"), "NPS");
  assert.equal(normalizeXlsxType("数值题"), "数值题");
});

check("extractQuestionConfig 排序/数值/定和配置提取", () => {
  assert.deepEqual(extractQuestionConfig("请选出前3项并排序", "rank"), { rankMode: "top_n", topN: 3, allowTies: false });
  const num = extractQuestionConfig("您能接受的最高价格是多少元（0-10000元）", "numeric");
  assert.equal(num.numericType, "currency");
  assert.equal(num.min, 0);
  assert.equal(num.max, 10000);
  assert.equal(num.unit, "元");
  assert.equal(extractQuestionConfig("请将100分分配给以下购买因素", "allocation").totalPoints, 100);
});

check("新题型进入识别统计与确认", () => {
  const qs = parseQuestionnaireText(`Q1. 请排序（排序题）
1. A 2. B 3. C
Q2. 您能接受的最高价格（数值题）
Q3. 请将100分分配（100分分配）
1. X 2. Y`);
  const analyzed = analyzeQuestionIssues(qs);
  assert.equal(analyzed[0].type, "rank");
  assert.equal(analyzed[1].type, "numeric");
  assert.equal(analyzed[2].type, "allocation");
  const summary = buildImportSummary(analyzed);
  assert.equal(summary.typeStats.rank, 1);
  assert.equal(summary.typeStats.numeric, 1);
  assert.equal(summary.typeStats.allocation, 1);
  const confirmed = confirmImportQuestions(analyzed);
  assert.equal(confirmed.ok, true, JSON.stringify(confirmed.errors));
  assert.equal(confirmed.questions.length, 3);
});

// ===== 汇总 =====
console.log(`\n========== 结果：${passed} 通过，${failed} 失败 ==========`);
if (failed > 0) {
  console.log("失败明细:");
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.err.message}`));
  process.exit(1);
}
