// Public Unsplash photographs: a stable pseudo-random choice per article.
// No API credentials, deprecated Source endpoint or runtime script is needed.
export const UNSPLASH_COVERS = Object.freeze([
  { photo: "photo-1499750310107-5fef28a66643", alt: "Góc bàn làm việc với máy tính và sổ ghi chép." },
  { photo: "photo-1519389950473-47ba0277781c", alt: "Không gian làm việc chung với máy tính." },
  { photo: "photo-1461749280684-dccba630e2f6", alt: "Màn hình hiển thị mã lập trình." },
]);

export function isUnsplashCover(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://images.unsplash.com" && /^\/photo-[A-Za-z0-9-]+$/.test(url.pathname) && !url.username && !url.password;
  } catch { return false; }
}

export function resolveArticleCover(data = {}) {
  if (isUnsplashCover(data.cover)) {
    return { coverSource: "unsplash", cover: data.cover, coverAlt: data.coverAlt || "", coverCaption: data.coverCaption || "", coverAttribution: data.coverAttribution || {} };
  }
  const seed = String(data.slug || data.page?.fileSlug || data.title || "blogmoi");
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  const photo = UNSPLASH_COVERS[hash % UNSPLASH_COVERS.length];
  return {
    coverSource: "unsplash",
    cover: `https://images.unsplash.com/${photo.photo}?auto=format&fit=crop&w=1440&q=80`,
    coverAlt: photo.alt,
    coverCaption: "Ảnh minh họa từ Unsplash; không phải ảnh chụp sự kiện trong bài.",
    coverAttribution: { photoUrl: "https://unsplash.com/?utm_source=blogmoi&utm_medium=referral" },
  };
}
