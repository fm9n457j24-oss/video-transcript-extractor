import { Loader2, Music, Search } from 'lucide-react';
import type { Platform } from '../../shared/types';
import { useExtractStore } from '@/store/useExtractStore';
import { cn } from '@/lib/utils';

function PlatformIcon({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  if (platform === 'bilibili') {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="6" width="20" height="14" rx="3" />
        <path d="M7 2l4 4M17 2l-4 4" />
        <path d="M9 12v2M15 12v2" />
      </svg>
    );
  }
  if (platform === 'douyin') {
    return <Music className={className} />;
  }
  return <Search className={className} />;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  bilibili: 'B站',
  douyin: '抖音',
  unknown: '未识别',
};

export default function UrlInput() {
  const { url, platform, status, setUrl, extract } = useExtractStore();
  const isBusy = status === 'extracting' || status === 'polling';
  const disabled = !url.trim() || isBusy;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disabled) void extract();
  };

  return (
    <div className="text-center">
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
        <span className="gradient-text">提取视频文案</span>
      </h1>
      <p className="mt-3 text-sm text-zinc-400 sm:text-base">
        粘贴B站或抖音视频链接，一键获取视频文字内容
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
        <div
          className={cn(
            'group flex items-center gap-3 rounded-2xl border border-ink-600 bg-ink-800 px-4 py-3 transition-colors',
            'focus-within:border-neon-purple focus-within:animate-border-glow'
          )}
        >
          <PlatformIcon platform={platform} className="h-5 w-5 shrink-0 text-zinc-400" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="粘贴B站/抖音视频链接..."
            className="flex-1 bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-500"
            disabled={isBusy}
          />
          {platform !== 'unknown' && (
            <span
              className={cn(
                'rounded-md px-2 py-0.5 text-xs font-medium',
                platform === 'bilibili'
                  ? 'bg-blue-500/15 text-blue-300'
                  : 'bg-pink-500/15 text-pink-300'
              )}
            >
              {PLATFORM_LABEL[platform]}
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={disabled}
          className={cn(
            'flex items-center justify-center gap-2 rounded-xl bg-gradient-primary px-6 py-3.5 font-medium text-white transition-all',
            disabled
              ? 'cursor-not-allowed opacity-50'
              : 'hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]'
          )}
        >
          {isBusy ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {status === 'polling' ? '识别中...' : '提取中...'}
            </>
          ) : (
            <>
              <Search className="h-5 w-5" />
              提取文案
            </>
          )}
        </button>
      </form>
    </div>
  );
}
