import type { CategoryItem } from '../api/categories';

/** 语音解析出的账单草稿（确认后才写入）。 */
export interface VoiceDraft {
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: string;
  note?: string;
}

export interface VoiceParseResult {
  draft: VoiceDraft | null;
  question?: string;
}

export interface VoiceParseOptions {
  today?: Date;
  categories?: CategoryItem[];
}

const CN_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  壹: 1,
  二: 2,
  两: 2,
  贰: 2,
  三: 3,
  叁: 3,
  四: 4,
  肆: 4,
  五: 5,
  伍: 5,
  六: 6,
  陆: 6,
  七: 7,
  柒: 7,
  八: 8,
  捌: 8,
  九: 9,
  玖: 9,
};

const CN_UNITS: Record<string, number> = {
  十: 10,
  拾: 10,
  百: 100,
  佰: 100,
  千: 1000,
  仟: 1000,
  万: 10000,
  亿: 100000000,
};

const INCOME_WORDS = [
  '工资',
  '收入',
  '收到',
  '报销',
  '奖金',
  '红包',
  '退款',
  '利息',
  '分红',
  '进账',
  '赚了',
  '卖了',
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  餐饮: [
    '早餐',
    '早饭',
    '午餐',
    '午饭',
    '晚餐',
    '晚饭',
    '吃饭',
    '外卖',
    '买菜',
    '菜',
    '火锅',
    '烧烤',
    '食堂',
    '餐厅',
    '咖啡',
    '面',
    '饭',
  ],
  交通: [
    '打车',
    '滴滴',
    '出租车',
    '地铁',
    '公交',
    '高铁',
    '火车',
    '机票',
    '飞机',
    '加油',
    '停车',
    '过路费',
  ],
  日用: [
    '超市',
    '日用品',
    '纸巾',
    '洗衣',
    '房租',
    '水电',
    '燃气',
    '物业',
    '话费',
    '宽带',
  ],
  娱乐: ['电影', '游戏', '唱歌', 'KTV', '演出', '门票', '旅游', '健身'],
  医疗: ['医院', '看病', '药', '挂号', '体检', '牙医'],
  教育: ['书', '课程', '学费', '培训', '考试', '文具'],
  购物: ['衣服', '鞋', '裤子', '数码', '手机', '电脑', '耳机', '化妆品', '护肤', '家具'],
  零食: ['零食', '薯片', '巧克力', '冰淇淋', '奶茶', '蛋糕'],
  收入: ['工资', '奖金', '红包', '报销', '退款', '利息', '分红'],
  生活费: ['生活费', '家用'],
};

const DATE_WORD_RE = /(大前天|前天|昨天|昨日|今天|今日|明天|昨日|今天|今日)/g;
const NUM_TOKEN_RE = /[0-9]+(?:\.[0-9]{1,2})?|[零〇一二两三四五六七八九十百千万亿点]+/g;
const CURRENCY_RE =
  /([0-9]+(?:\.[0-9]{1,2})?|[零〇一二两三四五六七八九十百千万亿点]+)\s*(?:块|元)(?:钱)?/;
const SPEND_RE =
  /(?:花了?|花费|付了?|支付|买了?|收入|工资|收到|报销|发了?|充了?|转了?|赚了?)\s*([0-9]+(?:\.[0-9]{1,2})?|[零〇一二两三四五六七八九十百千万亿点]+)/;

