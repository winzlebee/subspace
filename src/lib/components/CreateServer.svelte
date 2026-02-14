<script lang="ts">
    import { showCreateServer, servers } from "$lib/stores";
    import { createServer, joinServer, listServers } from "$lib/api";
    import { disconnectWs, connectWs } from "$lib/ws";

    let { onCreated }: { onCreated: (id: string) => void } = $props();

    let mode: "create" | "join" = $state("create");
    let name = $state("");
    let inviteCode = $state("");
    let loading = $state(false);
    let error = $state("");

    async function handleCreate() {
        if (!name.trim()) return;
        loading = true;
        error = "";
        try {
            const server = await createServer(name.trim());
            servers.update((s) => [...s, server]);
            showCreateServer.set(false);
            onCreated(server.id);
        } catch (e: any) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    async function handleJoin() {
        if (!inviteCode.trim()) return;
        loading = true;
        error = "";
        try {
            // Join the server
            await joinServer(inviteCode.trim());

            // Then re-set the list of servers from the remote
            servers.set(await listServers());

            // Force reconnect to pick up new server subscription
            disconnectWs();
            connectWs();

            onCreated(inviteCode.trim());

            showCreateServer.set(false);
        } catch (e: any) {
            error = e.message;
        } finally {
            loading = false;
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
    onclick={(e) => {
        if (e.target === e.currentTarget) showCreateServer.set(false);
    }}
    role="dialog"
    aria-modal="true"
    aria-label="Create or Join Server Modal"
    tabindex="0"
>
    <div class="card bg-base-100 w-full max-w-md shadow-2xl overflow-hidden">
        <div class="card-body">
            <h2 class="card-title text-center justify-center mb-2">
                {mode === "create" ? "Create a Server" : "Join a Server"}
            </h2>

            <!-- Tabs -->
            <div class="tabs tabs-boxed mb-4 justify-center">
                <button
                    class="tab {mode === 'create' ? 'tab-active' : ''}"
                    onclick={() => {
                        mode = "create";
                        error = "";
                    }}>Create</button
                >
                <button
                    class="tab {mode === 'join' ? 'tab-active' : ''}"
                    onclick={() => {
                        mode = "join";
                        error = "";
                    }}>Join</button
                >
            </div>

            {#if error}
                <div class="alert alert-error text-sm mb-2">{error}</div>
            {/if}

            {#if mode === "create"}
                <form
                    onsubmit={(e) => {
                        e.preventDefault();
                        handleCreate();
                    }}
                    class="space-y-4"
                >
                    <fieldset class="fieldset">
                        <label class="fieldset-label" for="server-name"
                            >Server Name</label
                        >
                        <input
                            id="server-name"
                            type="text"
                            class="input input-bordered w-full"
                            bind:value={name}
                            placeholder="My Awesome Server"
                            required
                        />
                    </fieldset>
                    <button
                        class="btn btn-primary w-full"
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? "Creating..." : "Create Server"}
                    </button>
                </form>
            {:else}
                <form
                    onsubmit={(e) => {
                        e.preventDefault();
                        handleJoin();
                    }}
                    class="space-y-4"
                >
                    <fieldset class="fieldset">
                        <label class="fieldset-label" for="invite-code"
                            >Server ID</label
                        >
                        <input
                            id="invite-code"
                            type="text"
                            class="input input-bordered w-full"
                            bind:value={inviteCode}
                            placeholder="Paste server ID"
                            required
                        />
                    </fieldset>
                    <button
                        class="btn btn-primary w-full"
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? "Joining..." : "Join Server"}
                    </button>
                </form>
            {/if}

            <button
                class="btn btn-ghost btn-sm mt-2"
                onclick={() => showCreateServer.set(false)}>Cancel</button
            >
        </div>
    </div>
</div>
