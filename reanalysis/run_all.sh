#!/usr/bin/env bash
# Phase 0 driver: reanalysis, then design simulation at two bin sizes.
set -euo pipefail
cd "$(dirname "$0")"
echo "=== reanalysis (bins 5,10,20) ==="
python3 run_reanalysis.py --bins 5,10,20
echo "=== design simulation, bin=10 ==="
python3 run_design_sim.py --bin 10 --n-participants 20
mv outputs/design_recommendations.md outputs/design_recommendations_bin10.md
for f in design_replication_floor design_discrimination design_recovery; do
  mv "outputs/$f.csv" "outputs/${f}_bin10.csv"
done
echo "=== design simulation, bin=5 ==="
python3 run_design_sim.py --bin 5 --n-participants 20
mv outputs/design_recommendations.md outputs/design_recommendations_bin5.md
for f in design_replication_floor design_discrimination design_recovery; do
  mv "outputs/$f.csv" "outputs/${f}_bin5.csv"
done
echo "=== done ==="
