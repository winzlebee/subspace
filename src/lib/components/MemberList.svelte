<script lang="ts">
    import { members, currentServer } from "$lib/stores";
    import { getFileUrl } from "$lib/api";

    // Resize logic
    let width = $state(240); // default w-60
    let isResizing = $state(false);

    function startResize(e: MouseEvent) {
        e.preventDefault(); // Prevent text selection
        isResizing = true;
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", stopResize);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
    }

    function handleMouseMove(e: MouseEvent) {
        if (!isResizing) return;
        // Member list is on the right
        // Width = window width - mouse X
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 150 && newWidth < 600) {
            width = newWidth;
        }
    }

    function stopResize() {
        isResizing = false;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", stopResize);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
    }
</script>

<div
    class="bg-base-200 shrink-0 overflow-hidden flex flex-col border-l border-base-300 relative group/sidebar"
    style="width: {width}px"
>
    <!-- Drag Handle -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors z-50 opacity-0 group-hover/sidebar:opacity-100 {isResizing
            ? '!bg-primary !opacity-100'
            : ''}"
        onmousedown={startResize}
    ></div>
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
