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

    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection(iceServers);
    peerConnections[targetUserId] = pc;

    // Add local tracks
    if (localStream) {
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream!));
    }
    if (localVideoTrack) {
        // Create a dummy stream for the track if we need to, or reuse localStream if possible.
        // WebRTC tracks are what matters.
        pc.addTrack(localVideoTrack, new MediaStream([localVideoTrack]));
    }
    if (localScreenTrack) {
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

    pc.oniceconnectionstatechange = () => {
        console.log(`ICE Connection State (${targetUserId}):`, pc.iceConnectionState);
        if (pc.iceConnectionState === "failed") {
            console.error("ICE connection failed. Verify TURN configuration.");
        }
    };

    pc.onicegatheringstatechange = () => {
        console.log(`ICE Gathering State (${targetUserId}):`, pc.iceGatheringState);
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
