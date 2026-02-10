<script lang="ts">
    import { showSettings, currentUser, theme, logout } from "$lib/stores";
    import { updateMe } from "$lib/api";

    let username = $state($currentUser?.username ?? "");
    let saving = $state(false);

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

    function toggleTheme() {
        const next =
            $theme === "subspace-dark" ? "subspace-light" : "subspace-dark";
        theme.set(next);
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
    on:click|self={() => showSettings.set(false)}
>
    <div class="card bg-base-100 w-full max-w-lg shadow-2xl">
        <div class="card-body">
            <div class="flex items-center justify-between mb-4">
                <h2 class="card-title">User Settings</h2>
                <button
                    class="btn btn-ghost btn-sm btn-square"
                    on:click={() => showSettings.set(false)}
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
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
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
                on:click={handleSave}
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
                        checked={$theme === "subspace-light"}
                        on:change={toggleTheme}
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
                on:click={() => {
                    showSettings.set(false);
                    logout();
                }}
            >
                Log Out
            </button>
        </div>
    </div>
</div>
