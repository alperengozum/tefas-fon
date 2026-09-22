#!/bin/sh
# Origin'de 80/443'ü sadece Cloudflare IP'lerine açar (sunucuda root olarak: sh firewall-cloudflare.sh).
# Coolify/Traefik portları Docker ile yayınlandığı için ufw değil DOCKER-USER zinciri kullanılır.
# Tekrar çalıştırılabilir; Cloudflare aralıkları her çalıştırmada yenilenir. Geri almak: sh firewall-cloudflare.sh off
# ponytail: iptables kuralları reboot'ta silinir; kalıcılık için systemd timer/@reboot cron ile bu script çağrılır.
set -eu
IF=$(ip route get 1.1.1.1 | sed -n 's/.* dev \([^ ]*\).*/\1/p')

for v in 4 6; do
  ipt=iptables; [ $v = 6 ] && ipt=ip6tables
  fam=inet; [ $v = 6 ] && fam=inet6
  $ipt -nL DOCKER-USER >/dev/null 2>&1 || { echo "$ipt DOCKER-USER yok, atlanıyor"; continue; }
  $ipt -D DOCKER-USER -j CF-ONLY 2>/dev/null || true
  $ipt -F CF-ONLY 2>/dev/null || true
  $ipt -X CF-ONLY 2>/dev/null || true
  [ "${1:-}" = off ] && continue

  ips=$(curl -fsS "https://www.cloudflare.com/ips-v$v")
  [ -n "$ips" ] || { echo "Cloudflare IP listesi alınamadı" >&2; exit 1; }
  ipset create -exist cf$v hash:net family $fam
  ipset flush cf$v
  for n in $ips; do ipset add cf$v "$n"; done

  $ipt -N CF-ONLY
  $ipt -A CF-ONLY -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  $ipt -A CF-ONLY -m set --match-set cf$v src -j RETURN
  $ipt -A CF-ONLY -j DROP
  # DOCKER-USER DNAT sonrası çalışır: asıl hedef portu conntrack'ten okunur
  $ipt -I DOCKER-USER -i "$IF" -p tcp -m conntrack --ctorigdstport 80:443 -m multiport --dports 80,443 -j CF-ONLY
done
echo "tamam (${1:-on}), arayüz $IF"
