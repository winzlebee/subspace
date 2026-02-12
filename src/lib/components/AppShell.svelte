<script lang="ts">
  import { onMount } from "svelte";
  import { connectWs, disconnectWs } from "$lib/ws";
  import {
    getMe,
    listServers,
    listChannels,
    getServerMembers,
    getMessages,
    clearServerUrl,
  } from "$lib/api";
  import {
    currentUser,
    servers,
    currentServerId,
    currentServer,
    channels,
    currentChannelId,
    currentChannel,
    messages,
    members,
    showSettings,
    showCreateServer,
    voiceChannelId,
    authToken,
  } from "$lib/stores";

  import { APP_NAME } from "$lib/config";

  import ServerSidebar from "./ServerSidebar.svelte";
  import ChannelList from "./ChannelList.svelte";
  import MessageArea from "./MessageArea.svelte";
  import MemberList from "./MemberList.svelte";
  import VoiceControls from "./VoiceControls.svelte";
  import UserSettings from "./UserSettings.svelte";
  import CreateServer from "./CreateServer.svelte";

  let loading = $state(true);
  let initError = $state("");

  // Server setup
  let needsSetup = $state(false);
  let setupUrl = $state("http://localhost:3001");
  let setupTesting = $state(false);
  let setupError = $state("");

  // Mobile responsive toggles
  let showMobileSidebar = $state(false);
  let showMobileMembers = $state(false);

  // Toast notifications
  let toasts: Array<{
    id: number;
    message: string;
    type: "error" | "success" | "info";
  }> = $state([]);
  let toastCounter = 0;

  function addToast(
    message: string,
    type: "error" | "success" | "info" = "error",
  ) {
    const id = ++toastCounter;
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 4000);
  }

  // Expose globally for other components to use
  if (typeof window !== "undefined") {
    (window as any).__subspace_toast = addToast;
  }

  onMount(() => {
    initApp();
    return () => disconnectWs();
  });

  function initApp() {
    (async () => {
      try {
        const user = await getMe();
        currentUser.set(user);
        const serverList = await listServers();
        servers.set(serverList);
        if (serverList.length > 0) {
          await selectServer(serverList[0].id);
        }
        connectWs();
      } catch (e: any) {
        console.error("Init error:", e);
        initError = e?.message ?? "Failed to connect";
      } finally {
        loading = false;
      }
    })();
  }

  async function selectServer(id: string) {
    currentServerId.set(id);
    showMobileSidebar = false;
    try {
      const [chs, mems] = await Promise.all([
        listChannels(id),
        getServerMembers(id),
      ]);
      channels.set(chs);
      members.set(mems);
      const firstText = chs.find((c) => c.type === "text");
      if (firstText) {
        await selectChannel(firstText.id);
      } else {
        currentChannelId.set(null);
        messages.set([]);
      }
    } catch (e: any) {
      addToast("Failed to load server data");
    }
  }

  async function selectChannel(id: string) {
    currentChannelId.set(id);
    showMobileSidebar = false;
    try {
      const msgs = await getMessages(id);
      messages.set(msgs);
    } catch (e: any) {
      addToast("Failed to load messages");
    }
  }
</script>

<!-- Loading state -->
{#if loading}
  <div class="flex h-full w-full items-center justify-center bg-base-100">
    <div class="text-center">
      <span class="loading loading-ring loading-lg text-primary"></span>
      <p class="mt-4 text-base-content/60 text-sm">
        Connecting to {APP_NAME}...
      </p>
    </div>
  </div>
{:else if initError}
  <div class="flex h-full w-full items-center justify-center bg-base-100">
    <div class="text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-16 w-16 mx-auto mb-4 text-error/50"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
      <p class="text-lg text-error mb-2">Connection Failed</p>
      <p class="text-sm text-base-content/50 mb-4">{initError}</p>
      <div class="flex gap-2 justify-center">
        <button
          class="btn btn-primary btn-sm"
          onclick={() => location.reload()}
        >
          Retry
        </button>
        <button
          class="btn btn-ghost btn-sm"
          onclick={() => {
            clearServerUrl();
            location.reload();
          }}
        >
          Change Server
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="flex h-full w-full overflow-hidden relative">
    <!-- Mobile hamburger menu -->
    <button
      class="md:hidden fixed top-2 left-2 z-40 btn btn-circle btn-ghost btn-sm"
      onclick={() => (showMobileSidebar = !showMobileSidebar)}
      aria-label="Toggle sidebar"
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
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
    </button>

    <!-- Mobile members toggle -->
    <button
      class="md:hidden fixed top-2 right-2 z-40 btn btn-circle btn-ghost btn-sm"
      onclick={() => (showMobileMembers = !showMobileMembers)}
      aria-label="Toggle members"
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
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    </button>

    <!-- Server sidebar -->
    <div class="hidden md:flex">
      <ServerSidebar onSelectServer={selectServer} />
    </div>

    <!-- Mobile sidebar overlay -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    {#if showMobileSidebar}
      <div
        class="md:hidden fixed inset-0 bg-black/50 z-30"
        onclick={() => (showMobileSidebar = false)}
      ></div>
      <div class="md:hidden fixed left-0 top-0 bottom-0 z-30 flex">
        <ServerSidebar onSelectServer={selectServer} />
        {#if $currentServer}
          <ChannelList onSelectChannel={selectChannel} />
        {/if}
      </div>
    {/if}

    <!-- Channel list (desktop) -->
    {#if $currentServer}
      <div class="hidden md:flex">
        <ChannelList onSelectChannel={selectChannel} />
      </div>
    {/if}

    <!-- Message area -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      {#if $currentChannel && $currentChannel.type === "text"}
        <MessageArea />
      {:else}
        <div
          class="flex-1 flex items-center justify-center text-base-content/40"
        >
          <div class="text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-16 w-16 mx-auto mb-4 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p class="text-lg">Select a text channel to start chatting</p>
          </div>
        </div>
      {/if}

      <!-- Voice controls bar (when in voice) -->
      {#if $voiceChannelId}
        <VoiceControls />
      {/if}
    </div>

    <!-- Member list (desktop) -->
    {#if $currentServer}
      <div class="hidden md:flex">
        <MemberList />
      </div>
    {/if}

    <!-- Mobile member list overlay -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    {#if showMobileMembers && $currentServer}
      <div
        class="md:hidden fixed inset-0 bg-black/50 z-30"
        onclick={() => (showMobileMembers = false)}
      ></div>
      <div class="md:hidden fixed right-0 top-0 bottom-0 z-30">
        <MemberList />
      </div>
    {/if}
  </div>
{/if}

<!-- Modals -->
{#if $showSettings}
  <UserSettings />
{/if}

{#if $showCreateServer}
  <CreateServer onCreated={selectServer} />
{/if}

<!-- Toast notifications -->
{#if toasts.length > 0}
  <div class="toast toast-end toast-bottom z-[100]">
    {#each toasts as toast (toast.id)}
      <div
        class="alert shadow-lg {toast.type === 'error'
          ? 'alert-error'
          : toast.type === 'success'
            ? 'alert-success'
            : 'alert-info'}"
      >
        <span class="text-sm">{toast.message}</span>
      </div>
    {/each}
  </div>
{/if}
