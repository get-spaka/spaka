#!/bin/bash
# Approach C from the recorded runs of approach A: the same generation, delivered by reload.
# No agent call. Takes the run folders to replay; three at a time.
#   src/replay-c.sh runs/A-launch-1-live-... runs/A-launch-2-live-...
cd "$(dirname "$0")/.."
printf '%s\n' "$@" | xargs -P 2 -I{} sh -c 'node src/run.ts --approach C --replay "{}" >> runs/matrix-C.log 2>&1 || echo "!!! replay failed: {}" >> runs/matrix-C.log'
echo "=== $(date +%H:%M:%S) replays finished" >> runs/matrix-C.log
grep -c "^\[run\] recording" runs/matrix-C.log
