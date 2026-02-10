<script lang="ts">
  import {
    currentServer,
    textChannels,
    voiceChannels,
    currentChannelId,
    voiceChannelId,
    voiceStates,
    currentUser,
  } from "$lib/stores";
  import { wsJoinVoice, wsLeaveVoice } from "$lib/ws";
  import type { VoiceState } from "$lib/types";

  let { onSelectChannel }: { onSelectChannel: (id: string) => void } = $props();

  function joinVoiceChannel(channelId: string) {
    wsJoinVoice(channelId);
    voiceChannelId.set(channelId);

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
    class="h-12 flex items-center px-4 shadow-md bg-base-200 border-b border-base-300"
  >
    <h2 class="font-semibold text-base-content truncate">
      {$currentServer?.name ?? ""}
    </h2>
  </div>

  <div class="flex-1 overflow-y-auto p-2 space-y-4">
    <!-- Text Channels -->
    {#if $textChannels.length > 0}
      <div>
        <h3
          class="text-xs font-semibold uppercase text-base-content/50 px-2 mb-1 tracking-wider"
        >
          Text Channels
        </h3>
        <ul class="menu menu-sm p-0 gap-0.5">
          {#each $textChannels as channel (channel.id)}
            <li>
              <button
                class="flex items-center gap-2 rounded-md px-2 py-1.5
                  {channel.id === $currentChannelId
                  ? 'bg-base-300 text-base-content'
                  : 'text-base-content/60 hover:text-base-content hover:bg-base-300/50'}"
                on:click={() => onSelectChannel(channel.id)}
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
        <ul class="menu menu-sm p-0 gap-0.5">
          {#each $voiceChannels as channel (channel.id)}
            {@const users = $voiceStates[channel.id] || []}
            <li>
              <button
                class="flex items-center gap-2 rounded-md px-2 py-1.5
                  {channel.id === $voiceChannelId
                  ? 'bg-success/20 text-success'
                  : 'text-base-content/60 hover:text-base-content hover:bg-base-300/50'}"
                on:click={() => joinVoiceChannel(channel.id)}
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
                <ul class="ml-6 mt-0.5 space-y-0.5">
                  {#each users as vs (vs.user_id)}
                    <li
                      class="flex items-center gap-2 text-xs text-base-content/50 py-0.5 px-1"
                    >
                      <div
                        class="w-5 h-5 rounded-full bg-base-300 flex items-center justify-center text-[10px] font-bold"
                      >
                        {(vs.username ?? "?")[0].toUpperCase()}
                      </div>
                      <span class="truncate">{vs.username ?? "Unknown"}</span>
                      {#if vs.muted}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-3 w-3 text-error"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                          />
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                          />
                        </svg>
                      {/if}
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
