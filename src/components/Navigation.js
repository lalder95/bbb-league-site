'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export default function Navigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const isActive = (path) => {
    return pathname === path ? 'bg-[#FF4B1F] bg-opacity-20' : '';
  };

  const navLinks = [
    { href: '/', label: 'Player Contracts' },
    { href: '/salary-cap', label: 'Cap Space' },
    { href: '/rules', label: 'Rules & Resources' },
    { href: '/analytics', label: 'Analytics' },
    { href: '/draft', label: 'Draft Center' },
    { href: '/offseason', label: 'Offseason Guide' },
    { href: '/hall-of-fame', label: 'Hall of Fame' },
    { href: '/history', label: 'League History' },
    { href: '/media', label: 'Media' },
    { href: '/trade', label: 'Trade Center' }
  ];

  return (
    <nav className="bg-black/30 border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Mobile Menu Button */}
          <div className="flex items-center">
            <img 
              src="/logo.png" 
              alt="BBB League" 
              className="h-10 w-10"
            />
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-white hover:text-[#FF4B1F]"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:justify-center md:flex-1">
            <div className="flex space-x-4 justify-center">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`${isActive(href)} px-3 py-2 rounded-md text-sm text-white hover:bg-[#FF4B1F] hover:bg-opacity-20 text-center`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`${isActive(href)} block px-3 py-2 rounded-md text-base text-white hover:bg-[#FF4B1F] hover:bg-opacity-20`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}