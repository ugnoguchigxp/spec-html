import { readFile } from "node:fs/promises";

const reportPath = process.argv[2] ?? "reports/lighthouse.json";
const minPerformance = Number(process.argv[3] ?? 90);
const minSeo = Number(process.argv[4] ?? 100);

const report = JSON.parse(await readFile(reportPath, "utf8"));
const score = (category) =>
  Math.round((report.categories?.[category]?.score ?? 0) * 100);

const performance = score("performance");
const accessibility = score("accessibility");
const bestPractices = score("best-practices");
const seo = score("seo");
const failures = [];

if (performance < minPerformance) {
  failures.push(
    `Performance score ${performance} is below minimum ${minPerformance}.`,
  );
}

if (seo < minSeo) {
  failures.push(`SEO score ${seo} is below minimum ${minSeo}.`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  [
    "Lighthouse gate passed",
    `performance=${performance}`,
    `accessibility=${accessibility}`,
    `best-practices=${bestPractices}`,
    `seo=${seo}`,
  ].join(" · "),
);
