# --- Base Stage ---
# Use a lightweight and secure Node.js base image.
FROM node:20-alpine AS base
WORKDIR /usr/src/app

# Create a non-root user and group for security.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup


# --- Dependencies Stage ---
# Copy only package manifests to leverage Docker layer caching.
FROM base AS deps
# Set user early to ensure permissions are handled if WORKDIR needs creation.
USER appuser
COPY package.json package-lock.json ./
# Install production dependencies.
RUN npm install --omit=dev


# --- Runner Stage ---
# Final, minimal image.
FROM base AS runner
# Set NODE_ENV to production for performance and security.
ENV NODE_ENV=production

# Set the user for the runner stage.
USER appuser

# Copy installed dependencies from the 'deps' stage with correct ownership.
COPY --from=deps --chown=appuser:appgroup /usr/src/app/node_modules ./node_modules
# Copy the application source code with correct ownership.
COPY --chown=appuser:appgroup . .

# Create a volume for the SQLite database to persist data across container restarts.
# The 'data' directory will be owned by 'appuser'.
VOLUME /usr/src/app/data

# Expose the application port defined in the environment.
EXPOSE 8080

# The command to run the application.
CMD [ "node", "server.js" ]