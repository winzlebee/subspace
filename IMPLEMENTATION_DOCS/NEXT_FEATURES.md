# Recommended Next Features for Subspace

This document outlines recommended features to implement next for the Subspace chat/voice application. Features are prioritized based on user impact, technical feasibility, and alignment with the project's goals.

---

## 🔥 High Priority - Core Functionality Gaps

### 1. ✅ Direct Messages (DMs) - COMPLETED v0.7.0
- Private 1-on-1 conversations between users
- Separate from server channels
- Uses the "Home" button concept mentioned in v0.4.7
- Essential for any Discord-like platform

**Status:** Fully implemented in version 0.7.0

### 2. User Status & Presence
**Priority:** HIGH  
**Complexity:** Medium  
**Impact:** High

#### Description
Add real-time user status indicators to show who's online, offline, away, or busy.

#### Features
- Online/Offline/Away/Do Not Disturb status indicators
- "Last seen" timestamps for offline users
- Activity status (e.g., "In voice channel: General")
- Status colors/icons in member lists and DM conversations
- Automatic status changes (e.g., idle after inactivity)

#### Technical Requirements
- Add `user_status` table to track current status
- WebSocket broadcasts for status changes
- Client-side idle detection
- Update member list and DM UI components

#### Benefits
- Makes the app feel alive and active
- Helps users know who's available to chat
- Reduces unnecessary message attempts to offline users
- Enhances the social aspect of the platform

---

### 3. Message Search
**Priority:** HIGH  
**Complexity:** Medium-High  
**Impact:** High

#### Description
Allow users to search for messages within channels, servers, or across all conversations.

#### Features
- Search within current channel
- Search across entire server
- Search across all servers and DMs
- Filter by:
  - User/author
  - Date range
  - Has attachments/images
  - Has links
  - Mentions me
- Keyboard shortcut (Ctrl/Cmd + F)
- Search results with context preview
- Jump to message in conversation

#### Technical Requirements
- Add full-text search to SQLite (FTS5 extension)
- Create search API endpoints
- Build search UI component
- Index existing messages
- Optimize search queries for performance

#### Benefits
- Critical for finding old conversations in active servers
- Improves productivity and user experience
- Essential as message history grows
- Common feature in all modern chat apps

---

### 4. Message History Pagination
**Priority:** HIGH  
**Complexity:** Low-Medium  
**Impact:** High

#### Description
Implement proper pagination for message history instead of loading all messages at once.

#### Features
- Load last 50 messages initially (already implemented)
- "Load More" button or infinite scroll
- Scroll position preservation when loading older messages
- Loading indicators
- Jump to specific date
- Jump to first unread message

#### Technical Requirements
- Update API to support `before` and `after` cursors
- Modify message loading logic in client
- Handle scroll position management
- Cache loaded messages efficiently

#### Benefits
- Essential for channels with long history
- Improves initial load performance
- Reduces memory usage
- Better user experience in active channels

---

## ⭐ Medium Priority - User Experience Enhancements

### 5. Notification System Improvements
**Priority:** MEDIUM  
**Complexity:** Medium  
**Impact:** High

#### Description
Add granular control over notifications to reduce noise and improve relevance.

#### Features
- Per-channel notification settings
  - All messages
  - Only @mentions
  - Nothing
- Per-server notification settings
- Per-DM conversation settings
- Unread message indicators/badges
- Unread count in title bar
- Notification sound customization
- Quiet hours/Do Not Disturb schedule
- Notification preview settings

#### Technical Requirements
- Add notification preferences to database
- Update notification logic to respect settings
- Add UI for notification preferences
- Implement unread tracking system
- Badge counter in app icon (platform-specific)

#### Benefits
- Reduces notification fatigue
- Users can focus on important conversations
- Essential for users in multiple active servers
- Improves overall user satisfaction

---

### 6. Voice Channel Improvements
**Priority:** MEDIUM  
**Complexity:** Medium-High  
**Impact:** Medium-High

#### Description
Enhance voice chat functionality with better controls and audio quality.

#### Features
- Push-to-talk keybind support
- Voice activity detection threshold settings
- Individual user volume controls
- Noise suppression toggle
- Echo cancellation settings
- Audio input/output device selection (already partially implemented)
- Voice quality indicators (latency, packet loss)
- Automatic gain control
- Krisp-style noise cancellation (advanced)

#### Technical Requirements
- Extend WebRTC audio processing
- Add audio settings UI
- Implement keybind system
- Per-user audio mixing
- Audio processing pipeline

#### Benefits
- Better audio quality for all users
- More control over voice experience
- Reduces background noise issues
- Professional-grade voice chat

---

### 7. Rich Embeds & Link Previews
**Priority:** MEDIUM  
**Complexity:** Medium  
**Impact:** Medium

#### Description
Automatically generate rich previews for URLs shared in chat.

#### Features
- Auto-generate previews for URLs
  - Title, description, thumbnail
  - Site favicon
- Embed support for:
  - YouTube videos (inline player)
  - Twitter/X posts
  - GitHub repositories
  - Spotify tracks
  - Images (already supported)
