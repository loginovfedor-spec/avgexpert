# PG 18 + pgvector with ru_RU.UTF-8 cluster locale (ADR-1, Sprint D0).
FROM pgvector/pgvector:pg18

RUN apt-get update \
    && apt-get install -y --no-install-recommends locales \
    && sed -i '/ru_RU.UTF-8/s/^# //g' /etc/locale.gen \
    && locale-gen ru_RU.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

ENV LANG=ru_RU.UTF-8
ENV LC_ALL=ru_RU.UTF-8
