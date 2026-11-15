# Imaginea oficiala nginx + snippets comune + reload periodic (pentru
# certificatele reinnoite de certbot). Template-urile per mediu se monteaza
# in /etc/nginx/templates din compose si sunt procesate cu envsubst la start.
FROM nginx:1.30.6-alpine

COPY snippets/ /etc/nginx/snippets/
COPY --chmod=755 reload-certs.sh /docker-entrypoint.d/99-reload-certs.sh
