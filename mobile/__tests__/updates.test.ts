/**
 * 更新逻辑层单元测试:版本比较与更新判断(纯函数,无需原生环境)。
 */
import { compareVersions, hasUpdate } from '../src/api/updates';

describe('compareVersions', () => {
  test("'2.0.0' > '1.0.29' → 1", () => {
    expect(compareVersions('2.0.0', '1.0.29')).toBe(1);
  });

  test("'1.0.0' == '1.0.0' → 0", () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  test("'1.0.10' > '1.0.9' → 1", () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
  });

  test("'2.0.1' > '2.0.0' → 1", () => {
    expect(compareVersions('2.0.1', '2.0.0')).toBe(1);
  });

  test('非法输入不抛异常', () => {
    expect(() => compareVersions('abc', '1.0.0')).not.toThrow();
    expect(() => compareVersions('1.2', '1.0.0')).not.toThrow();
    expect(() => compareVersions('', '1.0.0')).not.toThrow();
    // 非法段按 0 处理,返回确定值
    expect(compareVersions('abc', '0.0.0')).toBe(0);
  });
});

describe('hasUpdate', () => {
  test('版本相同 → false', () => {
    expect(hasUpdate('2.0.0', { version: '2.0.0', apkUrl: 'x' })).toBe(false);
  });

  test('远端版本更高 → true', () => {
    expect(hasUpdate('2.0.0', { version: '2.0.1', apkUrl: 'x' })).toBe(true);
  });
});
