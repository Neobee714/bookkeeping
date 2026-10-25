import type { CategoryItem } from '../src/api/categories';
import {
  parseChineseNumber,
  parseVoiceTransaction,
} from '../src/voice/parseTransaction';

const categories: CategoryItem[] = [
  { id: 1, user_id: 1, name: '餐饮', icon: '🍜', color: '#000000', type: 'expense', is_default: true, created_at: null },
  { id: 2, user_id: 1, name: '交通', icon: '🚕', color: '#000000', type: 'expense', is_default: true, created_at: null },
  { id: 3, user_id: 1, name: '娱乐', icon: '🎬', color: '#000000', type: 'expense', is_default: true, created_at: null },
  { id: 4, user_id: 1, name: '其他', icon: '💰', color: '#000000', type: 'expense', is_default: true, created_at: null },
  { id: 5, user_id: 1, name: '宠物', icon: '🐱', color: '#000000', type: 'expense', is_default: false, created_at: null },
  { id: 6, user_id: 1, name: '收入', icon: '💵', color: '#000000', type: 'income', is_default: true, created_at: null },
];

const today = new Date(2026, 9, 25);

const parse = (text: string) =>
  parseVoiceTransaction(text, { today, categories });

describe('中文金额解析', () => {
  it('解析常规中文数字', () => {
    expect(parseChineseNumber('十八')).toBe(18);
    expect(parseChineseNumber('一百零八')).toBe(108);
    expect(parseChineseNumber('一千二百三十四')).toBe(1234);
  });

  it('解析口语省略', () => {
    expect(parseChineseNumber('一百八')).toBe(180);
    expect(parseChineseNumber('两百五')).toBe(250);
    expect(parseChineseNumber('一万二')).toBe(12000);
  });
});

describe('语音账单解析', () => {
  it('早餐十八块', () => {
    const { draft } = parse('早餐十八块');
    expect(draft).toMatchObject({
      amount: 18,
      type: 'expense',
      category: '餐饮',
      date: '2026-10-25',
    });
  });

  it('昨天打车花了35', () => {
    const { draft } = parse('昨天打车花了35');
    expect(draft).toMatchObject({
      amount: 35,
      category: '交通',
      date: '2026-10-24',
    });
  });

  it('发工资5000 识别为收入', () => {
    const { draft } = parse('发工资5000');
    expect(draft).toMatchObject({
      amount: 5000,
      type: 'income',
      category: '收入',
    });
  });

  it('买菜一共一百八', () => {
    expect(parse('买菜一共一百八').draft?.amount).toBe(180);
  });

  it('7月28号看电影120', () => {
    const { draft } = parse('7月28号看电影120');
    expect(draft).toMatchObject({
      amount: 120,
      category: '娱乐',
      date: '2026-07-28',
    });
  });

  it('优先匹配用户自定义分类', () => {
    expect(parse('宠物粮89').draft?.category).toBe('宠物');
  });

  it('不会把数量当成金额', () => {
    expect(parse('三杯咖啡45').draft?.amount).toBe(45);
    expect(parse('买了一杯咖啡45').draft?.amount).toBe(45);
  });

  it('金额缺失时返回追问', () => {
    const result = parse('今天没花钱');
    expect(result.draft).toBeNull();
    expect(result.question).toContain('金额');
  });

  it('支持千分位', () => {
    expect(parse('工资 5,000').draft?.amount).toBe(5000);
  });
});
