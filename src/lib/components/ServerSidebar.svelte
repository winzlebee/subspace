<script lang="ts">
  import {
    servers,
    currentServerId,
    showCreateServer,
    showSettings,
    currentUser,
    isDmMode,
  } from "$lib/stores";
  import { getFileUrl } from "$lib/api";

  let { onSelectServer, onSelectDm }: { onSelectServer: (id: string) => void; onSelectDm: () => void } = $props();

  function getInitials(name: string): string {
    return name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
</script>

<div
  class="flex flex-col items-center w-[72px] bg-base-300 py-3 gap-2 shrink-0 overflow-y-auto"
>
  <!-- Direct Messages Icon -->
  <div class="indicator">
    {#if $isDmMode}
      <span
        class="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-base-content rounded-r-full"
      ></span>
    {/if}
    <button
      class="w-12 h-12 rounded-[24px] flex items-center justify-center text-sm font-semibold transition-all duration-200
        {$isDmMode
        ? 'bg-primary text-primary-content rounded-xl'
        : 'bg-base-100 text-base-content hover:bg-primary/30 hover:text-primary hover:rounded-xl'}"
      title="Direct Messages"
      onclick={onSelectDm}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    </button>
  </div>

  <!-- Divider -->
  <div class="w-8 h-[2px] bg-base-content/20 rounded-full"></div>

  <!-- Server list -->
  {#each $servers as server (server.id)}
    <div class="indicator">
      {#if server.id === $currentServerId}
        <span
          class="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-base-content rounded-r-full"
        ></span>
      {/if}
      <button
        class="w-12 h-12 rounded-[24px] flex items-center justify-center text-sm font-semibold transition-all duration-200
          {server.id === $currentServerId
          ? 'bg-primary text-primary-content rounded-xl'
          : 'bg-base-100 text-base-content hover:bg-primary/30 hover:text-primary hover:rounded-xl'}"
        title={server.name}
        onclick={() => onSelectServer(server.id)}
      >
        {#if server.icon_url}
          <img
            src={getFileUrl(server.icon_url)}
            alt={server.name}
            class="w-full h-full rounded-[inherit] object-cover"
          />
        {:else}
          {getInitials(server.name)}
        {/if}
      </button>
    </div>
  {/each}

  <!-- Add server -->
  <button
    class="w-12 h-12 rounded-[24px] bg-base-100 text-success flex items-center justify-center hover:bg-success hover:text-success-content hover:rounded-xl transition-all duration-200"
    title="Create or Join a Server"
    onclick={() => showCreateServer.set(true)}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M12 4v16m8-8H4"
      />
    </svg>
  </button>

  <!-- Spacer -->
  <div class="flex-1"></div>

  <!-- User avatar & settings -->
  <button
    class="w-12 h-12 rounded-full bg-base-100 flex items-center justify-center text-xs font-bold hover:ring-2 ring-primary transition-all"
    title="Settings"
    onclick={() => showSettings.set(true)}
  >
    {#if $currentUser?.avatar_url}
      <img
        src={getFileUrl($currentUser.avatar_url)}
        alt="avatar"
        class="w-full h-full rounded-full object-cover"
      />
    {:else if $currentUser}
      {getInitials($currentUser.username)}
    {:else}
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
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z"
        />
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    {/if}
  </button>
</div>
