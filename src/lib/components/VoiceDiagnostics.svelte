<script lang="ts">
    import { 
        connectionDiagnostics, 
        voiceConnectionStatus,
        enableDiagnostics, 
        disableDiagnostics 
    } from "$lib/webrtc";
    import { onMount, onDestroy } from "svelte";

    let diagnosticsEnabled = $state(false);

    onMount(() => {
        // Auto-enable diagnostics when component mounts
        diagnosticsEnabled = true;
        enableDiagnostics();
    });

    onDestroy(() => {
        // Clean up when component unmounts
        disableDiagnostics();
    });

    function formatBytes(bytes: number): string {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
    }

    function formatBitrate(bps: number | null): string {
        if (bps === null || bps === 0) return "N/A";
        const kbps = bps / 1000;
        if (kbps < 1000) {
            return Math.round(kbps) + " kbps";
        }
        return Math.round(kbps / 1000 * 10) / 10 + " Mbps";
    }

    function formatLatency(rtt: number | null): string {
        if (rtt === null) return "N/A";
        return Math.round(rtt * 1000) + " ms";
    }

    function getConnectionTypeColor(type: "direct" | "relay" | "unknown"): string {
        switch (type) {
            case "direct":
                return "badge-success";
            case "relay":
                return "badge-warning";
            default:
                return "badge-ghost";
        }
    }

    function getConnectionStateColor(state: RTCPeerConnectionState): string {
        switch (state) {
            case "connected":
                return "text-success";
            case "connecting":
                return "text-warning";
            case "failed":
            case "closed":
                return "text-error";
            default:
                return "text-base-content/50";
        }
    }
</script>

<div class="space-y-4">
    <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">Voice Connection Diagnostics</h3>
        <div class="badge badge-sm badge-info">Live</div>
    </div>

    <!-- Overall Status -->
    <div class="alert {$voiceConnectionStatus.isAlone ? 'alert-info' : $voiceConnectionStatus.turnServerStatus === 'failed' ? 'alert-error' : $voiceConnectionStatus.activeConnections > 0 ? 'alert-success' : 'alert-warning'}">
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            class="stroke-current shrink-0 w-6 h-6"
        >
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
        </svg>
        <div class="flex-1">
            <div class="font-semibold">{$voiceConnectionStatus.statusMessage}</div>
            {#if $voiceConnectionStatus.turnServerStatus === "connected"}
                <div class="text-xs mt-1">TURN relay server: Connected and active</div>
            {:else if $voiceConnectionStatus.turnServerStatus === "connecting"}
                <div class="text-xs mt-1">Establishing connections...</div>
            {:else if $voiceConnectionStatus.turnServerStatus === "failed"}
                <div class="text-xs mt-1">TURN server connection failed - check configuration</div>
            {/if}
        </div>
    </div>

    {#if Object.keys($connectionDiagnostics).length === 0 && !$voiceConnectionStatus.isAlone}
        <div class="alert alert-info">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                class="stroke-current shrink-0 w-6 h-6"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
            </svg>
            <span
                >No active voice connections. Join a voice channel to see
                diagnostics.</span
            >
        </div>
    {:else}
        <div class="space-y-3">
            {#each Object.values($connectionDiagnostics) as diag (diag.userId)}
                <div class="card bg-base-200 shadow-sm">
                    <div class="card-body p-4 space-y-3">
                        <!-- User Header -->
                        <div class="flex items-center justify-between">
                            <h4 class="font-semibold text-base">
                                {diag.username}
                            </h4>
                            <div class="flex gap-2">
                                <span
                                    class="badge badge-sm {getConnectionTypeColor(
                                        diag.connectionType,
                                    )}"
                                >
                                    {diag.connectionType === "direct"
                                        ? "P2P"
                                        : diag.connectionType === "relay"
                                          ? "Relay"
                                          : "Unknown"}
                                </span>
                                <span
                                    class="badge badge-sm {getConnectionStateColor(
                                        diag.connectionState,
                                    )}"
                                >
                                    {diag.connectionState}
                                </span>
                            </div>
                        </div>

                        <!-- Detailed Status -->
                        <div class="text-sm text-base-content/70 italic">
                            {diag.detailedStatus}
                        </div>

                        <!-- Connection Details -->
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <span class="text-base-content/50"
                                    >ICE State:</span
                                >
                                <span class="ml-1 font-mono"
                                    >{diag.iceConnectionState}</span
                                >
                            </div>
                            <div>
                                <span class="text-base-content/50">Latency:</span
                                >
                                <span class="ml-1 font-mono"
                                    >{formatLatency(
                                        diag.currentRoundTripTime,
                                    )}</span
                                >
                            </div>
                        </div>

                        <!-- Candidates -->
                        {#if diag.localCandidate || diag.remoteCandidate}
                            <div class="space-y-1 text-xs">
                                {#if diag.localCandidate}
                                    <div>
                                        <span class="text-base-content/50"
                                            >Local:</span
                                        >
                                        <span class="ml-1 font-mono text-xs"
                                            >{diag.localCandidate}</span
                                        >
                                    </div>
                                {/if}
                                {#if diag.remoteCandidate}
                                    <div>
                                        <span class="text-base-content/50"
                                            >Remote:</span
                                        >
                                        <span class="ml-1 font-mono text-xs"
                                            >{diag.remoteCandidate}</span
                                        >
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        <!-- Traffic Stats -->
                        <div class="divider my-1"></div>
                        <div class="grid grid-cols-2 gap-3 text-xs">
                            <div class="space-y-1">
                                <div class="text-base-content/50 font-semibold">
                                    Incoming
                                </div>
                                <div>
                                    <span class="text-base-content/50"
                                        >Bytes:</span
                                    >
                                    <span class="ml-1 font-mono"
                                        >{formatBytes(diag.bytesReceived)}</span
                                    >
                                </div>
                                <div>
                                    <span class="text-base-content/50"
                                        >Packets:</span
                                    >
                                    <span class="ml-1 font-mono"
                                        >{diag.packetsReceived.toLocaleString()}</span
                                    >
                                </div>
                                <div>
                                    <span class="text-base-content/50"
                                        >Bitrate:</span
                                    >
                                    <span class="ml-1 font-mono"
                                        >{formatBitrate(
                                            diag.availableIncomingBitrate,
                                        )}</span
                                    >
                                </div>
                            </div>
                            <div class="space-y-1">
                                <div class="text-base-content/50 font-semibold">
                                    Outgoing
                                </div>
                                <div>
                                    <span class="text-base-content/50"
                                        >Bytes:</span
                                    >
                                    <span class="ml-1 font-mono"
                                        >{formatBytes(diag.bytesSent)}</span
                                    >
                                </div>
                                <div>
                                    <span class="text-base-content/50"
                                        >Packets:</span
                                    >
                                    <span class="ml-1 font-mono"
                                        >{diag.packetsSent.toLocaleString()}</span
                                    >
                                </div>
                                <div>
                                    <span class="text-base-content/50"
                                        >Bitrate:</span
                                    >
                                    <span class="ml-1 font-mono"
                                        >{formatBitrate(
                                            diag.availableOutgoingBitrate,
                                        )}</span
                                    >
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}

    <!-- Info Section -->
    <div class="text-xs text-base-content/50 space-y-1 mt-4">
        <p>
            <strong>P2P (Peer-to-Peer):</strong> Direct connection between users
            - lowest latency
        </p>
        <p>
            <strong>Relay:</strong> Connection routed through TURN server - higher
            latency but works behind restrictive NATs
        </p>
        <p class="mt-2">
            Diagnostics update every second while this panel is open.
        </p>
    </div>
</div>
