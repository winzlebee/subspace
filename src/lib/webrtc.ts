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
let localVideoTrack: MediaStreamTrack | null = null;
let localScreenTrack: MediaStreamTrack | null = null;
let peerConnections: Record<string, RTCPeerConnection> = {};

export const remoteStreams = writable<Record<string, MediaStream[]>>({});
export const localVideoStream = writable<MediaStream | null>(null);
export const localScreenStream = writable<MediaStream | null>(null);

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

// ── Transceiver Indices (Strict Order) ───────────────────────────────────────
const TRANSCEIVER_AUDIO_INDEX = 0;
const TRANSCEIVER_VIDEO_INDEX = 1;
const TRANSCEIVER_SCREEN_INDEX = 2;

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

    try {
        // If we don't have an audio node for this user yet, set it up
        // We only want to pipe AUDIO to the audio context.
        if (stream.getAudioTracks().length > 0 && !remoteNodes[userId]) {
            const source = globalAudioCtx.createMediaStreamSource(stream);
            const analyser = globalAudioCtx.createAnalyser();
            analyser.fftSize = 256;
            const gain = globalAudioCtx.createGain(); // For mute/unmute or volume

            // Connect graph: Source -> Analyser -> Gain -> Destination (Speakers)
            source.connect(analyser);
            analyser.connect(gain);
            gain.connect(globalAudioCtx.destination);

            remoteNodes[userId] = { source, analyser, gain };

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
        const { source, analyser, gain } = remoteNodes[userId];
        source.disconnect();
        analyser.disconnect();
        gain.disconnect();
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
        // 0. Init Audio Context (must happen during user interaction event loop roughly)
        initAudioContext();

        // 1. Get local audio
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
            });
            startLocalSpeakingDetection(localStream);
        } catch (e) {
            console.warn("No local audio available/granted:", e);
            localStream = null;
        }

        // 2. Start speaking detection (even if failed, logic handles null)
        startSpeakingCheckLoop();

        // 3. Listen for signaling events
        window.addEventListener("webrtc_signal", handleSignal as unknown as EventListener);

        // 4. Create peers for existing users in the channel
        const states = get(voiceStates)[channelId] || [];
        const myId = get(currentUser)?.id;

        for (const state of states) {
            if (state.user_id !== myId) {
                // For us joining, we initiate connections to existing users
                createPeerConnection(state.user_id, true);
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

export async function toggleVideo(enable: boolean) {
    if (enable) {
        if (localVideoTrack) return; // already enabled
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            localVideoTrack = stream.getVideoTracks()[0];
            localVideoStream.set(stream);

            // Update all peer connections
            Object.values(peerConnections).forEach(pc => {
                const transceivers = pc.getTransceivers();
                if (transceivers.length > TRANSCEIVER_VIDEO_INDEX) {
                    const t = transceivers[TRANSCEIVER_VIDEO_INDEX];
                    t.sender.replaceTrack(localVideoTrack);
                    t.direction = "sendrecv"; // This triggers negotiation
                }
            });

            // Handle track ending (e.g. user revokes permission or unplug)
            localVideoTrack.onended = () => toggleVideo(false);

        } catch (e) {
            console.error("Failed to enable video:", e);
        }
    } else {
        if (localVideoTrack) {
            localVideoTrack.stop();
            // Update PCs
            Object.values(peerConnections).forEach(pc => {
                const transceivers = pc.getTransceivers();
                if (transceivers.length > TRANSCEIVER_VIDEO_INDEX) {
                    const t = transceivers[TRANSCEIVER_VIDEO_INDEX];
                    t.sender.replaceTrack(null);
                    t.direction = "recvonly"; // Or inactive if we don't want to receive? Keep recvonly for now.
                }
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
                const transceivers = pc.getTransceivers();
                if (transceivers.length > TRANSCEIVER_SCREEN_INDEX) {
                    const t = transceivers[TRANSCEIVER_SCREEN_INDEX];
                    t.sender.replaceTrack(localScreenTrack);
                    t.direction = "sendrecv";
                }
            });

            localScreenTrack.onended = () => toggleScreenShare(false);

        } catch (e) {
            console.error("Failed to enable screen share:", e);
        }
    } else {
        if (localScreenTrack) {
            localScreenTrack.stop();
            Object.values(peerConnections).forEach(pc => {
                const transceivers = pc.getTransceivers();
                if (transceivers.length > TRANSCEIVER_SCREEN_INDEX) {
                    const t = transceivers[TRANSCEIVER_SCREEN_INDEX];
                    t.sender.replaceTrack(null);
                    t.direction = "recvonly";
                }
            });
            localScreenTrack = null;
            localScreenStream.set(null);
        }
    }
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function createPeerConnection(targetUserId: string, initiator: boolean) {
    if (peerConnections[targetUserId]) return peerConnections[targetUserId];

    const pc = new RTCPeerConnection(STUN_SERVERS);
    peerConnections[targetUserId] = pc;

    // ── Transceivers ──
    // 1. Audio
    if (localStream && localStream.getAudioTracks().length > 0) {
        pc.addTransceiver(localStream.getAudioTracks()[0], { direction: 'sendrecv', streams: [localStream] });
    } else {
        pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    // 2. Video (Camera)
    if (localVideoTrack) {
        pc.addTransceiver(localVideoTrack, { direction: 'sendrecv', streams: [new MediaStream([localVideoTrack])] });
    } else {
        pc.addTransceiver('video', { direction: 'recvonly' });
    }

    // 3. Video (Screen)
    if (localScreenTrack) {
        pc.addTransceiver(localScreenTrack, { direction: 'sendrecv', streams: [new MediaStream([localScreenTrack])] });
    } else {
        pc.addTransceiver('video', { direction: 'recvonly' });
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

    // Negotiation logic
    let makingOffer = false;

    pc.onnegotiationneeded = async () => {
        try {
            makingOffer = true;
            await pc.setLocalDescription();
            if (pc.localDescription) {
                wsSignalSdp(targetUserId, JSON.stringify(pc.localDescription), pc.localDescription.type);
            }
        } catch (e) {
            console.error("Negotiation error:", e);
        } finally {
            makingOffer = false;
        }
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

        let pc = peerConnections[from_user_id];
        if (!pc) {
            pc = await createPeerConnection(from_user_id, false);
        }

        try {
            const description = { type: sdp_type, sdp: JSON.parse(sdp).sdp };

            // Polite Peer Pattern
            // We use string comparison of IDs to determine politeness (convention)
            const polite = myId < from_user_id;

            // Check for collision
            const collision = description.type === "offer" &&
                pc.signalingState !== "stable";

            // Ignore offer if we are impolite and have a collision
            if (collision && !polite) {
                console.log(`Ignoring collision offer from ${from_user_id} (impolite)`);
                return;
            }

            // Rollback if we are polite and have a collision
            // Note: implicit rollback is standard in recent WebRTC specs but explicit might be safer if supported
            // Using standard setRemoteDescription which handles implicit rollback in 'perfect negotiation' pattern
            // if implementd correctly. However, strict Perfect Negotiation usually does:
            // if (collision) {
            //    await Promise.all([
            //      pc.setLocalDescription({ type: "rollback" }),
            //      pc.setRemoteDescription(description)
            //    ]);
            // } 
            // But basic 'setRemoteDescription' usually works if 'stable'.

            if (collision && polite) {
                console.log(`Rolling back due to collision with ${from_user_id} (polite)`);
                // Some browsers require explicit rollback
                await pc.setLocalDescription({ type: "rollback" });
            }

            await pc.setRemoteDescription(description as RTCSessionDescriptionInit);

            if (description.type === "offer") {
                await pc.setLocalDescription();
                if (pc.localDescription) {
                    wsSignalSdp(from_user_id, JSON.stringify(pc.localDescription), "answer");
                }
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
                // Ensure we are ready for candidates
                // Logic: add candidate even if remote description is not set yet? 
                // WebRTC stacks usually handle buffering, or we can check signalingState.
                // However, 'transceiver' approach is much more stable.
                const candObj = JSON.parse(candidate);
                await pc.addIceCandidate(candObj);
            } catch (e) {
                console.error("ICE error:", e); // Often ignores if remote desc not set yet, which is fine, we can buffer if needed.
            }
        }
    }
}
