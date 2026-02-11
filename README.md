# Subspace

> [!WARNING]
> This project was almost entirely vibe-coded. It's intended to provide the bare-minimum functionality to begin a transition from Discord. I don't recommend using this in any case where you are allowing access to the server to anyone you don't know personally, as there are **severe security implications**. 
> The authentication part seems to be fine, but the rest of it is a bit of a mess. Therefore, make sure if you use it you're using the provided [whitelist](#whitelist) feature to control access to the server.
> I'm not a security expert, so take this with a grain of salt.
> Hey, at least I wrote the README 🤷

Subspace is a discord-like messaging application that is intended to provide the bare-minimum functionality to get orphans from Discord off the ground without requiring too much complicated setup.

As long as you can host a server or docker container on a computer somewhere, you can host your own subspace server.

## The gist

Client and server downloads are available on the [releases](https://github.com/winzlebee/subspace/releases) page.

- Host the backend server (available as a docker container) on a particular IP, ideally behind a reverse-proxy like nginx or cloudflared
- Clients can download the client for their platform and enter the IP of your main server.
- The client will remember this IP, and provide a discord-like interface for managing and connecting to servers.

## Detailed Hosting Instructions

### Docker Compose

The easiest way to host Subspace is via Docker. Create a `docker-compose.yml` file with the following configuration:

```yaml
services:
  subspace:
    image: winzlebee/subspace:latest
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    restart: always
```

Run the server:
```bash
docker compose up -d
```

### Reverse Proxy (Nginx)

Since Subspace uses WebSockets, your reverse proxy must be configured to handle connection upgrades.

```nginx
server {
    listen 80;
    server_name your.domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### Whitelist

To restrict access, ensure the whitelist is configured in your server settings. This is critical for security as mentioned in the warnings above. You can manage the whitelist by editing the `whitelist.json` file generated in your mapped data volume.


## Limitations

A lot at the moment. The ones that I plan to maybe plug away at;

- Only sqlite is supported as a database backend at the moment. This limits this to smaller servers, as that's all I needed to get running.
- No video and screenshare is available

