<script lang="ts">
  import { onMount } from "svelte";
  import {
    dmConversations,
    currentDmConversationId,
    currentUser,
    servers,
    members,
  } from "$lib/stores";
  import { listDmConversations, createDmConversation, getServerMembers } from "$lib/api";
  import { addToast } from "$lib/stores/toasts";
  import { getFileUrl } from "$lib/api";
  import type { UserPublic } from "$lib/types";
  import StatusIndicator from "./StatusIndicator.svelte";

  let { onSelectConversation } = $props<{
    onSelectConversation: (id: string) => void;
  }>();

  let showNewDmModal = $state(false);
  let newDmUsername = $state("");
  let creating = $state(false);
  let allUsers = $state<UserPublic[]>([]);
  let filteredUsers = $state<UserPublic[]>([]);
  let searchQuery = $state("");

  onMount(() => {
    loadConversations();
    loadAllUsers();
  });

  async function loadConversations() {
    try {
      const convs = await listDmConversations();
      dmConversations.set(convs);
    } catch (e: any) {
      addToast("Failed to load DM conversations");
    }
  }

  async function loadAllUsers() {
    try {
      // Get all users from all servers the current user is in
      const userMap = new Map<string, UserPublic>();
      
      for (const server of $servers) {
        const serverMembers = await getServerMembers(server.id);
        for (const member of serverMembers) {
          if (member.user_id !== $currentUser?.id) {
            userMap.set(member.user_id, {
              id: member.user_id,
              username: member.username,
              avatar_url: member.avatar_url,
              status: member.status,
            });
          }
        }
      }
      
      allUsers = Array.from(userMap.values()).sort((a, b) => 
        a.username.localeCompare(b.username)
      );
      filteredUsers = allUsers;
    } catch (e: any) {
      console.error("Failed to load users:", e);
    }
  }

  $effect(() => {
    if (!newDmUsername.trim()) {
      filteredUsers = allUsers;
      searchQuery = "";
      return;
    }
    
    const query = newDmUsername.toLowerCase();
    searchQuery = query;
    filteredUsers = allUsers.filter(u => 
      u.username.toLowerCase().includes(query)
    );
  });

  async function handleCreateDm() {
    if (!newDmUsername.trim()) {
      addToast("Please enter a username");
      return;
    }

    creating = true;
    try {
      const conv = await createDmConversation(newDmUsername.trim());
      dmConversations.update(convs => {
        const existing = convs.find(c => c.id === conv.id);
        if (existing) return convs;
        return [conv, ...convs];
      });
      showNewDmModal = false;
      newDmUsername = "";
      onSelectConversation(conv.id);
    } catch (e: any) {
      addToast(e.message || "Failed to create DM");
    } finally {
      creating = false;
    }
  }

  function selectUser(user: UserPublic) {
    newDmUsername = user.username;
    handleCreateDm();
  }

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }
</script>

<div class="flex flex-col h-full w-60 bg-base-200 border-r border-base-300">
  <!-- Header -->
  <div class="p-4 border-b border-base-300">
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-lg font-semibold">Direct Messages</h2>
      <button
        class="btn btn-circle btn-ghost btn-sm"
        onclick={() => (showNewDmModal = true)}
        aria-label="New DM"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 4v16m8-8H4"
          />
        </svg>
      </button>
    </div>
  </div>

  <!-- Conversation List -->
  <div class="flex-1 overflow-y-auto">
    {#if $dmConversations.length === 0}
      <div class="p-4 text-center text-base-content/50 text-sm">
        <p>No conversations yet</p>
        <p class="mt-2">Click + to start a new DM</p>
      </div>
    {:else}
      {#each $dmConversations as conv (conv.id)}
        <button
          class="w-full p-3 hover:bg-base-300 transition-colors text-left flex items-center gap-3 {$currentDmConversationId === conv.id ? 'bg-base-300' : ''}"
          onclick={() => onSelectConversation(conv.id)}
        >
          <!-- Avatar with Status -->
          <div class="avatar relative">
            <div class="w-10 h-10 rounded-full">
              {#if conv.other_user.avatar_url}
                <img src={getFileUrl(conv.other_user.avatar_url)} alt={conv.other_user.username} />
              {:else}
                <div class="bg-primary text-primary-content flex items-center justify-center w-full h-full">
                  {conv.other_user.username[0].toUpperCase()}
                </div>
              {/if}
            </div>
            <div class="absolute -bottom-0.5 -right-0.5">
              <StatusIndicator status={conv.other_user.status} size="small" />
            </div>
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <span class="font-medium truncate">{conv.other_user.username}</span>
              {#if conv.last_message}
                <span class="text-xs text-base-content/50">
                  {formatTimestamp(conv.last_message.created_at)}
                </span>
              {/if}
            </div>
            {#if conv.last_message}
              <p class="text-sm text-base-content/70 truncate">
                {conv.last_message.content || "Attachment"}
              </p>
            {:else}
              <p class="text-sm text-base-content/50 italic">No messages yet</p>
            {/if}
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>

<!-- New DM Modal -->
{#if showNewDmModal}
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg mb-4">New Direct Message</h3>
      
      <div class="form-control mb-4">
        <label class="label">
          <span class="label-text">Enter username or select from list</span>
        </label>
        <input
          type="text"
          class="input input-bordered w-full"
          placeholder="Username"
          bind:value={newDmUsername}
          onkeydown={(e) => e.key === "Enter" && handleCreateDm()}
        />
      </div>

      <!-- User List -->
      {#if searchQuery && filteredUsers.length > 0}
        <div class="max-h-60 overflow-y-auto border border-base-300 rounded-lg mb-4">
          {#each filteredUsers as user (user.id)}
            <button
              class="w-full p-2 hover:bg-base-200 transition-colors text-left flex items-center gap-2"
              onclick={() => selectUser(user)}
            >
              <div class="avatar">
                <div class="w-8 h-8 rounded-full">
                  {#if user.avatar_url}
                    <img src={getFileUrl(user.avatar_url)} alt={user.username} />
                  {:else}
                    <div class="bg-primary text-primary-content flex items-center justify-center w-full h-full text-sm">
                      {user.username[0].toUpperCase()}
                    </div>
                  {/if}
                </div>
              </div>
              <span>{user.username}</span>
            </button>
          {/each}
        </div>
      {/if}

      <div class="modal-action">
        <button
          class="btn btn-ghost"
          onclick={() => {
            showNewDmModal = false;
            newDmUsername = "";
            searchQuery = "";
            filteredUsers = allUsers;
          }}
        >
          Cancel
        </button>
        <button
          class="btn btn-primary"
          onclick={handleCreateDm}
          disabled={creating || !newDmUsername.trim()}
        >
          {creating ? "Creating..." : "Create DM"}
        </button>
      </div>
    </div>
  </div>
{/if}
