import { w as writable, d as derived } from "./index.js";
const authToken = writable(localStorage.getItem("token"));
authToken.subscribe((token) => {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
});
derived(authToken, ($t) => !!$t);
const servers = writable([]);
const currentServerId = writable(null);
derived(
  [servers, currentServerId],
  ([$servers, $id]) => $servers.find((s) => s.id === $id) ?? null
);
const channels = writable([]);
const currentChannelId = writable(null);
derived(
  [channels, currentChannelId],
  ([$channels, $id]) => $channels.find((c) => c.id === $id) ?? null
);
derived(channels, ($c) => $c.filter((c) => c.type === "text"));
derived(channels, ($c) => $c.filter((c) => c.type === "voice"));
const theme = writable(localStorage.getItem("theme") ?? "subspace-dark");
theme.subscribe((t) => {
  localStorage.setItem("theme", t);
  document.documentElement.setAttribute("data-theme", t);
});
