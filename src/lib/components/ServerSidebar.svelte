<script lang="ts">
  import {
    servers,
    currentServerId,
    showCreateServer,
    showSettings,
    currentUser,
    logout as doLogout,
  } from "$lib/stores";
  import { joinServer, listServers } from "$lib/api";

  let { onSelectServer }: { onSelectServer: (id: string) => void } = $props();

  let showJoinModal = $state(false);
  let joinServerId = $state("");
  let joining = $state(false);
  let joinError = $state("");

  function getInitials(name: string): string {
    return name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  async function handleJoin() {
    if (!joinServerId.trim()) return;
    joining = true;
    joinError = "";
    try {
      await joinServer(joinServerId.trim());
      // Refresh servers
      const updated = await listServers();
      servers.set(updated);
      onSelectServer(joinServerId.trim());
      showJoinModal = false;
      joinServerId = "";
    } catch (e: any) {
      joinError = e?.message ?? "Failed to join server";
    } finally {
      joining = false;
    }
  }
</script>

<div
  class="flex flex-col items-center w-[72px] bg-base-300 py-3 gap-2 shrink-0 overflow-y-auto"
>
  <!-- Home / DM button -->
  <button
    class="w-12 h-12 rounded-2xl bg-primary/20 text-primary flex items-center justify-center hover:rounded-xl hover:bg-primary hover:text-primary-content transition-all duration-200"
    title="Home"
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
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  </button>

  <div class="w-8 h-0.5 bg-base-content/10 rounded-full"></div>

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
            src={server.icon_url}
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
    title="Create a Server"
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

  <!-- Join server -->
  <button
    class="w-12 h-12 rounded-[24px] bg-base-100 text-info flex items-center justify-center hover:bg-info hover:text-info-content hover:rounded-xl transition-all duration-200"
    title="Join a Server"
    onclick={() => (showJoinModal = true)}
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
        d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
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
        src={$currentUser.avatar_url}
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

<!-- Join Server Modal -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
{#if showJoinModal}
  <div
    class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
    onclick={(e) => {
      if (e.target === e.currentTarget) showJoinModal = false;
    }}
    role="dialog"
    aria-modal="true"
  >
    <div class="card bg-base-100 w-full max-w-sm shadow-2xl">
      <div class="card-body">
        <h2 class="card-title">Join a Server</h2>
        <p class="text-sm text-base-content/60 mb-2">
          Enter a server invite code to join
        </p>

        <fieldset class="fieldset mb-2">
          <label class="fieldset-label" for="join-server-id">Invite Code</label>
          <input
            id="join-server-id"
            type="text"
            class="input input-bordered w-full font-mono text-sm"
            placeholder="Server ID / invite code"
            bind:value={joinServerId}
          />
        </fieldset>

        {#if joinError}
          <p class="text-xs text-error">{joinError}</p>
        {/if}

        <div class="card-actions justify-end mt-3">
          <button class="btn btn-ghost" onclick={() => (showJoinModal = false)}
            >Cancel</button
          >
          <button
            class="btn btn-primary"
            onclick={handleJoin}
            disabled={joining || !joinServerId.trim()}
          >
            {joining ? "Joining..." : "Join Server"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
