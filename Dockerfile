# Build stage
FROM rust:bookworm as builder

WORKDIR /usr/src/app
COPY . .

# Build the server binary
# We use --release and specify the server package
RUN cargo build --release -p server

# Runtime stage
FROM debian:bookworm-slim

# Install system dependencies if needed (e.g., for SSL, SQLite)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/local/bin

# Copy the binary from builder
COPY --from=builder /usr/src/app/target/release/server .

# Copy the schema for initial setup if needed (database initialization)
# usage of schema.sql depends on how db.rs references it (include_str! embeds it, so no need to copy)

# Create a directory for sqlite db
RUN mkdir -p /data
ENV DATABASE_URL=/data/subspace.db
ENV PORT=3000

# Expose the server port
EXPOSE 3000

# Run the server
CMD ["./server"]
