import { get } from "svelte/store";
import { authToken, currentUser, currentChannelId, currentServerId, messages, pinnedMessages, voiceStates, voiceChannelId, addTypingUser, members, dmMessages, currentDmConversationId, dmConversations, updateUserStatus } from "./stores";
import type { WsEnvelope, Message, VoiceState, DmMessage, UserStatus } from "./types";
import { getServerUrl } from "./api";

function getWsUrl(): string {
    const base = getServerUrl();
    return base.replace(/^http/, "ws") + "/ws";
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connectWs() {
    if (socket?.readyState === WebSocket.OPEN) return;

    socket = new WebSocket(getWsUrl());

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
    // console.log("Sending typing for", channelId);
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
            // Request notification permission
            if (typeof Notification !== "undefined" && Notification.permission === "default") {
                Notification.requestPermission();
            }
            break;

        case "message_created": {
            const msg: Message = env.payload.message;
            const currentCh = get(currentChannelId);
            
            // Always update messages if in the same channel
            if (msg.channel_id === currentCh) {
                messages.update((msgs) => {
                    if (msgs.some((m) => m.id === msg.id)) return msgs;
                    return [...msgs, msg];
                });
            }
            
            // Desktop notification if window not focused and not own message
            const me = get(currentUser);
            if (me && msg.author_id !== me.id && !document.hasFocus()) {
                showNotification(msg.author?.username ?? "Someone", msg.content ?? "");
            }
            break;
        }

        case "message_deleted": {
            const { message_id } = env.payload;
            messages.update((msgs) => msgs.filter((m) => m.id !== message_id));
            pinnedMessages.update((pins) => pins.filter((p) => p.id !== message_id));
            break;
        }

        case "message_updated": {
            const { message_id, content, edited_at, pinned } = env.payload;

            messages.update((msgs) =>
                msgs.map((m) =>
                    m.id === message_id
                        ? {
                            ...m,
                            content: content ?? m.content,
                            edited_at: edited_at ?? m.edited_at,
                            pinned: pinned ?? m.pinned,
                        }
                        : m,
                ),
            );

            pinnedMessages.update((pins) => {
                const alreadyPinned = pins.some((p) => p.id === message_id);

                if (pinned) {
                    if (!alreadyPinned) {
                        const msg = get(messages).find((m) => m.id === message_id);
                        pins.push(msg!);
                    }
                    return pins;
                }

                return pins.filter((p) => p.id !== message_id);
            });

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

        case "user_typing": {
            // console.log("Received user_typing", env.payload);
            const { channel_id, user } = env.payload;
            if (user) {
                addTypingUser(channel_id, user);
            }
            break;
        }

        case "member_joined": {
            const { server_id, member } = env.payload;
            const current = get(currentServerId);
            if (current === server_id) {
                members.update((m) => [...m, member]);
            }
            break;
        }

        case "signal_sdp":
        case "signal_ice":
            // Handled by webrtc.ts
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("webrtc_signal", { detail: env }));
            }
            break;

        case "dm_message_created": {
            const msg: DmMessage = env.payload.message;
            const currentConv = get(currentDmConversationId);
            
            // Update messages if viewing this conversation
            if (msg.conversation_id === currentConv) {
                dmMessages.update((msgs) => {
                    if (msgs.some((m) => m.id === msg.id)) return msgs;
                    return [...msgs, msg];
                });
            }
            
            // Update conversation list with latest message
            dmConversations.update((convs) => {
                return convs.map((conv) => {
                    if (conv.id === msg.conversation_id) {
                        return {
                            ...conv,
                            last_message: msg,
                        };
                    }
                    return conv;
                });
            });
            
            // Desktop notification if window not focused and not own message
            const me = get(currentUser);
            if (me && msg.author_id !== me.id && !document.hasFocus()) {
                showNotification(msg.author?.username ?? "Someone", msg.content ?? "");
            }
            break;
        }

        case "dm_message_deleted": {
            const { message_id } = env.payload;
            dmMessages.update((msgs) => msgs.filter((m) => m.id !== message_id));
            
            // Update conversation list if this was the last message
            dmConversations.update((convs) => {
                return convs.map((conv) => {
                    if (conv.last_message?.id === message_id) {
                        return {
                            ...conv,
                            last_message: null,
                        };
                    }
                    return conv;
                });
            });
            break;
        }

        case "dm_message_updated": {
            const { message_id, content, edited_at } = env.payload;
            dmMessages.update((msgs) =>
                msgs.map((m) =>
                    m.id === message_id
                        ? {
                            ...m,
                            content: content ?? m.content,
                            edited_at: edited_at ?? m.edited_at,
                        }
                        : m,
                ),
            );
            
            // Update conversation list if this is the last message
            dmConversations.update((convs) => {
                return convs.map((conv) => {
                    if (conv.last_message?.id === message_id) {
                        return {
                            ...conv,
                            last_message: {
                                ...conv.last_message,
                                content: content ?? conv.last_message.content,
                                edited_at: edited_at ?? conv.last_message.edited_at,
                            },
                        };
                    }
                    return conv;
                });
            });
            break;
        }

        case "dm_reaction_updated": {
            const { message_id, reactions } = env.payload;
            dmMessages.update((msgs) =>
                msgs.map((m) =>
                    m.id === message_id ? { ...m, reactions } : m
                )
            );
            break;
        }

        case "user_status_update": {
            const { user_id, status } = env.payload as {
                user_id: string;
                status: UserStatus;
            };
            updateUserStatus(user_id, status);
            break;
        }

        case "error":
            console.error("WS error:", env.payload.message);
            break;

        default:
            console.warn("Unknown WS message:", env.type);
    }
}

// ── User Status ──────────────────────────────────────────────────────

let manualStatus: 'online' | 'idle' | 'dnd' | null = null;

export function setUserStatus(status: 'online' | 'idle' | 'dnd', customText?: string) {
    // Track manual status changes (except auto-idle)
    if (status !== 'idle' || !isIdle) {
        manualStatus = status;
    }
    
    send({
        type: "update_status",
        payload: {
            status,
            custom_text: customText || null
        }
    });
}

// ── Idle Detection ───────────────────────────────────────────────────

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let isIdle = false;

function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    
    // If was idle and user is not manually set to DND, send online status
    if (isIdle && manualStatus !== 'dnd') {
        setUserStatus('online');
        isIdle = false;
    }
    
    // Only set idle timer if user is not manually set to DND
    if (manualStatus !== 'dnd') {
        idleTimer = setTimeout(() => {
            // Only auto-idle if user hasn't manually set DND
            if (manualStatus !== 'dnd') {
                setUserStatus('idle');
                isIdle = true;
            }
        }, 5 * 60 * 1000); // 5 minutes
    }
}

// Initialize idle detection when module loads
if (typeof window !== 'undefined') {
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('click', resetIdleTimer);
    window.addEventListener('scroll', resetIdleTimer);
    
    // Start idle timer
    resetIdleTimer();
}

// ── Desktop notifications ────────────────────────────────────────────

function showNotification(title: string, body: string) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification(title, {
        body: body.length > 100 ? body.slice(0, 100) + "…" : body,
        silent: false,
    });
    n.onclick = () => {
        window.focus();
        n.close();
    };
}
