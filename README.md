# Subspace

Subspace is a discord-like messaging application that is intended to provide the bare-minimum functionality to get orphans from Discord off the ground without requiring too much complicated setup.

As long as you can host a server or docker container on a computer somewhere, you can host your own subspace server.

> [!WARNING]
> This project was almost entirely vibe-coded. It's intended to provide the bare-minimum functionality to begin a transition from Discord. I don't recommend using this in any situation.
> If for some reason you do, only allow access to the server to people you know personally, as there are **severe security implications**. 
> For example, the `/upload` endpoint was vibe-given public access by Claude. Lmao.
> I'm not a security expert, so take this with a grain of salt.
> Hey, at least I wrote the README 🤷

## The gist

Client and server downloads are available on the [releases](https://github.com/winzlebee/subspace/releases) page.

- Host the backend server (available as a docker container) on a particular IP, ideally behind a reverse-proxy like nginx or cloudflared
- Clients can download the client for their platform and enter the IP of your main server.
- The client will remember this IP, and provide a discord-like interface for managing and connecting to servers.

## Scope

Subspace is designed for small communities where everyone already knows and trusts each other. For this reason, I've intentionally left out any moderation tools, including restricting management and creation of servers to certain users. Every user gets the same permissions from the get-go.

## Running locally

```bash
# Install C Compiler
sudo apt-get update && sudo apt-get install -y build-essential

# Install Rust & Carbo
curl https://sh.rustup.rs -sSf | sh

# Install dependencies
sudo apt-get install -y pkg-config libsoup-3.0-dev libgtk-3-dev libjavascriptcoregtk-4.1-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libpango1.0-dev

npm install

# Run the server
cargo run -p server

# Run the client
npm run tauri dev
```

## Detailed Hosting Instructions

To run subspace, you'll need to host both Subspace' server itself along with a TURN server for WebRTC. It's also possible to run subspace without any TURN server, but in practice the WebRTC connections will fail because most consumer routers now seem to have symmetric NAT. 

> **Trivia**
> Eventually, subspace will need to re-implement its own [special TURN server](https://web.archive.org/web/20200329084934/https://blog.discordapp.com/how-discord-handles-two-and-half-million-concurrent-voice-users-using-webrtc-ce01c3187429?gi=626623d44c6a) to support many people on the same voice call at once and to reduce the network traffic required on the server PC.

### Docker Compose

The easiest way to host Subspace is via its `docker-compose.yml` file located in the root of the repository. It will automatically set up the server and a [coturn](https://github.com/coturn/coturn) TURN server.

```bash
# Create a secure random password for the TURN server. This will be sent to clients when they need to connect via WebRTC from the subspace server.
TURN_PASSWORD=$(openssl rand -base64 32)
echo "TURN_PASSWORD=$TURN_PASSWORD" > .env

# Optional: Set a custom TURN_URL if your TURN server is hosted on a different domain/port
# echo "TURN_URL=turn:turn.example.com:3478" >> .env

# Start the subspace server and coturn TURN server
docker compose up -d
```

> [!IMPORTANT]
> The TURN server requires specific ports (3478 UDP/TCP) to be open and accessible.
> Please make sure you set the `TURN_PASSWORD` environment variable. This provides basic protection against unauthenticated users hogging your TURN server's bandwidth or using it for traffic amplification.

### Portainer Stack Deployment

If you're using Portainer, you can use the `docker-compose.portainer.yml` file as a stack:

1. In Portainer, go to **Stacks** → **Add stack**
2. Name your stack (e.g., "subspace")
3. Copy the contents of `docker-compose.portainer.yml` into the web editor
4. Under **Environment variables**, add:
   - `TURN_PASSWORD` - Generate a secure password (e.g., using `openssl rand -base64 32`)
5. Optionally add `TURN_URL` if using a custom TURN server
6. Deploy the stack

The stack uses named volumes (`subspace_data`, `subspace_uploads`, `turn_data`) which will persist your data across container updates and restarts.

### Reverse Proxy (Nginx)

Since Subspace uses WebSockets, your reverse proxy must be configured to handle connection upgrades.

```nginx
server {
    listen 80;
    server_name your.domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> [!NOTE]
> The Subspace server listens on port **3001** by default. Make sure your reverse proxy points to this port.

### TURN over TLS

If you expect users to connect from heavily restricted networks that only allow HTTPS traffic, you need to configure coturn to use TLS. 
This is currently unimplemented, but if there is enough interest I'll add support for this.

## Environment Variables

The server can be configured using the following environment variables:

- **`DATABASE_URL`** - Path to the SQLite database file (default: `subspace.db`, Docker: `/app/data/subspace.db`)
- **`UPLOAD_DIR`** - Directory for uploaded files (default: `uploads`, Docker: `/app/uploads`)
- **`BIND_ADDR`** - Address and port to bind the server to (default: `0.0.0.0:3001`)
- **`JWT_SECRET`** - Secret key for JWT token generation (default: `dev-secret-change-me` - **change this in production!**)
- **`TURN_PASSWORD`** - Password for the TURN server (required for WebRTC)
- **`TURN_URL`** - Custom TURN server URL (optional, e.g., `turn:turn.example.com:3478`)
- **`TURN_USERNAME`** - Username for TURN authentication (default: `subspace`)

> [!IMPORTANT]
> Make sure to set a strong `JWT_SECRET` in production environments. This is used to sign authentication tokens.

## Data Persistence

When running with Docker, your data is stored in volumes:
- **Database**: Mounted at `/app/data` - contains `subspace.db` with all users, servers, channels, and messages
- **Uploads**: Mounted at `/app/uploads` - contains user-uploaded files and attachments

Make sure these volumes are properly configured to persist data across container restarts.

## Technologies and Notes

Not that it really matters (what - with it being vibe-coded and all), but here's what I told the LLM to use:

- **Client**: *Tauri* - using Svelte, TailwindCSS, DaisyUI
  It didn't really like using DaisyUI sometimes and just rolled-its-own using raw-dog TailwindCSS. Ah well. For example, I would have liked for it to use all of DaisyUI's avatar components.
- **Server**: *Rust* - using Tokio, WebRTC, SQLite
  The server was pretty much a one-shot affair, kinda impressing me in the process. It won't handle many, many users very well, mostly because of the Sqlite backend, but it's fine for now.

## Limitations

A lot at the moment. The ones that I plan to maybe plug away at;

- Only sqlite is supported as a database backend at the moment. This limits this to smaller servers, as that's all I needed to get running.
- Discord uses a complicated server-side system of ensuring only relevant WebRTC traffic is transmitted. Since we don't do that, it'll really struggle on large calls (>15 people)

## Contributing

I'm not really expecting anyone to contribute to this, but if you'd like to, feel free to open a pull request. I'm not really sure what I'm doing, so I'm open to suggestions. I'm not a security expert, so if you see any security issues, please let me know.