/** 解析中文数字；支持“一百八”=180、“两百五”=250 这类口语省略。 */
export function parseChineseNumber(input: string): number | null {
  const text = input.trim();
  if (!text) {
    return null;
  }

  const [integerPart, decimalPart] = text.split('点');
  if (!integerPart) {
    return null;
  }

  // 口语省略：最后一个单位是百/千/万/亿，末尾只剩一个数字时，按单位/10 补。
  const shorthand = integerPart.match(/^(.*[百佰千仟万])([一二两三四五六七八九])$/);
  let base: number;
  if (shorthand && !integerPart.includes('零') && !shorthand[1].endsWith('十')) {
    const unitMatch = shorthand[1].match(/[百佰千仟万]/g);
    const lastUnit = unitMatch
      ? CN_UNITS[unitMatch[unitMatch.length - 1]]
      : 1;
    const prefix = parseChineseInteger(shorthand[1]);
    base = prefix + CN_DIGITS[shorthand[2]] * (lastUnit / 10);
  } else {
    base = parseChineseInteger(integerPart);
  }

  if (base === 0 && !integerPart.match(/[零〇]/)) {
    return null;
  }

  if (decimalPart) {
    const digits = decimalPart
      .split('')
      .map((char) => CN_DIGITS[char])
      .filter((value): value is number => value !== undefined)
      .map(String)
      .join('');
    if (!digits) {
      return base;
    }
    return Number(`${base}.${digits}`);
  }
  return base;
}

function parseChineseInteger(text: string): number {
  let total = 0;
  let section = 0;
  let number = 0;

  for (const char of text) {
    const digit = CN_DIGITS[char];
    if (digit !== undefined) {
      number = digit;
      continue;
    }
    const unit = CN_UNITS[char];
    if (!unit) {
      continue;
    }
    if (unit < 10000) {
      section += (number || 1) * unit;
      number = 0;
    } else {
      section += number;
      total += (section || 1) * unit;
      section = 0;
      number = 0;
    }
  }
  return total + section + number;
}

function parseAmountToken(token: string): number | null {
  const normalized = token.replace(/点/g, '点');
  const value = /^[0-9]/.test(normalized)
    ? Number(normalized)
    : parseChineseNumber(normalized);
  if (!value || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function extractAmount(text: string): number | null {
  const currency = text.match(CURRENCY_RE);
  if (currency) {
    const value = parseAmountToken(currency[1]);
    if (value) {
      return value;
    }
  }

  const spend = text.match(SPEND_RE);
  if (spend) {
    const token = spend[1];
    const after = text.slice((spend.index ?? 0) + spend[0].length);
    const hasUnit = /[十百千万亿]/.test(token);
    const isArabic = /^[0-9]/.test(token);
    const isCount = /^\s*(?:个|人|杯|份|次|年|岁|月|日|号)/.test(after);
    if (!isCount && (isArabic || hasUnit || /块|元/.test(spend[0]))) {
      const value = parseAmountToken(token);
      if (value) {
        return value;
      }
    }
  }

  // 去掉日期片段，避免把 7 月 28 号当成金额。
  const withoutDate = text
    .replace(/\d{4}\s*[年/-]\s*\d{1,2}\s*[月/-]\s*\d{1,2}\s*[日号]?/g, ' ')
    .replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]?/g, ' ')
    .replace(/\d{1,2}\s*[日号]/g, ' ');

  const tokens = [...withoutDate.matchAll(NUM_TOKEN_RE)];
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index][0];
    const after = withoutDate.slice((tokens[index].index ?? 0) + token.length);
    if (/^\s*(?:个|人|杯|份|次|年|岁|月|日|号)/.test(after)) {
      continue;
    }
    // 没有单位的中文数字（如“一起”）不作为金额；带十百千万或纯数字才接受。
    if (!/^[0-9]/.test(token) && !/[十百千万亿]/.test(token)) {
      continue;
    }
    const value = parseAmountToken(token);
    if (value) {
      return value;
    }
  }
  return null;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function parseVoiceDate(text: string, today: Date): string {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (/大前天/.test(text)) {
    return formatDate(addDays(base, -3));
  }
  if (/前天/.test(text)) {
    return formatDate(addDays(base, -2));
  }
  if (/昨天|昨日/.test(text)) {
    return formatDate(addDays(base, -1));
  }
  if (/明天/.test(text)) {
    return formatDate(addDays(base, 1));
  }
  if (/今天|今日/.test(text)) {
    return formatDate(base);
  }

  const full = text.match(/(\d{4})\s*[年/-]\s*(\d{1,2})\s*[月/-]\s*(\d{1,2})\s*[日号]?/);
  if (full) {
    return formatDate(new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3])));
  }
  const monthDay = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (monthDay) {
    return formatDate(
      new Date(base.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2])),
    );
  }
  return formatDate(base);
}

