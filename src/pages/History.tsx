import { useState, useEffect } from 'react';
import { Clock, Copy, Trash2 } from 'lucide-react';
import type { HistoryItem } from '../../shared/types';
import Navbar from '@/components/Navbar';
import { getHistory, deleteHistory, clearHistory } from '@/lib/history';
import { formatTime } from '@/lib/platform';
import { useToastStore } from '@/store/useToastStore';
import { cn } from '@/lib/utils';

export default function History() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const show = useToastStore((s) => s.show);

  useEffect(() => {
    setItems(getHistory());
  }, []);

  const reload = () => setItems(getHistory());

  const handleDelete = (id: string) => {
    deleteHistory(id);
    reload();
  };

  const handleClear = () => {
    clearHistory();
    reload();
    show('success', '已清空全部记录');
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      show('success', '已复制到剪贴板');
    } catch {
      show('error', '复制失败');
    }
  };

  return (
    <div className="relative min-h-screen">
      <div className="bg-glow" />
      <div className="bg-glow-2" />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-[960px] px-4 pb-16 pt-28">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display gradient-text text-3xl font-bold">历史记录</h1>
          {items.length > 0 && (
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 bg-ink-800 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
              清空全部
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="glass-card animate-fade-in rounded-2xl p-12 text-center">
            <Clock className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
            <p className="text-zinc-500">暂无历史记录</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const isExpanded = expanded === item.id;
              const isBili = item.platform === 'bilibili';
              return (
                <div
                  key={item.id}
                  className="glass-card animate-fade-in-up rounded-2xl p-4"
                >
                  <div className="flex gap-3">
                    {item.cover ? (
                      <img
                        src={item.cover}
                        alt={item.title}
                        className="h-16 w-28 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-16 w-28 shrink-0 rounded-lg bg-ink-700" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <h3 className="line-clamp-1 flex-1 font-display font-semibold text-zinc-100">
                          {item.title}
                        </h3>
                        <span
                          className={cn(
                            'shrink-0 rounded-md px-2 py-0.5 text-xs',
                            isBili
                              ? 'bg-blue-500/15 text-blue-300'
                              : 'bg-pink-500/15 text-pink-300'
                          )}
                        >
                          {isBili ? 'B站' : '抖音'}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-zinc-500">
                        {item.author} · {new Date(item.createdAt).toLocaleString('zh-CN')}
                      </p>
                      <p className="mt-1.5 line-clamp-1 text-sm text-zinc-400">
                        {item.transcriptText.slice(0, 100)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={() => setExpanded(isExpanded ? null : item.id)}
                      className="text-xs text-neon-purple hover:underline"
                    >
                      {isExpanded ? '收起' : '查看完整文案'}
                    </button>
                    <button
                      onClick={() => handleCopy(item.transcriptText)}
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-neon-purple"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      复制
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 max-h-72 overflow-y-auto rounded-lg bg-ink-900/60 p-3 font-mono text-sm text-zinc-200">
                      {item.transcriptSegments.length > 0 ? (
                        item.transcriptSegments.map((seg, i) => (
                          <p key={i} className="mb-2 flex gap-2">
                            <span className="mt-0.5 shrink-0 text-xs text-zinc-500">
                              [{formatTime(seg.start)}]
                            </span>
                            <span>{seg.text}</span>
                          </p>
                        ))
                      ) : (
                        <p className="whitespace-pre-wrap text-zinc-400">
                          {item.transcriptText}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