- Unfurl settings (enable/disable per user)
- Click to expand/collapse embeds

#### Technical Requirements
- URL detection in messages
- Metadata fetching service
- Embed rendering components
- Cache embed data
- Rate limiting for external requests
- Security: validate URLs, prevent SSRF

#### Benefits
- Makes chat feel more modern
- Better content sharing experience
- Reduces need to click external links
- Common feature in modern chat apps

---

### 8. User Roles & Permissions
**Priority:** MEDIUM  
**Complexity:** High  
**Impact:** High (for larger communities)

#### Description
Add role-based access control for server management and moderation.

#### Features
- Role creation and management
- Permission system:
  - Manage server
  - Manage channels
  - Kick/ban users
  - Delete messages
  - Manage roles
  - Send messages
  - Upload files
  - Use voice
- Channel-specific permission overrides
- Role hierarchy
- Role colors and display
- Default roles (Admin, Moderator, Member)

#### Technical Requirements
- Add roles and permissions tables
- Permission checking middleware
- Role assignment UI
- Permission inheritance system
- Update all API endpoints with permission checks

#### Benefits
- Essential for larger communities
- Enables proper moderation
- Prevents abuse and spam
- Allows delegation of responsibilities
- Currently mentioned as intentionally left out, but needed for growth

---

## 🎨 Nice to Have - Polish & Additional Features

### 9. Server Discovery/Browse
**Priority:** LOW-MEDIUM  
**Complexity:** Medium  
**Impact:** Medium

#### Description
Allow users to discover and join public servers.

#### Features
- Public server list/directory
- Server categories (Gaming, Tech, Art, etc.)
- Server search and filtering
- Server preview (description, member count, channels)
- Invite links with:
  - Expiration dates
  - Usage limits
  - Temporary membership
- Featured/trending servers
- Server tags

#### Technical Requirements
- Add server visibility settings
- Create server directory API
- Build discovery UI
- Invite link generation system
- Server preview endpoint

#### Benefits
- Helps communities grow
- Easier onboarding for new users
- Increases platform engagement
- Network effects

---

### 10. Custom Emojis
**Priority:** LOW-MEDIUM  
**Complexity:** Medium  
**Impact:** Medium

#### Description
Allow servers to upload and use custom emojis.

#### Features
- Server-specific custom emoji uploads
- Emoji management interface (add, remove, rename)
- Emoji picker with custom emojis
- Animated emoji support (GIF)
- Emoji usage statistics
- Emoji slots/limits per server
- Cross-server emoji usage (Nitro-like feature)

#### Technical Requirements
- Add custom_emojis table
- File upload for emoji images
- Emoji picker UI updates
- Emoji rendering in messages
- Image processing (resize, optimize)
- Storage management

#### Benefits
- Differentiates servers
- Enhances community identity
- Fun and engaging feature
- Common in Discord-like platforms

---

### 11. Message Threading
**Priority:** LOW  
**Complexity:** High  
**Impact:** Medium

#### Description
Allow users to create threaded conversations from messages.

#### Features
- Reply to specific messages creating threads
- Thread view with parent message context
- Thread participant list
- Thread notifications
- Collapse/expand threads
- Thread indicators in main channel
- Follow/unfollow threads

#### Technical Requirements
- Add thread relationships to database
- Thread API endpoints
- Thread UI components
- WebSocket updates for threads
- Complex state management

#### Benefits
- Keeps conversations organized
- Reduces channel clutter
- Better for complex discussions
- Common in modern chat apps (Slack, Discord)

---

### 12. User Profiles
**Priority:** LOW  
**Complexity:** Low-Medium  
**Impact:** Low-Medium

#### Description
Extended user profiles with more personalization options.

#### Features
- Profile modal/page
- Custom bio/about me section
- Join date display
- Mutual servers list
- Profile banner image
- Custom status message
- Pronouns field
- Social links
- Activity history

#### Technical Requirements
- Extend user table with profile fields
- Profile API endpoints
- Profile UI component
- Image upload for banners
- Privacy settings

#### Benefits
- More personalization options
- Helps users express identity
- Better social connections
- Common feature in social platforms

---

## 🔧 Technical Improvements

### 13. Database Migration to PostgreSQL
**Priority:** MEDIUM (for scaling)  
**Complexity:** High  
**Impact:** High (for large deployments)

#### Description
Migrate from SQLite to PostgreSQL for better scalability and concurrent access.

#### Features
- PostgreSQL support
- Connection pooling
- Better concurrent write performance
- Advanced query optimization
- Replication support
- Backup and restore tools

#### Technical Requirements
- Abstract database layer
- Migration scripts
- Update all queries for PostgreSQL
- Connection pool configuration
- Testing and validation

#### Benefits
- Supports larger communities
- Better concurrent access
- More robust for production
- Industry standard database
- Already mentioned as future need in README

---

### 14. Selective Forwarding Unit (SFU) for Voice
**Priority:** HIGH (for scaling voice)  
**Complexity:** Very High  
**Impact:** Very High (for large voice channels)

