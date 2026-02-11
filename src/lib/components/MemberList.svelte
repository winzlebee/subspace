<script lang="ts">
    import { members, currentServer } from "$lib/stores";
    import { getFileUrl } from "$lib/api";
</script>

<div
    class="w-60 bg-base-200 shrink-0 overflow-hidden flex flex-col border-l border-base-300"
>
    <div class="h-12 flex items-center px-4 border-b border-base-300">
        <h3
            class="text-xs font-semibold uppercase text-base-content/50 tracking-wider"
        >
            Members — {$members.length}
        </h3>
    </div>
    <div class="flex-1 overflow-y-auto p-2">
        <ul class="space-y-0.5">
            {#each $members as member (member.user_id)}
                <li
                    class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-base-300/50 cursor-pointer"
                >
                    <div
                        class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0"
                    >
                        {#if member.avatar_url}
                            <img
                                src={getFileUrl(member.avatar_url)}
                                alt=""
                                class="w-full h-full rounded-full object-cover"
                            />
                        {:else}
                            {member.username[0].toUpperCase()}
                        {/if}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-base-content truncate">
                            {member.username}
                        </p>
                        {#if member.role === "owner"}
                            <p class="text-[10px] text-warning">Owner</p>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    </div>
</div>
