import Parser from 'rss-parser';

const PFF_FEED_URL = 'https://www.pff.com/rss-feed';

/**
 * Fetches and filters PFF RSS feed for College & Draft news articles.
 * Returns an array of news items: { title, categories, link, pubDate, ... }
 */
export async function fetchCollegeDraftNews() {
  const parser = new Parser();
  const feed = await parser.parseURL(PFF_FEED_URL);
  return (feed.items || []).filter(item =>
    Array.isArray(item.categories) && item.categories.includes('College & Draft')
  );
}
