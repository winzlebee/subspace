import { get } from "svelte/store";
import { currentUser, voiceStates, voiceChannelId } from "./stores";
import { wsSignalSdp, wsSignalIce } from "./ws";
import type { SignalSdpPayload, SignalIcePayload } from "./types";
import { writable } from "svelte/store";

import { getServerUrl, getTurnCredentials } from "./api";

async function getIceServers(): Promise<RTCConfiguration> {
    const serverUrl = getServerUrl();

    // Gets the base server hostname minus any port or leading protocol information. 
    // We can use this to get the TURN server URL
    const hostname = serverUrl.replace(/^https?:\/\//, "").split(":")[0].split("/")[0];


    try {
        // Get the credentials for the TURN server from the subspace instance.

        const creds = await getTurnCredentials();
        let turnUrls = creds.uris;

        if (!turnUrls || turnUrls.length === 0) {
            // Just assume the TURN server is running on the same host as the subspace instance
            turnUrls = [`turn:${hostname}:3478`];
        }

        const servers = {
            iceServers: [
                {
                    urls: turnUrls,
                    username: creds.username,
                    credential: creds.credential,
                }
            ],
        };

        console.log("Connecting to WebRTC via ICE servers: ", servers);

        return servers;
    } catch (error) {
        // We couldn't get any credentials - that's fine, we can still use STUN. 
        // The caveat is that STUN won't work if the user is behind a symmetric NAT.

        console.error("Failed to fetch TURN credentials, falling back to STUN only:", error);

        return {
            iceServers: [
                {
                    urls: `stun:${hostname}:3478`,
                },
            ],
        };
    }
}

let localStream: MediaStream | null = null;
let localVideoTrack: MediaStreamTrack | null = null;
let localScreenTrack: MediaStreamTrack | null = null;
let peerConnections: Record<string, RTCPeerConnection> = {};

export const remoteStreams = writable<Record<string, MediaStream[]>>({});
export const localVideoStream = writable<MediaStream | null>(null);
export const localScreenStream = writable<MediaStream | null>(null);
export const webrtcError = writable<string | null>(null);

// ── Connection Diagnostics ───────────────────────────────────────────────────
export interface ConnectionDiagnostics {
    userId: string;
    username: string;
    connectionType: "direct" | "relay" | "unknown";
    connectionState: RTCPeerConnectionState;
    iceConnectionState: RTCIceConnectionState;
    localCandidate: string | null;
    remoteCandidate: string | null;
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
    currentRoundTripTime: number | null;
    availableIncomingBitrate: number | null;
    availableOutgoingBitrate: number | null;
    detailedStatus: string;
}

export const connectionDiagnostics = writable<Record<string, ConnectionDiagnostics>>({});

// Overall voice connection status
export interface VoiceConnectionStatus {
    inVoiceChannel: boolean;
    isAlone: boolean;
    turnServerConnected: boolean;
    turnServerStatus: "not-needed" | "connecting" | "connected" | "failed";
    activeConnections: number;
    statusMessage: string;
}

export const voiceConnectionStatus = writable<VoiceConnectionStatus>({
    inVoiceChannel: false,
    isAlone: true,
    turnServerConnected: false,
    turnServerStatus: "not-needed",
    activeConnections: 0,
    statusMessage: "Not in voice channel"
});

let diagnosticsInterval: ReturnType<typeof setInterval> | null = null;

// ── Audio Settings ───────────────────────────────────────────────────────────
export const audioInputDeviceId = writable<string | null>(localStorage.getItem("audioInputDeviceId"));
export const audioOutputDeviceId = writable<string | null>(localStorage.getItem("audioOutputDeviceId"));

audioInputDeviceId.subscribe(id => {
    if (id) localStorage.setItem("audioInputDeviceId", id);
    else localStorage.removeItem("audioInputDeviceId");
});

audioOutputDeviceId.subscribe(id => {
    if (id) localStorage.setItem("audioOutputDeviceId", id);
    else localStorage.removeItem("audioOutputDeviceId");
    // Apply output device change immediately if possible
    setAudioOutputDevice(id);
});


export async function getAudioDevices() {
    try {
        // Request permission primarily to get labels
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        return {
            inputs: devices.filter(d => d.kind === "audioinput"),
            outputs: devices.filter(d => d.kind === "audiooutput")
        };
    } catch (e) {
        console.error("Error getting audio devices:", e);
        return { inputs: [], outputs: [] };
    }
}

export async function setAudioInputDevice(deviceId: string) {
    console.log("Switching audio input to", deviceId);
    audioInputDeviceId.set(deviceId);

    // If we're currently in a call (localStream exists), we need to switch the track
    if (localStream) {
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: deviceId } },
                video: false
            });

            const newTrack = newStream.getAudioTracks()[0];
            const oldTrack = localStream.getAudioTracks()[0];

            if (oldTrack) {
                oldTrack.stop();
                localStream.removeTrack(oldTrack);
            }
            localStream.addTrack(newTrack);

            // Update all peer connections
            for (const pc of Object.values(peerConnections)) {
                const sender = pc.getSenders().find(s => s.track?.kind === "audio");
                if (sender) {
                    sender.replaceTrack(newTrack);
                } else {
                    // Fallback: add track if it wasn't there (shouldn't happen in voice mode usually)
                    pc.addTrack(newTrack, localStream);
                }
            }

            // Restart speaking detection with new stream
            stopLocalSpeakingDetection();
            startLocalSpeakingDetection(localStream);

        } catch (e) {
            console.error("Failed to switch input device:", e);
        }
    }
}

