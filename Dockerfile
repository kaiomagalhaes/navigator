# Next.js 16 app image for Heroku container deploy.
# Single stage: all deps stay installed so the Heroku `release` phase can run
# `drizzle-kit migrate` (a devDependency) against the production database.
FROM node:22-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies first for better layer caching. Install *all* deps
# (incl. dev) — the build needs them and the release phase needs drizzle-kit.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source (.dockerignore excludes node_modules/.next/.env).
COPY . .

# Build the production Next.js output.
RUN npm run build

ENV NODE_ENV=production
# Heroku injects $PORT at runtime; `next start` binds to it automatically.
EXPOSE 3000
CMD ["npm", "run", "start"]
