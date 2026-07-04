# docker buildx create --name amd64-arm64 --driver docker-container
# docker buildx build -t drwarpman/steam-hour-booster --builder=amd64-arm64 --platform linux/amd64,linux/arm64 --no-cache --push .

FROM oven/bun:1.2.19 AS base

RUN apt-get update && apt-get install -y --no-install-recommends locales && \
    sed -i '/ru_RU.UTF-8/s/^# //' /etc/locale.gen && locale-gen && \
    rm -rf /var/lib/apt/lists/*

ENV LANG=ru_RU.UTF-8
ENV LC_TIME=ru_RU.UTF-8
ENV TZ=Europe/Moscow

WORKDIR /app

FROM base AS install

RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --production

FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY src/ src
COPY package.json .
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT [ "/docker-entrypoint.sh", "bun", "." ]
