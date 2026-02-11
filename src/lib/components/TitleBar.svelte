<script lang="ts">
    import { onMount } from "svelte";
    import { APP_NAME } from "$lib/config";

    let appWindow: any = null;
    let isTauri = false;

    onMount(async () => {
        // Check if running in Tauri
        if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
            isTauri = true;
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            appWindow = getCurrentWindow();
        }
    });

    async function minimize() {
        if (appWindow) await appWindow.minimize();
    }

    async function toggleMaximize() {
        if (appWindow) await appWindow.toggleMaximize();
    }

    async function close() {
        if (appWindow) await appWindow.close();
    }
</script>

{#if isTauri}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="h-8 flex items-center bg-base-300 select-none shrink-0"
        data-tauri-drag-region
    >
        <!-- App title -->
        <div
            class="flex items-center gap-2 px-3 pointer-events-none"
            data-tauri-drag-region
        >
            <span
                class="text-xs font-semibold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"
            >
                {APP_NAME}
            </span>
        </div>

        <!-- Drag region fills middle -->
        <div class="flex-1" data-tauri-drag-region></div>

        <!-- Window controls -->
        <div class="flex items-center h-full">
            <button
                class="h-full px-3 hover:bg-base-content/10 transition-colors flex items-center justify-center"
                onclick={minimize}
                title="Minimize"
            >
                <svg
                    class="w-3 h-3 text-base-content/60"
                    viewBox="0 0 12 12"
                    fill="currentColor"
                >
                    <rect y="5" width="10" height="1.5" rx="0.75" />
                </svg>
            </button>
            <button
                class="h-full px-3 hover:bg-base-content/10 transition-colors flex items-center justify-center"
                onclick={toggleMaximize}
                title="Maximize"
            >
                <svg
                    class="w-3 h-3 text-base-content/60"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                >
                    <rect x="1" y="1" width="9" height="9" rx="1" />
                </svg>
            </button>
            <button
                class="h-full px-3 hover:bg-red-500/80 hover:text-white transition-colors flex items-center justify-center"
                onclick={close}
                title="Close"
            >
                <svg
                    class="w-3 h-3 text-base-content/60"
                    viewBox="0 0 12 12"
                    fill="currentColor"
                >
                    <path
                        d="M1.5 1.5l9 9M10.5 1.5l-9 9"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        fill="none"
                    />
                </svg>
            </button>
        </div>
    </div>
{/if}
