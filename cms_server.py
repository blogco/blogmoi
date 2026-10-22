#!/usr/bin/env python3
"""Local-only Blogmoi authoring publisher. Uses the OS Git credential helper."""
from __future__ import annotations

import base64
import hashlib
import html
import json
import mimetypes
import re
import shutil
import subprocess
import time
from datetime import datetime
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
PREFIX = "/blogmoi"
ORIGIN = "http://127.0.0.1:4173"
POSTS = ROOT / "content" / "posts"
UPLOADS = ROOT / "static" / "uploads"
MAX_JSON = 6 * 1024 * 1024
ALLOWED = {"p", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li", "blockquote", "br", "figure", "figcaption", "img", "table", "thead", "tbody", "tr", "th", "td", "hr"}
VOID = {"br", "img", "hr"}
SKIP = {"script", "style", "iframe", "object", "svg", "math"}


def git(*args: str, timeout: int = 30) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stderr.strip()[-800:] or "Git command failed")
    return result.stdout.strip()


def check_repo(clean: bool = False) -> None:
    branch = git("branch", "--show-current")
    remote = git("remote", "get-url", "origin")
    if branch != "main":
        raise RuntimeError("Publisher chỉ xuất bản từ nhánh main.")
    if remote not in {"https://github.com/blogco/blogmoi.git", "git@github.com:blogco/blogmoi.git", "ssh://git@github.com/blogco/blogmoi.git"}:
        raise RuntimeError("Từ chối xuất bản: origin không phải blogco/blogmoi.")
    if clean and git("status", "--porcelain"):
        raise RuntimeError("Checkout có thay đổi ngoài CMS. Hãy commit hoặc cất các thay đổi khác trước khi xuất bản.")


def slugify(value: str) -> str:
    import unicodedata
    text = unicodedata.normalize("NFD", value).replace("đ", "d").replace("Đ", "D")
    text = "".join(c for c in text if unicodedata.category(c) != "Mn").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:80].strip("-")
    return slug or "bai-viet"


class Sanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if self.skip_depth:
            if tag in SKIP:
                self.skip_depth += 1
            return
        if tag in SKIP:
            self.skip_depth = 1
            return
        if tag not in ALLOWED:
            return
        attrs = dict(attrs)
        kept = []
        if tag == "a":
            href = attrs.get("href", "")
            parsed = urlsplit(href)
            if href and (not parsed.scheme or parsed.scheme in {"https", "http", "mailto", "tel"}) and not href.startswith("//"):
                kept.append(("href", href))
                kept.append(("rel", "noopener noreferrer"))
        if tag == "img":
            src = attrs.get("src", "")
            if not (src.startswith(PREFIX + "/uploads/") or src.startswith("https://")):
                return
            kept.extend([("src", src), ("alt", attrs.get("alt", "")[:300])])
            width = attrs.get("width", "")
            if width in {"25", "50", "75", "100"}:
                kept.append(("width", width))
        if tag == "figure":
            if attrs.get("data-align") in {"left", "center", "right"}:
                kept.append(("data-align", attrs["data-align"]))
            if attrs.get("data-width") in {"25", "50", "75", "100"}:
                kept.append(("data-width", attrs["data-width"]))
        if tag in {"p", "h2", "h3", "h4", "blockquote"} and attrs.get("data-align") in {"left", "center", "right"}:
            kept.append(("data-align", attrs["data-align"]))
        if tag == "th":
            kept.append(("scope", "col"))
        attr_text = "".join(' %s="%s"' % (k, html.escape(v, quote=True)) for k, v in kept)
        self.out.append("<" + tag + attr_text + ">")

    def handle_endtag(self, tag):
        if self.skip_depth:
            if tag in SKIP:
                self.skip_depth -= 1
            return
        if tag in ALLOWED and tag not in VOID:
            self.out.append("</" + tag + ">")

    def handle_data(self, data):
        if not self.skip_depth:
            self.out.append(html.escape(data, quote=False))


def clean_html(source: str) -> str:
    parser = Sanitizer()
    parser.feed(source[:350_000])
    parser.close()
    return "".join(parser.out)


