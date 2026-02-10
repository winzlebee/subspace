<script lang="ts">
    import { messages, currentChannel, currentUser } from "$lib/stores";
    import { createMessage } from "$lib/api";
    import { wsSendTyping } from "$lib/ws";
    import { onMount, tick } from "svelte";

    let messageInput = $state("");
    let messagesContainer: HTMLDivElement | undefined = $state();
    let typingTimeout: ReturnType<typeof setTimeout> | null = null;

    $effect(() => {
        if ($messages) {
            tick().then(() => scrollToBottom());
        }
    });

    function scrollToBottom() {
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    async function handleSend() {
        const content = messageInput.trim();
        if (!content || !$currentChannel) return;
        messageInput = "";
        try {
            await createMessage($currentChannel.id, content);
        } catch (e) {
            console.error("Send error:", e);
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        } else {
            // Typing indicator throttle
            if (!typingTimeout && $currentChannel) {
                wsSendTyping($currentChannel.id);
                typingTimeout = setTimeout(() => {
                    typingTimeout = null;
                }, 3000);
            }
        }
    }

    function formatTime(dateStr: string): string {
        const d = new Date(dateStr);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) {
            return d.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            });
        }
        return (
            d.toLocaleDateString([], { month: "short", day: "numeric" }) +
            " " +
            d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        );
    }
</script>

<div class="flex flex-col flex-1 min-w-0">
    <!-- Channel header -->
    <div
        class="h-12 flex items-center px-4 gap-2 shadow-sm bg-base-100 border-b border-base-300 shrink-0"
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-base-content/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
        >
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
            />
        </svg>
        <h3 class="font-semibold text-base-content">
            {$currentChannel?.name ?? ""}
        </h3>
    </div>

    <!-- Messages -->
    <div
        bind:this={messagesContainer}
        class="flex-1 overflow-y-auto p-4 space-y-1"
    >
        {#each $messages as msg, i (msg.id)}
            {@const prevMsg = i > 0 ? $messages[i - 1] : null}
            {@const sameAuthor = prevMsg && prevMsg.author_id === msg.author_id}
            {@const timeDiff = prevMsg
                ? new Date(msg.created_at).getTime() -
                  new Date(prevMsg.created_at).getTime()
                : Infinity}
            {@const grouped = sameAuthor && timeDiff < 300000}

            {#if !grouped}
                <div
                    class="flex gap-3 pt-3 hover:bg-base-200/30 px-2 rounded-lg group"
                >
                    <!-- Avatar -->
                    <div
                        class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0 mt-0.5"
                    >
                        {#if msg.author?.avatar_url}
                            <img
                                src={msg.author.avatar_url}
                                alt=""
                                class="w-full h-full rounded-full object-cover"
                            />
                        {:else}
                            {(msg.author?.username ?? "?")[0].toUpperCase()}
                        {/if}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-2">
                            <span
                                class="font-semibold text-sm text-base-content"
                                >{msg.author?.username ?? "Unknown"}</span
                            >
                            <span class="text-xs text-base-content/40"
                                >{formatTime(msg.created_at)}</span
                            >
                            {#if msg.edited_at}
                                <span class="text-xs text-base-content/30"
                                    >(edited)</span
                                >
                            {/if}
                        </div>
                        <p
                            class="text-sm text-base-content/90 whitespace-pre-wrap break-words"
                        >
                            {msg.content ?? ""}
                        </p>

                        <!-- Attachments -->
                        {#if msg.attachments.length > 0}
                            <div class="flex flex-wrap gap-2 mt-1">
                                {#each msg.attachments as att}
                                    {#if att.mime_type.startsWith("image/")}
                                        <img
                                            src={att.file_url}
                                            alt={att.file_name}
                                            class="max-w-xs max-h-60 rounded-lg"
                                        />
                                    {:else}
                                        <a
                                            href={att.file_url}
                                            target="_blank"
                                            class="link link-primary text-sm"
                                            >📎 {att.file_name}</a
                                        >
                                    {/if}
                                {/each}
                            </div>
                        {/if}

                        <!-- Reactions -->
                        {#if msg.reactions.length > 0}
                            <div class="flex flex-wrap gap-1 mt-1">
                                {#each msg.reactions as reaction}
                                    <span
                                        class="badge badge-sm badge-ghost gap-1 cursor-pointer hover:bg-primary/20"
                                    >
                                        {reaction.emoji}
                                        {reaction.count}
                                    </span>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            {:else}
                <!-- Grouped (same author, close time) -->
                <div
                    class="flex gap-3 hover:bg-base-200/30 px-2 rounded-lg group"
                >
                    <div class="w-10 shrink-0 flex items-start justify-center">
                        <span
                            class="text-[10px] text-base-content/0 group-hover:text-base-content/30 transition-colors"
                        >
                            {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p
                            class="text-sm text-base-content/90 whitespace-pre-wrap break-words"
                        >
                            {msg.content ?? ""}
                        </p>
                    </div>
                </div>
            {/if}
        {/each}
    </div>

    <!-- Input -->
    <div class="px-4 pb-4 shrink-0">
        <div class="bg-base-300 rounded-lg flex items-end">
            <textarea
                class="textarea textarea-ghost flex-1 resize-none min-h-[44px] max-h-40 text-sm border-none focus:outline-none bg-transparent"
                placeholder="Message #{$currentChannel?.name ?? '...'}"
                bind:value={messageInput}
                on:keydown={handleKeydown}
                rows="1"
            ></textarea>
            <button
                class="btn btn-ghost btn-sm m-1 text-primary"
                on:click={handleSend}
                disabled={!messageInput.trim()}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                </svg>
            </button>
        </div>
    </div>
</div>
