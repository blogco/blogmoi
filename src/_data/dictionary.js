import source from "./dictionary-data.json" with { type: "json" };
import { createDictionaryData } from "../../lib/dictionary-index.js";
export default createDictionaryData(source);
