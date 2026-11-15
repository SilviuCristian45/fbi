#!/bin/bash
set -e

# Rulat de imaginea postgres DOAR la primul start (volum de date gol).
# Baza aplicatiei (POSTGRES_DB) e creata automat de imagine; aici cream
# baza pentru Keycloak. Numele vin din env (KEYCLOAK_DB_NAME, POSTGRES_DB).
KEYCLOAK_DB_NAME="${KEYCLOAK_DB_NAME:-keycloak}"

echo "🚀 Rulare script initializare baze de date suplimentare..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE "$KEYCLOAK_DB_NAME";

    GRANT ALL PRIVILEGES ON DATABASE "$KEYCLOAK_DB_NAME" TO "$POSTGRES_USER";
    GRANT ALL PRIVILEGES ON DATABASE "$POSTGRES_DB" TO "$POSTGRES_USER";
EOSQL

echo "✅ Bazele de date au fost configurate cu succes!"