export async function setAudioOutputDevice(deviceId: string | null) {
    if (!deviceId) return;
    console.log("Switching audio output to", deviceId);

    // Verify support for setSinkId
    // @ts-ignore
    if (!HTMLMediaElement.prototype.setSinkId) {
        console.warn("Browser does not support setSinkId");
        return;
    }

    // Update all remote audio elements
    for (const node of Object.values(remoteNodes)) {
        try {
            // @ts-ignore
            await node.audio.setSinkId(deviceId);
        } catch (e) {
            console.error("Failed to set output device for remote user:", e);
        }
    }
}

// ── Web Audio API Context ────────────────────────────────────────────────────
// We use a single global AudioContext for both playback and analysis.
// This context must be resumed on a user interaction (Join Voice click).
let globalAudioCtx: AudioContext | null = null;

// Track nodes to clean them up later
// key: userId
const remoteNodes: Record<string, { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; gain: GainNode; audio: HTMLAudioElement }> = {};

// Local nodes (for speaking detection only, not playback)
let localNodes: { source: MediaStreamAudioSourceNode; analyser: AnalyserNode } | null = null;

// ── Speaking detection ───────────────────────────────────────────────────────
export const speakingUsers = writable<Set<string>>(new Set());
let speakingCheckInterval: ReturnType<typeof setInterval> | null = null;
const SPEAKING_THRESHOLD = 15; // amplitude threshold for "speaking"

function initAudioContext() {
    if (!globalAudioCtx) {
        globalAudioCtx = new AudioContext();
    }
    if (globalAudioCtx.state === "suspended") {
        globalAudioCtx.resume().catch(e => console.error("Failed to resume AudioContext:", e));
    }
}

function stopAudioContext() {
    if (globalAudioCtx) {
        globalAudioCtx.close().catch(() => { });
        globalAudioCtx = null;
    }
}

function startLocalSpeakingDetection(stream: MediaStream) {
    if (!globalAudioCtx) initAudioContext();
    if (!globalAudioCtx) return;

    try {
        const source = globalAudioCtx.createMediaStreamSource(stream);
        const analyser = globalAudioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        // Do NOT connect to destination (feedback loop)

        localNodes = { source, analyser };
    } catch (e) {
        console.error("Failed to start local speaking detection:", e);
    }
}

function stopLocalSpeakingDetection() {
    if (localNodes) {
        localNodes.source.disconnect();
        localNodes.analyser.disconnect();
        localNodes = null;
    }
}

function handleRemoteStream(userId: string, stream: MediaStream) {
    if (!globalAudioCtx) initAudioContext();
    if (!globalAudioCtx) return;

    // Check if we already handle this user
    // if (remoteNodes[userId]) return; // <-- REMOVED because we might get a second track (video) for the same user

    try {
        // If we don't have an audio node for this user yet, set it up
        // We only want to pipe AUDIO to the audio context.
        if (stream.getAudioTracks().length > 0 && !remoteNodes[userId]) {
            const source = globalAudioCtx.createMediaStreamSource(stream);
            const analyser = globalAudioCtx.createAnalyser();
            analyser.fftSize = 256;
            const gain = globalAudioCtx.createGain(); // For muet/unmute or volume

            // Connect graph: Source -> Analyser -> Gain -> Destination (Speakers)
            source.connect(analyser);
            analyser.connect(gain);
            gain.connect(globalAudioCtx.destination);

            // Workaround: Attach to a hidden audio element to ensure the stream flows
            // This fixes issues where some browsers GC the stream or don't render it via Web Audio
            const audio = new Audio();
            audio.srcObject = stream;
            audio.muted = true; // We hear it via Web Audio

            const outputId = get(audioOutputDeviceId);
            // @ts-ignore
            if (outputId && typeof audio.setSinkId === 'function') {
                // @ts-ignore
                audio.setSinkId(outputId).catch(console.error);
            }

            audio.play().catch(e => console.warn("Hidden audio play failed:", e));

            remoteNodes[userId] = { source, analyser, gain, audio };

            // Handle stream end (audio track specifically)
            stream.getAudioTracks()[0].onended = () => {
                cleanupRemoteUser(userId);
            };
        }

        // Add to remoteStreams store for UI
        remoteStreams.update(s => {
            const current = s[userId] || [];
            if (!current.some(st => st.id === stream.id)) {
                return { ...s, [userId]: [...current, stream] };
            }
            return s;
        });

        // Handle stream end/empty
        const onRemove = () => {
            if (stream.getTracks().length === 0) {
                remoteStreams.update(s => ({
                    ...s,
                    [userId]: (s[userId] || []).filter(st => st.id !== stream.id)
                }));
            }
        };
        stream.addEventListener('removetrack', onRemove);

    } catch (e) {
        console.error("Failed to handle remote stream:", e);
    }
}

function cleanupRemoteUser(userId: string) {
    if (remoteNodes[userId]) {
        const { source, analyser, gain, audio } = remoteNodes[userId];
        source.disconnect();
        analyser.disconnect();
        gain.disconnect();

        audio.srcObject = null;
        audio.pause();

        delete remoteNodes[userId];
    }
    remoteStreams.update(s => {
        const next = { ...s };
        delete next[userId];
        return next;
    });
}

function startSpeakingCheckLoop() {
    if (speakingCheckInterval) return;
    speakingCheckInterval = setInterval(() => {
        const speaking = new Set<string>();
        const myId = get(currentUser)?.id;

        // Check local
        if (localNodes && myId) {
            const data = new Uint8Array(localNodes.analyser.frequencyBinCount);
            localNodes.analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            if (avg > SPEAKING_THRESHOLD) speaking.add(myId);
        }

        // Check remotes
        for (const [userId, { analyser }] of Object.entries(remoteNodes)) {
            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            if (avg > SPEAKING_THRESHOLD) speaking.add(userId);
        }

        speakingUsers.set(speaking);
    }, 100);
}

