/**
 * 记账弹层快捷输入接口:
 * - 弹层打开时一次拿全「最近一笔日期 + 收藏备注 + 各分类高频备注」;
 * - 收藏 / 不再推荐走 note-presets 的 upsert 与删除。
 *
 * 这些数据全部是「锦上添花」:调用方失败时应静默降级,不阻塞记账主流程。
 */
import type { ApiResponse, NotePresetKind, QuickInputs } from '../types';
import client, { unwrap } from './client';

/** 自动推荐统计窗口(天)与每个分类的候选上限,与后端默认值一致。 */
const QUICK_INPUT_DAYS = 90;
const QUICK_INPUT_PER_CATEGORY = 6;

export const fetchQuickInputs = async (): Promise<QuickInputs> => {
  const response = await client.get<ApiResponse<QuickInputs>>(
    '/transactions/quick-inputs',
    {
      params: {
        days: QUICK_INPUT_DAYS,
        per_category: QUICK_INPUT_PER_CATEGORY,
      },
    },
  );
  return unwrap(response.data);
};

export interface NotePresetResult {
  note: string;
  kind: NotePresetKind;
}

/** 收藏(kind='pinned')或不再推荐(kind='hidden')某条备注;后端按 (user, note) upsert。 */
export const setNotePreset = async (
  note: string,
  kind: NotePresetKind,
): Promise<NotePresetResult> => {
  const response = await client.post<ApiResponse<NotePresetResult>>(
    '/transactions/note-presets',
    { note, kind },
  );
  return unwrap(response.data);
};

export interface NotePresetRemoveResult {
  note: string;
  deleted: boolean;
}

/** 删除该备注的收藏 / 不再推荐记录。 */
export const removeNotePreset = async (
  note: string,
): Promise<NotePresetRemoveResult> => {
  const response = await client.delete<ApiResponse<NotePresetRemoveResult>>(
    '/transactions/note-presets',
    { params: { note } },
  );
  return unwrap(response.data);
};
