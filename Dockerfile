# Capybara host image — production start (HOST + EDGE + WPROOF).
# Runtime needs packages/core (auth/membership/roleGate) + ethers/dotenv.
# PORT from env at runtime — never bake secrets (AC-H02).
# Green unit/`npm test` ≠ live Done — see architecture / operator manuals.

FROM node:20-alpine

WORKDIR /app

# Workspace root + core package (host requires ../packages/core/…).
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/core/src/ ./packages/core/src/
COPY host/ ./host/

# Install only @capybara/core production deps (ethers, dotenv).
RUN npm install --omit=dev --workspace=@capybara/core --ignore-scripts

ENV NODE_ENV=production

USER node

EXPOSE 8080

CMD ["npm", "start"]
