// ── Types matching shared/src/models.rs ──────────────────────────────

export interface User {
    id: string;
    username: string;
    avatar_url: string | null;
    theme: string;
    language: string;
    notifications_enabled: boolean;
    created_at: string;
    updated_at: string;
}

export interface UserPublic {
    id: string;
    username: string;
    avatar_url: string | null;
}

export interface Server {
    id: string;
    name: string;
    icon_url: string | null;
    owner_id: string;
    created_at: string;
    updated_at: string;
}

export interface Channel {
    id: string;
    server_id: string;
    name: string;
    type: "text" | "voice";
    position: number;
    topic?: string;
    created_at: string;
    updated_at: string;
}

export interface Message {
    id: string;
    channel_id: string;
    author_id: string;
    content: string | null;
    pinned: boolean;
    created_at: string;
    edited_at: string | null;
    author: UserPublic | null;
    attachments: Attachment[];
    reactions: ReactionGroup[];
}

export interface Attachment {
    id: string;
    message_id: string;
    file_url: string;
    file_name: string;
    mime_type: string;
    size_bytes: number | null;
    created_at: string;
}

export interface ReactionGroup {
    emoji: string;
    count: number;
    me: boolean;
}

export interface VoiceState {
    user_id: string;
    channel_id: string;
    muted: boolean;
    deafened: boolean;
    joined_at: string;
    username: string | null;
    avatar_url: string | null;
}

export interface ServerMember {
    user_id: string;
    server_id: string;
    role: string;
    joined_at: string;
    username: string;
    avatar_url: string | null;
}

export interface AuthResponse {
    token: string;
    user: User;
}

// ── WebSocket message types ──────────────────────────────────────────

export interface WsEnvelope {
    type: string;
    payload: any;
}
