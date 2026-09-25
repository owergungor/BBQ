#!/usr/bin/env sh
# BBQ Development Safety Guard Hook
# Conforms to Antigravity PreToolUse hook contract.

# Read JSON payload from stdin
PAYLOAD=$(cat)

# Check for catastrophic commands
if echo "$PAYLOAD" | grep -Eq 'rm -rf /|git clean -fdx'; then
  echo '{"decision": "deny", "reason": "Destructive repository operation blocked by BBQ safety hook."}'
  exit 0
fi

# Allow safe commands
echo '{"decision": "allow"}'
