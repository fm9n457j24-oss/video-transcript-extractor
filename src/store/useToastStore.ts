import { create } from 'zustand';

export type ToastType = 'success' | 'error';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  show: (type: ToastType, message: string) => void;
  remove: (id: string) => void;
}

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  show: (type, message) => {
    const id = genId();
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// 便于在非组件代码中触发 Toast
export const toast = (type: ToastType, message: string) =>
  useToastStore.getState().show(type, message);
