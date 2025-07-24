# --- Base Stage ---
# Use a lightweight and secure Node.js base image.
FROM node:20-alpine AS base
WORKDIR /usr/src/app

# --- Dependencies Stage ---
# Copy only package manifests to leverage Docker layer caching.
FROM base AS deps
COPY package.json package-lock.json ./
# Install production dependencies.
RUN npm install --omit=dev

# --- Runner Stage ---
# Final, minimal image.
FROM base AS runner
# Set NODE_ENV to production for performance and security.
ENV NODE_ENV=production
# Copy installed dependencies from the 'deps' stage.
COPY --from=deps /usr/src/app/node_modules ./node_modules
# Copy the application source code.
COPY . .

# Create a volume for the SQLite database to persist data across container restarts.
VOLUME /usr/src/app/data

# Expose the application port defined in the environment.
EXPOSE 8080

# The command to run the application.
CMD [ "node", "server.js" ]