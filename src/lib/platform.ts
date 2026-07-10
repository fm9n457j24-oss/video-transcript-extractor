import type { Platform } from '../../shared/types';

// 检测视频链接所属平台
export function detectPlatform(url: string): Platform {
  const lower = url.toLowerCase();
  if (
    lower.includes('bilibili.com') ||
    lower.includes('b23.tv') ||
    /bv[0-9a-z]+/i.test(url)
  ) {
    return 'bilibili';
  }
  if (lower.includes('douyin.com') || lower.includes('iesdouyin.com')) {
    return 'douyin';
  }
  return 'unknown';
}

// 格式化秒数为 mm:ss 或 hh:mm:ss
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

// 格式化视频时长展示
export function formatDuration(seconds: number): string {
  return formatTime(seconds);
}
