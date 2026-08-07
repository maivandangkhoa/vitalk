#!/usr/bin/env bash
#
# sync-certs.sh — copy Caddy's Let's Encrypt certificate for turn.fechtin.com
# out of its Docker volume into ./certs, where coturn can read it.
#
# Why a copy rather than a shared mount: Caddy stores certificates root-only
# (0600), coturn drops privileges after binding, and Caddy's on-disk layout is
# an internal detail that has changed between releases. A copy owned by us is
# the stable seam between the two.
#
# Run daily from cron; Let's Encrypt renews at ~30 days remaining, so a daily
# check never misses a rotation. Restarts coturn only when the file changed.
#
#   sudo crontab -e
#   17 4 * * * /home/ubuntu/coturn/sync-certs.sh >> /var/log/coturn-certs.log 2>&1
set -euo pipefail

DOMAIN="${DOMAIN:-turn.fechtin.com}"
DEST="${DEST:-/home/ubuntu/coturn/certs}"
ACME_DIR="/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory"

log() { echo "[$(date -Is)] $*"; }

# Needs root to hand the files to uid 65534.
[ "$(id -u)" -eq 0 ] || { log "FATAL: run with sudo"; exit 1; }

mkdir -p "$DEST"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Caddy must already serve a site block for $DOMAIN, otherwise it has no reason
# to have obtained the certificate. See Caddyfile.snippet.
for ext in crt key; do
  if ! docker exec caddy sh -c "cat ${ACME_DIR}/${DOMAIN}/${DOMAIN}.${ext}" > "${tmp}/${DOMAIN}.${ext}" 2>/dev/null; then
    log "FATAL: Caddy has no ${ext} for ${DOMAIN}. Add the site block to the Caddyfile, reload Caddy, and retry."
    exit 1
  fi
  [ -s "${tmp}/${DOMAIN}.${ext}" ] || { log "FATAL: empty ${ext} for ${DOMAIN}"; exit 1; }
done

changed=0
for ext in crt key; do
  if ! cmp -s "${tmp}/${DOMAIN}.${ext}" "${DEST}/${DOMAIN}.${ext}" 2>/dev/null; then
    changed=1
  fi
done

# Install unconditionally, even when the bytes match. Ownership is as much a
# part of "correct" as content here: the coturn image runs as `nobody`, and a
# key it cannot read makes coturn fall back to built-in defaults *without
# failing* — a server that looks healthy and drops every call. Skipping on
# unchanged content would leave drifted ownership unrepaired forever.
install -m 644 -o 65534 -g 65534 "${tmp}/${DOMAIN}.crt" "${DEST}/${DOMAIN}.crt"
install -m 640 -o 65534 -g 65534 "${tmp}/${DOMAIN}.key" "${DEST}/${DOMAIN}.key"

if [ "$changed" -eq 0 ]; then
  log "certificate unchanged (ownership reasserted), not restarting coturn"
  exit 0
fi

log "certificate updated for ${DOMAIN}"

# coturn reads the certificate once at startup, so a rotation needs a restart.
# A dropped call at 04:17 is the cost; a silently expired cert would break every
# `turns:` connection for weeks.
if docker ps --format '{{.Names}}' | grep -qx coturn; then
  docker restart coturn >/dev/null
  log "coturn restarted"
fi
