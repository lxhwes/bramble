#!/usr/bin/env bash
#
# Smoke test for the Bramble container image.
#
# A build-only check proves very little about this image. Every failure it has
# actually had was at runtime: the native better-sqlite3 binary, migrations
# writing to /data as a non-root user, and build/prune.js — which broke in
# production twice (8b16c80, 90148a2) without CI noticing, because CI never ran
# the image. This boots it and exercises exactly those paths.
#
# Usage: scripts/smoke-test.sh [image-tag]      (default: bramble:smoke)
#        SMOKE_PORT=4100 scripts/smoke-test.sh

set -euo pipefail

IMAGE="${1:-bramble:smoke}"
PORT="${SMOKE_PORT:-3999}"
ORIGIN="http://localhost:${PORT}"
NAME="bramble-smoke-$$"
HEADERS="$(mktemp)"

cleanup() {
	# -v drops the anonymous volume the Dockerfile's VOLUME ["/data"] creates.
	# Without it every local run leaves one behind.
	docker rm -f -v "$NAME" >/dev/null 2>&1 || true
	rm -f "$HEADERS"
}
trap cleanup EXIT

fail() {
	echo "FAIL: $*" >&2
	echo "--- container logs ---" >&2
	docker logs "$NAME" 2>&1 | tail -40 >&2
	exit 1
}

echo "==> starting $IMAGE on port $PORT"
docker run -d --name "$NAME" -p "${PORT}:3000" -e "ORIGIN=${ORIGIN}" "$IMAGE" >/dev/null

echo "==> waiting for the server to accept requests"
for i in $(seq 1 60); do
	curl -fsS -o /dev/null "${ORIGIN}/" && break
	[ "$i" -eq 60 ] && fail "server never served GET /"
	sleep 1
done

echo "==> GET /healthz reports storage reachable"
health="$(curl -fsS "${ORIGIN}/healthz")" || fail "/healthz returned non-2xx"
[ "$health" = '{"status":"ok"}' ] || fail "/healthz body was: $health"

echo "==> POST / creates a session"
# The assertion that matters: this loads the native binary, runs the lazy
# migrations, and writes to /data as uid 1001. A wrong ORIGIN also fails here,
# which is the CSRF path self-hosters trip over.
curl -fsS -o /dev/null -D "$HEADERS" -X POST "${ORIGIN}/" \
	-H "Origin: ${ORIGIN}" \
	-H "Content-Type: application/x-www-form-urlencoded" \
	-d "" || fail "session create returned non-2xx"

# SvelteKit form actions answer a non-browser POST with 200 and a JSON body
# rather than a 303, so take the id from the cookie the action sets.
session="$(grep -i '^set-cookie: bramble_last_session=' "$HEADERS" |
	sed -E 's/.*bramble_last_session=([^;]+).*/\1/' | tr -d '\r')"
[ -n "$session" ] || fail "no session id in the response cookies"
echo "    session: $session"

echo "==> GET /s/<id> serves the session"
curl -fsS -o /dev/null "${ORIGIN}/s/${session}" || fail "session page did not load"

echo "==> node build/prune.js runs"
docker exec "$NAME" node build/prune.js || fail "prune script failed"

echo "==> prune left the just-created session alone"
# Retention is measured in days. A session created seconds ago having no votes
# yet is the normal create-then-share flow, and prune used to delete it.
curl -fsS -o /dev/null "${ORIGIN}/s/${session}" ||
	fail "prune deleted a session created seconds earlier"

echo "==> the image's own HEALTHCHECK reaches healthy"
for i in $(seq 1 60); do
	status="$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo unknown)"
	[ "$status" = healthy ] && break
	[ "$status" = unhealthy ] && fail "healthcheck reported unhealthy"
	[ "$i" -eq 60 ] && fail "healthcheck never became healthy (last status: $status)"
	sleep 2
done

echo "PASS"
