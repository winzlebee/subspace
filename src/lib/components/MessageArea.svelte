<script lang="ts">
    import {
        messages,
        currentChannel,
        currentUser,
        typingUsers,
        currentChannelId,
        members,
        pinnedMessages,
    } from "$lib/stores";
    import {
        createMessage,
        uploadFile,
        pinMessage,
        unpinMessage,
        addReaction,
        removeReaction,
        deleteMessage,
        editMessage,
        getFileUrl,
    } from "$lib/api";
    import { wsSendTyping } from "$lib/ws";
    import { onMount, tick } from "svelte";
    import { fade, slide } from "svelte/transition";
    import { marked } from "marked";

    import PinnedMessages from "./PinnedMessages.svelte";
    import EmojiPicker from "./EmojiPicker.svelte";

    let messageInput = $state("");
    let messagesContainer: HTMLDivElement | undefined = $state();
    let typingTimeout: ReturnType<typeof setTimeout> | null = null;
    let fileInput: HTMLInputElement | undefined = $state();
    let isUploading = $state(false);
    let showPins = $state(false);

    // Emoji Picker State
    // Emoji Picker State
    let showEmojiPicker = $state(false);
    let emojiPickerTarget: "input" | { msgId: string } | null = $state(null);
    let emojiPickerTrigger: HTMLElement | null = $state(null);

    function handleEmojiSelect(emoji: string) {
        if (emojiPickerTarget === "input") {
            messageInput += emoji;
        } else if (emojiPickerTarget && typeof emojiPickerTarget === "object") {
            addReaction(emojiPickerTarget.msgId, emoji).catch(console.error);
        }
        showEmojiPicker = false;
        emojiPickerTarget = null;
        emojiPickerTrigger = null;
    }

    function toggleEmojiPicker(
        target: "input" | { msgId: string },
        event: MouseEvent,
    ) {
        if (
            showEmojiPicker &&
            JSON.stringify(emojiPickerTarget) === JSON.stringify(target)
        ) {
            showEmojiPicker = false;
            emojiPickerTarget = null;
            emojiPickerTrigger = null;
            return;
        }

        emojiPickerTarget = target;
        emojiPickerTrigger = event.currentTarget as HTMLElement;
        showEmojiPicker = true;
    }

    // Mention autocomplete
    let showMentions = $state(false);
    let mentionQuery = $state("");
    let mentionStartIdx = $state(-1);
    let mentionResults = $derived(
        mentionQuery.length === 0
            ? [
                  { id: "here", username: "here", special: true },
                  { id: "everyone", username: "everyone", special: true },
                  ...$members.map((m) => ({
                      id: m.user_id,
                      username: m.username,
                      special: false,
                  })),
              ]
            : [
                  ...["here", "everyone"]
                      .filter((s) =>
                          s
                              .toLowerCase()
                              .startsWith(mentionQuery.toLowerCase()),
                      )
                      .map((s) => ({
                          id: s,
                          username: s,
                          special: true,
                      })),
                  ...$members
                      .filter((m) =>
                          m.username
                              .toLowerCase()
                              .startsWith(mentionQuery.toLowerCase()),
                      )
                      .map((m) => ({
                          id: m.user_id,
                          username: m.username,
                          special: false,
                      })),
              ],
    );

    // Configure marked for inline rendering (no wrapping <p>)
    const renderer = new marked.Renderer();
    renderer.image = function ({ href, title, text }) {
        return `<img src="${getFileUrl(href)}" alt="${text}" title="${title || ""}" class="max-w-xs max-h-60 rounded-lg" />`;
    };
    renderer.paragraph = ({ text }) => `${text}`;

    function renderMarkdown(content: string): string {
        // Highlight @mentions before markdown processing
        let processed = content.replace(
            /@(here|everyone|\w+)/g,
            '<span class="badge badge-sm badge-primary/20 text-primary font-semibold">@$1</span>',
        );
        try {
            return marked.parseInline(processed, { renderer }) as string;
        } catch {
            return processed;
        }
    }

    function isOnlyEmojis(str: string): boolean {
        if (!str) return false;
        // Check if string contains only emojis and whitespace
        // Using \p{Extended_Pictographic} which covers most modern emojis
        // and \p{Emoji_Presentation} for things like ☺️
        try {
            const regex =
                /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\s)+$/u;
            return (
                regex.test(str) &&
                /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u.test(str)
            );
        } catch (e) {
            // Fallback for older environments if needed
            return false;
        }
    }

    // Scroll to bottom when messages change
    $effect(() => {
        if ($messages) {
            tick().then(() => scrollToBottom());
        }
    });

    // Close pins view when channel changes
    $effect(() => {
        if ($currentChannelId) {
            showPins = false;
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
        if (showMentions) {
            if (e.key === "Escape") {
                e.preventDefault();
                showMentions = false;
                return;
            }
            if (e.key === "Tab" || e.key === "Enter") {
                if (mentionResults.length > 0) {
                    e.preventDefault();
                    selectMention(mentionResults[0]);
                    return;
                }
            }
        }
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

    function handleInput(e: Event) {
        const textarea = e.target as HTMLTextAreaElement;
        const val = textarea.value;
        const cursor = textarea.selectionStart;

        // Check for @ mention trigger
        const before = val.slice(0, cursor);
        const atIdx = before.lastIndexOf("@");
        if (
            atIdx >= 0 &&
            (atIdx === 0 ||
                before[atIdx - 1] === " " ||
                before[atIdx - 1] === "\n")
        ) {
            const query = before.slice(atIdx + 1);
            if (!query.includes(" ")) {
                showMentions = true;
                mentionQuery = query;
                mentionStartIdx = atIdx;
                return;
            }
        }
        showMentions = false;
    }

    function selectMention(mention: {
        id: string;
        username: string;
        special: boolean;
    }) {
        const before = messageInput.slice(0, mentionStartIdx);
        const after = messageInput.slice(
            mentionStartIdx + 1 + mentionQuery.length,
        );
        messageInput = `${before}@${mention.username} ${after}`;
        showMentions = false;
    }

    async function togglePin(msg: { id: string; pinned: boolean }) {
        try {
            if (msg.pinned) {
                await unpinMessage(msg.id);
            } else {
                await pinMessage(msg.id);
            }
        } catch (e) {
            console.error("Pin toggle error:", e);
        }
    }

    async function handleReaction(msgId: string, event: MouseEvent) {
        toggleEmojiPicker({ msgId }, event);
    }

    async function handleDelete(msgId: string) {
        if (!confirm("Delete this message?")) return;
        try {
            await deleteMessage(msgId);
            messages.update((msgs) => msgs.filter((m) => m.id !== msgId));
            pinnedMessages.update((pins) => pins.filter((p) => p.id !== msgId));
        } catch (e) {
            console.error("Delete error:", e);
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

<div
    class="flex flex-row flex-1 min-w-0 min-h-0 h-full relative overflow-hidden"
>
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
            <h3
                class="font-semibold text-base-content whitespace-nowrap overflow-hidden text-ellipsis"
            >
                {$currentChannel?.name ?? ""}
            </h3>
            {#if $currentChannel?.topic}
                <span
                    class="text-xs text-base-content/40 hidden sm:inline-block border-l border-base-content/10 pl-2 ml-2 truncate flex-1"
                >
                    {$currentChannel.topic}
                </span>
            {:else}
                <div class="flex-1"></div>
            {/if}

            <!-- Header Actions -->
            <button
                class="btn btn-ghost btn-sm btn-square {showPins
                    ? 'bg-base-200 text-primary'
                    : ''}"
                onclick={() => (showPins = !showPins)}
                title="Pinned Messages"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path
                        d="M9.828 3h3.982a2 2 0 011.992 2.181l-.637 7A2 2 0 0113.174 14H2.826a2 2 0 01-1.991-1.819l-.637-7a1.99 1.99 0 01.342-1.31L.5 3a2 2 0 012-2h3.672a2 2 0 011.414.586l.414.414a2 2 0 001.414 0l.414-.414A2 2 0 019.828 3zm-8.328.002L1.5 3a1 1 0 011-1h13.5a1 1 0 011 1l-.001.324-1.363 11.514a1 1 0 01-.989.879H4.353a1 1 0 01-.99-.88L2 4.002l-.5 1.5H1.5z"
                    />
                    <path
                        fill-rule="evenodd"
                        d="M5 4v3H4l4 5 4-5V4a1 1 0 00-1-1H6a1 1 0 00-1 1z"
                        clip-rule="evenodd"
                    />
                </svg>
                <!-- Using simple pin icon -->
                <span class="text-lg leading-none">📌</span>
            </button>
        </div>

        <!-- Messages -->
        <div
            bind:this={messagesContainer}
            class="flex-1 overflow-y-auto p-4 space-y-1 scroll-smooth"
        >
            {#each $messages as msg, i (msg.id)}
                {@const prevMsg = i > 0 ? $messages[i - 1] : null}
                {@const sameAuthor =
                    prevMsg && prevMsg.author_id === msg.author_id}
                {@const timeDiff = prevMsg
                    ? new Date(msg.created_at).getTime() -
                      new Date(prevMsg.created_at).getTime()
                    : Infinity}
                {@const grouped = sameAuthor && timeDiff < 300000}
                {@const isOwn = msg.author_id === $currentUser?.id}

                {#if !grouped}
                    <div
                        class="flex gap-3 pt-3 hover:bg-base-200/30 px-2 rounded-lg group relative"
                    >
                        <!-- Avatar -->
                        <div
                            class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0 mt-0.5 overflow-hidden"
                        >
                            {#if msg.author?.avatar_url}
                                <img
                                    src={getFileUrl(msg.author.avatar_url)}
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
                                {#if msg.pinned}
                                    <span
                                        class="text-xs text-warning flex items-center gap-0.5"
                                        title="Pinned message"
                                    >
                                        📌 pinned
                                    </span>
                                {/if}
                            </div>

                            <!-- Content with markdown rendering -->
                            <div
                                class="{isOnlyEmojis(msg.content ?? '')
                                    ? 'text-4xl leading-relaxed'
                                    : 'text-sm text-base-content/90 prose prose-sm max-w-none prose-a:text-primary prose-img:rounded-lg prose-img:max-w-md prose-img:max-h-80 prose-img:mt-2 prose-img:mb-1'} whitespace-pre-wrap break-words"
                            >
                                {#if msg.content}
                                    {@html renderMarkdown(msg.content)}
                                {/if}
                            </div>

                            <!-- Attachments (Native) -->
                            {#if msg.attachments?.length > 0}
                                <div class="flex flex-wrap gap-2 mt-1">
                                    {#each msg.attachments as att}
                                        {#if att.mime_type.startsWith("image/")}
                                            <img
                                                src={getFileUrl(att.file_url)}
                                                alt={att.file_name}
                                                class="max-w-xs max-h-60 rounded-lg"
                                            />
                                        {:else}
                                            <a
                                                href={getFileUrl(att.file_url)}
                                                target="_blank"
                                                class="link link-primary text-sm flex items-center gap-1"
                                            >
                                                📎 {att.file_name}
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
                                            class="badge badge-sm badge-ghost gap-1 cursor-pointer hover:bg-primary/40 {reaction.me
                                                ? 'bg-primary/20'
                                                : ''} transition-colors"
                                            onclick={() =>
                                                removeReaction(
                                                    msg.id,
                                                    reaction.emoji,
                                                )}
                                        >
                                            {reaction.emoji}
                                            {reaction.count}
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>

                        <!-- Message actions (hover) -->
                        <div
                            class="absolute right-2 -top-3 hidden group-hover:flex items-center gap-0.5 bg-base-100 border border-base-300 rounded-lg px-1 py-0.5 shadow-md z-10"
                        >
                            <button
                                class="btn btn-ghost btn-xs btn-square"
                                title="Add reaction"
                                onclick={(e) => handleReaction(msg.id, e)}
                            >
                                😀
                            </button>
                            <button
                                class="btn btn-ghost btn-xs btn-square"
                                title={msg.pinned ? "Unpin" : "Pin"}
                                onclick={() => togglePin(msg)}
                            >
                                📌
                            </button>
                            {#if isOwn}
                                <button
                                    class="btn btn-ghost btn-xs btn-square text-error"
                                    title="Delete"
                                    onclick={() => handleDelete(msg.id)}
                                >
                                    🗑️
                                </button>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <!-- Grouped (same author) -->
                    <div
                        class="flex gap-3 hover:bg-base-200/30 px-2 rounded-lg group relative"
                    >
                        <div
                            class="w-10 shrink-0 flex items-start justify-center"
                        >
                            <span
                                class="text-[10px] text-base-content/0 group-hover:text-base-content/30 transition-colors mt-1"
                            >
                                {new Date(msg.created_at).toLocaleTimeString(
                                    [],
                                    {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    },
                                )}
                            </span>
                        </div>
                        <div class="flex-1 min-w-0">
                            {#if msg.pinned}
                                <span
                                    class="text-xs text-warning flex items-center gap-0.5 mb-0.5"
                                    title="Pinned message"
                                >
                                    📌 pinned
                                </span>
                            {/if}
                            <div
                                class="{isOnlyEmojis(msg.content ?? '')
                                    ? 'text-4xl leading-relaxed'
                                    : 'text-sm text-base-content/90 prose prose-sm max-w-none prose-a:text-primary prose-img:rounded-lg prose-img:max-w-md prose-img:max-h-80 prose-img:mt-2 prose-img:mb-1'} whitespace-pre-wrap break-words"
                            >
                                {#if msg.content}
                                    {@html renderMarkdown(msg.content)}
                                {/if}
                            </div>
                            <!-- Attachments (Native) for grouped -->
                            {#if msg.attachments?.length > 0}
                                <div class="flex flex-wrap gap-2 mt-1">
                                    {#each msg.attachments as att}
                                        {#if att.mime_type.startsWith("image/")}
                                            <img
                                                src={getFileUrl(att.file_url)}
                                                alt={att.file_name}
                                                class="max-w-xs max-h-60 rounded-lg"
                                            />
                                        {:else}
                                            <a
                                                href={getFileUrl(att.file_url)}
                                                target="_blank"
                                                class="link link-primary text-sm"
                                                >📎 {att.file_name}</a
                                            >
                                        {/if}
                                    {/each}
                                </div>
                            {/if}
                            <!-- Reactions for grouped -->
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

                        <!-- Message actions (hover) - grouped -->
                        <div
                            class="absolute right-2 -top-3 hidden group-hover:flex items-center gap-0.5 bg-base-100 border border-base-300 rounded-lg px-1 py-0.5 shadow-md z-10"
                        >
                            <button
                                class="btn btn-ghost btn-xs btn-square"
                                title="Add reaction"
                                onclick={(e) => handleReaction(msg.id, e)}
                            >
                                😀
                            </button>
                            <button
                                class="btn btn-ghost btn-xs btn-square"
                                title={msg.pinned ? "Unpin" : "Pin"}
                                onclick={() => togglePin(msg)}
                            >
                                📌
                            </button>
                            {#if isOwn}
                                <button
                                    class="btn btn-ghost btn-xs btn-square text-error"
                                    title="Delete"
                                    onclick={() => handleDelete(msg.id)}
                                >
                                    🗑️
                                </button>
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

            <!-- Mention Autocomplete -->
            {#if showMentions && mentionResults.length > 0}
                <div
                    class="bg-base-200 border border-base-300 rounded-lg shadow-lg mb-2 max-h-48 overflow-y-auto"
                    transition:slide
                >
                    {#each mentionResults.slice(0, 8) as mention}
                        <button
                            class="w-full text-left px-3 py-2 text-sm hover:bg-base-300 transition-colors flex items-center gap-2"
                            onclick={() => selectMention(mention)}
                        >
                            {#if mention.special}
                                <span class="badge badge-sm badge-primary"
                                    >@{mention.username}</span
                                >
                            {:else}
                                <span
                                    class="size-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary"
                                >
                                    {mention.username[0].toUpperCase()}
                                </span>
                                <span>{mention.username}</span>
                            {/if}
                        </button>
                    {/each}
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
                    oninput={handleInput}
                    rows="1"
                ></textarea>

                <!-- Emoji Button -->
                <button
                    class="btn btn-circle btn-ghost btn-sm mb-1 text-base-content/60 hover:text-warning"
                    title="Emoji"
                    aria-label="Emoji picker"
                    onclick={(e) => toggleEmojiPicker("input", e)}
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
    {#if showPins && $currentChannelId}
        <PinnedMessages
            channelId={$currentChannelId}
            onClose={() => (showPins = false)}
        />
    {/if}
    {#if showEmojiPicker}
        <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => {
                showEmojiPicker = false;
                emojiPickerTarget = null;
                emojiPickerTrigger = null;
            }}
            trigger={emojiPickerTrigger}
        />
    {/if}
</div>
