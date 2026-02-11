<script lang="ts">
    import { setServerUrl } from "$lib/api";

    let { onComplete }: { onComplete: () => void } = $props();

    let setupUrl = $state("http://localhost:3001");
    let setupTesting = $state(false);
    let setupError = $state("");

    async function handleSetup() {
        let url = setupUrl.trim().replace(/\/+$/, ""); // strip trailing slashes
        if (!url) return;

        setupTesting = true;
        setupError = "";
        try {
            // Test connection to the server
            const res = await fetch(`${url}/api/me`, { method: "GET" }).catch(
                () => null,
            );
            // We expect 401 (no auth) or 200 — either means the server is reachable
            if (!res || (res.status !== 200 && res.status !== 401)) {
                setupError = `Could not reach server at ${url}. Check the address and try again.`;
                return;
            }
            setServerUrl(url);
            onComplete();
        } catch (e: any) {
            setupError = e?.message ?? "Connection failed";
        } finally {
            setupTesting = false;
        }
    }
</script>

<div class="flex h-full w-full items-center justify-center bg-base-100 p-4">
    <div class="card bg-base-200 w-full max-w-md shadow-2xl">
        <div class="card-body">
            <div class="text-center mb-4">
                <h1 class="text-2xl font-bold text-primary mb-1">
                    🚀 Subspace
                </h1>
                <p class="text-sm text-base-content/60">
                    Enter your server address to get started
                </p>
            </div>

            <fieldset class="fieldset mb-3">
                <label class="fieldset-label" for="server-url-input"
                    >Server URL</label
                >
                <input
                    id="server-url-input"
                    type="url"
                    class="input input-bordered w-full"
                    placeholder="http://192.168.1.100:3001"
                    bind:value={setupUrl}
                    onkeydown={(e) => {
                        if (e.key === "Enter") handleSetup();
                    }}
                />
                <p class="text-xs text-base-content/40 mt-1.5">
                    The address of your Subspace server (e.g.
                    http://your-server-ip:3001)
                </p>
            </fieldset>

            {#if setupError}
                <div class="alert alert-error text-sm mb-3">
                    {setupError}
                </div>
            {/if}

            <button
                class="btn btn-primary w-full"
                onclick={handleSetup}
                disabled={setupTesting || !setupUrl.trim()}
            >
                {#if setupTesting}
                    <span class="loading loading-spinner loading-sm"></span>
                    Testing connection...
                {:else}
                    Connect
                {/if}
            </button>
        </div>
    </div>
</div>