def store_media(post: dict, body: str, slug: str) -> tuple[dict, str, list[str]]:
    paths = []
    UPLOADS.mkdir(parents=True, exist_ok=True)

    def save_data_url(value: str) -> str:
        match = re.fullmatch(r"data:image/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)", value or "")
        if not match:
            raise ValueError("Ảnh nội tuyến không hợp lệ.")
        raw = base64.b64decode(match.group(2), validate=True)
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError("Mỗi ảnh tối đa 4 MB.")
        signatures = {
            "png": raw.startswith(b"\x89PNG\r\n\x1a\n"),
            "jpeg": raw.startswith(b"\xff\xd8\xff"),
            "gif": raw.startswith((b"GIF87a", b"GIF89a")),
            "webp": raw.startswith(b"RIFF") and raw[8:12] == b"WEBP",
        }
        ext = match.group(1)
        if not signatures.get(ext):
            raise ValueError("Định dạng ảnh không khớp dữ liệu.")
        digest = hashlib.sha256(raw).hexdigest()[:14]
        name = slug + "-" + digest + "." + ("jpg" if ext == "jpeg" else ext)
        target = UPLOADS / name
        if not target.exists():
            target.write_bytes(raw)
        paths.append("static/uploads/" + name)
        return PREFIX + "/uploads/" + name

    body = re.sub(
        r'src="(data:image/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+)"',
        lambda m: 'src="' + save_data_url(m.group(1)) + '"',
        body,
    )
    cover = post.get("cover") or {}
    if isinstance(cover.get("url"), str) and cover["url"].startswith("data:"):
        cover["url"] = save_data_url(cover["url"])
    post["cover"] = cover
    return post, body, sorted(set(paths))


