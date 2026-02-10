import type { AuthResponse, Server, Channel, Message, ServerMember, Attachment } from "./types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

function getHeaders(): Record<string, string> {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...getHeaders(), ...(options.headers || {}) },
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────

export async function register(username: string, password: string, avatar_url?: string): Promise<AuthResponse> {
    return request("/register", {
        method: "POST",
        body: JSON.stringify({ username, password, avatar_url }),
    });
}

export async function login(username: string, password: string): Promise<AuthResponse> {
    return request("/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
    });
}

// ── User ─────────────────────────────────────────────────────────────

export async function getMe() {
    return request<import("./types").User>("/me");
}

export async function updateMe(data: Record<string, unknown>) {
    return request("/me", { method: "PATCH", body: JSON.stringify(data) });
}

// ── Servers ──────────────────────────────────────────────────────────

export async function listServers(): Promise<Server[]> {
    return request("/servers");
}

export async function createServer(name: string, icon_url?: string): Promise<Server> {
    return request("/servers", {
        method: "POST",
        body: JSON.stringify({ name, icon_url }),
    });
}

export async function updateServer(serverId: string, data: { name?: string; icon_url?: string }): Promise<Server> {
    return request(`/servers/${serverId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
    });
}

export async function joinServer(serverId: string) {
    return request(`/servers/${serverId}/join`, { method: "POST" });
}

export async function leaveServer(serverId: string) {
    return request(`/servers/${serverId}/leave`, { method: "POST" });
}

export async function getServerMembers(serverId: string): Promise<ServerMember[]> {
    return request(`/servers/${serverId}/members`);
}

// ── Channels ─────────────────────────────────────────────────────────

export async function listChannels(serverId: string): Promise<Channel[]> {
    return request(`/servers/${serverId}/channels`);
}

export async function createChannel(serverId: string, name: string, type: string): Promise<Channel> {
    return request(`/servers/${serverId}/channels`, {
        method: "POST",
        body: JSON.stringify({ name, type }),
    });
}

export async function deleteChannel(channelId: string) {
    return request(`/channels/${channelId}`, { method: "DELETE" });
}

// ── Messages ─────────────────────────────────────────────────────────

export async function getMessages(channelId: string, limit = 50, before?: string): Promise<Message[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set("before", before);
    return request(`/channels/${channelId}/messages?${params}`);
}

export async function createMessage(channelId: string, content: string): Promise<Message> {
    return request(`/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
    });
}

export async function editMessage(messageId: string, content: string) {
    return request(`/messages/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ content }),
    });
}

export async function deleteMessage(messageId: string) {
    return request(`/messages/${messageId}`, { method: "DELETE" });
}

export async function pinMessage(messageId: string) {
    return request(`/messages/${messageId}/pin`, { method: "POST" });
}

export async function addReaction(messageId: string, emoji: string) {
    return request(`/messages/${messageId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
    });
}

export async function removeReaction(messageId: string, emoji: string) {
    return request(`/messages/${messageId}/reactions`, {
        method: "DELETE",
        body: JSON.stringify({ emoji }),
    });
}

// ── Upload ───────────────────────────────────────────────────────────

export async function uploadFile(file: File): Promise<{ url: string; file_name: string; mime_type: string; size_bytes: number }> {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
}
