<script lang="ts">
  import {
    currentServer,
    textChannels,
    voiceChannels,
    currentChannelId,
    voiceChannelId,
    voiceStates,
    currentUser,
    currentServerId,
  } from "$lib/stores";
  import { wsJoinVoice } from "$lib/ws";
  import { joinVoice, speakingUsers } from "$lib/webrtc";
  import ServerSettingsModals from "./ServerSettingsModals.svelte";
  import { getFileUrl } from "$lib/api";

  let { onSelectChannel }: { onSelectChannel: (id: string) => void } = $props();

  let showServerSettings = $state(false);

  function joinVoiceChannel(channelId: string) {
    joinVoice(channelId);
    wsJoinVoice(channelId);
    voiceChannelId.set(channelId);
    onSelectChannel(channelId);

    // Optimistic update: add current user to voice state immediately
    const user = $currentUser;
    if (user) {
      voiceStates.update((vs) => {
        const existing = vs[channelId] || [];
        if (existing.some((s) => s.user_id === user.id)) return vs;
        return {
          ...vs,
          [channelId]: [
            ...existing,
            {
              user_id: user.id,
              channel_id: channelId,
              muted: false,
              deafened: false,
              joined_at: new Date().toISOString(),
              username: user.username,
              avatar_url: user.avatar_url,
            },
          ],
        };
      });
    }
  }
</script>

<div class="flex flex-col w-60 bg-base-200 shrink-0 overflow-hidden">
  <!-- Server name header -->
  <div
    class="h-12 flex items-center justify-between px-4 shadow-md bg-base-200 border-b border-base-300 hover:bg-base-300 transition-colors cursor-pointer group"
    onclick={() => (showServerSettings = true)}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") showServerSettings = true;
    }}
    role="button"
    tabindex="0"
  >
    <h2 class="font-semibold text-base-content truncate flex-1">
      {$currentServer?.name ?? ""}
    </h2>
    <button
      class="btn btn-xs btn-ghost btn-square opacity-0 group-hover:opacity-100 transition-opacity"
      aria-label="Server Settings"
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
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>
  </div>

  <ServerSettingsModals
    bind:show={showServerSettings}
    onClose={() => (showServerSettings = false)}
  />

  <div class="flex-1 overflow-y-auto p-2 space-y-4">
    <!-- Text Channels -->
    {#if $textChannels.length > 0}
      <div>
        <h3
          class="text-xs font-semibold uppercase text-base-content/50 px-2 mb-1 tracking-wider"
        >
          Text Channels
        </h3>
        <ul class="menu menu-sm">
          {#each $textChannels as channel (channel.id)}
            <li>
              <button
                class="flex items-center gap-2 rounded-md px-2 py-1.5
                  {channel.id === $currentChannelId
                  ? 'bg-base-300 text-base-content'
                  : 'text-base-content/60 hover:text-base-content hover:bg-base-300/50'}"
                onclick={() => onSelectChannel(channel.id)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 shrink-0 opacity-60"
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
                <span class="truncate">{channel.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Voice Channels -->
    {#if $voiceChannels.length > 0}
      <div>
        <h3
          class="text-xs font-semibold uppercase text-base-content/50 px-2 mb-1 tracking-wider"
        >
          Voice Channels
        </h3>
        <ul class="menu menu-sm">
          {#each $voiceChannels as channel (channel.id)}
            {@const users = $voiceStates[channel.id] || []}
            <li>
              <button
                class="flex items-center gap-2 rounded-md px-2 py-1.5
                  {channel.id === $voiceChannelId
                  ? 'bg-success/20 text-success'
                  : 'text-base-content/60 hover:text-base-content hover:bg-base-300/50'}"
                onclick={() => joinVoiceChannel(channel.id)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 shrink-0 opacity-60"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15.536 8.464a5 5 0 010 7.072M12 6a7.975 7.975 0 015.657 2.343M6.343 6.343A7.975 7.975 0 0012 18a7.975 7.975 0 005.657-2.343M9.879 9.879a3 3 0 004.242 4.242"
                  />
                </svg>
                <span class="truncate">{channel.name}</span>
              </button>
              <!-- Voice channel users -->
              {#if users.length > 0}
                <ul>
                  {#each users as vs (vs.user_id)}
                    {@const isSpeaking = $speakingUsers.has(vs.user_id)}
                    <li>
                      <div
                        class="flex items-center gap-2 text-xs text-base-content/50 py-0.5 px-1"
                      >
                        <span
                          class="size-6 rounded-full bg-base-300 flex items-center justify-center text-[10px] font-bold relative overflow-hidden
                            {isSpeaking
                            ? 'ring-2 ring-success ring-offset-1 ring-offset-base-200'
                            : ''}"
                        >
                          {#if vs.avatar_url}
                            <img
                              src={getFileUrl(vs.avatar_url)}
                              alt=""
                              class="w-full h-full object-cover rounded-full"
                            />
                          {:else}
                            {(vs.username ?? "?")[0].toUpperCase()}
                          {/if}
                        </span>
                        <span
                          class="truncate {isSpeaking
                            ? 'text-success font-medium'
                            : ''}">{vs.username ?? "Unknown"}</span
                        >
                        <span class="flex items-center gap-0.5">
                          {#if vs.deafened}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              class="h-3.5 w-3.5 text-error"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fill-rule="evenodd"
                                d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                                clip-rule="evenodd"
                              />
                            </svg>
                          {:else if vs.muted}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              class="h-3.5 w-3.5 text-error"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fill-rule="evenodd"
                                d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                                clip-rule="evenodd"
                              />
                            </svg>
                          {/if}
                        </span>
                      </div>
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</div>
