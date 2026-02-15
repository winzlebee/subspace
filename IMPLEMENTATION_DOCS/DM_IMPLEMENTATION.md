# Direct Messages Feature Implementation

## Overview
Implemented a complete Direct Messages (DM) system for the Subspace chat/voice app, allowing users to have private 1-on-1 conversations.

## Changes Made

### 1. Database Schema (`schema.sql`)
Added four new tables:
- `dm_conversations` - Stores DM conversations between two users
- `dm_messages` - Messages sent in DM conversations
- `dm_attachments` - File attachments for DM messages
- `dm_reactions` - Emoji reactions on DM messages

### 2. Shared Models (`shared/src/models.rs`)
Added new types:
- `DmConversation` - Represents a DM conversation with the other user's info
- `DmMessage` - Represents a message in a DM conversation
- `CreateDmRequest` - Request to create/get a DM conversation
- `CreateDmMessageRequest` - Request to send a DM message

### 3. WebSocket Messages (`shared/src/ws_messages.rs`)
Added WebSocket message types for real-time DM updates:
- `WsDmMessageCreated` - Broadcast when a new DM is sent
- `WsDmMessageUpdated` - Broadcast when a DM is edited
- `WsDmMessageDeleted` - Broadcast when a DM is deleted
- `WsDmReactionUpdated` - Broadcast when reactions change

### 4. Server-Side API (`server/src/routes/dms.rs`)
Created complete DM API with endpoints:
- `GET /dms` - List all DM conversations for the current user
- `POST /dms` - Create or get a DM conversation with a user
- `GET /dms/{conversation_id}/messages` - Get messages in a conversation
- `POST /dms/{conversation_id}/messages` - Send a message
- `PATCH /dm_messages/{message_id}` - Edit a message
- `DELETE /dm_messages/{message_id}` - Delete a message
- `POST /dm_messages/{message_id}/reactions` - Add a reaction
- `DELETE /dm_messages/{message_id}/reactions` - Remove a reaction

### 5. Client-Side Types (`src/lib/types.ts`)
Added TypeScript interfaces:
- `DmConversation`
- `DmMessage`

### 6. Client-Side API (`src/lib/api.ts`)
Added API functions:
- `listDmConversations()`
- `createDmConversation(recipientUsername)`
- `getDmMessages(conversationId)`
- `createDmMessage(conversationId, content)`
- `editDmMessage(messageId, content)`
- `deleteDmMessage(messageId)`
- `addDmReaction(messageId, emoji)`
- `removeDmReaction(messageId, emoji)`

### 7. Client-Side State (`src/lib/stores.ts`)
Added new stores:
- `dmConversations` - List of DM conversations
- `currentDmConversationId` - Currently selected conversation
- `currentDmConversation` - Derived store for current conversation
- `dmMessages` - Messages in current conversation
- `isDmMode` - Boolean flag for DM mode

### 8. UI Components

#### `DirectMessages.svelte`
- Shows list of DM conversations
- "New DM" button to start conversations
- Modal to select users from servers or enter username manually
- Displays last message preview and timestamp
- User avatars and online status

#### `DmMessageArea.svelte`
- Message display area for DMs
- Same features as server channels:
  - Markdown rendering
  - File attachments
  - Emoji reactions
  - Message editing/deletion
  - Emoji-only message enlargement
  - Message grouping by author/time

#### Updated `ServerSidebar.svelte`
- Added DM icon at the top of the server list
- Visual indicator when in DM mode
- Divider between DM icon and server list

#### Updated `AppShell.svelte`
- Integrated DM mode navigation
- Shows DirectMessages component when in DM mode
- Shows DmMessageArea when a conversation is selected
- Hides member list in DM mode
- Proper state management between server and DM modes

## Features

### Core Functionality
✅ Create DM conversations by username
✅ List all DM conversations with last message preview
✅ Send and receive messages in real-time
✅ Edit and delete your own messages
✅ Add/remove emoji reactions
✅ Upload and share files/images
✅ Markdown support in messages
✅ Emoji-only messages display larger
✅ Message grouping for better readability

### User Experience
✅ Persistent DM icon at top of server sidebar
✅ Search/filter users when creating new DM
✅ Select users from any server you're in
✅ Manual username entry for users not in common servers
✅ Username validation when creating DM
✅ Timestamps with smart formatting (Today, Yesterday, etc.)
✅ User avatars throughout
✅ Mobile-responsive design
✅ Smooth transitions between servers and DMs

### Security
✅ Users can only access their own DM conversations
✅ Username validation prevents invalid DMs
✅ Can't create DM with yourself
✅ Proper authorization checks on all endpoints

## Technical Details

### Database Design
- Uses consistent user ordering (user1_id < user2_id) to prevent duplicate conversations
- Proper foreign key constraints and cascading deletes
- Indexed for performance on common queries
- Timestamps for sorting and display

### Real-Time Updates
- WebSocket broadcasts to both participants when messages are sent/edited/deleted
- Reactions update in real-time for both users
- Conversation list updates when new messages arrive

### State Management
- Clean separation between server and DM modes
- Proper cleanup when switching modes
- Derived stores for computed values
- Reactive updates throughout UI

## Usage

1. Click the DM icon (💬) at the top of the server sidebar
2. Click the "+" button to start a new conversation
3. Either:
   - Type to search users from your servers
   - Enter a username manually
4. Select a user or click "Create DM"
5. Start chatting with all the same features as server channels!

## Known Limitations

### User Discovery
- DMs work best between users who share at least one server (for user discovery in the UI)
- Manual username entry works for any user on the server instance
- No global user directory or search across all users

### Missing Features
- No typing indicators in DMs
- No unread message indicators or badges
- No DM-specific notification settings (uses global settings)
- No "last seen" or read receipts
- No way to block or mute specific DM conversations
- No group DMs (limited to 1-on-1 conversations)

### Technical Limitations
- DM messages are stored separately from server messages (different tables)
- No message history pagination yet (loads all messages)
- No DM search functionality
- Desktop notifications use the same settings as server channels

## Implementation Notes

### Axum Handler Signatures
All route handlers that need to parse request bodies manually use `axum::http::Request<axum::body::Body>` instead of mixing `Json<T>` extractors with `Request`. This is because:
- Axum requires specific extractor ordering: `State`, `Path`, `Json`, then `Request` (last)
- For DELETE requests, JSON body extraction must be done manually using `axum::body::to_bytes`
- This pattern matches the existing codebase in `server/src/routes/messages.rs`

### Database Library
The implementation uses `rusqlite` (not `tokio-rusqlite`) to match the existing codebase. All database operations follow the same patterns as the existing server/channel message code.

### WebSocket Broadcasting
Added `broadcast_to_user()` method to `WsState` to send messages to specific users rather than entire servers. This enables real-time DM updates for both participants in a conversation.

## Future Enhancements

Consider adding:
1. **Unread message badges** - Visual indicators for new messages
2. **Typing indicators** - Show when the other user is typing
3. **"Last seen" timestamps** - Show when users were last active
4. **DM search functionality** - Search within DM conversations
5. **Group DMs** - Support for 3+ people in a conversation
6. **Voice/video calls in DMs** - Extend WebRTC to DMs
7. **Message read receipts** - Show when messages have been read
8. **DM-specific settings** - Mute, block, notification preferences per conversation
9. **Message history pagination** - Load older messages on demand
10. **User presence indicators** - Online/offline status in DM list
