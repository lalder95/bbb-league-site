// src/components/ConditionalNewsTicker.js
'use client';
import { usePathname } from 'next/navigation';
import NewsTicker from './NewsTicker';

export default function ConditionalNewsTicker() {
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  
  if (!isHomePage) {
    return null;
  }
  
  return <NewsTicker />;
}