// 验证内置 Key 集成
const fs = require('fs');
const path = require('path');

// Mock 浏览器环境
const store = {};
global.localStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};
global.window = {
  matchMedia: () => ({ matches: false }),
  navigator: { onLine: true, standalone: false },
  scrollTo: () => {},
  location: { search: '' },
  addEventListener: () => {},
};
global.document = {
  querySelector: (sel) => {
    if (sel === '#app') return { innerHTML: '' };
    return null;
  },
  body: { addEventListener: () => {} },
  addEventListener: () => {},
};
global.navigator = { onLine: true };

// 读取并 eval app.js 顶部声明部分
const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

// 用 Function 提取顶层常量与函数（避免直接执行 UI 渲染逻辑）
const moduleCode = `
${code}

// 把需要测试的符号暴露出来
return {
  MODEL_CONFIG,
  PROXY_PROVIDERS,
  state,
  getSavedKey,
  shouldUseProxy,
  validateKeyFormat,
  migrateToDefaultProvider,
  hasModelReady
};
`;

const sandbox = new Function(moduleCode);
const api = sandbox();

const results = [];
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, pass, actual, expected });
}

// Test 1: PROXY_PROVIDERS 包含 zhipu
check('代理支持 zhipu',
  Object.keys(api.PROXY_PROVIDERS),
  ['zhipu']
);

// Test 2: zhipu 配置正确（环境变量名）
check('zhipu 代理 envKey 正确',
  api.PROXY_PROVIDERS.zhipu.envKey,
  'ZHIPU_API_KEY'
);

// Test 3: 默认 provider 是 zhipu（清空 localStorage 时）
check('默认 provider 是 zhipu',
  api.state.provider,
  'zhipu'
);

// Test 4: 未保存 Key 时走代理
check('未保存 Key 时 shouldUseProxy=true',
  api.shouldUseProxy('zhipu'),
  true
);

// Test 5: 未保存 Key 时 hasModelReady=true（代理可用）
check('代理可用时 hasModelReady=true',
  api.hasModelReady(),
  true
);

// Test 6: kimi 不支持代理
check('kimi 不支持代理',
  api.PROXY_PROVIDERS.kimi || null,
  null
);

// Test 7: kimi 未保存 Key 时不走代理
check('kimi 未保存 Key 时 shouldUseProxy=false',
  api.shouldUseProxy('kimi'),
  false
);

// Test 8: 保存 Key 后 shouldUseProxy 变为 false
global.localStorage.setItem('synthuser_api_key_zhipu', 'user-own-key-1234567890123');
check('保存 Key 后 shouldUseProxy=false',
  api.shouldUseProxy('zhipu'),
  false
);

// Test 9: 保存 Key 后 getSavedKey 返回用户 Key
check('保存 Key 后 getSavedKey 返回用户 Key',
  api.getSavedKey('zhipu'),
  'user-own-key-1234567890123'
);

// Test 10: 清除后又回退到代理模式
global.localStorage.removeItem('synthuser_api_key_zhipu');
check('清除 Key 后又走代理',
  api.shouldUseProxy('zhipu'),
  true
);

// Test 11: 模拟旧版本用户：localStorage 里 provider=kimi，且没保存 kimi Key
// 此时应该被 migrateToDefaultProvider 切换到 zhipu
global.localStorage.setItem('synthuser_provider', 'kimi');
// 不设置 kimi 的 key
const freshSandbox = new Function(moduleCode);
const freshApi = freshSandbox();
freshApi.migrateToDefaultProvider();
check('旧版本 kimi 用户迁移到 zhipu',
  freshApi.state.provider,
  'zhipu'
);
check('迁移后 localStorage 同步更新',
  global.localStorage.getItem('synthuser_provider'),
  'zhipu'
);

// Test 12: 已保存自己 Key 的 kimi 用户不应被迁移
global.localStorage.setItem('synthuser_provider', 'kimi');
global.localStorage.setItem('synthuser_api_key_kimi', 'sk-user-own-kimi-key-1234567890123');
const freshApi2 = new Function(moduleCode)();
freshApi2.migrateToDefaultProvider();
check('kimi 已保存 Key 时不迁移',
  freshApi2.state.provider,
  'kimi'
);

// Test 13: 代理模式下 validateApiConfig 返回 null（不需要校验）
const freshApi3 = new Function(moduleCode)();
freshApi3.migrateToDefaultProvider();
check('代理模式下 hasModelReady=true（无需 Key）',
  freshApi3.hasModelReady(),
  true
);

// 输出测试报告
let passCount = 0;
let failCount = 0;
for (const r of results) {
  const mark = r.pass ? '✓' : '✗';
  console.log(`${mark} ${r.name}`);
  if (!r.pass) {
    console.log(`    expected: ${JSON.stringify(r.expected)}`);
    console.log(`    actual:   ${JSON.stringify(r.actual)}`);
    failCount++;
  } else {
    passCount++;
  }
}
console.log(`\n${passCount}/${results.length} passed`);
process.exit(failCount === 0 ? 0 : 1);