def yaml_value(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def serialize(post: dict, body: str, slug: str) -> str:
    cover = post.get("cover") or {}
    fields = {
        "title": post.get("title", "").strip(),
        "slug": slug,
        "date": post.get("date") or datetime.now().astimezone().isoformat(timespec="minutes"),
        "draft": False,
        "description": post.get("excerpt", "").strip(),
        "author": post.get("author", "").strip() or "Blogmoi",
        "language": post.get("language", "vi"),
        "categories": post.get("categories", []),
        "tags": post.get("tags", []),
        "cover_url": cover.get("url", ""),
        "cover_alt": cover.get("alt", ""),
        "cover_caption": cover.get("caption", ""),
        "seo_title": post.get("seoTitle", ""),
        "seo_description": post.get("seoDescription", ""),
        "canonical": post.get("canonical", ""),
        "og_image": post.get("ogImage", ""),
        "faq": post.get("faq", []),
        "sources": post.get("sources", []),
        "related": post.get("related", []),
    }
    front = "\n".join(key + ": " + yaml_value(value) for key, value in fields.items())
    return "---\n" + front + "\n---\n\n{{< rich >}}\n" + clean_html(body) + "\n{{< /rich >}}\n"


def parse_post(text: str) -> dict:
    match = re.match(r"^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$", text)
    if not match:
        raise ValueError("Bài viết chưa dùng định dạng CMS Blogmoi.")
    fields = {}
    for line in match.group(1).splitlines():
        key, sep, value = line.partition(": ")
        if sep:
            try:
                fields[key] = json.loads(value)
            except json.JSONDecodeError:
                fields[key] = value.strip('"')
    body_match = re.search(r"\{\{<\s*rich\s*>}}\s*([\s\S]*?)\s*\{\{<\s*/rich\s*>}}", match.group(2))
    body = body_match.group(1) if body_match else match.group(2)
    return {
        "title": fields.get("title", ""), "slug": fields.get("slug", ""),
        "excerpt": fields.get("description", ""), "author": fields.get("author", ""),
        "date": fields.get("date", ""), "language": fields.get("language", "vi"),
        "categories": fields.get("categories", []), "tags": fields.get("tags", []),
        "cover": {"url": fields.get("cover_url", ""), "alt": fields.get("cover_alt", ""), "caption": fields.get("cover_caption", "")},
        "seoTitle": fields.get("seo_title", ""), "seoDescription": fields.get("seo_description", ""),
        "canonical": fields.get("canonical", ""), "ogImage": fields.get("og_image", ""),
        "faq": fields.get("faq", []), "sources": fields.get("sources", []), "related": fields.get("related", []),
        "bodyHtml": body,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "BlogmoiLocal/1"

    def reply(self, status: int, value: dict):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_JSON:
            raise ValueError("Yêu cầu trống hoặc vượt giới hạn 6 MB.")
        return json.loads(self.rfile.read(length))

    def allowed_request(self):
        return self.headers.get("Host") == "127.0.0.1:4173" and self.headers.get("Origin") == ORIGIN

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if self.headers.get("Host") != "127.0.0.1:4173":
            self.reply(403, {"error": "Chỉ phục vụ tại 127.0.0.1."})
            return
        if path == PREFIX + "/api/posts":
            try:
                items = []
                if POSTS.exists():
                    for file in POSTS.glob("*/index.md"):
                        text = file.read_text(encoding="utf-8")
                        post = parse_post(text)
                        if post["title"]:
                            items.append({"slug": file.parent.name, "title": post["title"], "date": post["date"], "excerpt": post["excerpt"]})
                items.sort(key=lambda p: p["date"], reverse=True)
                self.reply(200, {"posts": items})
            except Exception as exc:
                self.reply(500, {"error": str(exc)})
            return
        prefix = PREFIX + "/api/posts/"
        if path.startswith(prefix):
            slug = path[len(prefix):]
            if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
                self.reply(400, {"error": "Slug không hợp lệ."})
                return
            file = POSTS / slug / "index.md"
            if not file.is_file():
                self.reply(404, {"error": "Không tìm thấy bài viết."})
                return
            text = file.read_text(encoding="utf-8")
            self.reply(200, {"post": parse_post(text), "sha": hashlib.sha256(text.encode()).hexdigest()})
            return
        if path == PREFIX or path == PREFIX + "/":
            self.send_response(302)
            self.send_header("Location", PREFIX + "/")
            self.end_headers()
            return
        if not path.startswith(PREFIX + "/"):
            self.send_error(404)
            return
        relative = path[len(PREFIX) + 1:]
        target = (PUBLIC / relative).resolve()
        if target.is_dir():
            target = target / "index.html"
        if not target.is_relative_to(PUBLIC.resolve()) or not target.is_file():
            self.send_error(404)
            return
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        content = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime + ("; charset=utf-8" if mime.startswith("text/") else ""))
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-cache" if "/admin/" in path else "public, max-age=300")
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        if not self.allowed_request():
            self.reply(403, {"error": "Yêu cầu bị từ chối do sai nguồn hoặc host."})
            return
        path = unquote(urlsplit(self.path).path)
        prefix = PREFIX + "/api/posts/"
        if not path.startswith(prefix):
            self.reply(404, {"error": "Đường dẫn không tồn tại."})
            return
        slug = path[len(prefix):]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            self.reply(400, {"error": "Slug không hợp lệ."})
            return
        try:
            payload = self.body()
            post = payload.get("post") or {}
            if slugify(str(post.get("slug", ""))) != slug or not str(post.get("title", "")).strip():
                raise ValueError("Tiêu đề hoặc slug không hợp lệ.")
            body = str(post.get("bodyHtml", ""))
            if not re.sub(r"<[^>]*>", "", body).strip():
                raise ValueError("Nội dung bài viết trống.")
            check_repo(clean=True)
            file = POSTS / slug / "index.md"
            existing = file.read_text(encoding="utf-8") if file.exists() else None
            expected = payload.get("sha")
            actual = hashlib.sha256(existing.encode()).hexdigest() if existing is not None else None
            if existing is not None and actual != expected:
                raise RuntimeError("Bài viết đã thay đổi trên Git. Hãy tải lại trước khi ghi đè.")
            if existing is None and expected:
                raise RuntimeError("Bài viết đã bị xóa hoặc slug đã được dùng.")
            post, body, media_paths = store_media(post, body, slug)
            html_body = clean_html(body)
            content = serialize(post, html_body, slug)
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(content, encoding="utf-8")
            paths = ["content/posts/" + slug + "/index.md", *media_paths]
            git("add", "--", *paths)
            git("commit", "-m", "content: publish " + slug, timeout=60)
            commit = git("rev-parse", "--short", "HEAD")
            git("push", "origin", "main", timeout=90)
            self.reply(200, {"ok": True, "slug": slug, "sha": hashlib.sha256(content.encode()).hexdigest(), "commit": commit})
        except Exception as exc:
            self.reply(409 if "thay đổi" in str(exc) or "Checkout có thay đổi" in str(exc) else 400, {"error": str(exc)})

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))


def main():
    if shutil.which("hugo") is None:
        raise SystemExit("Hugo Extended 0.163.1 chưa được cài.")
    check_repo()
    print("Building Hugo site...")
    subprocess.run(["hugo", "--gc", "--minify"], cwd=ROOT, check=True)
    server = ThreadingHTTPServer(("127.0.0.1", 4173), Handler)
    print("Blogmoi CMS: http://127.0.0.1:4173/blogmoi/admin/")
    print("Publisher is loopback-only. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
