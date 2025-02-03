import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://www.pff.com/feed');
    const xmlData = await response.text();
    
    // Simple XML parsing without using XMLParser
    const getTagContent = (xml, tag) => {
      const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'gs');
      return [...xml.matchAll(regex)].map(match => match[1]);
    };

    const titles = getTagContent(xmlData, 'title').slice(1); // Skip the first title (channel title)
    const links = getTagContent(xmlData, 'link').slice(1);  // Skip the first link (channel link)
    const categories = getTagContent(xmlData, 'category');
    const pubDates = getTagContent(xmlData, 'pubDate');

    const newsItems = titles.map((title, index) => ({
      title: title.replace('<![CDATA[', '').replace(']]>', ''),
      link: links[index],
      category: categories[index]?.replace('<![CDATA[', '').replace(']]>', '') || 'News',
      timestamp: pubDates[index]
    }));

    return NextResponse.json(newsItems);
  } catch (error) {
    console.error('Error fetching news:', error);
    return NextResponse.json([]);
  }
}