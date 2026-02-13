<script lang="ts">
    import { currentUser, voiceStates, voiceChannelId } from "$lib/stores";
    import {
        remoteStreams,
        localVideoStream,
        localScreenStream,
        speakingUsers,
    } from "$lib/webrtc";
    import { getFileUrl } from "$lib/api";
    import { onMount, onDestroy } from "svelte";

    // Helper to bind media stream to video element
    function srcObject(node: HTMLVideoElement, stream: MediaStream) {
        node.srcObject = stream;
        node.play().catch((e) => console.error("Error playing video:", e));
        return {
            update(newStream: MediaStream) {
                if (node.srcObject !== newStream) {
                    node.srcObject = newStream;
                    node.play().catch((e) =>
                        console.error("Error playing video:", e),
                    );
                }
            },
            destroy() {
                node.srcObject = null;
            },
        };
    }

    $effect(() => {
        // Debugging
        // console.log("Remote streams:", $remoteStreams);
        // console.log("Local video:", $localVideoStream);
    });

    let focusedStreamId: string | null = $state(null);

    function toggleFocus(id: string) {
        if (focusedStreamId === id) {
            focusedStreamId = null;
        } else {
            focusedStreamId = id;
        }
    }
</script>

<div class="flex-1 w-full h-full overflow-hidden flex flex-col relative">
    {#if $voiceChannelId}
        {@const users = $voiceStates[$voiceChannelId] || []}

        <!-- Gather all "video items" we want to display -->
        {@const items = (() => {
            const list: {
                id: string;
                type: "local-cam" | "local-screen" | "remote";
                stream?: MediaStream;
                user?: any;
            }[] = [];

            if ($currentUser) {
                if ($localVideoStream)
                    list.push({
                        id: "local-cam",
                        type: "local-cam",
                        stream: $localVideoStream,
                        user: $currentUser,
                    });
                if ($localScreenStream)
                    list.push({
                        id: "local-screen",
                        type: "local-screen",
                        stream: $localScreenStream,
                        user: $currentUser,
                    });
                if (!$localVideoStream && !$localScreenStream)
                    list.push({
                        id: "local-avatar",
                        type: "local-cam",
                        user: $currentUser,
                    }); // avatar fallback
            }

            for (const u of users) {
                if (u.user_id === $currentUser?.id) continue;
                const streams = $remoteStreams[u.user_id] || [];
                const videoStreams = streams.filter(
                    (s) => s.getVideoTracks().length > 0,
                );

                if (videoStreams.length > 0) {
                    videoStreams.forEach((s) => {
                        list.push({
                            id: s.id,
                            type: "remote",
                            stream: s,
                            user: u,
                        });
                    });
                } else {
                    list.push({
                        id: `avatar-${u.user_id}`,
                        type: "remote",
                        user: u,
                    });
                }
            }
            return list;
        })()}

        {#if focusedStreamId}
            {@const focusedItem = items.find((i) => i.id === focusedStreamId)}
            <!-- Spotlight Layout -->
            <div class="flex-1 flex gap-4 p-4 min-h-0">
                <!-- Main Stage -->
                <div
                    class="flex-1 bg-black rounded-lg overflow-hidden relative shadow-lg flex items-center justify-center"
                >
                    {#if focusedItem}
                        {#if focusedItem.stream}
                            <video
                                use:srcObject={focusedItem.stream}
                                class="w-full h-full object-contain"
                                autoplay
                                playsinline
                                muted={focusedItem.type.startsWith("local")}
                            ></video>
                        {:else}
                            <!-- Avatar in spotlight? Weird but okay -->
                            <div class="flex flex-col items-center">
                                <div
                                    class="w-32 h-32 rounded-full bg-base-100 flex items-center justify-center text-4xl font-bold overflow-hidden mb-4"
                                >
                                    {#if focusedItem.user.avatar_url}
                                        <img
                                            src={getFileUrl(
                                                focusedItem.user.avatar_url,
                                            )}
                                            alt=""
                                            class="w-full h-full object-cover"
                                        />
                                    {:else}
                                        {(focusedItem.user.username ||
                                            "?")[0].toUpperCase()}
                                    {/if}
                                </div>
                                <span class="text-2xl font-bold text-white"
                                    >{focusedItem.user.username}</span
                                >
                            </div>
                        {/if}
                        <!-- Close button -->
                        <button
                            class="absolute top-4 right-4 btn btn-circle btn-sm bg-black/50 hover:bg-black/80 border-none text-white"
                            onclick={() => (focusedStreamId = null)}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-5 w-5"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </button>
                    {:else}
                        <div class="text-white/50">Stream unavailable</div>
                    {/if}
                </div>

                <!-- Sidebar list -->
                {#if items.length > 1}
                    <div
                        class="w-64 flex flex-col gap-2 overflow-y-auto shrink-0"
                    >
                        {#each items as item (item.id)}
                            {#if item.id !== focusedStreamId}
                                <div
                                    class="relative aspect-video bg-base-300 rounded-lg overflow-hidden shrink-0 cursor-pointer hover:ring-2 hover:ring-primary transition-all group"
                                    onclick={() => toggleFocus(item.id)}
                                    onkeydown={() => {}}
                                    role="button"
                                    tabindex="0"
                                >
                                    {#if item.stream}
                                        <video
                                            use:srcObject={item.stream}
                                            class="w-full h-full object-cover pointer-events-none"
                                            autoplay
                                            playsinline
                                            muted={item.type.startsWith(
                                                "local",
                                            )}
                                        ></video>
                                    {:else}
                                        <div
                                            class="w-full h-full flex items-center justify-center"
                                        >
                                            <div
                                                class="w-10 h-10 rounded-full bg-base-100 flex items-center justify-center font-bold"
                                            >
                                                {(item.user.username ||
                                                    "?")[0].toUpperCase()}
                                            </div>
                                        </div>
                                    {/if}
                                    <div
                                        class="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-white truncate max-w-[90%]"
                                    >
                                        {item.user.username}
                                    </div>
                                </div>
                            {/if}
                        {/each}
                    </div>
                {/if}
            </div>
        {:else}
            <!-- Grid Layout (Default) -->
            <div
                class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4 auto-rows-fr overflow-y-auto"
            >
                {#each items as item (item.id)}
                    <div
                        class="relative aspect-video bg-black rounded-lg overflow-hidden group shadow-md border border-base-content/10 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                        onclick={() => toggleFocus(item.id)}
                        onkeydown={() => {}}
                        role="button"
                        tabindex="0"
                    >
                        {#if item.stream}
                            <video
                                use:srcObject={item.stream}
                                class="w-full h-full {item.type === 'local-cam'
                                    ? 'object-cover scale-x-[-1]'
                                    : 'object-contain bg-neutral-900'}"
                                autoplay
                                playsinline
                                muted={item.type.startsWith("local")}
                            ></video>
                        {:else}
                            <!-- Avatar Fallback -->
                            <div
                                class="w-full h-full bg-base-300 flex items-center justify-center"
                            >
                                <div class="flex flex-col items-center">
                                    <div
                                        class="w-20 h-20 rounded-full bg-base-100 flex items-center justify-center text-3xl font-bold overflow-hidden mb-2 relative
                                        {$speakingUsers.has(item.user.id)
                                            ? 'ring-4 ring-success'
                                            : ''}"
                                    >
                                        {#if item.user.avatar_url}
                                            <img
                                                src={getFileUrl(
                                                    item.user.avatar_url,
                                                )}
                                                alt=""
                                                class="w-full h-full object-cover"
                                            />
                                        {:else}
                                            {(item.user.username ||
                                                "?")[0].toUpperCase()}
                                        {/if}
                                    </div>
                                    <span class="font-medium opacity-70"
                                        >{item.user.username}</span
                                    >
                                </div>
                            </div>
                        {/if}

                        <!-- Overlay Name -->
                        <div
                            class="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-xs text-white font-medium flex items-center gap-2"
                        >
                            <span>{item.user.username}</span>
                            {#if item.type === "local-screen" || (item.stream && item.stream
                                        .getVideoTracks()[0]
                                        .label.toLowerCase()
                                        .includes("screen"))}
                                <span
                                    class="opacity-70 text-[10px] uppercase border border-white/20 px-1 rounded"
                                    >Screen</span
                                >
                            {/if}
                        </div>

                        <!-- Icons -->
                        <div class="absolute bottom-2 right-2 flex gap-1">
                            {#if $speakingUsers.has(item.user.id)}
                                <div
                                    class="w-3 h-3 bg-success rounded-full shadow-sm animate-pulse"
                                ></div>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    {:else}
        <div
            class="flex items-center justify-center h-full text-base-content/50"
        >
            <p>Not connected to voice</p>
        </div>
    {/if}
</div>