function stopSpeakingCheckLoop() {
    if (speakingCheckInterval) {
        clearInterval(speakingCheckInterval);
        speakingCheckInterval = null;
    }
    speakingUsers.set(new Set());
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function joinVoice(channelId: string) {
    try {
        webrtcError.set(null);

        // 0. Init Audio Context (must happen during user interaction event loop roughly)
        initAudioContext();

        // 1. Get local audio
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
        });

        // 2. Start speaking detection
        startLocalSpeakingDetection(localStream);
        startSpeakingCheckLoop();

        // 3. Listen for signaling events
        window.addEventListener("webrtc_signal", handleSignal as unknown as EventListener);

        // 4. Create peers for existing users in the channel
        const states = get(voiceStates)[channelId] || [];
        const myId = get(currentUser)?.id;

        for (const state of states) {
            if (state.user_id !== myId) {
                createPeerConnection(state.user_id, true); // true = initiator (offer)
            }
        }
    } catch (e) {
        console.error("Failed to join voice:", e);
        leaveVoice();
    }
}

export function leaveVoice() {
    // 1. Stop local tracks
    if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        localStream = null;
    }
    if (localVideoTrack) {
        localVideoTrack.stop();
        localVideoTrack = null;
    }
    if (localScreenTrack) {
        localScreenTrack.stop();
        localScreenTrack = null;
    }
    stopLocalSpeakingDetection();

    // 2. Close all peer connections
    Object.values(peerConnections).forEach((pc) => pc.close());
    peerConnections = {};

    // 3. Cleanup remote nodes
    Object.keys(remoteNodes).forEach(cleanupRemoteUser);

    // 4. Stop speaking detection loop & AudioContext
    stopSpeakingCheckLoop();
    stopAudioContext();

    // 5. Stop diagnostics collection
    stopDiagnosticsCollection();

    // 6. Remove listeners
    window.removeEventListener("webrtc_signal", handleSignal as unknown as EventListener);
}

export function toggleMute(muted: boolean) {
    if (localStream) {
        localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    }
}

export function toggleDeafen(deafened: boolean) {
    // Mute/unmute all remote audio via GainNodes
    Object.values(remoteNodes).forEach(({ gain }) => {
        gain.gain.value = deafened ? 0 : 1;
    });
}

export async function toggleVideo(enable: boolean) {
    if (enable) {
        if (localVideoTrack) return; // already enabled
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            localVideoTrack = stream.getVideoTracks()[0];
            localVideoStream.set(stream);

            // Add track to all peer connections
            Object.values(peerConnections).forEach(pc => {
                pc.addTrack(localVideoTrack!, stream); // stream doesn't matter much here but required
                // Re-negotiation happens automatically via existing logic if we strictly followed it, 
                // but actually we need to trigger it manually or ensure onnegotiationneeded fires.
                // Adding a track DOES trigger onnegotiationneeded.
            });

            // Handle track ending (e.g. user revokes permission or unplug)
            localVideoTrack.onended = () => toggleVideo(false);

        } catch (e) {
            console.error("Failed to enable video:", e);
        }
    } else {
        if (localVideoTrack) {
            localVideoTrack.stop();
            // Remove from PCs
            Object.values(peerConnections).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track === localVideoTrack);
                if (sender) pc.removeTrack(sender);
            });
            localVideoTrack = null;
            localVideoStream.set(null);
        }
    }
}

export async function toggleScreenShare(enable: boolean) {
    if (enable) {
        if (localScreenTrack) return;
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            localScreenTrack = stream.getVideoTracks()[0];
            localScreenStream.set(stream);

            Object.values(peerConnections).forEach(pc => {
                pc.addTrack(localScreenTrack!, stream);
            });

            localScreenTrack.onended = () => toggleScreenShare(false);

        } catch (e) {
            console.error("Failed to enable screen share:", e);
            // User probably cancelled the prompt
        }
    } else {
        if (localScreenTrack) {
            localScreenTrack.stop();
            Object.values(peerConnections).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track === localScreenTrack);
                if (sender) pc.removeTrack(sender);
            });
            localScreenTrack = null;
            localScreenStream.set(null);
        }
    }
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function createPeerConnection(targetUserId: string, initiator: boolean) {
    if (peerConnections[targetUserId]) return peerConnections[targetUserId];

    console.log(`[WebRTC] Creating PeerConnection for ${targetUserId} (initiator=${initiator})`);

    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection(iceServers);
    peerConnections[targetUserId] = pc;

    // Add local tracks
    if (localStream) {
        const tracks = localStream.getTracks();
        console.log(`[WebRTC] Adding ${tracks.length} local audio tracks to ${targetUserId}`);
        tracks.forEach((track) => pc.addTrack(track, localStream!));
    } else {
        console.warn(`[WebRTC] No localStream found when creating PC for ${targetUserId}`);
    }

    if (localVideoTrack) {
        console.log(`[WebRTC] Adding local video track to ${targetUserId}`);
        // Create a dummy stream for the track if we need to, or reuse localStream if possible.
        // WebRTC tracks are what matters.
        pc.addTrack(localVideoTrack, new MediaStream([localVideoTrack]));
    }
    if (localScreenTrack) {
        console.log(`[WebRTC] Adding local screen track to ${targetUserId}`);
        pc.addTrack(localScreenTrack, new MediaStream([localScreenTrack]));
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            wsSignalIce(
                targetUserId,
                JSON.stringify(event.candidate),
                event.candidate.sdpMid,
                event.candidate.sdpMLineIndex
            );
        }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
        console.log(`[WebRTC] ontrack from ${targetUserId}:`, event.track.kind, event.streams[0]?.id);
        const [remoteStream] = event.streams;
        if (remoteStream) {
            handleRemoteStream(targetUserId, remoteStream);
        } else {
            console.warn(`[WebRTC] ontrack from ${targetUserId} has no stream!`);
        }
    };

    // Negotiation needed (only for initiator)
    if (initiator) {
        pc.onnegotiationneeded = async () => {
            console.log(`[WebRTC] onnegotiationneeded for ${targetUserId}`);
            try {
                const offer = await pc.createOffer();
                console.log(`[WebRTC] Created Offer for ${targetUserId} (SDP length: ${offer.sdp?.length})`);
                await pc.setLocalDescription(offer);
                wsSignalSdp(targetUserId, JSON.stringify(offer), "offer");
            } catch (e) {
                console.error("Negotiation error:", e);
            }
        };
    }

    pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE Connection State (${targetUserId}):`, pc.iceConnectionState);
        if (pc.iceConnectionState === "failed") {
            const err = "ICE connection failed. Check TURN config.";
            console.error(err);
            webrtcError.set(err);
        }
    };

    pc.onicegatheringstatechange = () => {
        console.log(`[WebRTC] ICE Gathering State (${targetUserId}):`, pc.iceGatheringState);
    };

    pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection State (${targetUserId}):`, pc.connectionState);
    };

    pc.onsignalingstatechange = () => {
        console.log(`[WebRTC] Signaling State (${targetUserId}):`, pc.signalingState);
    };

    return pc;
}

