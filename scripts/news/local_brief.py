"""CPU-only, local English summarization + Korean translation. No AI API.

Model input is article text, never executable instructions. Download only the
specified model repositories with trust_remote_code=False; keep TLS enabled.
"""
import contextlib
import gc
import json
import os
import re
import sys

SUMMARY_MODEL = "sshleifer/distilbart-cnn-12-6"
TRANSLATION_MODEL = "facebook/m2m100_418M"
SUMMARY_REVISION = "a4f8f3ea906ed274767e9906dbaede7531d660ff"
TRANSLATION_REVISION = "55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636"


def sentences(text):
    # Protect common company suffixes/abbreviations before splitting.
    protected = text
    for abbreviation in ("U.S.", "U.K.", "Inc.", "Corp.", "Ltd.", "Mr.", "Ms.", "Dr."):
        protected = protected.replace(abbreviation, abbreviation.replace(".", "\u2024"))
    return [part.replace("\u2024", ".").strip() for part in re.split(r"(?<=[.!?])\s+(?=[A-Z\"“])", protected) if part.strip()]


def evidence_for(summary, body):
    terms = set(re.findall(r"[a-z]{3,}", summary.lower()))
    candidates = [sentence for sentence in sentences(body) if 40 <= len(sentence) <= 800]
    if not candidates:
        raise ValueError("No suitable source evidence")
    best = max(candidates, key=lambda sentence: len(terms & set(re.findall(r"[a-z]{3,}", sentence.lower()))))
    overlap = len(terms & set(re.findall(r"[a-z]{3,}", best.lower()))) / max(1, len(terms))
    if overlap < 0.45:
        raise ValueError("Summary does not sufficiently match source evidence")
    for number in re.findall(r"\d+(?:[.,]\d+)*", summary):
        if number not in best:
            raise ValueError("Summary contains an unsupported number")
    return best


def main():
    article = json.load(sys.stdin)
    if not all(isinstance(article.get(key), str) for key in ("title", "body")):
        raise ValueError("Missing article input")
    if len(article["body"]) > 100000:
        raise ValueError("Article too large")
    # Libraries may log progress; stdout is reserved for the JSON protocol.
    with contextlib.redirect_stdout(sys.stderr):
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        torch.set_num_threads(max(1, min(2, os.cpu_count() or 1)))
        torch.manual_seed(0)
        tokenizer = AutoTokenizer.from_pretrained(SUMMARY_MODEL, revision=SUMMARY_REVISION, trust_remote_code=False)
        model = AutoModelForSeq2SeqLM.from_pretrained(SUMMARY_MODEL, revision=SUMMARY_REVISION, trust_remote_code=False)
        model.eval()
        # Summarize every part of a long article; never silently truncate its end.
        def summarize_text(text, maximum=90):
            encoded = tokenizer(text, return_tensors="pt", truncation=False)
            if encoded.input_ids.shape[1] > 1024:
                raise ValueError("Summary chunk exceeded the verified context size")
            with torch.inference_mode():
                result = model.generate(**encoded, max_new_tokens=maximum, min_new_tokens=min(25, maximum // 2), num_beams=4, do_sample=False, no_repeat_ngram_size=3)
            return tokenizer.decode(result[0], skip_special_tokens=True)

        chunks = []
        current = ""
        for sentence in sentences(article["body"]):
            candidate = (current + " " + sentence).strip()
            if len(tokenizer.encode(candidate)) > 900:
                if not current:
                    raise ValueError("A source sentence exceeds the local model context")
                chunks.append(current)
                current = sentence
            else:
                current = candidate
        if current:
            chunks.append(current)
        budget = min(90, max(25, int(len(article["body"].split()) * 0.3)))
        summaries = [summarize_text(chunk, 70 if len(chunks) > 1 else budget) for chunk in chunks]
        summary = summaries[0] if len(summaries) == 1 else summarize_text(" ".join(summaries), budget)
        statements = sentences(summary)
        if not 1 <= len(statements) <= 5:
            raise ValueError("Unexpected summary length")
        evidence = [evidence_for(statement, article["body"]) for statement in statements]
        revisions = {SUMMARY_MODEL: getattr(model.config, "_commit_hash", None)}
        del model, tokenizer
        gc.collect()
        tokenizer = AutoTokenizer.from_pretrained(TRANSLATION_MODEL, revision=TRANSLATION_REVISION, src_lang="en", trust_remote_code=False)
        model = AutoModelForSeq2SeqLM.from_pretrained(TRANSLATION_MODEL, revision=TRANSLATION_REVISION, trust_remote_code=False)
        model.eval()
        revisions[TRANSLATION_MODEL] = getattr(model.config, "_commit_hash", None)
        texts = [article["title"], *statements]
        inputs = tokenizer(texts, return_tensors="pt", padding=True, truncation=False)
        with torch.inference_mode():
            output = model.generate(**inputs, forced_bos_token_id=tokenizer.get_lang_id("ko"), max_new_tokens=220, num_beams=4, do_sample=False, no_repeat_ngram_size=3)
        translations = tokenizer.batch_decode(output, skip_special_tokens=True)
        print("Local model revisions: " + json.dumps(revisions), file=sys.stderr)
    title = translations[0]
    paragraphs = translations[1:]
    description = " ".join(statements)
    if len(description) > 250:
        description = description[:247].rsplit(" ", 1)[0] + "…"
    json.dump({"title": article["title"], "titleKo": title, "description": description, "facts": [{"en": english, "ko": korean, "evidence": proof} for english, korean, proof in zip(statements, paragraphs, evidence)]}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
