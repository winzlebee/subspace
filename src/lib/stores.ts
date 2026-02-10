import { writable, derived, get } from "svelte/store";
import type { User, Server, Channel, Message, ServerMember, VoiceState } from "./types";

// ── Auth ─────────────────────────────────────────────────────────────
export const authToken = writable<string | null>(localStorage.getItem("token"));
export const currentUser = writable<User | null>(null);

authToken.subscribe((token) => {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
});

export const isLoggedIn = derived(authToken, ($t) => !!$t);

// ── Servers ──────────────────────────────────────────────────────────
export const servers = writable<Server[]>([]);
export const currentServerId = writable<string | null>(null);
export const currentServer = derived(
    [servers, currentServerId],
    ([$servers, $id]) => $servers.find((s) => s.id === $id) ?? null
);

// ── Channels ─────────────────────────────────────────────────────────
export const channels = writable<Channel[]>([]);
export const currentChannelId = writable<string | null>(null);
export const currentChannel = derived(
    [channels, currentChannelId],
    ([$channels, $id]) => $channels.find((c) => c.id === $id) ?? null
);

export const textChannels = derived(channels, ($c) => $c.filter((c) => c.type === "text"));
export const voiceChannels = derived(channels, ($c) => $c.filter((c) => c.type === "voice"));

// ── Messages ─────────────────────────────────────────────────────────
export const messages = writable<Message[]>([]);

// ── Members ──────────────────────────────────────────────────────────
export const members = writable<ServerMember[]>([]);

// ── Voice ────────────────────────────────────────────────────────────
export const voiceChannelId = writable<string | null>(null);
export const voiceStates = writable<Record<string, VoiceState[]>>({});
export const isMuted = writable(false);
export const isDeafened = writable(false);

// ── UI State ─────────────────────────────────────────────────────────
export const showSettings = writable(false);
export const showCreateServer = writable(false);
export const theme = writable<string>(localStorage.getItem("theme") ?? "subspace-dark");

theme.subscribe((t) => {
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
});

// ── Logout ───────────────────────────────────────────────────────────
export function logout() {
    authToken.set(null);
    currentUser.set(null);
    servers.set([]);
    channels.set([]);
    messages.set([]);
    members.set([]);
    currentServerId.set(null);
    currentChannelId.set(null);
    voiceChannelId.set(null);
}