async function handleSignal(event: CustomEvent) {
    const env = event.detail;
    const type = env.type;

    const myId = get(currentUser)?.id;
    if (!myId) return;

    if (type === "signal_sdp") {
        const payload = env.payload as SignalSdpPayload;
        const { from_user_id, target_user_id, sdp, sdp_type } = payload;

        if (target_user_id !== myId) return;
        console.log(`[WebRTC] Received SDP ${sdp_type} from ${from_user_id}`);

        let pc = peerConnections[from_user_id];

        if (!pc) {
            if (sdp_type === "answer") {
                console.warn(`Ignoring answer from ${from_user_id} - no local connection`);
                return;
            }
            pc = await createPeerConnection(from_user_id, false);
        }

        try {
            if (sdp_type === "answer" && pc.signalingState !== "have-local-offer") {
                console.warn(`Ignoring answer from ${from_user_id} - state is ${pc.signalingState}`);
                return;
            }

            const descObj = JSON.parse(sdp);
            console.log(`[WebRTC] Setting Remote Description (${sdp_type}) from ${from_user_id}`);
            await pc.setRemoteDescription(descObj);

            if (sdp_type === "offer") {
                console.log(`[WebRTC] Creating Answer for ${from_user_id}`);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                wsSignalSdp(from_user_id, JSON.stringify(answer), "answer");
            }
        } catch (e) {
            console.error("SDP error:", e);
        }

    } else if (type === "signal_ice") {
        const payload = env.payload as SignalIcePayload;
        const { from_user_id, target_user_id, candidate } = payload;

        if (target_user_id !== myId) return;

        const pc = peerConnections[from_user_id];
        if (pc) {
            try {
                const candObj = JSON.parse(candidate);
                await pc.addIceCandidate(candObj);
            } catch (e) {
                console.error("ICE error:", e);
            }
        }
    }
}

// ── Diagnostics Collection ──────────────────────────────────────────────────

function generateDetailedStatus(
    connectionState: RTCPeerConnectionState,
    iceConnectionState: RTCIceConnectionState,
    connectionType: "direct" | "relay" | "unknown",
    hasReceivedData: boolean
): string {
    // Handle failed states first
    if (connectionState === "failed" || iceConnectionState === "failed") {
        if (connectionType === "relay" || iceConnectionState === "failed") {
            return "Connection failed - TURN server unreachable or misconfigured";
        }
        return "Connection failed - unable to establish peer connection";
    }

    if (connectionState === "closed") {
        return "Connection closed";
    }

    if (connectionState === "disconnected") {
        return "Connection lost - attempting to reconnect";
    }

    // Handle connecting states
    if (connectionState === "connecting" || connectionState === "new") {
        if (iceConnectionState === "checking") {
            return "Establishing connection - testing network paths";
        }
        if (iceConnectionState === "new") {
            return "Initializing connection";
        }
        return "Connecting to peer";
    }

    // Handle connected states
    if (connectionState === "connected") {
        if (!hasReceivedData) {
            if (connectionType === "relay") {
                return "Connected via TURN relay - syncing audio stream";
            }
            return "Connected - syncing audio stream";
        }

        if (connectionType === "relay") {
            return "Connected and streaming via TURN relay server";
        }
        if (connectionType === "direct") {
            return "Connected and streaming (peer-to-peer)";
        }
        return "Connected and streaming";
    }

    // Default fallback
    return `Connection state: ${connectionState} (ICE: ${iceConnectionState})`;
}

