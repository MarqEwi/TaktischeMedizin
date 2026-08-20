#!/bin/sh
# Aufgabe 1: Home Assistant + Mosquitto auf der UGREEN NAS (STEVENAS) einrichten.
# Auf der NAS ausfuehren (per SSH), z. B.:  sh setup-nas.sh
# Das Skript ist idempotent - mehrfaches Ausfuehren schadet nicht.

set -eu

echo "== 1) Pfad der Freigabe 'Grundlagen' ermitteln =="
SHARE=""
for CAND in /volume1/Grundlagen /volume2/Grundlagen /mnt/dm-0/Grundlagen /srv/Grundlagen; do
    if [ -d "$CAND" ]; then SHARE="$CAND"; break; fi
done
if [ -z "$SHARE" ]; then
    SHARE=$(find /volume1 /volume2 /mnt /srv /share -maxdepth 4 -type d -name Grundlagen 2>/dev/null | head -n 1 || true)
fi
if [ -z "$SHARE" ]; then
    echo "FEHLER: Freigabe 'Grundlagen' nicht gefunden. Bitte Pfad manuell setzen:"
    echo "        SHARE=/pfad/zu/Grundlagen sh setup-nas.sh"
    exit 1
fi
BASE="$SHARE/docker/heizung"
echo "Freigabe gefunden: $SHARE"
echo "Zielordner:        $BASE"

echo "== 2) Ordnerstruktur anlegen =="
mkdir -p "$BASE/ha-config" "$BASE/mosquitto/config" "$BASE/mosquitto/data"

echo "== 3) docker-compose.yml schreiben =="
cat > "$BASE/docker-compose.yml" <<'EOF'
services:
  homeassistant:
    container_name: homeassistant
    image: ghcr.io/home-assistant/home-assistant:stable
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./ha-config:/config
      - /etc/localtime:/etc/localtime:ro

  mosquitto:
    container_name: mosquitto
    image: eclipse-mosquitto:2
    restart: unless-stopped
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto/config:/mosquitto/config
      - ./mosquitto/data:/mosquitto/data
EOF

echo "== 4) mosquitto.conf schreiben =="
cat > "$BASE/mosquitto/config/mosquitto.conf" <<'EOF'
listener 1883
allow_anonymous true
persistence true
persistence_location /mosquitto/data/
EOF

echo "== 5) Container starten =="
cd "$BASE"

# Docker-Binaerdatei finden (bei UGOS liegt sie evtl. ausserhalb des PATH)
DOCKER=""
for CAND in "$(command -v docker 2>/dev/null || true)" \
            /usr/bin/docker /usr/local/bin/docker /opt/bin/docker \
            /usr/sbin/docker /sbin/docker; do
    if [ -n "$CAND" ] && [ -x "$CAND" ]; then DOCKER="$CAND"; break; fi
done
if [ -z "$DOCKER" ]; then
    DOCKER=$(find /usr /opt /volume1/@apps /var/packages -maxdepth 4 \
        -type f -name docker -perm -u+x 2>/dev/null | head -n 1 || true)
fi
if [ -z "$DOCKER" ]; then
    echo "FEHLER: Docker ist auf dieser NAS nicht installiert (Binaerdatei nicht gefunden)."
    echo "        Bitte in der UGOS-Weboberflaeche das App Center oeffnen und die App"
    echo "        'Docker' installieren, danach dieses Skript erneut ausfuehren."
    exit 1
fi
echo "Docker gefunden: $DOCKER"

# Ohne Root-Rechte auf den Docker-Daemon? Dann automatisch sudo davorsetzen.
if ! "$DOCKER" info >/dev/null 2>&1; then
    echo "Kein direkter Zugriff auf den Docker-Daemon - versuche sudo (ggf. Passwort eingeben)."
    DOCKER="sudo $DOCKER"
fi
if ! $DOCKER info >/dev/null 2>&1; then
    echo "FEHLER: Docker-Daemon nicht erreichbar. Laeuft die Docker-App in UGOS?"
    exit 1
fi

if $DOCKER compose version >/dev/null 2>&1; then
    $DOCKER compose -f "$BASE/docker-compose.yml" up -d
elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$BASE/docker-compose.yml" up -d
else
    echo "FEHLER: Docker vorhanden, aber kein Compose-Plugin ('docker compose')."
    echo "        Bitte die Docker-App in UGOS aktualisieren oder docker-compose installieren."
    exit 1
fi

echo "-- Laufende Container --"
$DOCKER ps --filter name=homeassistant --filter name=mosquitto \
    --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo "== 6) Home Assistant auf Port 8123 testen =="
echo "(erster Start kann 1-2 Minuten dauern)"
i=0
while [ $i -lt 24 ]; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8123/ || true)
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        echo "OK: Home Assistant antwortet auf Port 8123 (HTTP $CODE)."
        echo "Onboarding im Browser: http://$(hostname -I 2>/dev/null | awk '{print $1}'):8123"
        exit 0
    fi
    i=$((i+1))
    sleep 5
done
echo "WARNUNG: Port 8123 antwortet noch nicht. Logs pruefen mit:"
echo "         $DOCKER logs homeassistant"
exit 1
