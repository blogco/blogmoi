import { readFile } from "node:fs/promises";
import { refreshYYData } from "./lib/yy-info.mjs";
import { writeJsonAtomically } from "../lib/dictionary-storage.js";
const path = "static/data/yy-info.json";
let previous = {};
try { previous = JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const snapshot = await refreshYYData(previous);
await writeJsonAtomically(path, snapshot);
for (const key of ["delays","metar","news"]) console.log(`${key}: ${snapshot[key].status}, ${snapshot[key].items.length} records; last success ${snapshot[key].fetchedAt || "none"}`);
