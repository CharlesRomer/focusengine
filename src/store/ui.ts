import { create } from 'zustand'
import type { ToastItem } from '@/components/shared/Toast'

interface UIState {
  sidebarOpen: boolean
  toasts: ToastItem[]
  setSidebarOpen: (open: boolean) => void
  addToast: (message: string, type: ToastItem['type']) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toasts: [],
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  addToast: (message, type) => {
    const id = crypto.randomUUID()
    set(state => ({
      toasts: [...state.toasts.slice(-2), { id, message, type }],
    }))
  },
  removeToast: (id) => set(state => ({
    toasts: state.toasts.filter(t => t.id !== id),
  })),
}))

export function toast(message: string, type: ToastItem['type'] = 'info') {
  useUIStore.getState().addToast(message, type)
}
