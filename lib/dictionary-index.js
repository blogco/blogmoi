export function createDictionaryData(source) {
  const seen=new Set();
  const text=value=>typeof value==="string" && value.trim();
  const entries=(Array.isArray(source.entries)?source.entries:[]).filter(entry=>{
    if(!entry || !["reviewed","published"].includes(entry.status) || !["id","vi","ko","en","field","sourceLanguage","updatedAt"].every(key=>text(entry[key])))return false;
    const manual=entry.entrySource==="manual";
    if(!manual && (!text(entry.sourceArticle) || (!entry.sourceContext && !["vi","ko","en"].some(language=>text(entry.examples?.[language])))))return false;
    if(entry.sourceArticle && !/^\/(?!\/)(?!.*\.\.)[^?#\s]*\/$/u.test(entry.sourceArticle))return false;
    if(entry.examples && (typeof entry.examples!=="object" || Object.values(entry.examples).some(value=>typeof value!=="string")))return false;
    const key=manual?`manual:${entry.id}`:[entry.vi,entry.ko,entry.en].map(value=>value.normalize("NFKC").toLocaleLowerCase("und").trim().replace(/\s+/g," ")).join("\u0000");
    if(seen.has(key))return false;seen.add(key);return true;
  }).map(entry=>({id:entry.id,vi:entry.vi,ko:entry.ko,en:entry.en,definition:typeof entry.definition==="string"?entry.definition:"",notes:typeof entry.notes==="string"?entry.notes:"",examples:entry.examples || {},relatedExpressions:Array.isArray(entry.relatedExpressions)?entry.relatedExpressions:[],field:entry.field,sourceLanguage:entry.sourceLanguage,sourceArticle:entry.sourceArticle?"/blogmoi/"+entry.sourceArticle.replace(/^\/+/,""):"",sourceContext:entry.sourceContext || "",entrySource:entry.entrySource || "article",updatedAt:entry.updatedAt}));
  const counts=new Map(), sources=new Set();
  for(const entry of entries){counts.set(entry.field,(counts.get(entry.field)||0)+1);if(entry.sourceArticle)sources.add(entry.sourceArticle);}
  const fields=[...counts].map(([name,count])=>({name,count})).sort((a,b)=>a.name.localeCompare(b.name,"vi"));
  return {version:source.version || 1,entries,index:entries,fields,fieldCount:fields.length,entryCount:entries.length,sourcePostCount:sources.size};
}
