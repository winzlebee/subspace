<script lang="ts">
    import {
        currentServerId,
        servers,
        currentServer,
        showSettings,
    } from "$lib/stores";
    import { updateServer, uploadFile } from "$lib/api";

    import CloseButton from "./CloseButton.svelte";

    let {
        show = $bindable(false),
        onClose,
    }: { show: boolean; onClose: () => void } = $props();

    let name = $state($currentServer?.name ?? "");
    let isUploading = $state(false);
    let saving = $state(false);

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
            // Update server with new icon URL
            const updated = await updateServer($currentServerId, {
                icon_url: result.url,
            });

            // Update local store
            servers.update((all) =>
                all.map((s) => (s.id === $currentServerId ? updated : s)),
            );
            // Store derived value should update automatically
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
            class="card bg-base-100 w-full max-w-md shadow-2xl overflow-hidden"
        >
            <div class="card-body">
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
                                    src={$currentServer.icon_url}
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
                <fieldset class="fieldset">
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

                <div class="card-actions justify-end mt-6">
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
