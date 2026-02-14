<script lang="ts">
    import { pinnedMessages } from "$lib/stores";

    import { onMount } from "svelte";
    import { getPinnedMessages, unpinMessage } from "$lib/api";
    import { type Message } from "$lib/types";
    import { fly } from "svelte/transition";
    import { marked } from "marked";

    let { channelId, onClose } = $props<{
        channelId: string;
        onClose: () => void;
    }>();

    let loading = $state(true);

    onMount(async () => {
        loadPins();
    });

    $effect(() => {
        if (channelId) loadPins();
    });

    async function loadPins() {
        loading = true;
        try {
            pinnedMessages.set(await getPinnedMessages(channelId));
        } catch (e) {
            console.error(e);
        } finally {
            loading = false;
        }
    }

    async function handleUnpin(msgId: string) {
        try {
            await unpinMessage(msgId);
        } catch (e) {
            console.error(e);
        }
    }

    function renderContent(content: string) {
        try {
            return marked.parseInline(content);
        } catch {
            return content;
        }
    }
</script>

<div
    class="w-80 border-l border-base-300 bg-base-100 flex flex-col h-full shadow-xl z-20"
    transition:fly={{ x: 300, duration: 200 }}
>
    <div
        class="h-12 flex items-center justify-between px-4 border-b border-base-300 shrink-0 bg-base-100"
    >
        <h3 class="font-bold text-base-content flex items-center gap-2">
            📌 Pinned Messages
        </h3>
        <button
            class="btn btn-ghost btn-sm btn-square"
            onclick={onClose}
            title="Close"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
            >
                <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                />
            </svg>
        </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-4">
        {#if loading}
            <div class="flex justify-center py-8">
                <span class="loading loading-spinner text-primary"></span>
            </div>
        {:else}
            {#each $pinnedMessages as pin (pin.id)}
                <div
                    class="bg-base-200/50 rounded-lg p-3 text-sm group relative hover:bg-base-200 transition-colors border border-transparent hover:border-base-300"
                >
                    <!-- Author & Time -->
                    <div class="flex items-center gap-2 mb-1.5">
                        <div
                            class="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0 overflow-hidden"
                        >
                            {#if pin.author?.avatar_url}
                                <img
                                    src={pin.author.avatar_url}
                                    alt=""
                                    class="w-full h-full object-cover"
                                />
                            {:else}
                                {(pin.author?.username ?? "?")[0].toUpperCase()}
                            {/if}
                        </div>
                        <span class="font-bold text-base-content"
                            >{pin.author?.username}</span
                        >
                        <span class="text-[10px] text-base-content/50"
                            >{new Date(
                                pin.created_at,
                            ).toLocaleDateString()}</span
                        >
                    </div>

                    <!-- Content -->
                    <div
                        class="text-base-content/80 line-clamp-6 prose prose-xs max-w-none prose-p:my-0 prose-a:text-primary"
                    >
                        {#if pin.content}
                            {@html renderContent(pin.content)}
                        {:else}
                            <span class="italic text-base-content/40"
                                >(Attachment only)</span
                            >
                        {/if}
                    </div>

                    <!-- Attachments indicator -->
                    {#if pin.attachments?.length > 0}
                        <div class="mt-2 text-xs text-primary flex gap-2">
                            {#each pin.attachments as att}
                                <span
                                    class="flex items-center gap-1 bg-primary/10 px-1.5 py-0.5 rounded"
                                >
                                    📎 {att.file_name}
                                </span>
                            {/each}
                        </div>
                    {/if}

                    <button
                        class="absolute top-2 right-2 btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 bg-base-100 shadow-sm"
                        title="Unpin"
                        onclick={() => handleUnpin(pin.id)}
                    >
                        ✕
                    </button>
                </div>
            {:else}
                <div
                    class="flex flex-col items-center justify-center py-12 text-base-content/40 gap-2 text-center"
                >
                    <span class="text-4xl">📌</span>
                    <span class="text-sm"
                        >No pinned messages in this channel yet.</span
                    >
                </div>
            {/each}
        {/if}
    </div>
</div>
