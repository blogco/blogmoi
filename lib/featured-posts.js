// collections.posts supplies publication order, newest first.
export function selectFeaturedPosts(posts) {
  const published = posts.filter(post => !post.data.draft);
  return [
    ...published.filter(post => post.data.featured === true),
    ...published.filter(post => post.data.featured !== true),
  ].slice(0, 3);
}
