## Subspace specification

Subspace is a peer-to-peer WebRTC-enabled gaming voice and text client that also acts as a social network. The server and client are built using Rust, on the client side Tauri is used to provide platform-agnostic web rendering. The frontend also supports a web-backed mode that can be run in a browser.

## Important Functionality

The most important functionality for the application to provide is;

1. Users can join any number of 'Servers' - which are instances running the server software. Anyone can host a server.
2. Servers have at least one voice channel and text channel, but can have as many as desired. The server maintainer is able to configure these channels.
3. A user can 'join' any number of 'Servers'. Their client will remember these servers, and the user can switch between them. 
4. Users in the same voice channel can talk to each other using WebRTC. There is a list of people in each voice channel in the client along with whether the user is transmitting their voice (using an activity light or similar)
5. Text Channels
    1. Text channels are used for text chat. Users can send messages to a text channel, and these messages will be displayed in the client if they have that channel active. Users can switch between their active channel.
    2. Messages can be pinned in text channels
    3. Users can also upload images and videos to text channels, which appear as separate messages.
    4. Users can use emojis in their messages as would be expected from UTF-8 support.
    5. Emojis can also be used to react to messages. Use just the native emoji keyboard here if possible, to reduce complexity.
    6. Users can use markdown in their messages and the client will render it.
    7. Users can receive *notifications* when a message is sent to a server or someone joints a voice channel using the native notifications service of their OS
    8. Users can also use @mentions to mention other users in the channel, which will notify them if they have notifications enabled.
    9. Users can also use @here and @everyone to mention all users in the channel or server respectively.
6. Voice channels
    1. Voice channels are comparitively 'simpler'. Users are able to listen and talk to each other when they are in the same voice channel.
    2. Users can mute and deafen themselves, which will prevent them from being heard by others.
    3. Users can also see who is currently speaking in the voice channel, and who is muted or deafened.
7. Personalisation
    1. Users can change their username and avatar.
    2. Users can change their theme between light and dark.
    3. Users can change their language, but only English is implemented for now.
    4. Users can change their notification settings, IE: They can turn them off or on only for now.

## The client

The client is a desktop application built using Tauri and Rust. It is a cross-platform application that can be run on Windows, macOS, and Linux. The client is a single-threaded application that uses a message-passing architecture to communicate between the UI and the backend.

The UI is built in a very simple manner without too many modern frameworks to improve the ability for the maintainer to understand the codebase.

- Typescript
- Svelte
- TailwindCSS is used for styling, with [daisyUI](https://daisyui.com/) anywhere at all possible for pre-made components
- Wrap as much of the UI as possible in components to reduce code duplication
- Components with a backend should be split into a `.svelte` file and a `.ts` file
- Components that update state should have clear methods to fetch/post state to the server
- The delineation between backend and frontend should be very clear

### Appearance

In order from left to right;
- The list of servers and their icons in circular bubbles. Clicking on a server will switch to that server.
- The list of channels in the current server (voice and text channels). Clicking on a voice or text channel joins it. That means, on joining a voice channel you will leave the previous voice channel. The text channel will be displayed in the messages pane.
    - When in a voice channel, a region will appear at the bottom of the client to show the user's microphone and speaker status, along with a button to mute/deafen themselves.
- The list of messages in the current channel (text channels only). 
    - There is a place to type messages at the bottom of the client in this section.
- The list of all members of the server.

## The server

The server is a standalone application built using Rust and uses the `tokio` runtime to handle asynchronous operations. 

Recommended dependencies (do not feel you need to follow these explicitly)

- `tokio` - async runtime
- `webrtc` - WebRTC connections
- `serde` - serialization and deserialization
- `reqwest` - HTTP requests
- `tokio-tungstenite` - WebSocket connections
- `tokio-sqlite` - SQLite connections. Keep in mind that we might need to migrate to PostgreSQL in the future.
- `tracing` - logging
- `tracing-subscriber` - logging

## The database

Feel free to design the schema however you like, but keep in mind that we might need to migrate to PostgreSQL in the future.

`schema.sql` is already generated to give an idea of the database schema, but feel free to modify it as necessary.

## Additional instructions

Please keep track of tasks as you do them in `TODO.md`. Maintain system design docs in the `docs/` folder. 