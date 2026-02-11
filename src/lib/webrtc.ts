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
let remoteAudioElements: Record<string, HTMLAudioElement> = {};

// ── Speaking detection ───────────────────────────────────────────────────────
export const speakingUsers = writable<Set<string>>(new Set());

let localAnalyser: AnalyserNode | null = null;
let localAudioCtx: AudioContext | null = null;
let speakingCheckInterval: ReturnType<typeof setInterval> | null = null;
const remoteAnalysers: Record<string, { ctx: AudioContext; analyser: AnalyserNode }> = {};

const SPEAKING_THRESHOLD = 15; // amplitude threshold for "speaking"

function startLocalSpeakingDetection() {
    if (!localStream) return;
    try {
        localAudioCtx = new AudioContext();
        const source = localAudioCtx.createMediaStreamSource(localStream);
        localAnalyser = localAudioCtx.createAnalyser();
        localAnalyser.fftSize = 256;
        source.connect(localAnalyser);
    } catch (e) {
        console.error("Failed to start local speaking detection:", e);
    }
}

function startRemoteSpeakingDetection(userId: string, stream: MediaStream) {
    try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        remoteAnalysers[userId] = { ctx, analyser };
    } catch (e) {
        console.error("Failed to start remote speaking detection:", e);
    }
}

function stopRemoteSpeakingDetection(userId: string) {
    const entry = remoteAnalysers[userId];
    if (entry) {
        entry.ctx.close().catch(() => { });
        delete remoteAnalysers[userId];
    }
}

function startSpeakingCheckLoop() {
    if (speakingCheckInterval) return;
    speakingCheckInterval = setInterval(() => {
        const speaking = new Set<string>();
        const myId = get(currentUser)?.id;

        // Check local
        if (localAnalyser && myId) {
            const data = new Uint8Array(localAnalyser.frequencyBinCount);
            localAnalyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            if (avg > SPEAKING_THRESHOLD) speaking.add(myId);
        }

        // Check remotes
        for (const [userId, { analyser }] of Object.entries(remoteAnalysers)) {
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
        // 1. Get local audio
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
        });

        // 2. Start speaking detection
        startLocalSpeakingDetection();
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

    // 2. Close all peer connections
    Object.values(peerConnections).forEach((pc) => pc.close());
    peerConnections = {};

    // 3. Remove audio elements
    Object.values(remoteAudioElements).forEach((audio) => {
        audio.srcObject = null;
        audio.remove();
    });
    remoteAudioElements = {};

    // 4. Stop speaking detection
    stopSpeakingCheckLoop();
    if (localAudioCtx) {
        localAudioCtx.close().catch(() => { });
        localAudioCtx = null;
        localAnalyser = null;
    }
    for (const userId of Object.keys(remoteAnalysers)) {
        stopRemoteSpeakingDetection(userId);
    }

    // 5. Remove listeners
    window.removeEventListener("webrtc_signal", handleSignal as unknown as EventListener);
}

export function toggleMute(muted: boolean) {
    if (localStream) {
        localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    }
}

export function toggleDeafen(deafened: boolean) {
    // Mute/unmute all remote audio elements
    Object.values(remoteAudioElements).forEach((audio) => {
        audio.muted = deafened;
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
            playRemoteStream(targetUserId, remoteStream);
            startRemoteSpeakingDetection(targetUserId, remoteStream);
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

function playRemoteStream(userId: string, stream: MediaStream) {
    if (remoteAudioElements[userId]) return;

    const audio = document.createElement("audio");
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.style.display = "none";
    document.body.appendChild(audio);
    remoteAudioElements[userId] = audio;

    // Handle stream end
    stream.onremovetrack = () => {
        audio.remove();
        delete remoteAudioElements[userId];
        stopRemoteSpeakingDetection(userId);
    };
}

async function handleSignal(event: CustomEvent) {
    const env = event.detail;
    const type = env.type;

    if (type === "signal_sdp") {
        const payload = env.payload as SignalSdpPayload;
        const { from_user_id, sdp, sdp_type } = payload;

        let pc = peerConnections[from_user_id];
        if (!pc) {
            // Received offer from someone else -> we are answerer
            pc = await createPeerConnection(from_user_id, false);
        }

        try {
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
        const { from_user_id, candidate } = payload;

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
