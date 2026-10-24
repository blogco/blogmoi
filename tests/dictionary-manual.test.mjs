import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createManualEntry,mergeManualEntry,publishManualEntry } from "../static/js/dictionary-manual.js";
import { createDictionaryData } from "../lib/dictionary-index.js";
import { initDictionary,filterDictionary } from "../static/js/dictionary.js";
const values={vi:"Đoạn văn tiếng Việt\n".repeat(8000),ko:"한국어 문장입니다.\n".repeat(8000),en:"An English passage.\n".repeat(8000),exampleKo:"예문입니다.\n".repeat(8000),notes:"Ghi chú dài\n".repeat(8000),field:"Ngôn ngữ",verified:true};
const entry=createManualEntry(values,{id:"manual-long-test",now:new Date("2026-10-24T01:00:00Z")});
test("manual passages preserve every character and newline beyond dispatch and old term limits",()=>{
 for(const language of ["vi","ko","en"])assert.equal(entry[language],values[language]);assert.equal(entry.examples.ko,values.exampleKo);assert.equal(entry.notes,values.notes);assert.ok(JSON.stringify(entry).length>65000);
 const data=createDictionaryData({entries:[entry]});assert.equal(data.entryCount,1);assert.equal(data.index[0].sourceArticle,"");assert.equal(data.index[0].ko,values.ko);assert.equal(filterDictionary(data.index,"Ghi chú dài").length,1);
 const merged=mergeManualEntry({version:1,entries:[],custom:"preserve"},entry);assert.equal(merged.dictionary.custom,"preserve");assert.equal(mergeManualEntry(merged.dictionary,entry).duplicate.id,entry.id);
 assert.throws(()=>createManualEntry({...values,verified:false}));
});
test("Git blob saving preserves long content and refuses concurrent branch changes",async()=>{
 const calls=[],original={version:1,entries:[{id:"existing",vi:"old",ko:"기존",en:"old",notes:"keep"}]};
 const fetchImpl=async(url,options)=>{calls.push({url,options});const path=new URL(url).pathname;const body=options.body?JSON.parse(options.body):null;
 if(path.endsWith("/git/ref/heads/main"))return Response.json({object:{sha:"head"}});
 if(path.endsWith("/git/commits/head"))return Response.json({tree:{sha:"tree"}});
 if(path.includes("/contents/"))return Response.json({sha:"file"});
 if(path.endsWith("/git/blobs/file"))return Response.json({encoding:"base64",content:Buffer.from(JSON.stringify(original)).toString("base64")});
 if(path.endsWith("/git/blobs")){const data=JSON.parse(body.content);assert.equal(data.entries[0].notes,"keep");assert.equal(data.entries[1].vi,values.vi);return Response.json({sha:"blob"});}
 if(path.endsWith("/git/trees")){assert.equal(body.tree.length,1);assert.equal(body.tree[0].path,"src/_data/dictionary-data.json");return Response.json({sha:"newtree"});}
 if(path.endsWith("/git/commits")){assert.deepEqual(body.parents,["head"]);return Response.json({sha:"newcommit"});}
 if(options.method==="PATCH"){assert.equal(body.force,false);return Response.json({});}throw new Error(path);};
 const result=await publishManualEntry(entry,"test-only-token",{fetchImpl});assert.equal(result.status,"saved");assert.ok(calls.every(call=>new URL(call.url).hostname==="api.github.com"));
 await assert.rejects(publishManualEntry(entry,"test-only-token",{fetchImpl:async(url,options)=>options.method==="PATCH"?new Response("",{status:409}):fetchImpl(url,options)}),/Repository vừa thay đổi/);
});
test("manual form has no length attributes and long passage details remain complete",async()=>{
 const dom=new JSDOM(await readFile("_site/tu-dien-vi-kr/index.html","utf8"),{url:"https://blogco.github.io/blogmoi/tu-dien-vi-kr/"});const root=dom.window.document.querySelector("[data-dictionary]");let saved;
 const app=initDictionary(root,{fetchImpl:async url=>Response.json(String(url).includes("search-index")?[]:createDictionaryData({entries:[entry]}).index),publish:async(item,token)=>{assert.equal(token,"test-token");saved=item;return{status:"saved",entry:item,commit:"a".repeat(40)};}});
 try{await app.ready;assert.equal(root.querySelectorAll("textarea[maxlength],input[maxlength]").length,0);assert.equal(root.querySelectorAll("textarea").length,5);assert.equal(root.querySelector("[data-candidate-list]"),null);
 root.querySelector(".dict-card button").click();assert.equal(dom.window.document.querySelector(".dict-detail-block p").textContent,values.vi);
 const form=root.querySelector("[data-manual-form]");for(const key of ["vi","ko","en","exampleKo","notes","field"])form.elements[key].value=values[key];form.elements.verified.checked=true;root.querySelector("[data-github-token]").value="test-token";form.dispatchEvent(new dom.window.Event("submit",{cancelable:true}));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(saved.en,values.en);assert.equal(root.querySelector("[data-github-token]").value,"");assert.match(root.querySelector("[data-entry-status]").textContent,/Đã lưu trên GitHub/);
 }finally{app.destroy();dom.window.close();}
});
