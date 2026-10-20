---
name: Build failure
title: "build: "
labels: ["build"]
---

**Target**
Which matrix entry: linux-x64, linux-arm64, mac-x64, mac-arm64, or win-x64.

**Failure output**
The first lines of the error, including any `FAIL` message from the patcher or a `FAIL` line from the verifier.

**Upstream version**
The `version` value in `config/upstream.json` at the time of the run.

**Notes**
Anything changed in `patches/` or `scripts/` before the failure.
