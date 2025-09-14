# Base image
FROM node:lts-alpine

# Install pnpm
RUN npm install -g pnpm

# Create app directory
WORKDIR /usr/src/app

# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install app dependencies
RUN pnpm install --frozen-lockfile

# Bundle app source
COPY . .

# Creates a "dist" folder with the production build
RUN pnpm run build

# Expose the port on which the app will run
EXPOSE 3000

# Start the server using the production build
CMD ["pnpm", "run", "start"]