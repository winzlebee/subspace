# Frontend Reactivity Fixes

## Problem Summary

The application had several interface updating issues where UI elements wouldn't update until the page was refreshed or the user navigated away and back. This affected:
- Status indicators not updating in real-time
- Message previews in DM conversations staying stale
- New messages not appearing immediately
- General UI state not reflecting backend changes

## Root Cause

The core issue was **incomplete WebSocket event handling**. The application architecture follows this pattern:

1. **Initial data load**: Components fetch data on mount (e.g., conversations, messages, members)
2. **Real-time updates**: WebSocket events update Svelte stores
3. **Reactive UI**: Components subscribe to stores and re-render when they change

However, the WebSocket handlers were only updating the **currently active view**, not all related stores. For example:
- When a DM message arrived, it only updated `dmMessages` if you were viewing that conversation
- The `dmConversations` store (which shows message previews) was never updated via WebSocket
- Status updates worked but didn't always trigger re-renders due to object mutation patterns

## Fixes Applied

### 1. DM Conversation List Updates (`ws.ts`)

**Problem**: When a new DM message arrived, the conversation list showed stale "last_message" data.

**Fix**: Updated WebSocket handlers to also update the `dmConversations` store:

```typescript
case "dm_message_created": {
    // ... existing code to update dmMessages ...
    
    // NEW: Update conversation list with latest message
    dmConversations.update((convs) => {
        return convs.map((conv) => {
            if (conv.id === msg.conversation_id) {
                return {
                    ...conv,
                    last_message: msg,  // Update preview
                };
            }
            return conv;
        });
    });
}
```

Similar fixes for `dm_message_updated` and `dm_message_deleted` events.

### 2. Improved Status Update Reactivity (`stores.ts`)

**Problem**: Status updates used object spreading but didn't always trigger re-renders because the check for whether to update was missing.

**Fix**: Added early return checks to avoid unnecessary updates and ensure new arrays are created:

```typescript
export function updateUserStatus(userId: string, status: UserStatus) {
    // Update userStatuses store
    userStatuses.update(statuses => ({
        ...statuses,
        [userId]: status
    }));
    
    // Update members list - check if user exists first
    members.update(m => {
        const hasUser = m.some(member => member.user_id === userId);
        if (!hasUser) return m;  // No change needed
        
        return m.map(member =>   // Create new array
            member.user_id === userId 
                ? { ...member, status }  // Create new object
                : member
        );
    });
    
    // Update DM conversations - check if user exists first
    dmConversations.update(convs => {
        const hasUser = convs.some(conv => conv.other_user.id === userId);
        if (!hasUser) return convs;  // No change needed
        
        return convs.map(conv =>     // Create new array
            conv.other_user.id === userId
                ? { ...conv, other_user: { ...conv.other_user, status } }
                : conv
        );
    });
}
```

### 3. Import Fix (`ws.ts`)

**Problem**: `dmConversations` wasn't imported at the top of the file.

**Fix**: Added to imports:
```typescript
import { 
    // ... other imports ...
    dmConversations,  // Added this
    updateUserStatus 
} from "./stores";
```

## How Svelte Reactivity Works

For anyone maintaining this code, here's how Svelte's reactivity system works:

1. **Stores must be reassigned**: `store.update()` or `store.set()` must create a new reference
2. **Object spreading creates new references**: `{ ...obj, field: newValue }` creates a new object
3. **Array methods that return new arrays**: `.map()`, `.filter()` create new arrays
4. **Mutations don't trigger updates**: `obj.field = value` or `array.push()` won't trigger reactivity

### Good Pattern ✅
```typescript
members.update(m => m.map(member => 
    member.id === userId 
        ? { ...member, status }  // New object
        : member
));
```

### Bad Pattern ❌
```typescript
members.update(m => {
    const member = m.find(mem => mem.id === userId);
    if (member) member.status = status;  // Mutation!
    return m;  // Same array reference
});
```

## Testing the Fixes

To verify these fixes work:

1. **Status indicators**: 
   - Open two browser windows with different users
   - Change status in one window
   - Verify the status indicator updates in the other window without refresh

2. **DM message previews**:
   - Open DM list in one window
   - Send a message from another window/user
   - Verify the message preview updates in the conversation list

3. **Real-time messages**:
   - Have a conversation open
   - Send messages from another client
   - Verify messages appear immediately without refresh

## Future Improvements

Consider these additional enhancements:

1. **Optimistic updates**: Update UI immediately before server confirms
2. **Retry logic**: Handle failed WebSocket messages
3. **Offline queue**: Queue messages when connection is lost
4. **Presence indicators**: Show when users are typing in DMs
5. **Read receipts**: Track which messages have been seen
6. **Pagination**: Load older messages/conversations on demand

## Related Files

- `/src/lib/ws.ts` - WebSocket event handlers
- `/src/lib/stores.ts` - Svelte stores and update functions
- `/src/lib/components/DirectMessages.svelte` - DM conversation list
- `/src/lib/components/MemberList.svelte` - Server member list with status
- `/src/lib/components/StatusIndicator.svelte` - Status display component
