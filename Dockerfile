# Base image
FROM node:lts-alpine

# Install pnpm
RUN npm install -g pnpm

# Create app directory
WORKDIR /usr/src/app

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy turbo config
COPY turbo.json ./

# Copy all package.json files to establish workspace structure
COPY apps/api/package.json ./apps/api/
COPY packages/*/package.json ./packages/*/

# Install all dependencies (including workspace dependencies)
RUN pnpm install --frozen-lockfile

# Copy the API source code
COPY apps/api/ ./apps/api/

# Copy shared packages that the API depends on
COPY packages/ ./packages/

# Set working directory to API
WORKDIR /usr/src/app/apps/api

# Build the API
RUN pnpm run build

# Expose the port
EXPOSE 3000

# Start the API
CMD ["pnpm", "run", "start"]
