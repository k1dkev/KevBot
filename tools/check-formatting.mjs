import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const prettier = fileURLToPath(new URL("../node_modules/prettier/bin/prettier.cjs", import.meta.url));
const cases = [
  {
    command: process.execPath,
    prefix: [prettier],
    flags: ["--stdin-filepath", "format-check.js"],
    input: "const example={value:1};\n",
  },
  {
    command: "ruff",
    prefix: ["format"],
    flags: ["--stdin-filename", "format_check.py", "-"],
    input: "example={ 'value':1}\n",
  },
];

for (const { command, prefix, flags, input } of cases) {
  const run = (args, source) => {
    const result = spawnSync(command, [...prefix, ...args, ...flags], { input: source, encoding: "utf8" });
    assert.ifError(result.error);
    return result;
  };
  const bad = run(["--check"], input);
  assert.equal(bad.status, 1, bad.stderr);
  const fixed = run([], input);
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.notEqual(fixed.stdout, input);
  const good = run(["--check"], fixed.stdout);
  assert.equal(good.status, 0, good.stderr);
}
console.log("Python and JS formatting checks reject bad input and accept formatted input without editing files.");
