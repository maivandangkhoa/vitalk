#!/usr/bin/env bash
#
# setup-firewall.sh — open the ports coturn needs on the fechtin VM, and map
# UDP 443 onto it.
#
# Idempotent: every rule is checked before it is added, so re-running is safe.
#
# IMPORTANT — this only covers the VM's own iptables. Oracle's Security List is
# a separate layer in the cloud console and a script cannot reach it. Open there
# too, or every rule below is moot:
#     UDP  3478, 5349, 443, 49160-49400
#     TCP  3478, 5349
set -euo pipefail

MIN_PORT=49160
MAX_PORT=49400

[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }

# The Oracle Ubuntu image ends its INPUT chain with a REJECT. New ACCEPTs must
# be inserted *above* it — appended rules would sit below and never be reached.
# This ordering bug is the usual reason a port "is open" and still refuses
# connections.
rej_line() { iptables -L INPUT --line-numbers -n | awk '/REJECT/{print $1; exit}'; }

add_accept() {
  local proto="$1" dports="$2"
  if iptables -C INPUT -p "$proto" -m multiport --dports "$dports" -j ACCEPT 2>/dev/null; then
    echo "  already present: ${proto}/${dports}"
    return
  fi
  local rej; rej="$(rej_line)"
  if [ -n "$rej" ]; then
    iptables -I INPUT "$rej" -p "$proto" -m multiport --dports "$dports" -j ACCEPT
  else
    iptables -A INPUT -p "$proto" -m multiport --dports "$dports" -j ACCEPT
  fi
  echo "  added: ${proto}/${dports}"
}

echo "iptables INPUT:"
add_accept udp "3478,5349,443"
add_accept tcp "3478,5349"
add_accept udp "${MIN_PORT}:${MAX_PORT}"

# UDP 443 → 3478. Caddy publishes only 443/TCP, so 443/UDP is free, and many
# networks that drop unfamiliar UDP still pass it because that is where QUIC
# lives. This buys most of what a shared TCP 443 would, without putting an
# SNI-routing layer in front of the eight services Caddy already fronts.
echo "nat PREROUTING:"
if iptables -t nat -C PREROUTING -p udp --dport 443 -j REDIRECT --to-port 3478 2>/dev/null; then
  echo "  already present: udp/443 -> 3478"
else
  iptables -t nat -A PREROUTING -p udp --dport 443 -j REDIRECT --to-port 3478
  echo "  added: udp/443 -> 3478"
fi

netfilter-persistent save >/dev/null 2>&1 || iptables-save > /etc/iptables/rules.v4
echo "saved."
echo
echo "Still to do by hand, in the Oracle console → Security List (ingress, 0.0.0.0/0):"
echo "  UDP  3478, 5349, 443, ${MIN_PORT}-${MAX_PORT}"
echo "  TCP  3478, 5349"
