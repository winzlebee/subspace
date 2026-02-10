import { get } from "svelte/store";
import { authToken, currentChannelId, messages, voiceStates, voiceChannelId } from "./stores";
import type { WsEnvelope, Message, VoiceState } from "./types";

const WS_URL = "ws://localhost:3001/ws";

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connectWs() {
    if (socket?.readyState === WebSocket.OPEN) return;

    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        const token = get(authToken);
        if (token) {
            send({ type: "auth", payload: { token } });
        }
    };

    socket.onmessage = (event) => {
        try {
            const env: WsEnvelope = JSON.parse(event.data);
            handleMessage(env);
        } catch (e) {
            console.error("WS parse error:", e);
        }
    };

    socket.onclose = () => {
        socket = null;
        // Reconnect after 3 seconds
        reconnectTimer = setTimeout(connectWs, 3000);
    };

    socket.onerror = () => {
        socket?.close();
    };
}

export function disconnectWs() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    socket?.close();
    socket = null;
}

export function send(envelope: WsEnvelope) {
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(envelope));
    }
}

// ── Convenience senders ──────────────────────────────────────────────

export function wsSendMessage(channelId: string, content: string) {
    send({ type: "send_message", payload: { channel_id: channelId, content } });
}

export function wsSendTyping(channelId: string) {
    send({ type: "typing", payload: { channel_id: channelId } });
}

export function wsJoinVoice(channelId: string) {
    send({ type: "join_voice", payload: { channel_id: channelId } });
}

export function wsLeaveVoice() {
    send({ type: "leave_voice", payload: {} });
}

export function wsUpdateMuteDeafen(muted: boolean, deafened: boolean) {
    send({ type: "voice_mute_deafen", payload: { muted, deafened } });
}

export function wsSignalSdp(targetUserId: string, sdp: string, sdpType: string) {
    send({
        type: "signal_sdp",
        payload: { target_user_id: targetUserId, sdp, sdp_type: sdpType },
    });
}

export function wsSignalIce(
    targetUserId: string,
    candidate: string,
    sdpMid: string | null,
    sdpMlineIndex: number | null
) {
    send({
        type: "signal_ice",
        payload: {
            target_user_id: targetUserId,
            candidate,
            sdp_mid: sdpMid,
            sdp_mline_index: sdpMlineIndex,
        },
    });
}

// ── Message handler ──────────────────────────────────────────────────

function handleMessage(env: WsEnvelope) {
    switch (env.type) {
        case "auth_success":
            console.log("WebSocket authenticated");
            break;

        case "message_created": {
            const msg: Message = env.payload.message;
            const currentCh = get(currentChannelId);
            if (msg.channel_id === currentCh) {
                messages.update((msgs) => {
                    if (msgs.some((m) => m.id === msg.id)) return msgs;
                    return [...msgs, msg];
                });
            }
            break;
        }

        case "message_deleted": {
            const { message_id } = env.payload;
            messages.update((msgs) => msgs.filter((m) => m.id !== message_id));
            break;
        }

        case "message_updated": {
            const { message_id, content, edited_at } = env.payload;
            messages.update((msgs) =>
                msgs.map((m) =>
                    m.id === message_id ? { ...m, content, edited_at } : m
                )
            );
            break;
        }

        case "reaction_updated": {
            const { message_id, reactions } = env.payload;
            messages.update((msgs) =>
                msgs.map((m) =>
                    m.id === message_id ? { ...m, reactions } : m
                )
            );
            break;
        }

        case "voice_state_update": {
            const { channel_id, voice_states: states } = env.payload as {
                channel_id: string;
                voice_states: VoiceState[];
            };
            voiceStates.update((vs) => ({ ...vs, [channel_id]: states }));
            break;
        }

        case "user_typing":
            // Could show typing indicator — skipping for now
            break;

        case "signal_sdp":
        case "signal_ice":
            // Handled by webrtc.ts
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("webrtc_signal", { detail: env }));
            }
            break;

        case "error":
            console.error("WS error:", env.payload.message);
            break;

        default:
            console.warn("Unknown WS message:", env.type);
    }
}
