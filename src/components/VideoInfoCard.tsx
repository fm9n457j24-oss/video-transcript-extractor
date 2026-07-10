import type { ExtractResult } from '../../shared/types';
import { formatDuration } from '@/lib/platform';
import { cn } from '@/lib/utils';

export default function VideoInfoCard({ result }: { result: ExtractResult }) {
  const isBili = result.platform === 'bilibili';

  return (
    <div className="glass-card animate-fade-in-up flex gap-4 rounded-2xl p-4">
      <div className="shrink-0">
        {result.cover ? (
          <img
            src={result.cover}
            alt={result.title}
            className="h-24 w-40 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-24 w-40 items-center justify-center rounded-xl bg-ink-700 text-xs text-zinc-600">
            无封面
          </div>
        )}
      </div>

      <div className="relative min-w-0 flex-1 pr-16">
        <span
          className={cn(
            'absolute right-0 top-0 rounded-md px-2 py-0.5 text-xs font-medium',
            isBili ? 'bg-blue-500/15 text-blue-300' : 'bg-pink-500/15 text-pink-300'
          )}
        >
          {isBili ? 'B站' : '抖音'}
        </span>
        <h3 className="line-clamp-2 pr-14 font-display text-lg font-semibold text-zinc-100">
          {result.title}
        </h3>
        <p className="mt-1 text-sm text-zinc-400">{result.author}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">
            {formatDuration(result.duration)}
          </span>
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-xs',
              result.subtitleSource === 'subtitle'
                ? 'bg-neon-cyan/15 text-neon-cyan'
                : 'bg-neon-purple/15 text-neon-purple'
            )}
          >
            {result.subtitleSource === 'subtitle' ? '字幕' : '语音识别'}
          </span>
        </div>
      </div>
    </div>
  );
}
