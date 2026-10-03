FROM oven/bun:1-debian
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN bun add zod@4.6.5
COPY server.ts /app/server.ts
EXPOSE 8080
CMD ["bun", "run", "/app/server.ts"]
