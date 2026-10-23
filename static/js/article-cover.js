// Public Unsplash photographs: a stable pseudo-random choice per article.
// No API credentials, deprecated Source endpoint or runtime script is needed.
export const UNSPLASH_COVERS = Object.freeze([
  { photo: "photo-1499750310107-5fef28a66643", alt: "Góc bàn làm việc với máy tính và sổ ghi chép." },
  { photo: "photo-1519389950473-47ba0277781c", alt: "Không gian làm việc chung với máy tính." },
  { photo: "photo-1461749280684-dccba630e2f6", alt: "Màn hình hiển thị mã lập trình." },
  { photo: "photo-1516321318423-f06f85e504b3", alt: "Hai người trao đổi bên màn hình máy tính." },
  { photo: "photo-1497215728101-856f4ea42174", alt: "Bàn làm việc cạnh cửa sổ và cây xanh." },
  { photo: "photo-1486312338219-ce68d2c6f44d", alt: "Đôi tay gõ phím trên máy tính xách tay." },
  { photo: "photo-1522071820081-009f0129c71c", alt: "Một nhóm làm việc cùng máy tính quanh bàn." },
  { photo: "photo-1515879218367-8466d910aaa4", alt: "Các dòng mã lập trình trên màn hình." },
  { photo: "photo-1498050108023-c5249f4df085", alt: "Máy tính hiển thị mã lập trình trên bàn làm việc." },
  { photo: "photo-1551288049-bebda4e38f71", alt: "Màn hình hiển thị nhiều biểu đồ dữ liệu." },
  { photo: "photo-1451187580459-43490279c0fa", alt: "Trái Đất về đêm nhìn từ không gian." },
  { photo: "photo-1518770660439-4636190af475", alt: "Cận cảnh linh kiện trên một bảng mạch điện tử." },
  { photo: "photo-1504639725590-34d0984388bd", alt: "Cặp kính đặt trước màn hình làm việc." },
  { photo: "photo-1487014679447-9f8336841d58", alt: "Máy tính và tài liệu thiết kế trên bàn." },
  { photo: "photo-1531482615713-2afd69097998", alt: "Hai người cùng xem màn hình trong văn phòng." },
  { photo: "photo-1522202176988-66273c2fd55f", alt: "Một nhóm trao đổi quanh bàn cùng máy tính." },
]);

export function isUnsplashCover(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://images.unsplash.com" && /^\/photo-[A-Za-z0-9-]+$/.test(url.pathname) && !url.username && !url.password;
  } catch { return false; }
}

export function coverIdentity(value) {
  return isUnsplashCover(value) ? new URL(value).pathname : "";
}

export function articleCoverKey(data = {}) {
  return String(data.slug || data.page?.fileSlug || data.title || "blogmoi");
}

export function resolveArticleCover(data = {}, usedPhotos = new Set()) {
  if (isUnsplashCover(data.cover) && !usedPhotos.has(coverIdentity(data.cover))) {
    return { coverSource: "unsplash", cover: data.cover, coverAlt: data.coverAlt || "", coverCaption: data.coverCaption || "", coverAttribution: data.coverAttribution || {} };
  }
  const seed = articleCoverKey(data);
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  let photo;
  for (let offset = 0; offset < UNSPLASH_COVERS.length; offset++) {
    const candidate = UNSPLASH_COVERS[(hash + offset) % UNSPLASH_COVERS.length];
    if (!usedPhotos.has(`/${candidate.photo}`)) { photo = candidate; break; }
  }
  if (!photo) throw new Error("Hết ảnh Unsplash chưa dùng. Hãy chọn một ảnh Unsplash mới hoặc bổ sung bộ ảnh.");
  return {
    coverSource: "unsplash",
    cover: `https://images.unsplash.com/${photo.photo}?auto=format&fit=crop&w=1440&q=80`,
    coverAlt: photo.alt,
    coverCaption: "Ảnh minh họa từ Unsplash; không phải ảnh chụp sự kiện trong bài.",
    coverAttribution: { photoUrl: "https://unsplash.com/?utm_source=blogmoi&utm_medium=referral" },
  };
}

// Reserve explicit selections before allocating defaults; compare photo IDs,
// never URL query strings. Sorting makes allocation independent of input order.
export function assignArticleCovers(articles) {
  const items = articles.filter(data => !data.draft).slice().sort((a, b) => articleCoverKey(a).localeCompare(articleCoverKey(b), "en"));
  const assignments = new Map();
  const used = new Set();
  for (const data of items) {
    const photo = coverIdentity(data.cover);
    if (photo && !used.has(photo)) {
      assignments.set(articleCoverKey(data), resolveArticleCover(data));
      used.add(photo);
    }
  }
  for (const data of items) {
    const key = articleCoverKey(data);
    if (assignments.has(key)) continue;
    const cover = resolveArticleCover(data, used);
    assignments.set(key, cover);
    used.add(coverIdentity(cover.cover));
  }
  return assignments;
}
