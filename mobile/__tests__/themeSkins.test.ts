import { resolveSkin, SKINS } from '../src/theme/skins';

describe('皮肤解析', () => {
  it('04 浮雕锁定亮色，忽略深色偏好与系统', () => {
    expect(resolveSkin('neu', 'dark', true).scheme).toBe('light');
    expect(resolveSkin('neu', 'system', true).scheme).toBe('light');
  });

  it('06 霓虹锁定深色', () => {
    expect(resolveSkin('neon', 'light', false).scheme).toBe('dark');
    expect(resolveSkin('neon', 'system', false).scheme).toBe('dark');
  });

  it('08 / 10 跟随偏好与系统', () => {
    expect(resolveSkin('aurora', 'dark', false).scheme).toBe('dark');
    expect(resolveSkin('aurora', 'system', true).scheme).toBe('dark');
    expect(resolveSkin('candy', 'system', false).scheme).toBe('light');
    expect(resolveSkin('candy', 'light', true).scheme).toBe('light');
  });

  it('每套皮肤都提供完整的颜色、渐变与表面样式', () => {
    for (const def of SKINS) {
      for (const preference of ['light', 'dark'] as const) {
        const skin = resolveSkin(def.id, preference, preference === 'dark');
        expect(skin.colors.background).toMatch(/^#|^rgba/);
        expect(skin.colors.onHero).toBeTruthy();
        expect(skin.gradient).toHaveLength(2);
        expect(skin.surfaces.card).toBeTruthy();
        expect(skin.surfaces.sheet).toBeTruthy();
        expect(skin.authGradient).toHaveLength(2);
      }
    }
  });

  it('未知皮肤回退到默认极光', () => {
    // @ts-expect-error 运行时兜底
    const skin = resolveSkin('unknown', 'system', false);
    expect(skin.id).toBe('aurora');
  });
});
