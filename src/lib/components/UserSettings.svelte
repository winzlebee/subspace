<script lang="ts">
    import { showSettings, currentUser, theme, logout } from "$lib/stores";
    import { updateMe, uploadFile, getFileUrl, getServerVersion } from "$lib/api";
    import {
        getAudioDevices,
        audioInputDeviceId,
        audioOutputDeviceId,
    } from "$lib/webrtc";
    import CloseButton from "./CloseButton.svelte";
    import StatusIndicator from "./StatusIndicator.svelte";
    import { THEMES } from "$lib/config";
    import { onMount, onDestroy } from "svelte";
    import { setUserStatus } from "$lib/ws";

    let username = $state($currentUser?.username ?? "");
    let saving = $state(false);
    let avatarUploading = $state(false);
    let activeTab = $state("account"); // 'account' | 'voice'
    let serverVersion = $state<string | null>(null);
    let clientVersion = $state<string>(__APP_VERSION__);

    // Audio Settings
    let audioInputs: MediaDeviceInfo[] = $state([]);
    let audioOutputs: MediaDeviceInfo[] = $state([]);
    let micTestContext: AudioContext | null = null;
    let micTestAnalyser: AnalyserNode | null = null;
    let micTestStream: MediaStream | null = null;
    let micVolume = $state(0);
    let micTestInterval: number | null = null;

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

    // ── Audio Settings Logic ─────────────────────────────────────────────

    async function loadAudioDevices() {
        const devices = await getAudioDevices();
        audioInputs = devices.inputs;
        audioOutputs = devices.outputs;

        // Set defaults if null
        if (!$audioInputDeviceId && audioInputs.length > 0) {
            audioInputDeviceId.set(audioInputs[0].deviceId);
        }
        if (!$audioOutputDeviceId && audioOutputs.length > 0) {
            audioOutputDeviceId.set(audioOutputs[0].deviceId);
        }
    }

    async function startMicTest() {
        try {
            if (micTestContext) await stopMicTest();

            micTestContext = new AudioContext();
            const deviceId = $audioInputDeviceId;

            micTestStream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: deviceId ? { exact: deviceId } : undefined },
                video: false,
            });

            const source =
                micTestContext.createMediaStreamSource(micTestStream);
            micTestAnalyser = micTestContext.createAnalyser();
            micTestAnalyser.fftSize = 256;
            source.connect(micTestAnalyser);

            micTestInterval = window.setInterval(() => {
                if (!micTestAnalyser) return;
                const data = new Uint8Array(micTestAnalyser.frequencyBinCount);
                micTestAnalyser.getByteFrequencyData(data);
                const avg = data.reduce((a, b) => a + b, 0) / data.length;
                // Normalize simpler: 0-255 -> 0-100%
                micVolume = Math.min(100, (avg / 128) * 100);
            }, 100);
        } catch (e) {
            console.error("Failed to start mic test:", e);
        }
    }

    async function stopMicTest() {
        if (micTestInterval) {
            clearInterval(micTestInterval);
            micTestInterval = null;
        }
        if (micTestStream) {
            micTestStream.getTracks().forEach((t) => t.stop());
            micTestStream = null;
        }
        if (micTestContext) {
            await micTestContext.close();
            micTestContext = null;
        }
        micVolume = 0;
    }

    // Effect to monitor tab switching
    $effect(() => {
        if (activeTab === "voice") {
            loadAudioDevices();
            // We listen to device changes
            navigator.mediaDevices.addEventListener(
                "devicechange",
                loadAudioDevices,
            );
            startMicTest();
        } else {
            stopMicTest();
            navigator.mediaDevices.removeEventListener(
                "devicechange",
                loadAudioDevices,
            );
        }
    });

    onMount(async () => {
        try {
            const versionData = await getServerVersion();
            serverVersion = versionData.version;
        } catch (e) {
            console.error("Failed to fetch server version:", e);
            serverVersion = "Unknown";
        }
    });

    onDestroy(() => {
        stopMicTest();
        // Event listener might stick if we destoryed while on voice tab, but svelte handles component unmount cleanup well usually
    });
