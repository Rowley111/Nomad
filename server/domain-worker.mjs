// JSON over stdin only; no URLs, shell commands or user-provided module paths.
import { validateWorkspace, validateTransition, calculateWorkspace } from "./domain-validation.mjs";

let raw = "";
process.stdin.setEncoding("utf8");
try {
  for await (const chunk of process.stdin) {
    raw += chunk;
    // Transition envelopes contain both the old and the new <=5 MiB body.
    if (Buffer.byteLength(raw) > 11 * 1024 * 1024)
      throw new Error("Слишком большой запрос");
  }
  const request = JSON.parse(raw);
  let state;
  if (request.action === "validate") state = validateWorkspace(request.state);
  else if (request.action === "transition") state = validateTransition(request.previous, request.state);
  else if (request.action === "evaluate") {
    const result = calculateWorkspace(request.state, request.input, request.priceId);
    process.stdout.write(JSON.stringify({ ok: true, result }));
    process.exit(0);
  } else throw new Error("Неизвестная операция проверки");
  process.stdout.write(JSON.stringify({ ok: true, state }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
}
