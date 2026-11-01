// BBQ Development Safety Guard Hook
let payload = "";
const timer = setTimeout(() => {
  process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
  process.exit(0);
}, 200);

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  payload += chunk;
});
process.stdin.on("end", () => {
  clearTimeout(timer);
  if (/rm -rf \/|git clean -fdx/.test(payload)) {
    process.stdout.write(
      JSON.stringify({
        decision: "deny",
        reason: "Destructive repository operation blocked by BBQ safety hook.",
      }) + "\n"
    );
  } else {
    process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
  }
  process.exit(0);
});
