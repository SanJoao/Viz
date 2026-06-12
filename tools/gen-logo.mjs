// Generates viz/logo.svg — the 7-petal streak rose (one week of streaks).
//
// Petals are true capsules (stadium shapes) radiating from a center hole,
// matching how severo's month rose reads visually: rounded tongue-like
// petals, not pie wedges. Each petal is a stroked line with round caps —
// the simplest path that yields a perfect capsule.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const TAU = Math.PI * 2;
const f = n => +n.toFixed(2);

// ── The week, clockwise from 12 o'clock ──────────────────────────────
// Heights tell a real week: one short "tried" day, one frozen day, the
// tallest ember petal crowning the top. Severo's orange ramp with the
// deepest petal tilted toward viz's red marker; the freeze petal is a
// pale tint of viz's ballpoint blue.
const week = [
  { ratio: 1.00, color: "#d7400f" }, // sun — ember, tilted toward red marker
  { ratio: 0.62, color: "#ff9e3d" },
  { ratio: 0.78, color: "#f47b20" },
  { ratio: 0.52, color: "#ffd08a" }, // tried day — palest, shortest
  { ratio: 0.85, color: "#e85d17" },
  { ratio: 0.58, color: "#9db8f2" }, // freeze — ballpoint-blue tint
  { ratio: 0.72, color: "#ffbe63" },
];

const CX = 50, CY = 50;
const HOLE = 19;        // center hole radius — keeps the chart identity
const MAX_R = 47;       // tallest petal's outer tip
const W = 13;           // petal width (capsule diameter); base chord at the
                        // hole is ~16.5 for 7 slots, so this leaves clean seams

const baseAngle = -Math.PI / 2; // petal 0 points straight up
const slot = TAU / 7;

const petals = week.map((p, i) => {
  const a = baseAngle + i * slot;
  const outer = HOLE + (MAX_R - HOLE) * p.ratio;
  // Stroke centerline: inset by half the cap radius at both ends so the
  // rounded caps land exactly on HOLE and `outer`.
  const r1 = HOLE + W / 2;
  const r2 = Math.max(outer - W / 2, r1 + 0.5); // guard tiny petals
  const x1 = f(CX + Math.cos(a) * r1), y1 = f(CY + Math.sin(a) * r1);
  const x2 = f(CX + Math.cos(a) * r2), y2 = f(CY + Math.sin(a) * r2);
  return `  <path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${p.color}" stroke-width="${W}" stroke-linecap="round" fill="none"/>`;
}).join("\n");

const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
${petals}
</svg>
`;

writeFileSync(join(here, "..", "logo.svg"), logo);
console.log("wrote logo.svg");
