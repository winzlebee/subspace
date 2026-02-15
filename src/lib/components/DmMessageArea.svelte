<script lang="ts">
  import {
    dmMessages,
    currentDmConversation,
    currentUser,
  } from "$lib/stores";
  import {
    createDmMessage,
    uploadFile,
    addDmReaction,
    removeDmReaction,
    deleteDmMessage,
    editDmMessage,
    getFileUrl,
  } from "$lib/api";
  import { onMount, tick } from "svelte";
  import { slide } from "svelte/transition";
  import { marked } from "marked";
  import EmojiPicker from "./EmojiPicker.svelte";

  let messageInput = $state("");
  let messagesContainer: HTMLDivElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();
  let isUploading = $state(false);

  // Emoji Picker State
  let showEmojiPicker = $state(false);
  let emojiPickerTarget: "input" | { msgId: string } | null = $state(null);
  let emojiPickerTrigger: HTMLElement | null = $state(null);

  function handleEmojiSelect(emoji: string) {
    if (emojiPickerTarget === "input") {
      messageInput += emoji;
    } else if (emojiPickerTarget && typeof emojiPickerTarget === "object") {
      addDmReaction(emojiPickerTarget.msgId, emoji).catch(console.error);
    }
    showEmojiPicker = false;
    emojiPickerTarget = null;
    emojiPickerTrigger = null;
  }

  function toggleEmojiPicker(
    target: "input" | { msgId: string },
    event: MouseEvent
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

  // Configure marked for inline rendering
  const renderer = new marked.Renderer();
  renderer.image = function ({ href, title, text }) {
    return `<img src="${getFileUrl(href)}" alt="${text}" title="${title || ""}" class="max-w-xs max-h-60 rounded-lg" />`;
  };
  renderer.paragraph = ({ text }) => `${text}`;

  function renderMarkdown(content: string): string {
    try {
      return marked.parseInline(content, { renderer }) as string;
    } catch {
      return content;
    }
  }

  function isOnlyEmojis(str: string): boolean {
    if (!str) return false;
    try {
      const regex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\s)+$/u;
      return (
        regex.test(str) &&
        /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u.test(str)
      );
    } catch (e) {
      return false;
    }
  }

  // Scroll to bottom when messages change
  $effect(() => {
    if ($dmMessages) {
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
    if (!content || !$currentDmConversation) return;
    messageInput = "";
    try {
      const newMsg = await createDmMessage($currentDmConversation.id, content);
      dmMessages.update((msgs) => {
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
    if (!file || !$currentDmConversation) return;

    isUploading = true;
    try {
      const result = await uploadFile(file);

      const content = result.mime_type.startsWith("image/")
        ? `![${result.file_name}](${result.url})`
        : `[${result.file_name}](${result.url})`;

      const newMsg = await createDmMessage($currentDmConversation.id, content);
      dmMessages.update((msgs) => {
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
    }
  }

  async function handleReaction(msgId: string, event: MouseEvent) {
    toggleEmojiPicker({ msgId }, event);
  }

  async function handleDelete(msgId: string) {
    if (!confirm("Delete this message?")) return;
    try {
      await deleteDmMessage(msgId);
      dmMessages.update((msgs) => msgs.filter((m) => m.id !== msgId));
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
</script>

<div class="flex flex-col flex-1 min-w-0 min-h-0 h-full relative">
  <!-- DM header -->
  <div
    class="h-12 flex items-center px-4 gap-2 shadow-sm bg-base-100 border-b border-base-300 shrink-0"
  >
    <div class="avatar">
      <div class="w-6 h-6 rounded-full">
        {#if $currentDmConversation?.other_user.avatar_url}
          <img
            src={getFileUrl($currentDmConversation.other_user.avatar_url)}
            alt={$currentDmConversation.other_user.username}
          />
        {:else}
          <div
            class="bg-primary text-primary-content flex items-center justify-center w-full h-full text-xs"
          >
            {$currentDmConversation?.other_user.username[0].toUpperCase()}
          </div>
        {/if}
      </div>
    </div>
    <h3 class="font-semibold text-base-content">
      {$currentDmConversation?.other_user.username ?? ""}
    </h3>
  </div>

  <!-- Messages -->
  <div
    bind:this={messagesContainer}
    class="flex-1 overflow-y-auto p-4 space-y-1 scroll-smooth"
  >
    {#each $dmMessages as msg, i (msg.id)}
      {@const prevMsg = i > 0 ? $dmMessages[i - 1] : null}
      {@const sameAuthor = prevMsg && prevMsg.author_id === msg.author_id}
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
              <span class="font-semibold text-sm text-base-content"
                >{msg.author?.username ?? "Unknown"}</span
              >
              <span class="text-xs text-base-content/40"
                >{formatTime(msg.created_at)}</span
              >
              {#if msg.edited_at}
                <span class="text-xs text-base-content/30">(edited)</span>
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

            <!-- Attachments -->
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
                    onclick={() => removeDmReaction(msg.id, reaction.emoji)}
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
              class="{isOnlyEmojis(msg.content ?? '')
                ? 'text-4xl leading-relaxed'
                : 'text-sm text-base-content/90 prose prose-sm max-w-none prose-a:text-primary prose-img:rounded-lg prose-img:max-w-md prose-img:max-h-80 prose-img:mt-2 prose-img:mb-1'} whitespace-pre-wrap break-words"
            >
              {#if msg.content}
                {@html renderMarkdown(msg.content)}
              {/if}
            </div>
            <!-- Attachments for grouped -->
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
                      class="link link-primary text-sm">📎 {att.file_name}</a
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
                    class="badge badge-sm badge-ghost gap-1 cursor-pointer hover:bg-primary/40 {reaction.me
                      ? 'bg-primary/20'
                      : ''} transition-colors"
                    onclick={() => removeDmReaction(msg.id, reaction.emoji)}
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
  <div
    class="px-4 pb-4 shrink-0"
    style="padding-bottom: max(1rem, env(safe-area-inset-bottom));"
  >
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
        placeholder="Message @{$currentDmConversation?.other_user.username ?? '...'}"
        bind:value={messageInput}
        onkeydown={handleKeydown}
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
