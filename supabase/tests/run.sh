#!/bin/sh
# 스키마 + RLS 정책 테스트.
#
#   sh supabase/tests/run.sh
#
# Supabase 를 띄우지 않고 **맨 Postgres** 위에서 돈다. Supabase 가 미리 만들어 두는
# 것(auth 스키마, auth.uid(), anon/authenticated 롤)만 00_stub.sql 로 흉내낸다.
# 정책이 실제로 막는지 안 막는지는 이렇게 사람 세 명을 흉내내 봐야 알 수 있다 —
# 정책은 문법이 맞아도 뜻이 틀릴 수 있고, 틀리면 남의 기록이 보인다.
#
# Storage 정책(0002)은 storage 스키마가 있어야 해서 여기서 안 돈다.
set -e

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}
DATA=${PGDATA_TEST:-${TMPDIR:-/tmp}/mysd-pgtest}
PORT=${PGPORT_TEST:-55432}
SOCK=$DATA/sock
PSQL="psql -U postgres -h $SOCK -p $PORT -v ON_ERROR_STOP=1 -q"

# root 로 돌면 postgres 는 서버를 안 띄운다. 그때만 su 로 내려간다.
if [ "$(id -u)" = 0 ]; then AS="su postgres -c"; else AS="sh -c"; fi

if [ ! -f "$DATA/pgdata/PG_VERSION" ]; then
  rm -rf "$DATA"; mkdir -p "$DATA/pgdata" "$SOCK"
  [ "$(id -u)" = 0 ] && chown -R postgres:postgres "$DATA"
  $AS "$PGBIN/initdb -D $DATA/pgdata -U postgres -A trust" >/dev/null
fi
$AS "$PGBIN/pg_ctl -D $DATA/pgdata -o '-k $SOCK -p $PORT -c listen_addresses=' -l $DATA/pg.log -w start" \
  >/dev/null 2>&1 || true

for db in mysd_test postgres; do
  psql -U postgres -h "$SOCK" -p "$PORT" -d $db -q \
    -c 'drop owned by anon, authenticated, service_role cascade' 2>/dev/null || true
done
$PSQL -d postgres \
  -c 'drop database if exists mysd_test' -c 'create database mysd_test' \
  -c 'drop role if exists anon' -c 'drop role if exists authenticated' -c 'drop role if exists service_role'

$PSQL -d mysd_test -f "$ROOT/supabase/tests/00_stub.sql"
$PSQL -d mysd_test -f "$ROOT/supabase/migrations/0001_init.sql"

out=$(psql -U postgres -h "$SOCK" -p "$PORT" -d mysd_test -f "$ROOT/supabase/tests/10_rls.sql" 2>&1) || {
  echo "$out" | sed -E 's|^psql:[^ ]+ ||; s|^NOTICE:  ||' | grep -E 'PASS|FAIL|ERROR'
  exit 1
}
echo "$out" | sed -E 's|^psql:[^ ]+ ||; s|^NOTICE:  ||' | grep -E 'PASS|FAIL|전부 통과'
echo "통과 $(echo "$out" | grep -c PASS)건"
