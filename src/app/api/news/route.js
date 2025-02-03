import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://www.pff.com/feed');
    const xmlData = await response.text();
    
    // Simpler XML parsing with fixed regex patterns
    const titles = (xmlData.match(/<title>.*?<\/title>/gs) || [])
      .slice(1)  // Skip the first title (channel title)
      .map(t => t.replace(/<title>/, '').replace(/<\/title>/, '')
        .replace('<![CDATA[', '').replace(']]>', '').trim());
    
    const links = (xmlData.match(/<link>.*?<\/link>/gs) || [])
      .slice(1)  // Skip the first link (channel link)
      .map(l => l.replace(/<link>/, '').replace(/<\/link>/, '').trim());
    
    const categories = (xmlData.match(/<category>.*?<\/category>/gs) || [])
      .map(c => c.replace(/<category>/, '').replace(/<\/category>/, '')
        .replace('<![CDATA[', '').replace(']]>', '').trim());
    
    const pubDates = (xmlData.match(/<pubDate>.*?<\/pubDate>/gs) || [])
      .map(d => d.replace(/<pubDate>/, '').replace(/<\/pubDate>/, '').trim());

    const newsItems = titles.map((title, index) => ({
      title,
      link: links[index] || '',
      category: categories[index] || 'News',
      timestamp: pubDates[index] || ''
    }));

    return NextResponse.json(newsItems);
  } catch (error) {
    console.error('Error fetching news:', error);
    return NextResponse.json([]);
  }
}