import type { Skin, SkinDefinition, SkinId, ThemeMode } from '../types';
import aurora from './aurora';
import candy from './candy';
import neon from './neon';
import neu from './neu';

/** 皮肤注册表。新增皮肤：写一个文件 + 在这里加一行 + 在 SkinId 里加 id。 */
export const SKINS: SkinDefinition[] = [aurora, candy, neon, neu];

export const DEFAULT_SKIN_ID: SkinId = 'aurora';

export const getSkinDefinition = (id: SkinId): SkinDefinition =>
  SKINS.find((skin) => skin.id === id) ?? aurora;

/**
 * 解析出当前实际渲染的皮肤。
 * 锁定模式（light / dark）优先于用户偏好；both 时按偏好 → 系统。
 */
export function resolveSkin(
  id: SkinId,
  preference: ThemeMode,
  systemIsDark: boolean
): Skin {
  const definition = getSkinDefinition(id);
  let scheme: 'light' | 'dark';
  if (definition.mode === 'light') {
    scheme = 'light';
  } else if (definition.mode === 'dark') {
    scheme = 'dark';
  } else if (preference === 'light' || preference === 'dark') {
    scheme = preference;
  } else {
    scheme = systemIsDark ? 'dark' : 'light';
  }

  const palette =
    scheme === 'dark'
      ? definition.dark ?? definition.light
      : definition.light ?? definition.dark;

  if (!palette) {
    throw new Error(`皮肤 ${id} 缺少配色`);
  }

  return {
    ...palette,
    id: definition.id,
    name: definition.name,
    tagline: definition.tagline,
    mode: definition.mode,
    scheme,
  };
}
