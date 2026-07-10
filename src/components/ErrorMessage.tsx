import { AlertCircle, RefreshCw } from 'lucide-react';
import { useExtractStore } from '@/store/useExtractStore';

export default function ErrorMessage() {
  const { error, extract, url } = useExtractStore();

  return (
    <div className="glass-card animate-fade-in flex items-start gap-3 rounded-2xl border-red-500/40 p-5">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
      <div className="flex-1">
        <p className="text-sm text-zinc-200">{error || '发生未知错误'}</p>
        <button
          onClick={() => void extract()}
          disabled={!url.trim()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          重试
        </button>
      </div>
    </div>
  );
}
