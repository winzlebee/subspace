<script lang="ts">
    import {
        currentServerId,
        servers,
        currentServer,
        channels,
    } from "$lib/stores";
    import {
        updateServer,
        uploadFile,
        createChannel,
        deleteChannel,
        listChannels,
        getFileUrl,
    } from "$lib/api";

    import CloseButton from "./CloseButton.svelte";

    let {
        show = $bindable(false),
        onClose,
    }: { show: boolean; onClose: () => void } = $props();

    let name = $state($currentServer?.name ?? "");
    let isUploading = $state(false);
    let saving = $state(false);

    // Channel management
    let newChannelName = $state("");
    let newChannelType = $state<"text" | "voice">("text");
    let creatingChannel = $state(false);
    let deletingChannelId = $state<string | null>(null);

    // Invite
    let copied = $state(false);

    // Sync state when opening
    $effect(() => {
        if (show && $currentServer) {
            name = $currentServer.name;
        }
    });

    async function handleAvatarUpload(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file || !$currentServerId) return;

        isUploading = true;
        try {
            const result = await uploadFile(file);
            const updated = await updateServer($currentServerId, {
                icon_url: result.url,
            });
            servers.update((all) =>
                all.map((s) => (s.id === $currentServerId ? updated : s)),
            );
        } catch (e) {
            console.error("Server icon upload failed:", e);
        } finally {
            isUploading = false;
        }
    }

    async function handleSave() {
        if (!$currentServerId) return;
        saving = true;
        try {
            const updated = await updateServer($currentServerId, { name });
            servers.update((all) =>
                all.map((s) => (s.id === $currentServerId ? updated : s)),
            );
            onClose();
        } catch (e) {
            console.error("Update server failed:", e);
        } finally {
            saving = false;
        }
    }

    async function handleCreateChannel() {
        if (!newChannelName.trim() || !$currentServerId) return;
        creatingChannel = true;
        try {
            await createChannel(
                $currentServerId,
                newChannelName.trim(),
                newChannelType,
            );
            // Refresh channels
            const chs = await listChannels($currentServerId);
            channels.set(chs);
            newChannelName = "";
        } catch (e) {
            console.error("Create channel failed:", e);
        } finally {
            creatingChannel = false;
        }
    }

    async function handleDeleteChannel(channelId: string) {
        if (!confirm("Delete this channel?")) return;
        deletingChannelId = channelId;
        try {
            await deleteChannel(channelId);
            channels.update((chs) => chs.filter((c) => c.id !== channelId));
        } catch (e) {
            console.error("Delete channel failed:", e);
        } finally {
            deletingChannelId = null;
        }
    }

    function copyServerId() {
        if ($currentServerId) {
            navigator.clipboard.writeText($currentServerId);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
{#if show}
    <div
        class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        onclick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Server Settings Modal"
        tabindex="0"
    >
        <div
            class="card bg-base-100 w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh]"
        >
            <div class="card-body overflow-y-auto">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="card-title">Server Settings</h2>
                    <CloseButton {onClose} />
                </div>

                <!-- Server Icon -->
                <div class="flex flex-col items-center gap-4 mb-6">
                    <div class="relative group">
                        <div
                            class="w-24 h-24 rounded-2xl bg-base-300 flex items-center justify-center text-3xl font-bold text-base-content/50 overflow-hidden shadow-inner"
                        >
                            {#if $currentServer?.icon_url}
                                <img
                                    src={getFileUrl($currentServer.icon_url)}
                                    alt="Server Icon"
                                    class="w-full h-full object-cover"
                                />
                            {:else}
                                {($currentServer?.name ?? "?")
                                    .substring(0, 2)
                                    .toUpperCase()}
                            {/if}
                        </div>

                        <label
                            class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                        >
                            {#if isUploading}
                                <span class="loading loading-spinner text-white"
                                ></span>
                            {:else}
                                <span class="text-xs text-white font-medium"
                                    >Change Icon</span
                                >
                            {/if}
                            <input
                                type="file"
                                accept="image/*"
                                class="hidden"
                                onchange={handleAvatarUpload}
                                disabled={isUploading}
                            />
                        </label>
                    </div>
                    <p class="text-xs text-base-content/50">
                        Recommended 512x512px
                    </p>
                </div>

                <!-- Server Name -->
                <fieldset class="fieldset mb-4">
                    <label class="fieldset-label" for="server-name-edit"
                        >Server Name</label
                    >
                    <input
                        id="server-name-edit"
                        type="text"
                        class="input input-bordered w-full"
                        bind:value={name}
                    />
                </fieldset>

                <!-- Invite Code -->
                <div class="mb-6">
                    <h3 class="text-sm font-semibold text-base-content/70 mb-2">
                        Invite Code
                    </h3>
                    <div class="flex items-center gap-2">
                        <input
                            type="text"
                            class="input input-bordered input-sm flex-1 font-mono text-xs"
                            value={$currentServerId ?? ""}
                            readonly
                        />
                        <button
                            class="btn btn-sm btn-outline"
                            onclick={copyServerId}
                        >
                            {copied ? "✓ Copied!" : "Copy"}
                        </button>
                    </div>
                    <p class="text-xs text-base-content/40 mt-1">
                        Share this ID to let others join your server
                    </p>
                </div>

                <!-- Channels Management -->
                <div class="mb-6">
                    <h3 class="text-sm font-semibold text-base-content/70 mb-3">
                        Channels
                    </h3>

                    <!-- Existing channels -->
                    <div class="space-y-2 mb-4 max-h-48 overflow-y-auto">
                        {#each $channels as channel (channel.id)}
                            <div
                                class="flex items-center justify-between px-3 py-2 rounded-lg bg-base-200 group"
                            >
                                <div class="flex items-center gap-2">
                                    <span class="text-xs text-base-content/40">
                                        {channel.type === "text" ? "#" : "🔊"}
                                    </span>
                                    <span class="text-sm">{channel.name}</span>
                                    <span class="badge badge-xs badge-ghost"
                                        >{channel.type}</span
                                    >
                                </div>
                                <button
                                    class="btn btn-xs btn-ghost text-error opacity-0 group-hover:opacity-100 transition-opacity"
                                    onclick={() =>
                                        handleDeleteChannel(channel.id)}
                                    disabled={deletingChannelId === channel.id}
                                >
                                    {deletingChannelId === channel.id
                                        ? "..."
                                        : "✕"}
                                </button>
                            </div>
                        {/each}
                    </div>

                    <!-- Create new channel -->

                    <h2 class="text-sm font-semibold text-base-content/70 mb-3">
                        Create a New Channel
                    </h2>

                    <div class="flex gap-2">
                        <label class="input flex-3">
                            <span class="text-base-content/40">#</span>
                            <input
                                id="new-channel-name"
                                type="text"
                                class="input input-bordered input-md"
                                placeholder="new-channel-name"
                                bind:value={newChannelName}
                            />
                        </label>
                        <select
                            id="new-channel-type"
                            class="select select-bordered select-md flex-1"
                            bind:value={newChannelType}
                        >
                            <option value="text">Text</option>
                            <option value="voice">Voice</option>
                        </select>
                        <button
                            class="btn btn-md btn-primary"
                            onclick={handleCreateChannel}
                            disabled={creatingChannel || !newChannelName.trim()}
                        >
                            {creatingChannel ? "..." : "+ Add"}
                        </button>
                    </div>
                </div>

                <div class="card-actions justify-end mt-2">
                    <button
                        class="btn btn-ghost"
                        onclick={onClose}
                        aria-label="Close">Cancel</button
                    >
                    <button
                        class="btn btn-primary"
                        onclick={handleSave}
                        disabled={saving}
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
