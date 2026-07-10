import { Link } from 'react-router-dom';
import { Clapperboard, Clock } from 'lucide-react';

export default function Navbar() {
  return (
    <nav className="glass-card fixed inset-x-0 top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="group flex items-center gap-2">
          <div className="rounded-lg bg-gradient-primary p-1.5">
            <Clapperboard className="h-5 w-5 text-white" />
          </div>
          <span className="font-display text-lg font-semibold text-zinc-100">
            视频文案提取器
          </span>
        </Link>
        <Link
          to="/history"
          className="flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-neon-purple"
        >
          <Clock className="h-4 w-4" />
          <span>历史记录</span>
        </Link>
      </div>
    </nav>
  );
}
