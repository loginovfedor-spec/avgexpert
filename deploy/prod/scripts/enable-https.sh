#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-www.avgexpert.ru}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@avgexpert.ru}"

APP_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DEPLOY_DIR="$APP_ROOT/deploy/prod"
ENV_FILE="$DEPLOY_DIR/.env"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/compose.yml")
SSL_CONF="$DEPLOY_DIR/nginx/conf.d/ssl.conf"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Create it from deploy/prod/env.example first."
  exit 1
fi

cd "$APP_ROOT"

echo "Starting nginx for HTTP-01 challenge..."
if [[ -f "$SSL_CONF" ]] && [[ ! -f "$SSL_CONF.before-certbot" ]]; then
  mv "$SSL_CONF" "$SSL_CONF.before-certbot"
fi

"${COMPOSE[@]}" up -d nginx

echo "Requesting Let's Encrypt certificate for $DOMAIN..."
"${COMPOSE[@]}" run --rm --entrypoint certbot certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --domain "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email

cat > "$SSL_CONF" <<EOF
server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://app:8200;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}

server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF

echo "Reloading nginx with HTTPS config..."
"${COMPOSE[@]}" up -d nginx
"${COMPOSE[@]}" exec nginx nginx -t
"${COMPOSE[@]}" exec nginx nginx -s reload

echo "HTTPS enabled: https://$DOMAIN"
