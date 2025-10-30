'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';

// Dropdown component
const NavDropdown = ({ title, links, isActive }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const dropdownRef = useRef(null);
  const timeoutRef = useRef(null);
  const buttonRef = useRef(null);
  const itemRefs = useRef([]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsOpen(true), 100);
  };
  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsOpen(false), 200);
  };
  const handleDropdownMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      buttonRef.current?.focus();
    }
    if (!isOpen && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setIsOpen(true);
      // Focus first item after open
      setTimeout(() => itemRefs.current[0]?.focus(), 0);
    } else if (isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const items = itemRefs.current.filter(Boolean);
      if (!items.length) return;
      const currentIndex = items.indexOf(document.activeElement);
      let nextIndex = currentIndex;
      if (e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
      if (e.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
    }
  };

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return (
    <div className="relative group" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        className={`
          flex items-center px-3 py-2 rounded-full transition-all duration-300 ease-in-out
          ${links.some(link => link.href === pathname) ? 'bg-[#FF4B1F] bg-opacity-20 text-[#FF4B1F]' : 'text-white/70 hover:text-[#FF4B1F] hover:bg-white/5'}
        `}
      >
        {title}
        <ChevronDown className="ml-1 h-4 w-4 transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>
      {isOpen && (
        <div ref={dropdownRef} role="menu" onMouseEnter={handleDropdownMouseEnter} className="absolute z-50 left-0 mt-2 w-56 bg-black/80 backdrop-blur-md rounded-xl shadow-2xl border border-white/10 py-2">
          {links.map(({ href, label }, idx) => (
            <Link
              key={href}
              href={href}
              ref={(el) => (itemRefs.current[idx] = el)}
              role="menuitem"
              tabIndex={-1}
              className={`
                block px-4 py-2 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#FF4B1F]/50
                ${pathname === href ? 'bg-[#FF4B1F] bg-opacity-20 text-[#FF4B1F]' : 'text-white/80 hover:bg-white/10 hover:text-[#FF4B1F]'}
              `}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default function Navigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { data: session } = useSession();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navGroups = [
    {
      type: 'single',
      links: [{ href: '/', label: 'Home' }]
    },
    {
      type: 'dropdown',
      title: 'My Team',
      links: [
        { href: '/my-team/roster', label: 'Roster' },
        { href: '/my-team/finance', label: 'Finance' },
        { href: '/my-team/draft', label: 'Draft' },
        { href: '/my-team/free-agency', label: 'Free Agency' },
        { href: '/my-team/assistant-gm', label: 'Assistant GM' },
        { href: '/my-team/badges', label: 'Badges' },
        { href: '/my-team/contract-management', label: 'Contract Management' },
      ]
    },
    {
      type: 'dropdown',
      title: 'Contracts',
      links: [
        { href: '/player-contracts', label: 'Player Contracts' },
        { href: '/salary-cap', label: 'Cap Space' }
      ]
    },
    {
      type: 'dropdown',
      title: 'Team Building',
      links: [
        { href: '/analytics', label: 'Analytics' },
        { href: '/draft', label: 'Draft' },
        { href: '/free-agency', label: 'Free Agency' }
      ]
    },
    {
      type: 'dropdown',
      title: 'Rules & Tools',
      links: [
        { href: '/rules', label: 'Rules' },
        { href: '/media', label: 'Media' },
        { href: '/offseason', label: 'Offseason' },
        { href: '/trade', label: 'Trade' }
      ]
    },
    {
      type: 'dropdown',
      title: 'League History',
      links: [
        { href: '/history', label: 'History' },
        { href: '/hall-of-fame', label: 'Hall of Fame' }
      ]
    }
  ];

  if (session?.user?.role === 'admin') {
    navGroups.push({ type: 'single', links: [{ href: '/admin', label: 'Admin' }] });
  }

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'supports-[backdrop-filter]:bg-black/40 bg-black/70 backdrop-blur-xl border-b border-white/10 shadow-lg'
          : 'bg-transparent'
      }`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center group">
              <img src="/logo.png" alt="BBB League" className="h-10 w-10 transition-transform group-hover:rotate-6 group-hover:scale-110" />
              <span className="ml-3 text-xl font-bold text-white/80 group-hover:text-[#FF4B1F] transition-colors">BBB</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:justify-center md:flex-1">
            <div className="flex space-x-2 bg-white/5 supports-[backdrop-filter]:bg-white/10 backdrop-blur-sm rounded-full p-1 border border-white/10">
              {navGroups.map((group, index) => (
                group.type === 'single' ? (
                  group.links.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      className={`
                        relative px-3 py-2 rounded-full text-sm transition-all duration-300 ease-in-out
                        ${pathname === href ? 'text-[#FF4B1F] font-semibold' : 'text-white/80 hover:text-white'}
                      `}
                    >
                      <span className="relative z-10">{label}</span>
                      <span
                        className={`absolute inset-0 rounded-full transition-all duration-300 ${
                          pathname === href
                            ? 'bg-[#FF4B1F]/15 ring-1 ring-[#FF4B1F]/30'
                            : 'bg-transparent group-hover:bg-white/5'
                        }`}
                        aria-hidden
                      />
                    </Link>
                  ))
                ) : (
                  <NavDropdown
                    key={group.title}
                    title={group.title}
                    links={group.links}
                    isActive={group.links.some(link => link.href === pathname)}
                  />
                )
              ))}
            </div>
          </div>

          {/* Auth Links */}
          <div className="hidden md:flex items-center gap-4">
            {session ? (
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="px-4 py-2 rounded-full bg-[#FF4B1F] text-white text-sm hover:bg-[#FF4B1F]/80 transition-transform hover:scale-105 shadow-md hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4B1F]/50"
              >
                Logout
              </button>
            ) : (
              <Link href="/login" className="px-4 py-2 rounded-full bg-[#FF4B1F] text-white text-sm hover:bg-[#FF4B1F]/80 transition-transform hover:scale-105 shadow-md hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4B1F]/50">
                Login
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-white hover:text-[#FF4B1F] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4B1F]/50"
            >
              {isMenuOpen ? <X className="h-6 w-6 animate-rotate-in" /> : <Menu className="h-6 w-6 animate-rotate-out" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden overflow-hidden transition-[max-height,opacity] duration-300" style={{ maxHeight: isMenuOpen ? '1000px' : '0px', opacity: isMenuOpen ? 1 : 0 }}>
          <div className="px-2 pt-2 pb-3 space-y-1 bg-black/30 backdrop-blur-md rounded-lg border border-white/10">
              {navGroups.map((group, index) => (
                <div key={index}>
                  {group.type === 'single' ? (
                    group.links.map(({ href, label }) => (
                      <Link
                        key={href}
                        href={href}
                        className={`
                          ${pathname === href ? 'bg-[#FF4B1F] bg-opacity-20 text-[#FF4B1F]' : 'text-white/70 hover:text-[#FF4B1F]'}
                          block px-3 py-2 rounded-md text-base transition-all duration-300 ease-in-out
                        `}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {label}
                      </Link>
                    ))
                  ) : (
                    <div className="border-b border-white/10 pb-2 mb-2">
                      <div className="px-3 py-2 text-white/70 font-semibold">{group.title}</div>
                      {group.links.map(({ href, label }) => (
                        <Link
                          key={href}
                          href={href}
                          className={`
                            ${pathname === href ? 'bg-[#FF4B1F] bg-opacity-20 text-[#FF4B1F]' : 'text-white/70 hover:text-[#FF4B1F]'}
                            block px-4 py-2 rounded-md text-base ml-2 transition-all duration-300 ease-in-out
                          `}
                          onClick={() => setIsMenuOpen(false)}
                        >
                          {label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Auth Links for Mobile */}
              <div className="border-t border-white/10 pt-2 mt-2">
                {session ? (
                  <button
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="block w-full text-left px-3 py-2 rounded-md text-base text-white hover:bg-[#FF4B1F] hover:bg-opacity-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4B1F]/50"
                  >
                    Logout
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="block px-3 py-2 rounded-md text-base text-white hover:bg-[#FF4B1F] hover:bg-opacity-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4B1F]/50"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Login
                  </Link>
                )}
              </div>
            </div>
        </div>
      </div>
    </nav>
  );
}