function updateOverallVoiceStatus() {
    const channelId = get(voiceChannelId);
    const states = get(voiceStates);
    const myId = get(currentUser)?.id;

    if (!channelId || !myId) {
        voiceConnectionStatus.set({
            inVoiceChannel: false,
            isAlone: true,
            turnServerConnected: false,
            turnServerStatus: "not-needed",
            activeConnections: 0,
            statusMessage: "Not in voice channel"
        });
        return;
    }

    const usersInChannel = states[channelId] || [];
    const otherUsers = usersInChannel.filter(s => s.user_id !== myId);
    const isAlone = otherUsers.length === 0;

    if (isAlone) {
        voiceConnectionStatus.set({
            inVoiceChannel: true,
            isAlone: true,
            turnServerConnected: false,
            turnServerStatus: "not-needed",
            activeConnections: 0,
            statusMessage: "In voice channel (alone - no connections needed)"
        });
        return;
    }

    // Check peer connections
    const activeConnections = Object.keys(peerConnections).length;
    const connectedCount = Object.values(peerConnections).filter(
        pc => pc.connectionState === "connected"
    ).length;
    const connectingCount = Object.values(peerConnections).filter(
        pc => pc.connectionState === "connecting" || pc.connectionState === "new"
    ).length;
    const failedCount = Object.values(peerConnections).filter(
        pc => pc.connectionState === "failed"
    ).length;

    // Check if any connection is using TURN relay
    let turnServerStatus: "not-needed" | "connecting" | "connected" | "failed" = "not-needed";
    let turnServerConnected = false;

    const diags = get(connectionDiagnostics);
    const hasRelayConnection = Object.values(diags).some(d => d.connectionType === "relay");
    const hasFailedConnection = failedCount > 0;

    if (hasRelayConnection) {
        turnServerStatus = "connected";
        turnServerConnected = true;
    } else if (connectingCount > 0) {
        // Might need TURN, still establishing
        turnServerStatus = "connecting";
    } else if (hasFailedConnection) {
        turnServerStatus = "failed";
    }

    // Generate status message
    let statusMessage = "";
    if (failedCount > 0) {
        statusMessage = `${failedCount} connection(s) failed - check TURN server configuration`;
    } else if (connectedCount === otherUsers.length) {
        if (hasRelayConnection) {
            statusMessage = `Connected to ${connectedCount} user(s) via TURN relay`;
        } else {
            statusMessage = `Connected to ${connectedCount} user(s) (peer-to-peer)`;
        }
    } else if (connectingCount > 0) {
        statusMessage = `Connecting to ${connectingCount} user(s)...`;
    } else {
        statusMessage = `${connectedCount}/${otherUsers.length} connections established`;
    }

    voiceConnectionStatus.set({
        inVoiceChannel: true,
        isAlone: false,
        turnServerConnected,
        turnServerStatus,
        activeConnections: connectedCount,
        statusMessage
    });
}

async function collectDiagnostics() {
    const diagnostics: Record<string, ConnectionDiagnostics> = {};
    const states = get(voiceStates);
    const channelId = get(voiceChannelId);
    
    if (!channelId) return;
    
    const usersInChannel = states[channelId] || [];

    for (const [userId, pc] of Object.entries(peerConnections)) {
        const userState = usersInChannel.find(s => s.user_id === userId);
        const username = userState?.username || "Unknown";

        try {
            const stats = await pc.getStats();
            let localCandidate: string | null = null;
            let remoteCandidate: string | null = null;
            let connectionType: "direct" | "relay" | "unknown" = "unknown";
            let bytesReceived = 0;
            let bytesSent = 0;
            let packetsReceived = 0;
            let packetsSent = 0;
            let currentRoundTripTime: number | null = null;
            let availableIncomingBitrate: number | null = null;
            let availableOutgoingBitrate: number | null = null;

            stats.forEach((report) => {
                if (report.type === "candidate-pair" && report.state === "succeeded") {
                    // Get the active candidate pair
                    const localCandidateId = report.localCandidateId;
                    const remoteCandidateId = report.remoteCandidateId;

                    // Find the actual candidate info
                    stats.forEach((r) => {
                        if (r.id === localCandidateId && r.type === "local-candidate") {
                            localCandidate = `${r.candidateType} (${r.protocol})`;
                            if (r.address) localCandidate += ` ${r.address}:${r.port}`;
                        }
                        if (r.id === remoteCandidateId && r.type === "remote-candidate") {
                            remoteCandidate = `${r.candidateType} (${r.protocol})`;
                            if (r.address) remoteCandidate += ` ${r.address}:${r.port}`;
                        }
                    });

                    // Determine connection type
                    if (localCandidate?.includes("relay") || remoteCandidate?.includes("relay")) {
                        connectionType = "relay";
                    } else if (localCandidate && remoteCandidate) {
                        connectionType = "direct";
                    }

                    currentRoundTripTime = report.currentRoundTripTime || null;
                    availableIncomingBitrate = report.availableIncomingBitrate || null;
                    availableOutgoingBitrate = report.availableOutgoingBitrate || null;
                }

                if (report.type === "inbound-rtp" && report.kind === "audio") {
                    bytesReceived += report.bytesReceived || 0;
                    packetsReceived += report.packetsReceived || 0;
                }

                if (report.type === "outbound-rtp" && report.kind === "audio") {
                    bytesSent += report.bytesSent || 0;
                    packetsSent += report.packetsSent || 0;
                }
            });

            // Generate detailed status message
            const detailedStatus = generateDetailedStatus(
                pc.connectionState,
                pc.iceConnectionState,
                connectionType,
                bytesReceived > 0
            );

            diagnostics[userId] = {
                userId,
                username,
                connectionType,
                connectionState: pc.connectionState,
                iceConnectionState: pc.iceConnectionState,
                localCandidate,
                remoteCandidate,
                bytesReceived,
                bytesSent,
                packetsReceived,
                packetsSent,
                currentRoundTripTime,
                availableIncomingBitrate,
                availableOutgoingBitrate,
                detailedStatus,
            };
        } catch (e) {
            console.error(`Failed to collect diagnostics for ${userId}:`, e);
        }
    }

    connectionDiagnostics.set(diagnostics);
    updateOverallVoiceStatus();
}

function startDiagnosticsCollection() {
    if (diagnosticsInterval) return;
    diagnosticsInterval = setInterval(collectDiagnostics, 1000);
}

function stopDiagnosticsCollection() {
    if (diagnosticsInterval) {
        clearInterval(diagnosticsInterval);
        diagnosticsInterval = null;
    }
    connectionDiagnostics.set({});
}

export function enableDiagnostics() {
    startDiagnosticsCollection();
}

export function disableDiagnostics() {
    stopDiagnosticsCollection();
}

