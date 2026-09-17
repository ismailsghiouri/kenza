# syntax=docker/dockerfile:1

FROM node:20-alpine

RUN apk add --no-cache curl

WORKDIR /app

# Install dependencies (uses package-lock.json for reproducible builds)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the Next.js app
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["npm", "start"]
