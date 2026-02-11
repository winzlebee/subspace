<script lang="ts">
    import { showSettings, currentUser, theme, logout } from "$lib/stores";
    import { updateMe, uploadFile, getFileUrl } from "$lib/api";
    import CloseButton from "./CloseButton.svelte";
    import { THEMES } from "$lib/config";

    let username = $state($currentUser?.username ?? "");
    let saving = $state(false);
    let avatarUploading = $state(false);

    async function handleSave() {
        saving = true;
        try {
            await updateMe({ username });
            currentUser.update((u) => (u ? { ...u, username } : u));
        } catch (e) {
            console.error("Save error:", e);
        } finally {
            saving = false;
        }
    }

    async function handleAvatarUpload(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        avatarUploading = true;
        try {
            const result = await uploadFile(file);
            await updateMe({ avatar_url: result.url });
            currentUser.update((u) =>
                u ? { ...u, avatar_url: result.url } : u,
            );
        } catch (e) {
            console.error("Avatar upload error:", e);
        } finally {
            avatarUploading = false;
        }
    }

    function toggleTheme() {
        const next = $theme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
        theme.set(next);
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
    onclick={(e) => {
        if (e.target === e.currentTarget) showSettings.set(false);
    }}
    role="dialog"
    aria-modal="true"
    aria-label="User Settings Modal"
    tabindex="0"
>
    <div class="card bg-base-100 w-full max-w-lg shadow-2xl overflow-hidden">
        <div class="card-body">
            <div class="flex items-center justify-between mb-4">
                <h2 class="card-title">User Settings</h2>
                <CloseButton onClose={() => showSettings.set(false)} />
            </div>

            <!-- Avatar -->
            <div class="flex items-center gap-4 mb-4">
                <div class="relative group">
                    <div
                        class="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary overflow-hidden"
                    >
                        {#if $currentUser?.avatar_url}
                            <img
                                src={getFileUrl($currentUser.avatar_url)}
                                alt="Avatar"
                                class="w-full h-full object-cover"
                            />
                        {:else}
                            {($currentUser?.username ?? "?")[0].toUpperCase()}
                        {/if}
                    </div>
                    <label
                        class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                    >
                        {#if avatarUploading}
                            <span
                                class="loading loading-spinner loading-sm text-white"
                            ></span>
                        {:else}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-6 w-6 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                                />
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                            </svg>
                        {/if}
                        <input
                            type="file"
                            accept="image/*"
                            class="hidden"
                            onchange={handleAvatarUpload}
                            disabled={avatarUploading}
                        />
                    </label>
                </div>
                <div>
                    <p class="font-semibold">{$currentUser?.username ?? ""}</p>
                    <p class="text-xs text-base-content/50">
                        Click avatar to change
                    </p>
                </div>
            </div>

            <!-- Profile -->
            <fieldset class="fieldset">
                <label class="fieldset-label" for="settings-username"
                    >Username</label
                >
                <input
                    id="settings-username"
                    type="text"
                    class="input input-bordered w-full"
                    bind:value={username}
                />
            </fieldset>

            <button
                class="btn btn-primary btn-sm mt-2"
                onclick={handleSave}
                disabled={saving}
            >
                {saving ? "Saving..." : "Save Changes"}
            </button>

            <div class="divider"></div>

            <!-- Theme -->
            <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Theme</span>
                <label class="swap swap-rotate">
                    <input
                        type="checkbox"
                        checked={$theme === THEMES.LIGHT}
                        onchange={toggleTheme}
                        aria-label="Toggle theme"
                    />
                    <svg
                        class="swap-on h-6 w-6"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                        />
                    </svg>
                    <svg
                        class="swap-off h-6 w-6"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                        />
                    </svg>
                </label>
            </div>

            <div class="divider"></div>

            <!-- Logout -->
            <button
                class="btn btn-error btn-outline btn-sm"
                onclick={() => {
                    showSettings.set(false);
                    logout();
                }}
            >
                Log Out
            </button>
        </div>
    </div>
</div>
