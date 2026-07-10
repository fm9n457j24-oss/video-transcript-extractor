import { Copy, Download, Trash2 } from 'lucide-react';
import type { ExtractResult } from '../../shared/types';
import { formatTime } from '@/lib/platform';
import { useExtractStore } from '@/store/useExtractStore';
import { useToastStore } from '@/store/useToastStore';

export default function TranscriptResult({ result }: { result: ExtractResult }) {
  const show = useToastStore((s) => s.show);
  const reset = useExtractStore((s) => s.reset);
  const fullText = result.transcript.map((s) => s.text).join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      show('success', '已复制到剪贴板');
    } catch {
      show('error', '复制失败');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.title || 'transcript'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    show('success', '已开始下载');
  };

  return (
    <div className="glass-card animate-fade-in-up overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
        <h3 className="font-display font-semibold text-zinc-100">文案内容</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            title="复制"
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-ink-700 hover:text-neon-purple"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={handleDownload}
            title="下载TXT"
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-ink-700 hover:text-neon-purple"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={reset}
            title="清空"
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-ink-700 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="max-h-[480px] overflow-y-auto p-5 font-mono text-sm leading-relaxed">
        {result.transcript.length === 0 ? (
          <p className="text-zinc-500">暂无文案内容</p>
        ) : (
          result.transcript.map((seg, i) => (
            <p key={i} className="mb-3 flex gap-2">
              <span className="mt-0.5 shrink-0 text-xs text-zinc-500">
                [{formatTime(seg.start)}]
              </span>
              <span className="text-zinc-100">{seg.text}</span>
            </p>
          ))
        )}
      </div>
    </div>
  );
}
