import learnedPhrases from '../data/short-phrase-rules.json' with { type: 'json' };

export function normalizeText(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/g, '<URL>')
    .replace(/@\S+/g, '<USER>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function maskText(text) {
  return text
    .replace(/(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千万两]+)\s*(?:元|块|万)/g, '<金额>')
    .replace(/(?:妈妈|妈|爸爸|爸|父母|姥爷|爷爷|奶奶)/g, '<家人>')
    .replace(/(?:楼主|lz|题主|po主)/gi, '<当事人>');
}

export function splitSentences(text) {
  return text
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .slice(0, 8);
}

const SHORT_HOSTILE_PHRASES = new Set([
  '你没事吧',
  '什么巨婴',
  '巨婴',
  '白眼狼',
  '吸血鬼',
  '窝里横',
  '找骂',
  '讨债吗这是',
  '真是讨债来的',
  '你咋这么不要脸',
  '自己没长手脚',
  '你他妈无敌了',
  '自己挂自己吗',
  '不如养块叉烧',
  '不如叉烧',
  '恶心',
  '恶心恶心恶心',
  's13',
  'sblz',
  'sb',
  '畜生',
  '出生',
  '纯cs',
  '啥比巨婴',
  '傻逼玩意儿',
  '那你去死吧',
  '你是真逆天',
  '你是正常人类吗',
  '难道不是你错了吗',
  '不是你错了还能是谁',
  ...learnedPhrases.hostile,
]);

const SHORT_SAFE_PHRASES = new Set(learnedPhrases.safe);

function shortRuleKey(text) {
  return normalizeText(text)
    .replace(/\s+/g, '')
    .replace(/[。！!？?，,、…]+$/g, '');
}

export function analyzeRules(text) {
  const reasons = [];
  let score = 0;
  const key = shortRuleKey(text);
  const hostileExact = SHORT_HOSTILE_PHRASES.has(key);
  const safeExact = SHORT_SAFE_PHRASES.has(key) && !hostileExact;
  const add = (pattern, points, reason) => {
    if (pattern.test(text)) {
      score += points;
      reasons.push(reason);
    }
  };

  if (hostileExact) {
    score += 0.78;
    reasons.push('高风险短句');
  }

  add(/傻逼|脑残|弱智|庸才|去死|闭嘴|滚(?:开|蛋)?|问ai给自己问高潮|什么民科跑/i, 1, '直接辱骂');
  add(/你没事吧|想找骂吗|在逗我吗|破案了|纯纯|真是.*宽容|不知足|理所当然/i, 0.62, '轻蔑或贴标签');
  add(/(?:\d+|[一二三四五六七八九十百千万两]+).{0,8}(?:一个月|每月).{0,8}(?:不够|还嫌|够花).{0,8}[吗？?]/i, 0.65, '金额式反问施压');
  add(/(?:凭什么|为什么|怎么|难道|还不|不会|不能|不应该).{0,28}[吗呢？?]/i, 0.28, '反问施压');
  add(/你(?:明显|就是|其实|无非|不过是)|感觉.*蹭|真的?热爱|赌气|甩脸色/i, 0.5, '揣测动机');
  add(/(?:你只是|无非是).{0,16}(?:不是|不代表)|经历和数字.{0,8}水分/i, 0.48, '否定能力或经历');
  add(/(?:情分不是本分|升米恩.{0,3}斗米仇|有问题了|不求是.*不创新|先反思)/i, 0.45, '道德审判');
  add(/(?:这点|这么点|多大点|都已经|都大学生|都成年人|才这点).{0,24}/i, 0.32, '缩小处境');
  add(/(?:建议|最好|应该|不如|先).{0,12}(?:反思|闭嘴|认清|学会|去做|了解)/i, 0.18, '命令训诫');

  if (/不清楚|不知道完整|不太好判断|可能|也许|可以考虑|如果愿意|听起来确实|能理解/.test(text)) {
    score -= 0.22;
  }
  if (/哪些|哪里|大概|是否足够|具体|能覆盖|造成了什么影响/.test(text)) score -= 0.12;
  if (text === '？' || text === '?') score = Math.max(score, 0.62);
  if (safeExact) {
    score = Math.min(score, 0.32);
  }

  return {
    probability: Math.max(0, Math.min(1, score)),
    reasons,
    hostileExact,
    safeExact,
  };
}
