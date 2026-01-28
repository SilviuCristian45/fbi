#!/bin/bash
set -e

# Mesaj de debug ca sa vezi in loguri ca ruleaza
echo "🚀 Rulare script initializare baze de date suplimentare..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Cream baza pentru Keycloak (fbi e creata deja de variabila POSTGRES_DB)
    CREATE DATABASE keycloak;
    
    -- Dam drepturi (optional, userul admin le are oricum, dar e good practice)
    GRANT ALL PRIVILEGES ON DATABASE keycloak TO "$POSTGRES_USER";
    GRANT ALL PRIVILEGES ON DATABASE fbi TO "$POSTGRES_USER";
EOSQL

echo "✅ Bazele de date au fost configurate cu succes!"