</script>

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
    <div
        class="card bg-base-100 w-full max-w-4xl shadow-2xl overflow-hidden h-[80vh] flex flex-row"
    >
        <!-- Sidebar -->
        <div class="w-64 bg-base-200 p-4 flex flex-col gap-2 shrink-0">
            <div
                class="text-xs font-bold text-base-content/50 uppercase tracking-wider mb-2 px-2"
            >
                Settings
            </div>
            <button
                class="btn btn-ghost justify-start {activeTab === 'account'
                    ? 'bg-base-300'
                    : ''}"
                onclick={() => (activeTab = "account")}
            >
                My Account
            </button>
            <button
                class="btn btn-ghost justify-start {activeTab === 'voice'
                    ? 'bg-base-300'
                    : ''}"
                onclick={() => (activeTab = "voice")}
            >
                Voice & Video
            </button>

            <div class="divider"></div>

            <button
                class="btn btn-error btn-outline btn-sm justify-start"
                onclick={() => {
                    showSettings.set(false);
                    logout();
                }}
            >
                Log Out
            </button>

            <!-- Version Info -->
            <div class="mt-auto pt-4 px-2 text-xs text-base-content/50 space-y-1">
                <div class="flex justify-between">
                    <span>Client:</span>
                    <span class="font-mono">v{clientVersion}</span>
                </div>
                <div class="flex justify-between">
                    <span>Server:</span>
                    <span class="font-mono">
                        {#if serverVersion === null}
                            <span class="loading loading-spinner loading-xs"></span>
                        {:else}
                            v{serverVersion}
                        {/if}
                    </span>
                </div>
            </div>
        </div>

        <!-- Content -->
        <div class="flex-1 p-8 overflow-y-auto relative">
            <div class="absolute right-4 top-4">
                <CloseButton onClose={() => showSettings.set(false)} />
            </div>

            {#if activeTab === "account"}
                <h2 class="text-2xl font-bold mb-6">My Account</h2>

                <!-- Avatar -->
                <div class="card bg-base-200 p-4 mb-8">
                    <div class="flex items-center gap-4">
                        <div class="relative group">
                            <div
                                class="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary overflow-hidden"
                            >
                                {#if $currentUser?.avatar_url}
                                    <img
                                        src={getFileUrl(
                                            $currentUser.avatar_url,
                                        )}
                                        alt="Avatar"
                                        class="w-full h-full object-cover"
                                    />
                                {:else}
                                    {($currentUser?.username ??
                                        "?")[0].toUpperCase()}
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
                            <p class="font-bold text-lg">
                                {$currentUser?.username ?? ""}
                            </p>
                            <p class="text-sm text-base-content/60">
                                Click avatar to change
                            </p>
                        </div>
                        <button
                            class="btn btn-primary ml-auto"
                            onclick={handleSave}
                            disabled={saving}
                        >
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </div>

                <!-- Username -->
                <fieldset class="fieldset w-full max-w-md mb-8">
                    <label
                        class="fieldset-label font-bold"
                        for="settings-username">USERNAME</label
                    >
                    <input
                        id="settings-username"
                        type="text"
                        class="input input-bordered w-full"
                        bind:value={username}
                    />
                </fieldset>

                <div class="divider"></div>

                <!-- Status Selector -->
                <div class="max-w-md mb-8">
                    <h3 class="font-bold mb-2">Status</h3>
                    <p class="text-sm text-base-content/60 mb-4">
                        Set your online status
                    </p>
                    <div class="space-y-2">
                        <button
                            class="btn btn-ghost w-full justify-start gap-3"
                            onclick={() => setUserStatus('online')}
                        >
                            <StatusIndicator status={{ user_id: '', status: 'online', custom_text: null, activity_type: null, activity_name: null, last_seen: '', updated_at: '' }} size="medium" />
                            <span>Online</span>
                        </button>
                        <button
                            class="btn btn-ghost w-full justify-start gap-3"
                            onclick={() => setUserStatus('idle')}
                        >
                            <StatusIndicator status={{ user_id: '', status: 'idle', custom_text: null, activity_type: null, activity_name: null, last_seen: '', updated_at: '' }} size="medium" />
                            <span>Idle</span>
                        </button>
                        <button
                            class="btn btn-ghost w-full justify-start gap-3"
                            onclick={() => setUserStatus('dnd')}
                        >
                            <StatusIndicator status={{ user_id: '', status: 'dnd', custom_text: null, activity_type: null, activity_name: null, last_seen: '', updated_at: '' }} size="medium" />
                            <span>Do Not Disturb</span>
                        </button>
                    </div>
                    <p class="text-xs text-base-content/50 mt-3">
                        Note: Status will automatically change to Idle after 5 minutes of inactivity
                    </p>
                </div>

                <div class="divider"></div>

                <!-- Theme -->
                <div class="flex items-center justify-between max-w-md">
                    <div>
                        <h3 class="font-bold">Theme</h3>
                        <p class="text-sm text-base-content/60">
                            Customize the look of Subspace
                        </p>
                    </div>
                    <label class="swap swap-rotate btn btn-ghost btn-circle">
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
            {:else if activeTab === "voice"}
                <h2 class="text-2xl font-bold mb-6">Voice & Video</h2>

                <div class="space-y-6 max-w-lg">
                    <!-- Input Device -->
                    <div>
                        <span
                            class="label font-bold uppercase text-xs text-base-content/50 justify-start gap-2"
                        >
                            Input Device
                        </span>
                        <select
                            class="select select-bordered w-full"
                            bind:value={$audioInputDeviceId}
                        >
                            {#each audioInputs as device}
                                <option value={device.deviceId}
                                    >{device.label ||
                                        `Microphone ${device.deviceId.slice(0, 5)}...`}</option
                                >
                            {/each}
                        </select>
                    </div>

                    <!-- Output Device -->
                    <div>
                        <span
                            class="label font-bold uppercase text-xs text-base-content/50 justify-start gap-2"
                        >
                            Output Device
                        </span>
                        <select
                            class="select select-bordered w-full"
                            bind:value={$audioOutputDeviceId}
                        >
                            {#each audioOutputs as device}
                                <option value={device.deviceId}
                                    >{device.label ||
                                        `Speaker ${device.deviceId.slice(0, 5)}...`}</option
                                >
                            {/each}
                        </select>
                        <div class="text-xs text-base-content/50 mt-1 px-1">
                            Note: Output device selection is only supported in
                            some browsers (Chrome/Edge).
                        </div>
                    </div>

                    <div class="divider"></div>

                    <!-- Mic Test -->
                    <div>
                        <span
                            class="label font-bold uppercase text-xs text-base-content/60"
                            >Mic Test</span
                        >
                        <p class="text-sm mb-2 text-base-content/70">
                            Say something to check your microphone.
                        </p>

                        <div
                            class="w-full bg-base-300 h-8 rounded-full overflow-hidden relative"
                        >
                            <div
                                class="h-full bg-primary transition-all duration-100 ease-out"
                                style="width: {micVolume}%"
                            ></div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>
