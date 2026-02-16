<script lang="ts">
    import type { UserStatus } from '$lib/types';
    
    export let status: UserStatus | null | undefined = null;
    export let size: 'small' | 'medium' | 'large' = 'medium';
    export let showActivity = false;
    
    $: statusColor = {
        online: '#43b581',
        idle: '#faa61a',
        dnd: '#f04747',
        offline: '#747f8d'
    }[status?.status || 'offline'];
    
    $: sizeMap = {
        small: '12px',
        medium: '16px',
        large: '20px'
    };
    
    $: statusLabel = {
        online: 'Online',
        idle: 'Idle',
        dnd: 'Do Not Disturb',
        offline: 'Offline'
    }[status?.status || 'offline'];
</script>

<div class="status-indicator" title={statusLabel}>
    <div 
        class="dot" 
        style="
            width: {sizeMap[size]}; 
            height: {sizeMap[size]}; 
            background-color: {statusColor};
        "
    ></div>
    {#if showActivity && status?.activity_name}
        <span class="activity">{status.activity_name}</span>
    {/if}
    {#if status?.custom_text}
        <span class="custom-text">{status.custom_text}</span>
    {/if}
</div>

<style>
    .status-indicator {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
    
    .dot {
        border-radius: 50%;
        border: 2px solid var(--bg-primary, #2c2f33);
        flex-shrink: 0;
    }
    
    .activity,
    .custom-text {
        font-size: 0.75rem;
        color: var(--text-secondary, #b9bbbe);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    .custom-text {
        font-style: italic;
    }
</style>
