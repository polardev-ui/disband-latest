// potrace step for tools/trace-logo.py: traces a prepared black-on-white PNG.
// Usage: node tools/trace-logo.cjs <in.png> <out.svg>
const potrace = require("potrace");
const fs = require("fs");
const [src, out] = process.argv.slice(2);
potrace.trace(src, { turdSize: 40, alphaMax: 1.0, optCurve: true, optTolerance: 0.6, threshold: 128, color: "#000", background: "transparent" }, (err, svg) => {
  if (err) throw err;
  fs.writeFileSync(out, svg);
  console.log("wrote", out, svg.length);
});
