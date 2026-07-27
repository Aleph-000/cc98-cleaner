import { analyzeRules } from '../src/tone.js';

const cases = [
  ['你没事吧？', true],
  ['两千一个月不够花吗？', true],
  ['升米恩，斗米仇。', true],
  ['你明显就是因为钱不够然后赌气甩脸色。', true],
  ['？', true],
  ['巨婴', true],
  ['白眼狼', true],
  ['自己没长手脚？', true],
  ['你是真逆天', true],
  ['不如养块叉烧', true],
  ['我只看到了一群庸才正在嘲讽别人。', true],
  ['你只是会用 AI 了，不代表真正掌握了。', true],
  ['你每个月大概有哪些必要支出？', false],
  ['你觉得这个证明哪里有问题？', false],
  ['如果时间允许，可以考虑做家教。', false],
  ['能理解你现在很难受，可以先照顾好自己。', false],
  ['出生率最近有所下降。', false],
  ['这件事让人感到不舒服。', false],
  ['我只是用 AI 整理了资料，不代表内容由 AI 生成。', false],
];

const failures = [];
for (const [text, hostile] of cases) {
  const result = analyzeRules(text);
  const predicted = result.probability >= 0.4;
  if (predicted !== hostile) failures.push({ text, hostile, result });
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Rule smoke tests passed: ${cases.length}`);
