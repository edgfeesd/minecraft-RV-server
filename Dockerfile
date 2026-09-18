FROM eclipse-temurin:21-jre-jammy
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates unzip tini xz-utils && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz -o /tmp/node.tar.xz && mkdir -p /usr/local/node && tar -xJf /tmp/node.tar.xz -C /usr/local/node --strip-components=1 && ln -sf /usr/local/node/bin/node /usr/local/bin/node && ln -sf /usr/local/node/bin/npm /usr/local/bin/npm && ln -sf /usr/local/node/bin/npx /usr/local/bin/npx && rm /tmp/node.tar.xz
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3000
ENV MC_DATA_DIR=/data
ENV MC_VERSION=1.21.1
ENV SERVER_TYPE=PAPER
ENV MEMORY=2G
ENV EULA=TRUE
EXPOSE 3000 25565
VOLUME ["/data"]
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","server.js"]