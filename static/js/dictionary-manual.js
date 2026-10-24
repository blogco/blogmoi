export const DICTIONARY_REPOSITORY = "blogco/blogmoi";
export const DICTIONARY_FILE = "src/_data/dictionary-data.json";
const API = `https://api.github.com/repos/${DICTIONARY_REPOSITORY}`;
const required = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Vui lòng nhập ${label}.`);
  return value;
};
export function createManualEntry(values, { id = crypto.randomUUID(), now = new Date() } = {}) {
  const sourceArticle = typeof values.sourceArticle === "string" ? values.sourceArticle : "";
  if (sourceArticle && !/^\/(?!\/)(?!.*\.\.)[^?#\s]*\/$/u.test(sourceArticle)) throw new Error("Liên kết bài nguồn không hợp lệ.");
  if (values.verified !== true) throw new Error("Hãy xác nhận bạn đã kiểm tra nội dung trước khi xuất bản.");
  return {
    id, vi: required(values.vi,"tiếng Việt"), ko: required(values.ko,"tiếng Hàn"), en: required(values.en,"tiếng Anh"),
    examples: { vi:"", ko: typeof values.exampleKo === "string" ? values.exampleKo : "", en:"" },
    notes: typeof values.notes === "string" ? values.notes : "", field: required(values.field,"lĩnh vực").trim(),
    definition:"", relatedExpressions:[], sourceLanguage:"vi", sourceArticle, sourceContext:"",
    entrySource:"manual", translationSource:"manual-entry", status:"reviewed", reviewStatus:"reviewed", updatedAt:now.toISOString(),
  };
}
export function entryFingerprint(entry) {
  return JSON.stringify([entry.vi,entry.ko,entry.en,entry.examples?.ko || "",entry.notes || "",entry.field,entry.sourceArticle || ""]);
}
export function mergeManualEntry(dictionary, entry) {
  if (!dictionary || !Array.isArray(dictionary.entries)) throw new Error("Dữ liệu từ điển hiện tại không hợp lệ. Không ghi đè dữ liệu.");
  const sameId=dictionary.entries.find(item=>item.id===entry.id);
  if(sameId && entryFingerprint(sameId)!==entryFingerprint(entry)) throw new Error("Mục này đã được lưu với nội dung khác. Tạo mục mới hoặc tải lại trước khi thử lại.");
  const duplicate=sameId || dictionary.entries.find(item=>entryFingerprint(item)===entryFingerprint(entry));
  if(duplicate) return {dictionary,duplicate};
  return {dictionary:{...dictionary,version:dictionary.version || 1,entries:[...dictionary.entries,entry]},duplicate:null};
}
export function decodeDictionaryBlob(blob) {
  if(blob?.encoding!=="base64" || typeof blob.content!=="string") throw new Error("Không đọc được file từ điển hiện tại.");
  const bytes=Uint8Array.from(atob(blob.content.replace(/\s/g,"")),char=>char.charCodeAt(0));
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
}
export async function publishManualEntry(entry, token, {fetchImpl=fetch}={}) {
  if(typeof token!=="string" || !token.trim()) throw new Error("Nhập GitHub token có quyền Contents: Read and write để xuất bản.");
  const request=async(path,{method="GET",body}={})=>{
    const response=await fetchImpl(API+path,{method,credentials:"omit",redirect:"error",headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${token.trim()}`,"Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28"},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok){const error=new Error([409,422].includes(response.status)?"Repository vừa thay đổi. Dữ liệu chưa được xác nhận lưu; thử lại để hợp nhất với bản mới nhất.":response.status===401 || response.status===403?"GitHub từ chối quyền ghi. Kiểm tra token Contents: Read and write cho blogco/blogmoi.":`GitHub trả HTTP ${response.status}. Giữ bản nháp và kiểm tra lịch sử commit trước khi thử lại.`);error.status=response.status;throw error;}
    return response.json();
  };
  // Pin every read to one HEAD. A non-fast-forward ref update must fail instead
  // of overwriting another editor's work. Git blobs avoid the Contents 1 MB read limit.
  const ref=await request("/git/ref/heads/main"), head=ref.object.sha;
  const commit=await request(`/git/commits/${head}`);
  const file=await request(`/contents/${DICTIONARY_FILE}?ref=${encodeURIComponent(head)}`);
  const dictionary=decodeDictionaryBlob(await request(`/git/blobs/${file.sha}`));
  const merged=mergeManualEntry(dictionary,entry);
  if(merged.duplicate)return {status:"already-saved",entry:merged.duplicate,commit:head};
  const blob=await request("/git/blobs",{method:"POST",body:{content:JSON.stringify(merged.dictionary,null,2)+"\n",encoding:"utf-8"}});
  const tree=await request("/git/trees",{method:"POST",body:{base_tree:commit.tree.sha,tree:[{path:DICTIONARY_FILE,mode:"100644",type:"blob",sha:blob.sha}]}});
  const saved=await request("/git/commits",{method:"POST",body:{message:"content(dictionary): add manually reviewed entry",tree:tree.sha,parents:[head]}});
  await request("/git/refs/heads/main",{method:"PATCH",body:{sha:saved.sha,force:false}});
  return {status:"saved",entry,commit:saved.sha};
}
