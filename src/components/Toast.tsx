import { CheckCircle2, XCircle, X } from 'lucide-react';
import { useToastStore } from '@/store/useToastStore';
import { cn } from '@/lib/utils';

export default function Toast() {
  const { toasts, remove } = useToastStore();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'glass-card flex min-w-[240px] items-center gap-3 rounded-xl px-4 py-3 animate-fade-in-up',
            t.type === 'success' ? 'border-neon-cyan/40' : 'border-red-500/40'
          )}
        >
          {t.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-neon-cyan" />
          ) : (
            <XCircle className="h-5 w-5 shrink-0 text-red-400" />
          )}
          <span className="flex-1 text-sm text-zinc-200">{t.message}</span>
          <button
            onClick={() => remove(t.id)}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
