#!/bin/bash
# Runs a list of "request:run" pairs for one approach, one after the other.
#   src/matrix.sh A launch:1 launch:2 ...
# Each run spends the Claude subscription. Throwaway spike code.
cd "$(dirname "$0")/.."
approach="$1"; shift
log="runs/matrix-$approach.log"
for pair in "$@"; do
  req="${pair%%:*}"; n="${pair##*:}"
  echo "=== $(date +%H:%M:%S) $approach $req $n" >> "$log"
  node src/run.ts --approach "$approach" --request "$req" --run "$n" >> "$log" 2>&1 || echo "!!! run failed: $approach $req $n" >> "$log"
done
echo "=== $(date +%H:%M:%S) matrix $approach finished" >> "$log"
grep -c "^\[run\] recording" "$log"
