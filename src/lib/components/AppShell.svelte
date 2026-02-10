<script lang="ts">
  import { onMount } from "svelte";
  import { connectWs, disconnectWs } from "$lib/ws";
  import {
    getMe,
    listServers,
    listChannels,
    getServerMembers,
    getMessages,
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
  } from "$lib/stores";

  import ServerSidebar from "./ServerSidebar.svelte";
  import ChannelList from "./ChannelList.svelte";
  import MessageArea from "./MessageArea.svelte";
  import MemberList from "./MemberList.svelte";
  import VoiceControls from "./VoiceControls.svelte";
  import UserSettings from "./UserSettings.svelte";
  import CreateServer from "./CreateServer.svelte";

  onMount(() => {
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
      } catch (e) {
        console.error("Init error:", e);
      }
    })();

    return () => disconnectWs();
  });

  async function selectServer(id: string) {
    currentServerId.set(id);
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
  }

  async function selectChannel(id: string) {
    currentChannelId.set(id);
    const msgs = await getMessages(id);
    messages.set(msgs);
  }
</script>

<div class="flex h-full w-full overflow-hidden">
  <!-- Server sidebar -->
  <ServerSidebar onSelectServer={selectServer} />

  <!-- Channel list -->
  {#if $currentServer}
    <ChannelList onSelectChannel={selectChannel} />
  {/if}

  <!-- Message area -->
  <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
    {#if $currentChannel && $currentChannel.type === "text"}
      <MessageArea />
    {:else}
      <div class="flex-1 flex items-center justify-center text-base-content/40">
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

  <!-- Member list -->
  {#if $currentServer}
    <MemberList />
  {/if}
</div>

<!-- Modals -->
{#if $showSettings}
  <UserSettings />
{/if}

{#if $showCreateServer}
  <CreateServer onCreated={selectServer} />
{/if}