function resolveCategory(
  text: string,
  type: 'income' | 'expense',
  categories: CategoryItem[],
): string {
  const typeCategories = categories.filter((item) => item.type === type);
  const pool = typeCategories.length > 0 ? typeCategories : categories;

  // 用户自定义分类优先，长名字优先，避免“咖啡”命中“咖啡豆”之类。
  const custom = [...pool]
    .filter((item) => item.name && text.includes(item.name))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (custom) {
    return custom.name;
  }

  const staticEntries = Object.entries(CATEGORY_KEYWORDS)
    .filter(([name]) => (type === 'income' ? name === '收入' : name !== '收入'))
    .flatMap(([name, words]) => words.map((word) => ({ name, word })))
    .sort((a, b) => b.word.length - a.word.length);
  const matched = staticEntries.find((entry) => text.includes(entry.word));
  if (matched) {
    const exists = pool.find(
      (item) => item.name === matched.name && item.type === type,
    );
    if (exists) {
      return exists.name;
    }
  }

  const fallback =
    pool.find((item) => item.name === '其他' && item.type === type) ??
    pool.find((item) => item.name === (type === 'income' ? '收入' : '其他')) ??
    pool[0];
  return fallback?.name ?? (type === 'income' ? '收入' : '其他');
}

function buildNote(text: string, amount: number | null): string {
  let note = text
    .replace(DATE_WORD_RE, ' ')
    .replace(/\d{4}\s*[年/-]\s*\d{1,2}\s*[月/-]\s*\d{1,2}\s*[日号]?/g, ' ')
    .replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]?/g, ' ')
    .replace(/\d{1,2}\s*[日号]/g, ' ')
    .replace(/(?:花了?|花费|付了?|支付|买了?|收入|工资|收到|报销|发了?|充了?|转了?|赚了?)/g, ' ')
    .replace(/([0-9]+(?:\.[0-9]{1,2})?|[零〇一二两三四五六七八九十百千万亿点]+)\s*(?:块|元)(?:钱)?/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[，,。.!！?？、\s]+|[，,。.!！?？、\s]+$/g, '')
    .trim();
  if (amount !== null) {
    note = note.replace(new RegExp(String(amount).replace('.', '\\.'), 'g'), ' ');
  }
  note = note.replace(/\s+/g, ' ').trim();
  return note.slice(0, 255) || text.slice(0, 255);
}

function normalizeSpeech(text: string): string {
  return text
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1')
    .replace(/，/g, ',');
}

/**
 * 把一句中文语音转写解析成账单草稿。纯本地规则，不请求后端/大模型。
 * 解析不完整时返回 question，由 UI 提示重说；确认页仍可手动改所有字段。
 */
export function parseVoiceTransaction(
  text: string,
  options: VoiceParseOptions = {},
): VoiceParseResult {
  const raw = normalizeSpeech(text).trim();
  if (!raw) {
    return { draft: null, question: '没有听清，请再说一次' };
  }

  const amount = extractAmount(raw);
  if (amount === null) {
    return {
      draft: null,
      question: '没听清金额，请带上金额再说一次，比如“早餐 18 元”',
    };
  }

  const isIncome = INCOME_WORDS.some((word) => raw.includes(word));
  const type: 'income' | 'expense' = isIncome ? 'income' : 'expense';
  const today = options.today ?? new Date();
  const date = parseVoiceDate(raw, today);
  const category = resolveCategory(raw, type, options.categories ?? []);

  return {
    draft: {
      amount,
      type,
      category,
      date,
      note: buildNote(raw, amount),
    },
  };
}
