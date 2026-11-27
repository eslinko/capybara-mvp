# Capybara host image — production start (HOST + EDGE + WPROOF + SBPORT + MCP Soft).
# Runtime needs packages/core (auth/membership/roleGate) + ethers/dotenv +
# @supabase/supabase-js (SBPORT-03) + @modelcontextprotocol/sdk (MCP-01 Soft —
# lockfile in Git; image install pulls it via workspace=@capybara/core).
# PORT / SUPABASE_* / CAPY_BEARER_SECRET / CAPY_MCP_ENABLED from env at runtime —
# never bake secrets (AC-H02 / AC-S04 class).
# Green unit/`npm test` ≠ REQ-09 / Phase 2/4 Done · Soft≠Live · ≠ invent Live Pass.

# supabase-js ≥2.119 needs Node 22+ native WebSocket (Auth Admin createClient boot).
FROM node:22-alpine

WORKDIR /app

# Workspace root + core package (host requires ../packages/core/…).
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/core/src/ ./packages/core/src/
COPY host/ ./host/

# Install @capybara/core production deps (ethers, dotenv, @supabase/supabase-js,
# @modelcontextprotocol/sdk for host/mcp Soft — MCP-01 packaging HOST-02 class).
# Do not COPY .env — credentials stay Railway/env-only (SBPORT-03 t03).
RUN npm install --omit=dev --workspace=@capybara/core --ignore-scripts

ENV NODE_ENV=production

USER node

EXPOSE 8080

CMD ["npm", "start"]
