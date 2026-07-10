import { Check, Link2, Video, Captions, AudioLines } from 'lucide-react';
import { useExtractStore } from '@/store/useExtractStore';
import { cn } from '@/lib/utils';

const STEPS = [
  { label: '解析链接', icon: Link2 },
  { label: '获取视频信息', icon: Video },
  { label: '提取字幕/音频', icon: Captions },
  { label: '语音识别', icon: AudioLines },
];

export default function ExtractionStatus() {
  const { status, step } = useExtractStore();
  const progress = Math.min(100, Math.round((step / 4) * 100));

  return (
    <div className="glass-card animate-fade-in-up rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-zinc-400">
          {status === 'success'
            ? '提取完成'
            : status === 'error'
              ? '提取失败'
              : '正在处理...'}
        </span>
        <span className="font-mono text-sm text-neon-purple">{progress}%</span>
      </div>

      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
        <div
          className="h-full bg-gradient-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => {
          const stepNum = i + 1;
          const isDone = step > stepNum || status === 'success';
          const isCurrent =
            step === stepNum && status !== 'success' && status !== 'error';
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="flex flex-col items-center gap-2 text-center"
            >
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border transition-all',
                  isDone && 'border-green-500/50 bg-green-500/10 text-green-400',
                  isCurrent &&
                    'border-neon-purple text-neon-purple animate-pulse-slow',
                  !isDone &&
                    !isCurrent &&
                    'border-ink-600 text-zinc-600'
                )}
              >
                {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <span
                className={cn(
                  'text-xs',
                  isDone || isCurrent ? 'text-zinc-200' : 'text-zinc-600'
                )}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