export interface TurnTestResult {
    status: "testing" | "success" | "failed" | "error";
    message: string;
    details?: {
        turnServerUrl?: string;
        localCandidate?: string;
        remoteCandidate?: string;
        connectionType?: "direct" | "relay" | "unknown";
        iceConnectionState?: RTCIceConnectionState;
        connectionState?: RTCPeerConnectionState;
        testDuration?: number;
        error?: string;
        p2pCapable?: boolean;
        relayCapable?: boolean;
    };
}

export const turnTestResult = writable<TurnTestResult | null>(null);

/**
 * Tests TURN server connectivity without joining a voice channel.
 * Creates two local peer connections to simulate a real connection and
 * verifies both P2P and TURN relay capabilities.
 * 
 * @param forceRelay - If true, forces relay-only mode to strictly test TURN server
 */
export async function testTurnConnection(forceRelay: boolean = false): Promise<TurnTestResult> {
    turnTestResult.set({
        status: "testing",
        message: "Testing TURN server connection...",
    });

    // Check if WebRTC is available
    if (typeof RTCPeerConnection === 'undefined') {
        const result: TurnTestResult = {
            status: "error",
            message: "WebRTC is not available in this environment. Please ensure you're running in a browser or Tauri with WebRTC support.",
            details: {
                error: "RTCPeerConnection is not defined"
            }
        };
        turnTestResult.set(result);
        return result;
    }

    const startTime = Date.now();
    let testPc1: RTCPeerConnection | null = null;
    let testPc2: RTCPeerConnection | null = null;

    try {
        // Get ICE servers configuration
        const iceConfig = await getIceServers();
        
        if (!iceConfig.iceServers || iceConfig.iceServers.length === 0) {
            const result: TurnTestResult = {
                status: "error",
                message: "No ICE servers configured",
                details: {
                    error: "ICE server configuration is empty"
                }
            };
            turnTestResult.set(result);
            return result;
        }

        const turnServer = iceConfig.iceServers[0];
        const turnUrls = Array.isArray(turnServer.urls) ? turnServer.urls : [turnServer.urls];
        const turnUrl = turnUrls.find(url => url.startsWith("turn:")) || turnUrls[0];

        console.log("[TURN Test] Testing connection to:", turnUrl);
        console.log("[TURN Test] ICE configuration:", iceConfig);
        console.log("[TURN Test] Force relay mode:", forceRelay);

        // Optionally force relay-only mode for strict TURN testing
        const config: RTCConfiguration = forceRelay 
            ? { ...iceConfig, iceTransportPolicy: "relay" }
            : iceConfig;

        // Create two peer connections to test connectivity
        // This simulates a real peer-to-peer connection locally
        testPc1 = new RTCPeerConnection(config);
        testPc2 = new RTCPeerConnection(config);

        // Track ICE candidates and connection state
        let pc1LocalCandidate: string | undefined = undefined;
        let pc1RemoteCandidate: string | undefined = undefined;
        let connectionType: "direct" | "relay" | "unknown" = "unknown";
        let iceConnectionState: RTCIceConnectionState = "new";
        let connectionState: RTCPeerConnectionState = "new";
        let hasRelayCandidates = false;
        let hasHostCandidates = false;

        // Track all ICE candidates to determine capabilities
        const allCandidates: RTCIceCandidate[] = [];

        // Create a data channel to trigger ICE gathering
        const dataChannel = testPc1.createDataChannel("test");
        
        // Monitor data channel for actual connectivity
        let dataChannelOpen = false;
        dataChannel.onopen = () => {
            dataChannelOpen = true;
            console.log("[TURN Test] Data channel opened");
        };

        // Set up promise to wait for connection
        const connectionPromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Connection timeout after 15 seconds"));
            }, 15000);

            testPc1!.oniceconnectionstatechange = () => {
                iceConnectionState = testPc1!.iceConnectionState;
                console.log("[TURN Test] PC1 ICE state:", iceConnectionState);
                
                if (iceConnectionState === "connected" || iceConnectionState === "completed") {
                    clearTimeout(timeout);
                    resolve();
                } else if (iceConnectionState === "failed") {
                    clearTimeout(timeout);
                    reject(new Error("ICE connection failed"));
                }
            };

            testPc1!.onconnectionstatechange = () => {
                connectionState = testPc1!.connectionState;
                console.log("[TURN Test] PC1 connection state:", connectionState);
                
                if (connectionState === "failed") {
                    clearTimeout(timeout);
                    reject(new Error("Peer connection failed"));
                }
            };

            testPc2!.oniceconnectionstatechange = () => {
                console.log("[TURN Test] PC2 ICE state:", testPc2!.iceConnectionState);
            };
        });

        // Exchange ICE candidates
        testPc1.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("[TURN Test] PC1 candidate:", event.candidate.type, event.candidate.candidate);
                allCandidates.push(event.candidate);
                
                // Check candidate types
                if (event.candidate.type === "relay") {
                    hasRelayCandidates = true;
                }
                if (event.candidate.type === "host") {
                    hasHostCandidates = true;
                }
                
                if (testPc2) {
                    testPc2.addIceCandidate(event.candidate).catch(console.error);
                }
            }
        };

        testPc2.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("[TURN Test] PC2 candidate:", event.candidate.type, event.candidate.candidate);
                if (testPc1) {
                    testPc1.addIceCandidate(event.candidate).catch(console.error);
                }
            }
        };

        // Create and exchange offers/answers
        const offer = await testPc1.createOffer();
        await testPc1.setLocalDescription(offer);
        await testPc2.setRemoteDescription(offer);

        const answer = await testPc2.createAnswer();
        await testPc2.setLocalDescription(answer);
        await testPc1.setRemoteDescription(answer);

        // Wait for connection to establish
        await connectionPromise;

        // Give it a moment to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Analyze the connection to determine if TURN was used
        const stats = await testPc1.getStats();
        stats.forEach((report) => {
            if (report.type === "candidate-pair" && report.state === "succeeded") {
                const localCandidateId = report.localCandidateId;
                const remoteCandidateId = report.remoteCandidateId;

                stats.forEach((r) => {
                    if (r.id === localCandidateId && r.type === "local-candidate") {
                        pc1LocalCandidate = `${r.candidateType} (${r.protocol})`;
                        if (r.address) pc1LocalCandidate += ` ${r.address}:${r.port}`;
                    }
                    if (r.id === remoteCandidateId && r.type === "remote-candidate") {
                        pc1RemoteCandidate = `${r.candidateType} (${r.protocol})`;
                        if (r.address) pc1RemoteCandidate += ` ${r.address}:${r.port}`;
                    }
                });

                if (pc1LocalCandidate?.includes("relay") || pc1RemoteCandidate?.includes("relay")) {
                    connectionType = "relay";
                } else if (pc1LocalCandidate && pc1RemoteCandidate) {
                    connectionType = "direct";
                }
            }
        });

        const testDuration = Date.now() - startTime;

        let message = "";
        let status: "success" | "failed" = "success";

        // Determine capabilities and generate appropriate message
        const p2pCapable = hasHostCandidates;
        const relayCapable = hasRelayCandidates;

        if ((connectionType as string) === "relay") {
            message = `✓ TURN server working! Connected via relay in ${testDuration}ms. Network requires TURN for voice chat.`;
        } else if ((connectionType as string) === "direct") {
            if (relayCapable) {
                message = `✓ Connection successful (P2P) in ${testDuration}ms. TURN server available and working as fallback.`;
            } else {
                message = `⚠ Connected via P2P in ${testDuration}ms, but no TURN relay candidates found. TURN server may not be configured correctly.`;
                status = "failed";
            }
        } else {
            message = `⚠ Connection established in ${testDuration}ms, but connection type could not be determined.`;
        }

        const result: TurnTestResult = {
            status,
            message,
            details: {
                turnServerUrl: turnUrl,
                localCandidate: pc1LocalCandidate,
                remoteCandidate: pc1RemoteCandidate,
                connectionType,
                iceConnectionState,
                connectionState,
                testDuration,
                p2pCapable,
                relayCapable,
            }
        };

        turnTestResult.set(result);
        return result;

    } catch (error) {
        const testDuration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        console.error("[TURN Test] Failed:", error);

        let detailedMessage = `✗ TURN server test failed: ${errorMessage}`;
        
        // Provide more specific guidance based on error
        if (errorMessage.includes("timeout")) {
            detailedMessage += ". This usually indicates firewall/network issues or TURN server is not running.";
        } else if (errorMessage.includes("ICE connection failed")) {
            detailedMessage += ". Unable to establish connection - check TURN server configuration and firewall rules.";
        }

        const result: TurnTestResult = {
            status: "failed",
            message: detailedMessage,
            details: {
                error: errorMessage,
                testDuration,
            }
        };

        turnTestResult.set(result);
        return result;

    } finally {
        // Clean up test peer connections
        if (testPc1) {
            testPc1.close();
        }
        if (testPc2) {
            testPc2.close();
        }
    }
}

