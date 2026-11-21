# Capybara Phase 1 host image — production start only (AC-H03).
# Runtime: Node stdlib host entry. PORT from env at runtime — never bake secrets (AC-H02).
# Green unit/`npm test` ≠ Phase 1 host Done (AC-H04) — see docs/architecture/07-railway-family-host/03-env-verify-deploy-residual.md
FROM node:20-alpine

WORKDIR /app

# package.json provides `npm start` → `node host/start.js` (HOST-01).
# No npm install: host uses Node builtins only; do not pull hardhat/mocha into the image.
COPY package.json ./
COPY host/ ./host/

ENV NODE_ENV=production

# PORT is injected by Railway / `docker run -e PORT=…`. Do not set secrets here.
USER node

# Documentary default; Railway overrides via env PORT.
EXPOSE 8080

CMD ["npm", "start"]
