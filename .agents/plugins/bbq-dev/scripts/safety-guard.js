// BBQ Development Safety Guard Hook
// Conforms to Antigravity PreToolUse hook contract.

const fs = require("fs");

const payload = fs.readFileSync(0, "utf8");

if (/rm -rf \/|git clean -fdx/.test(payload)) {
  process.stdout.write(
    JSON.stringify({
      decision: "deny",
      reason: "Destructive repository operation blocked by BBQ safety hook.",
    }) + "\n"
  );
  process.exit(0);
}

process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
