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
  DEFAULT_PROVIDER_KEYS,
  state,
  getSavedKey,
  isUsingDefaultKey,
  validateKeyFormat,
  migrateToDefaultProvider
};
`;

const sandbox = new Function(moduleCode);
const api = sandbox();

const results = [];
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, pass, actual, expected });
}

// Test 1: DEFAULT_PROVIDER_KEYS 包含 zhipu
check('内置 Key 包含 zhipu',
  Object.keys(api.DEFAULT_PROVIDER_KEYS),
  ['zhipu']
);

// Test 2: zhipu Key 是用户的真实 Key
check('zhipu 内置 Key 正确',
  api.DEFAULT_PROVIDER_KEYS.zhipu,
  'bb32a87bafb94891a4aab4eeff9b48b4.L5NZNKkIWgWWUMRS'
);

// Test 3: 默认 provider 是 zhipu（清空 localStorage 时）
check('默认 provider 是 zhipu',
  api.state.provider,
  'zhipu'
);

// Test 4: 未保存 Key 时，getSavedKey 返回内置 Key
check('未保存 Key 时回退到内置 Key',
  api.getSavedKey('zhipu'),
  'bb32a87bafb94891a4aab4eeff9b48b4.L5NZNKkIWgWWUMRS'
);

// Test 5: isUsingDefaultKey 在未保存 Key 时为 true
check('未保存 Key 时 isUsingDefaultKey=true',
  api.isUsingDefaultKey('zhipu'),
  true
);

// Test 6: kimi 没有内置 Key
check('kimi 没有内置 Key',
  api.DEFAULT_PROVIDER_KEYS.kimi || null,
  null
);

// Test 7: kimi 未保存 Key 时 getSavedKey 返回空字符串
check('kimi 未保存 Key 时返回空',
  api.getSavedKey('kimi'),
  ''
);

// Test 8: 保存 Key 后 isUsingDefaultKey 变为 false
global.localStorage.setItem('synthuser_api_key_zhipu', 'user-own-key-1234567890123');
check('保存 Key 后 isUsingDefaultKey=false',
  api.isUsingDefaultKey('zhipu'),
  false
);

// Test 9: 保存 Key 后 getSavedKey 返回用户 Key
check('保存 Key 后 getSavedKey 返回用户 Key',
  api.getSavedKey('zhipu'),
  'user-own-key-1234567890123'
);

// Test 10: 清除后又回退到内置 Key
global.localStorage.removeItem('synthuser_api_key_zhipu');
check('清除 Key 后又回退到内置 Key',
  api.getSavedKey('zhipu'),
  'bb32a87bafb94891a4aab4eeff9b48b4.L5NZNKkIWgWWUMRS'
);

// Test 11: 内置 Key 通过 validateKeyFormat 校验
check('内置 Key 通过校验',
  api.validateKeyFormat(api.DEFAULT_PROVIDER_KEYS.zhipu, 'zhipu'),
  null
);

// Test 12: 模拟旧版本用户：localStorage 里 provider=kimi，且没保存 kimi Key
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

// Test 13: 已保存自己 Key 的 kimi 用户不应被迁移
global.localStorage.setItem('synthuser_provider', 'kimi');
global.localStorage.setItem('synthuser_api_key_kimi', 'sk-user-own-kimi-key-1234567890123');
const freshApi2 = new Function(moduleCode)();
freshApi2.migrateToDefaultProvider();
check('kimi 已保存 Key 时不迁移',
  freshApi2.state.provider,
  'kimi'
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
