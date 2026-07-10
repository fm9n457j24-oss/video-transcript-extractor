import type { HistoryItem } from '../../shared/types';

const STORAGE_KEY = 'video-transcript-history';
const MAX_ITEMS = 20;

// 获取全部历史记录（按时间倒序）
export function getHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// 新增一条历史记录到头部，超出上限截断
export function addHistory(item: HistoryItem): void {
  const list = getHistory();
  list.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
}

// 删除指定历史记录
export function deleteHistory(id: string): void {
  const list = getHistory().filter((it) => it.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// 清空全部历史记录
export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
