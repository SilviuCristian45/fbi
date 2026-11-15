#!/bin/sh
# Ruleaza de entrypoint-ul imaginii nginx inainte de pornire.
# Porneste in fundal un reload la 6h, ca nginx sa preia certificatele
# reinnoite de containerul certbot (reload-ul nu intrerupe conexiunile).
set -eu
(
  while :; do
    sleep 21600
    nginx -s reload || true
  done
) &
