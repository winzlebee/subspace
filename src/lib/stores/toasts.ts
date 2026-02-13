import { writable } from "svelte/store";

export interface Toast {
    id: number;
    message: string;
    type: "error" | "success" | "info";
}

export const toasts = writable<Toast[]>([]);

let toastCounter = 0;

export function addToast(
    message: string,
    type: "error" | "success" | "info" = "error"
) {
    const id = ++toastCounter;
    toasts.update((t) => [...t, { id, message, type }]);
    setTimeout(() => {
        toasts.update((t) => t.filter((toast) => toast.id !== id));
    }, 4000);
}

// Expose globally for legacy/external support if needed, but prefer importing addToast
if (typeof window !== "undefined") {
    (window as any).__subspace_toast = addToast;
}
