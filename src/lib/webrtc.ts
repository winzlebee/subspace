import { get } from "svelte/store";
import { currentUser, voiceStates, voiceChannelId } from "./stores";
import { wsSignalSdp, wsSignalIce } from "./ws";
import type { SignalSdpPayload, SignalIcePayload } from "./types";
import { writable } from "svelte/store";

const STUN_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

let localStream: MediaStream | null = null;
let peerConnections: Record<string, RTCPeerConnection> = {};

// ── Web Audio API Context ────────────────────────────────────────────────────
// We use a single global AudioContext for both playback and analysis.
// This context must be resumed on a user interaction (Join Voice click).
let globalAudioCtx: AudioContext | null = null;

// Track nodes to clean them up later
// key: userId
const remoteNodes: Record<string, { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; gain: GainNode }> = {};

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
    if (remoteNodes[userId]) return;

    try {
        const source = globalAudioCtx.createMediaStreamSource(stream);
        const analyser = globalAudioCtx.createAnalyser();
        analyser.fftSize = 256;
        const gain = globalAudioCtx.createGain(); // For muet/unmute or volume

        // Connect graph: Source -> Analyser -> Gain -> Destination (Speakers)
        source.connect(analyser);
        analyser.connect(gain);
        gain.connect(globalAudioCtx.destination);

        remoteNodes[userId] = { source, analyser, gain };

        // Handle stream end
        stream.onremovetrack = () => {
            cleanupRemoteUser(userId);
        };
    } catch (e) {
        console.error("Failed to handle remote stream:", e);
    }
}

function cleanupRemoteUser(userId: string) {
    if (remoteNodes[userId]) {
        const { source, analyser, gain } = remoteNodes[userId];
        source.disconnect();
        analyser.disconnect();
        gain.disconnect();
        delete remoteNodes[userId];
    }
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
    stopLocalSpeakingDetection();

    // 2. Close all peer connections
    Object.values(peerConnections).forEach((pc) => pc.close());
    peerConnections = {};

    // 3. Cleanup remote nodes
    Object.keys(remoteNodes).forEach(cleanupRemoteUser);

    // 4. Stop speaking detection loop & AudioContext
    stopSpeakingCheckLoop();
    stopAudioContext();

    // 5. Remove listeners
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

// ── Internal ─────────────────────────────────────────────────────────────────

async function createPeerConnection(targetUserId: string, initiator: boolean) {
    if (peerConnections[targetUserId]) return peerConnections[targetUserId];

    const pc = new RTCPeerConnection(STUN_SERVERS);
    peerConnections[targetUserId] = pc;

    // Add local tracks
    if (localStream) {
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream!));
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
        const [remoteStream] = event.streams;
        if (remoteStream) {
            handleRemoteStream(targetUserId, remoteStream);
        }
    };

    // Negotiation needed (only for initiator)
    if (initiator) {
        pc.onnegotiationneeded = async () => {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                wsSignalSdp(targetUserId, JSON.stringify(offer), "offer");
            } catch (e) {
                console.error("Negotiation error:", e);
            }
        };
    }

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
        console.log(`Received SDP ${sdp_type} from ${from_user_id}`);

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
            await pc.setRemoteDescription(descObj);

            if (sdp_type === "offer") {
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