#### Description
Implement a custom SFU server for efficient voice routing in large calls.

#### Features
- Server-side voice routing
- Bandwidth optimization
- Support for 50+ simultaneous speakers
- Simulcast support
- Automatic quality adjustment
- Voice activity detection server-side

#### Technical Requirements
- Custom SFU server implementation
- WebRTC server-side processing
- Bandwidth management algorithms
- Load balancing
- Extensive testing

#### Benefits
- Dramatically improves voice scalability
- Reduces bandwidth requirements
- Enables large voice channels (>15 people)
- Essential for growth
- Mentioned in README as needed for >15 people

---

### 15. Message Editing History
**Priority:** LOW  
**Complexity:** Low-Medium  
**Impact:** Low-Medium

#### Description
Track and display message edit history for transparency.

#### Features
- Store all message versions
- "(edited)" indicator on messages
- View edit history modal
- Timestamp for each edit
- Diff view showing changes
- Limit edit history retention (e.g., 30 days)

#### Technical Requirements
- Add message_history table
- Update edit endpoints to store history
- History viewer UI component
- Diff algorithm for changes

#### Benefits
- Prevents abuse of editing
- Transparency in conversations
- Accountability
- Useful for moderation

---

### 16. Rate Limiting & Anti-Spam
**Priority:** MEDIUM-HIGH  
**Complexity:** Medium  
**Impact:** High (for security)

#### Description
Implement rate limiting and anti-spam measures to prevent abuse.

#### Features
- Message rate limiting (e.g., 5 messages per 5 seconds)
- File upload rate limiting
- API rate limiting per user
- Duplicate message detection
- Slowmode for channels
- Automatic spam detection
- IP-based rate limiting

#### Technical Requirements
- Rate limiting middleware
- Redis or in-memory cache for counters
- Configurable rate limit rules
- Rate limit headers in API responses
- Admin controls for rate limits

#### Benefits
- Prevents spam and flooding
- Protects server resources
- Improves user experience
- Essential for public servers
- Security best practice

---

## 📱 Mobile & Accessibility

### 17. Native Mobile Apps (iOS/Android)
**Priority:** MEDIUM  
**Complexity:** Very High  
**Impact:** High

#### Description
Build native mobile applications for iOS and Android.

#### Features
- Native iOS app (Swift/SwiftUI)
- Native Android app (Kotlin/Jetpack Compose)
- Push notifications
- Background voice chat
- Mobile-optimized UI
- Offline message queue
- Share extensions
- Camera integration

#### Technical Requirements
- iOS development setup
- Android development setup (already has APK build guide)
- Push notification service
- Mobile-specific API optimizations
- App store deployment

#### Benefits
- Mobile-first user experience
- Push notifications
- Better performance than web
- Wider user reach
- Essential for modern chat apps

---

### 18. Accessibility Improvements
**Priority:** MEDIUM  
**Complexity:** Medium  
**Impact:** High (for accessibility)

#### Description
Improve accessibility for users with disabilities.

#### Features
- Screen reader support (ARIA labels)
- Full keyboard navigation
- Focus indicators
- High contrast theme
- Reduced motion option
- Font size controls
- Color blind friendly colors
- Alt text for images
- Captions for voice channels (future)

#### Technical Requirements
- ARIA attributes throughout UI
- Keyboard event handlers
- Accessibility testing
- Theme variants
- Settings for accessibility options

#### Benefits
- Inclusive for all users
- Legal compliance (ADA, WCAG)
- Better UX for everyone
- Ethical responsibility
- Expands user base

---

## 📊 Priority Summary

### Immediate Next Steps (After DMs)
1. **User Status & Presence** - Makes the app feel alive
2. **Notification System Improvements** - Critical for usability
3. **Message Search** - Essential quality-of-life feature

### Short-term Goals (Next 3-6 months)
4. Message History Pagination
5. Voice Channel Improvements
6. Rich Embeds & Link Previews
7. Rate Limiting & Anti-Spam

### Medium-term Goals (6-12 months)
8. User Roles & Permissions
9. Server Discovery
10. Custom Emojis
11. Database Migration to PostgreSQL

### Long-term Goals (12+ months)
12. Selective Forwarding Unit (SFU)
13. Message Threading
14. Native Mobile Apps
15. Advanced Accessibility Features

---

## Implementation Notes

### Feature Selection Criteria
When choosing which feature to implement next, consider:
1. **User Impact** - How many users will benefit?
2. **Technical Debt** - Does it address existing limitations?
3. **Complexity** - Can it be completed in a reasonable timeframe?
4. **Dependencies** - Does it unlock other features?
5. **Community Requests** - What are users asking for?

### Development Approach
- Start with high-priority, medium-complexity features
- Build incrementally with frequent testing
- Maintain backward compatibility
- Document as you go
- Get user feedback early and often

### Resource Considerations
- Some features (like SFU) require significant expertise
- Mobile apps require platform-specific knowledge
- Database migration needs careful planning
- Consider community contributions for lower-priority features

---

**Last Updated:** 2026-02-15  
**Version:** 0.7.0 (Post-DM Implementation)
