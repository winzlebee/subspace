<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import "emoji-picker-element";
    import { theme } from "$lib/stores";
    import { THEMES } from "$lib/config";

    let pickerContainer: HTMLElement | undefined = $state();
    let { onSelect, onClose, trigger } = $props<{
        onSelect: (emoji: string) => void;
        onClose: () => void;
        trigger?: HTMLElement | null;
    }>();

    let isDark = $derived($theme === THEMES.DARK);

    function handleEmojiClick(event: any) {
        if (event.detail && event.detail.unicode) {
            onSelect(event.detail.unicode);
        }
    }

    function handleClickOutside(event: MouseEvent) {
        if (
            pickerContainer &&
            !pickerContainer.contains(event.target as Node)
        ) {
            // Check if click was on the trigger
            if (trigger && trigger.contains(event.target as Node)) {
                return;
            }
            onClose();
        }
    }

    function updatePosition() {
        if (!pickerContainer || !trigger) return;

        const rect = trigger.getBoundingClientRect();
        const pickerRect = pickerContainer.getBoundingClientRect();

        // Calculate position based on available space
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const pickerHeight = 400; // Approximate height

        let top;
        // Default to above if there is space, or if there is simply more space above than below
        if (spaceAbove > pickerHeight || spaceAbove > spaceBelow) {
            top = rect.top - pickerHeight - 10;
            // Ensure it doesn't go off the top edge
            if (top < 10) top = 10;
        } else {
            // Place below
            top = rect.bottom + 10;
            // Ensure it doesn't go off the bottom edge
            if (top + pickerHeight > window.innerHeight) {
                top = window.innerHeight - pickerHeight - 10;
            }
        }

        // Horizontal positioning
        let left = rect.left;
        const pickerWidth = 350; // Approximate width
        if (left + pickerWidth > window.innerWidth) {
            left = window.innerWidth - pickerWidth - 20;
        }
        if (left < 0) left = 10;

        pickerContainer.style.top = `${top}px`;
        pickerContainer.style.left = `${left}px`;
    }

    onMount(() => {
        document.addEventListener("click", handleClickOutside);

        const picker = pickerContainer?.querySelector("emoji-picker");
        if (picker) {
            picker.addEventListener("emoji-click", handleEmojiClick);
        }

        // Initial position
        updatePosition();

        // Update on resize
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
    });

    onDestroy(() => {
        document.removeEventListener("click", handleClickOutside);
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("scroll", updatePosition, true);

        const picker = pickerContainer?.querySelector("emoji-picker");
        if (picker) {
            picker.removeEventListener("emoji-click", handleEmojiClick);
        }
    });

    // React to trigger changes if it changes while mounted
    $effect(() => {
        if (trigger) {
            updatePosition();
        }
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
    class="fixed z-50 shadow-xl rounded-lg overflow-hidden border border-base-300 bg-base-100"
    bind:this={pickerContainer}
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    style="top: 0; left: 0;"
>
    <!-- @ts-ignore -->
    <emoji-picker class={isDark ? "dark" : "light"}></emoji-picker>
</div>
