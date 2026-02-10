<script lang="ts">
    import { voiceChannelId, isMuted, isDeafened, channels } from "$lib/stores";
    import { wsLeaveVoice, wsUpdateMuteDeafen } from "$lib/ws";
    import { derived } from "svelte/store";

    const voiceChannel = derived(
        [channels, voiceChannelId],
        ([$channels, $id]) => $channels.find((c) => c.id === $id) ?? null,
    );

    function toggleMute() {
        isMuted.update((m) => {
            const next = !m;
            wsUpdateMuteDeafen(next, false);
            return next;
        });
    }

    function toggleDeafen() {
        isDeafened.update((d) => {
            const next = !d;
            wsUpdateMuteDeafen(false, next);
            return next;
        });
    }

    function disconnect() {
        wsLeaveVoice();
        voiceChannelId.set(null);
        isMuted.set(false);
        isDeafened.set(false);
    }
</script>

<div
    class="flex items-center gap-2 px-4 py-2 bg-base-300 border-t border-base-content/10"
>
    <div class="flex items-center gap-2 flex-1 min-w-0">
        <div class="w-2 h-2 rounded-full bg-success animate-pulse"></div>
        <span class="text-sm text-success font-medium">Voice Connected</span>
        {#if $voiceChannel}
            <span class="text-xs text-base-content/40"
                >/ {$voiceChannel.name}</span
            >
        {/if}
    </div>

    <div class="flex items-center gap-1">
        <!-- Mute -->
        <button
            class="btn btn-ghost btn-sm btn-square {$isMuted
                ? 'text-error'
                : 'text-base-content/60'}"
            on:click={toggleMute}
            title={$isMuted ? "Unmute" : "Mute"}
        >
            {#if $isMuted}
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
                        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                    />
                </svg>
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
                        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                </svg>
            {/if}
        </button>

        <!-- Deafen -->
        <button
            class="btn btn-ghost btn-sm btn-square {$isDeafened
                ? 'text-error'
                : 'text-base-content/60'}"
            on:click={toggleDeafen}
            title={$isDeafened ? "Undeafen" : "Deafen"}
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
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
            </svg>
        </button>

        <!-- Disconnect -->
        <button
            class="btn btn-ghost btn-sm btn-square text-error"
            on:click={disconnect}
            title="Disconnect"
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
                    d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
                />
            </svg>
        </button>
    </div>
</div>
