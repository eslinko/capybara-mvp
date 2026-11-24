# Capybara host image — production start (HOST + EDGE + WPROOF + SBPORT).
# Runtime needs packages/core (auth/membership/roleGate) + ethers/dotenv +
# @supabase/supabase-js (SBPORT-03 — lockfile in Git; image install pulls it).
# PORT / SUPABASE_* / CAPY_BEARER_SECRET from env at runtime — never bake secrets
# (AC-H02 / AC-S04 class). Green unit/`npm test` ≠ REQ-09 / Phase 2 Done.

FROM node:20-alpine

WORKDIR /app

# Workspace root + core package (host requires ../packages/core/…).
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/core/src/ ./packages/core/src/
COPY host/ ./host/

# Install @capybara/core production deps (ethers, dotenv, @supabase/supabase-js).
# Do not COPY .env — credentials stay Railway/env-only (SBPORT-03 t03).
RUN npm install --omit=dev --workspace=@capybara/core --ignore-scripts

ENV NODE_ENV=production

USER node

EXPOSE 8080

CMD ["npm", "start"]
