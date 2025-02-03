import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

export async function GET() {
  try {
    const response = await fetch('https://www.pff.com/feed');
    const xmlData = await response.text();
    
    const parser = new XMLParser();
    const result = parser.parse(xmlData);
    
    const newsItems = result.rss.channel.item.map(item => ({
      title: item.title,
      link: item.link,
      category: Array.isArray(item.category) ? item.category[0] : item.category || 'News',
      timestamp: item.pubDate
    }));

    return NextResponse.json(newsItems);
  } catch (error) {
    console.error('Error fetching news:', error);
    return NextResponse.json([]);
  }
}