/**
 * Tests TURN server connectivity using a remote server endpoint.
 * This provides more realistic testing by connecting to an actual remote peer.
 */
export async function testTurnConnectionRemote(): Promise<TurnTestResult> {
    turnTestResult.set({
        status: "testing",
        message: "Testing TURN server with remote peer...",
    });

    // Check if WebRTC is available
    if (typeof RTCPeerConnection === 'undefined') {
        const result: TurnTestResult = {
            status: "error",
            message: "WebRTC is not available in this environment.",
            details: {
                error: "RTCPeerConnection is not defined"
            }
        };
        turnTestResult.set(result);
        return result;
    }

    const startTime = Date.now();
    let testPc: RTCPeerConnection | null = null;
    let ws: WebSocket | null = null;

    try {
        // Get ICE servers configuration
        const iceConfig = await getIceServers();
        
        if (!iceConfig.iceServers || iceConfig.iceServers.length === 0) {
            const result: TurnTestResult = {
                status: "error",
                message: "No ICE servers configured",
                details: {
                    error: "ICE server configuration is empty"
                }
            };
            turnTestResult.set(result);
            return result;
        }

        const turnServer = iceConfig.iceServers[0];
        const turnUrls = Array.isArray(turnServer.urls) ? turnServer.urls : [turnServer.urls];
        const turnUrl = turnUrls.find(url => url.startsWith("turn:")) || turnUrls[0];

        console.log("[TURN Remote Test] Testing connection to:", turnUrl);

        // Connect to server's test endpoint
        const serverUrl = getServerUrl();
        const wsUrl = serverUrl.replace(/^http/, 'ws') + '/api/turn-test';
        
        console.log("[TURN Remote Test] Connecting to test endpoint:", wsUrl);

        // Create WebSocket connection
        ws = new WebSocket(wsUrl);

        // Wait for WebSocket to open
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("WebSocket connection timeout"));
            }, 5000);

            ws!.onopen = () => {
                clearTimeout(timeout);
                console.log("[TURN Remote Test] WebSocket connected");
                resolve();
            };

            ws!.onerror = (error) => {
                clearTimeout(timeout);
                reject(new Error("WebSocket connection failed"));
            };
        });

        // Create peer connection
        testPc = new RTCPeerConnection(iceConfig);

        let hasRelayCandidates = false;
        let hasHostCandidates = false;
        let pc1LocalCandidate: string | undefined = undefined;
        let pc1RemoteCandidate: string | undefined = undefined;
        let connectionType: "direct" | "relay" | "unknown" = "unknown";
        let iceConnectionState: RTCIceConnectionState = "new";
        let connectionState: RTCPeerConnectionState = "new";

        // Create data channel to trigger ICE gathering
        const dataChannel = testPc.createDataChannel("test");

        // Set up signaling through WebSocket
        testPc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("[TURN Remote Test] Local candidate:", event.candidate.type);
                
                if (event.candidate.type === "relay") {
                    hasRelayCandidates = true;
                }
                if (event.candidate.type === "host") {
                    hasHostCandidates = true;
                }

                // Send candidate to remote peer via WebSocket
                ws!.send(JSON.stringify({
                    type: "ice",
                    candidate: event.candidate
                }));
            }
        };

        // Handle messages from remote peer
        const connectionPromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Connection timeout after 20 seconds"));
            }, 20000);

            ws!.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === "answer") {
                        console.log("[TURN Remote Test] Received answer from remote peer");
                        await testPc!.setRemoteDescription(data.sdp);
                    } else if (data.type === "ice") {
                        console.log("[TURN Remote Test] Received ICE candidate from remote peer");
                        if (data.candidate) {
                            await testPc!.addIceCandidate(data.candidate);
                        }
                    }
                } catch (e) {
                    console.error("[TURN Remote Test] Error handling message:", e);
                }
            };

            testPc!.oniceconnectionstatechange = () => {
                iceConnectionState = testPc!.iceConnectionState;
                console.log("[TURN Remote Test] ICE state:", iceConnectionState);
                
                if (iceConnectionState === "connected" || iceConnectionState === "completed") {
                    clearTimeout(timeout);
                    resolve();
                } else if (iceConnectionState === "failed") {
                    clearTimeout(timeout);
                    reject(new Error("ICE connection failed"));
                }
            };

            testPc!.onconnectionstatechange = () => {
                connectionState = testPc!.connectionState;
                console.log("[TURN Remote Test] Connection state:", connectionState);
                
                if (connectionState === "failed") {
                    clearTimeout(timeout);
                    reject(new Error("Peer connection failed"));
                }
            };

            dataChannel.onopen = () => {
                console.log("[TURN Remote Test] Data channel opened");
            };
        });

        // Create and send offer
        const offer = await testPc.createOffer();
        await testPc.setLocalDescription(offer);
        
        ws.send(JSON.stringify({
            type: "offer",
            sdp: offer
        }));

        console.log("[TURN Remote Test] Sent offer to remote peer");

        // Wait for connection to establish
        await connectionPromise;

        // Give it a moment to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Analyze the connection
        const stats = await testPc.getStats();
        stats.forEach((report) => {
            if (report.type === "candidate-pair" && report.state === "succeeded") {
                const localCandidateId = report.localCandidateId;
                const remoteCandidateId = report.remoteCandidateId;

                stats.forEach((r) => {
                    if (r.id === localCandidateId && r.type === "local-candidate") {
                        pc1LocalCandidate = `${r.candidateType} (${r.protocol})`;
                        if (r.address) pc1LocalCandidate += ` ${r.address}:${r.port}`;
                    }
                    if (r.id === remoteCandidateId && r.type === "remote-candidate") {
                        pc1RemoteCandidate = `${r.candidateType} (${r.protocol})`;
                        if (r.address) pc1RemoteCandidate += ` ${r.address}:${r.port}`;
                    }
                });

                if (pc1LocalCandidate?.includes("relay") || pc1RemoteCandidate?.includes("relay")) {
                    connectionType = "relay";
                } else if (pc1LocalCandidate && pc1RemoteCandidate) {
                    connectionType = "direct";
                }
            }
        });

        const testDuration = Date.now() - startTime;

        let message = "";
        let status: "success" | "failed" = "success";

        const p2pCapable = hasHostCandidates;
        const relayCapable = hasRelayCandidates;

        if ((connectionType as string) === "relay") {
            message = `✓ TURN server working with remote peer! Connected via relay in ${testDuration}ms. This confirms TURN is properly configured.`;
        } else if ((connectionType as string) === "direct") {
            if (relayCapable) {
                message = `✓ Connected to remote peer (P2P) in ${testDuration}ms. TURN server available and working as fallback.`;
            } else {
                message = `⚠ Connected via P2P in ${testDuration}ms, but no TURN relay candidates found. TURN server may not be configured correctly.`;
                status = "failed";
            }
        } else {
            message = `⚠ Connection established in ${testDuration}ms, but connection type could not be determined.`;
        }

        const result: TurnTestResult = {
            status,
            message,
            details: {
                turnServerUrl: turnUrl,
                localCandidate: pc1LocalCandidate,
                remoteCandidate: pc1RemoteCandidate,
                connectionType,
                iceConnectionState,
                connectionState,
                testDuration,
                p2pCapable,
                relayCapable,
            }
        };

        turnTestResult.set(result);
        return result;

    } catch (error) {
        const testDuration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        console.error("[TURN Remote Test] Failed:", error);

        let detailedMessage = `✗ Remote TURN test failed: ${errorMessage}`;
        
        if (errorMessage.includes("WebSocket")) {
            detailedMessage += ". Could not connect to test endpoint - ensure server is running.";
        } else if (errorMessage.includes("timeout")) {
            detailedMessage += ". Connection timeout - check TURN server and firewall configuration.";
        } else if (errorMessage.includes("ICE connection failed")) {
            detailedMessage += ". Unable to establish connection - check TURN server configuration.";
        }

        const result: TurnTestResult = {
            status: "failed",
            message: detailedMessage,
            details: {
                error: errorMessage,
                testDuration,
            }
        };

        turnTestResult.set(result);
        return result;

    } finally {
        // Clean up
        if (testPc) {
            testPc.close();
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
    }
}
