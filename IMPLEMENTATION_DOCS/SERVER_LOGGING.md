# Server Logging Improvements

## Overview

Enhanced server logging to provide better visibility into application operations, especially useful for monitoring Docker container logs.

## Changes Made

### 1. Authentication Logging (`server/src/auth.rs`)

**Registration:**
- `INFO`: Successful registration with user_id and username
- `INFO`: Registration attempt (username)
- `WARN`: Failed registration (username already taken)
- `ERROR`: Database errors during user creation

**Login:**
- `INFO`: Successful login with user_id and username
- `INFO`: Login attempt (username)
- `WARN`: Failed login (user not found or invalid password)

### 2. WebSocket Logging (`server/src/ws.rs`)

**Connection Events:**
- `INFO`: WebSocket authenticated (user_id)
- `INFO`: WebSocket disconnected (user_id)

**Message Handling:**
- `DEBUG`: All WebSocket message types received (type, user_id)
- `INFO`: Message sent via WebSocket (message_id, channel_id, user_id)
- `INFO`: User joining voice channel (user_id, channel_id)
- `INFO`: User left voice channel (user_id, channel_id)
- `INFO`: User status update (user_id, status, custom_text)
- `WARN`: Failed to parse WebSocket message
- `WARN`: Unknown WebSocket message type
- `WARN`: Invalid status update attempt
- `DEBUG`: User left previous voice channel when switching

### 3. HTTP API Logging (`server/src/routes/messages.rs`)

**Message Operations:**
- `INFO`: Creating message via HTTP (message_id, channel_id, user_id)
- `INFO`: Deleting message (message_id)
- `ERROR`: Failed to create message with context (channel_id, user_id, error)
- `ERROR`: Failed operations (get, edit, delete, pin, unpin, reactions)

## Log Levels

The server uses standard log levels:

- **ERROR**: Critical failures that prevent operations
- **WARN**: Unexpected conditions or failed attempts (auth failures, invalid input)
- **INFO**: Important operational events (connections, user actions, state changes)
- **DEBUG**: Detailed diagnostic information (message types, state transitions)

## Configuration

Set the `RUST_LOG` environment variable to control log verbosity:

```bash
# Show only errors and warnings
RUST_LOG=warn

# Show info and above (recommended for production)
RUST_LOG=info

# Show debug and above (useful for troubleshooting)
RUST_LOG=debug

# Show everything including trace
RUST_LOG=trace

# Module-specific logging
RUST_LOG=subspace_server=debug,axum=info
```

## Docker Usage

### View logs:
```bash
docker logs subspace-server

# Follow logs in real-time
docker logs -f subspace-server

# Show last 100 lines
docker logs --tail 100 subspace-server
```

### Set log level in docker-compose.yml:
```yaml
services:
  server:
    environment:
      - RUST_LOG=info  # or debug, warn, error
```

## Example Log Output

```
2024-01-15T10:30:45Z INFO  subspace_server: Subspace server listening on 0.0.0.0:3001
2024-01-15T10:31:12Z INFO  subspace_server::auth: Registration attempt for username: alice
2024-01-15T10:31:12Z INFO  subspace_server::auth: User registered successfully: user_id=550e8400-e29b-41d4-a716-446655440000, username=alice
2024-01-15T10:31:45Z INFO  subspace_server::auth: Login attempt for username: alice
2024-01-15T10:31:45Z INFO  subspace_server::auth: User logged in successfully: user_id=550e8400-e29b-41d4-a716-446655440000, username=alice
2024-01-15T10:31:46Z INFO  subspace_server::ws: WebSocket authenticated: user_id=550e8400-e29b-41d4-a716-446655440000
2024-01-15T10:32:10Z DEBUG subspace_server::ws: WebSocket message: type=send_message, user_id=550e8400-e29b-41d4-a716-446655440000
2024-01-15T10:32:10Z INFO  subspace_server::ws: Message sent via WebSocket: message_id=660e8400-e29b-41d4-a716-446655440001, channel_id=770e8400-e29b-41d4-a716-446655440002, user_id=550e8400-e29b-41d4-a716-446655440000
2024-01-15T10:33:05Z INFO  subspace_server::ws: User status update: user_id=550e8400-e29b-41d4-a716-446655440000, status=idle, custom_text=None
2024-01-15T10:35:20Z INFO  subspace_server::ws: User joining voice channel: user_id=550e8400-e29b-41d4-a716-446655440000, channel_id=880e8400-e29b-41d4-a716-446655440003
2024-01-15T10:40:15Z INFO  subspace_server::ws: WebSocket disconnected: user_id=550e8400-e29b-41d4-a716-446655440000
```

## Benefits

1. **Troubleshooting**: Quickly identify issues by following user actions
2. **Monitoring**: Track user activity, connection patterns, and system health
3. **Security**: Audit authentication attempts and failures
4. **Performance**: Identify bottlenecks by tracking operation timing
5. **Debugging**: Detailed message flow for WebSocket communications

## Future Enhancements

Consider adding:
- Request timing/duration metrics
- Database query logging (with query time)
- File upload/download logging
- Rate limiting events
- Server/channel creation and deletion events
- DM conversation logging
- Structured logging (JSON format) for log aggregation tools
- Correlation IDs for request tracing
