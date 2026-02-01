FROM oven/bun:1.3-alpine
WORKDIR /app
COPY package.json bun.lock* ./
COPY packages/dashboard/package.json ./packages/dashboard/
RUN cd packages/dashboard && bun install
COPY packages/dashboard ./packages/dashboard
EXPOSE 3001
CMD ["bun", "run", "--cwd", "packages/dashboard", "dev"]
