<script lang="ts">
    import {
        messages,
        currentChannel,
        currentUser,
        typingUsers,
        currentChannelId,
    } from "$lib/stores";
    import { createMessage, uploadFile } from "$lib/api";
    import { wsSendTyping } from "$lib/ws";
    import { onMount, tick } from "svelte";
    import { fade, slide } from "svelte/transition";

    let messageInput = $state("");
    let messagesContainer: HTMLDivElement | undefined = $state();
    let typingTimeout: ReturnType<typeof setTimeout> | null = null;
    let fileInput: HTMLInputElement | undefined = $state();
    let isUploading = $state(false);

    // Scroll to bottom when messages change
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
            const newMsg = await createMessage($currentChannel.id, content);
            messages.update((msgs) => {
                if (msgs.some((m) => m.id === newMsg.id)) return msgs;
                return [...msgs, newMsg];
            });
        } catch (e) {
            console.error("Send error:", e);
        }
    }

    async function handleFileUpload(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file || !$currentChannel) return;

        isUploading = true;
        try {
            const result = await uploadFile(file);

            const content = result.mime_type.startsWith("image/")
                ? `![${result.file_name}](${result.url})`
                : `[${result.file_name}](${result.url})`;

            const newMsg = await createMessage($currentChannel.id, content);
            messages.update((msgs) => {
                if (msgs.some((m) => m.id === newMsg.id)) return msgs;
                return [...msgs, newMsg];
            });
        } catch (e) {
            console.error("Upload error:", e);
        } finally {
            isUploading = false;
            if (fileInput) fileInput.value = "";
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

    function triggerEmojiPicker() {
        const textarea = document.querySelector("textarea");
        textarea?.focus();
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

    // Reactive typing users for current channel
    let typingList = $derived($typingUsers[$currentChannelId ?? ""] || []);
    let typingText = $derived(() => {
        if (typingList.length === 0) return "";
        const names = typingList.map((t) => t.user.username);
        if (names.length === 1) return `${names[0]} is typing...`;
        if (names.length === 2)
            return `${names[0]} and ${names[1]} are typing...`;
        return `${names[0]}, ${names[1]}, and others are typing...`;
    });
</script>

<div class="flex flex-col flex-1 min-w-0 min-h-0 h-full relative">
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
        {#if $currentChannel?.topic}
            <span
                class="text-xs text-base-content/40 hidden sm:inline-block border-l border-base-content/10 pl-2 ml-2 truncate"
            >
                {$currentChannel.topic}
            </span>
        {/if}
    </div>

    <!-- Messages -->
    <div
        bind:this={messagesContainer}
        class="flex-1 overflow-y-auto p-4 space-y-1 scroll-smooth"
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
                        class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0 mt-0.5 overflow-hidden"
                    >
                        {#if msg.author?.avatar_url}
                            <img
                                src={msg.author.avatar_url}
                                alt=""
                                class="w-full h-full object-cover"
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

                        <!-- Content with markdown-like rendering for images -->
                        <div
                            class="text-sm text-base-content/90 whitespace-pre-wrap break-words"
                        >
                            {#if msg.content}
                                {@html msg.content
                                    .replace(
                                        /!\[(.*?)\]\((.*?)\)/g,
                                        '<img src="$2" alt="$1" class="max-w-md max-h-80 rounded-lg mt-2 mb-1" />',
                                    )
                                    .replace(
                                        /\[(.*?)\]\((.*?)\)/g,
                                        '<a href="$2" target="_blank" class="link link-primary">$1</a>',
                                    )}
                            {/if}
                        </div>

                        <!-- Attachments (Native) -->
                        {#if msg.attachments?.length > 0}
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
                                            class="link link-primary text-sm flex items-center gap-1"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                class="h-4 w-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                                />
                                            </svg>
                                            {att.file_name}
                                        </a>
                                    {/if}
                                {/each}
                            </div>
                        {/if}

                        <!-- Reactions -->
                        {#if msg.reactions?.length > 0}
                            <div class="flex flex-wrap gap-1 mt-1">
                                {#each msg.reactions as reaction}
                                    <button
                                        class="badge badge-sm badge-ghost gap-1 cursor-pointer hover:bg-primary/20 transition-colors"
                                    >
                                        {reaction.emoji}
                                        {reaction.count}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            {:else}
                <!-- Grouped (same author) -->
                <div
                    class="flex gap-3 hover:bg-base-200/30 px-2 rounded-lg group"
                >
                    <div class="w-10 shrink-0 flex items-start justify-center">
                        <span
                            class="text-[10px] text-base-content/0 group-hover:text-base-content/30 transition-colors mt-1"
                        >
                            {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div
                            class="text-sm text-base-content/90 whitespace-pre-wrap break-words"
                        >
                            {#if msg.content}
                                {@html msg.content
                                    .replace(
                                        /!\[(.*?)\]\((.*?)\)/g,
                                        '<img src="$2" alt="$1" class="max-w-md max-h-80 rounded-lg mt-2 mb-1" />',
                                    )
                                    .replace(
                                        /\[(.*?)\]\((.*?)\)/g,
                                        '<a href="$2" target="_blank" class="link link-primary">$1</a>',
                                    )}
                            {/if}
                        </div>
                        <!-- Attachments (Native) for grouped -->
                        {#if msg.attachments?.length > 0}
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
                    </div>
                </div>
            {/if}
        {/each}
        <div class="h-2"></div>
    </div>

    <!-- Input -->
    <div class="px-4 pb-4 shrink-0">
        <!-- Typing Indicator -->
        {#if typingList.length > 0}
            <div
                class="absolute -top-6 left-6 text-xs font-semibold text-base-content/70 animate-pulse flex items-center gap-1"
                transition:slide
            >
                <span class="loading loading-dots loading-xs"></span>
                {typingText()}
            </div>
        {/if}

        <div
            class="bg-base-300 rounded-lg flex items-end p-1 shadow-inner relative ring-focus-within"
        >
            <!-- File Upload Button -->
            <input
                type="file"
                class="hidden"
                bind:this={fileInput}
                onchange={handleFileUpload}
                disabled={isUploading}
            />
            <button
                class="btn btn-circle btn-ghost btn-sm mb-1 text-base-content/60 hover:text-primary"
                onclick={() => fileInput?.click()}
                disabled={isUploading}
                title="Upload file"
                aria-label="Upload file"
            >
                {#if isUploading}
                    <span class="loading loading-spinner loading-xs"></span>
                {:else}
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                    >
                        <path
                            fill-rule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                            clip-rule="evenodd"
                        />
                    </svg>
                {/if}
            </button>

            <textarea
                class="textarea textarea-ghost flex-1 resize-none min-h-[44px] max-h-40 text-sm border-none focus:outline-none bg-transparent py-3"
                placeholder="Message #{$currentChannel?.name ?? '...'}"
                bind:value={messageInput}
                onkeydown={handleKeydown}
                rows="1"
            ></textarea>

            <!-- Emoji Button (Placeholder / Native trigger) -->
            <button
                class="btn btn-circle btn-ghost btn-sm mb-1 text-base-content/60 hover:text-warning"
                onclick={triggerEmojiPicker}
                title="Emoji"
                aria-label="Emoji picker"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a1 1 0 10-1.415-1.414 3 3 0 01-4.242 0 1 1 0 00-1.415 1.414 5 5 0 007.072 0z"
                        clip-rule="evenodd"
                    />
                </svg>
            </button>

            {#if messageInput.trim()}
                <button
                    class="btn btn-ghost btn-sm mb-1 text-primary hover:bg-primary/20 transition-all"
                    onclick={handleSend}
                    aria-label="Send message"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                    >
                        <path
                            d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"
                        />
                    </svg>
                </button>
            {/if}
        </div>
    </div>
</div>
