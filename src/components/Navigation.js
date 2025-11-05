'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { Menu, X, ChevronDown, Search } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import PlayerProfileCard from '../app/my-team/components/PlayerProfileCard';

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
        <div ref={dropdownRef} role="menu" onMouseEnter={handleDropdownMouseEnter} className="absolute z-[70] left-0 mt-2 w-56 bg-black/80 backdrop-blur-md rounded-xl shadow-2xl border border-white/10 py-2">
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
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { data: session } = useSession();
  const [scrolled, setScrolled] = useState(false);
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [allPlayers, setAllPlayers] = useState([]); // {playerId, playerName, position, team}
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null); // for modal
  const searchInputRef = useRef(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock background scroll when mobile menu is open
  useEffect(() => {
    if (!isMenuOpen) return;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [isMenuOpen]);

  // Build page list from navGroups
  // (kept for reference) We'll populate pages from navGroups after it's defined below.

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
        { href: '/free-agency', label: 'Free Agency' },
        { href: '/player-performance', label: 'Player Performance' },
        { href: '/holdouts', label: 'Holdouts' }
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

  // Populate page items once from navGroups
  const pages = navGroups.flatMap(group =>
    group.type === 'single' ? group.links : group.links
  );

  // Fetch players from BBB contracts CSV lazily
  async function ensurePlayersLoaded() {
    if (allPlayers.length || loadingPlayers) return;
    try {
      setLoadingPlayers(true);
      const res = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv');
      const text = await res.text();
      const rows = text.split('\n').filter(r => r.trim());
      const data = rows.slice(1).map((row, idx) => {
        const cols = row.split(',');
        return {
          playerId: cols[0],
          playerName: cols[1],
          position: cols[21],
          team: cols[33],
        };
      });
      // Deduplicate by playerId keeping first occurrence
      const seen = new Set();
      const unique = [];
      for (const p of data) {
        if (!seen.has(String(p.playerId))) {
          seen.add(String(p.playerId));
          unique.push(p);
        }
      }
      setAllPlayers(unique);
    } catch (e) {
      // swallow; keep empty
    } finally {
      setLoadingPlayers(false);
    }
  }

  // Compute filtered results
  const normalized = (s) => s.toLowerCase().trim();
  const q = normalized(searchQuery);
  const pageResults = q
    ? pages
        .filter(p => normalized(p.label).includes(q) || normalized(p.href).includes(q))
        .slice(0, 6)
    : [];
  const playerResults = q && allPlayers.length
    ? allPlayers
        .filter(p => normalized(p.playerName).includes(q))
        .slice(0, 8)
    : [];

  const combinedResults = [
    ...pageResults.map(p => ({ type: 'page', key: `page-${p.href}`, label: p.label, href: p.href })),
    ...playerResults.map(p => ({ type: 'player', key: `player-${p.playerId}`, label: p.playerName, playerId: p.playerId, position: p.position, team: p.team })),
  ];

  const handleSearchFocus = async () => {
    setShowResults(true);
    await ensurePlayersLoaded();
  };

  const handleResultClick = (item) => {
    if (item.type === 'page') {
      setShowResults(false);
      setSearchQuery('');
      router.push(item.href);
    } else if (item.type === 'player') {
      setSelectedPlayerId(item.playerId);
      setShowResults(false);
      setSearchQuery('');
    }
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        showResults &&
        resultsRef.current &&
        !resultsRef.current.contains(e.target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target)
      ) {
        setShowResults(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showResults]);

  const onKeyDownSearch = (e) => {
    if (!combinedResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowResults(true);
      setActiveIndex((prev) => (prev + 1) % combinedResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setShowResults(true);
      setActiveIndex((prev) => (prev - 1 + combinedResults.length) % combinedResults.length);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < combinedResults.length) {
        handleResultClick(combinedResults[activeIndex]);
      } else if (pageResults.length) {
        handleResultClick({ type: 'page', href: pageResults[0].href, label: pageResults[0].label });
      } else if (playerResults.length) {
        handleResultClick({ type: 'player', playerId: playerResults[0].playerId, label: playerResults[0].playerName });
      }
    } else if (e.key === 'Escape') {
      setShowResults(false);
      setActiveIndex(-1);
    }
  };

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
        {/* Desktop search row (above nav) */}
        <div className="hidden md:flex justify-center pt-2 mb-2">
          <div className="relative w-full max-w-2xl">
            <div className="flex items-center bg-white/5 rounded-full px-4 h-10 border border-white/10 focus-within:ring-2 focus-within:ring-[#FF4B1F]/40">
              <Search className="h-4 w-4 text-white/60" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setActiveIndex(-1); setShowResults(true); }}
                onFocus={handleSearchFocus}
                onKeyDown={onKeyDownSearch}
                placeholder="Search pages and players..."
                className="ml-2 bg-transparent outline-none text-sm text-white placeholder-white/50 w-full"
                aria-label="Search pages and players"
              />
            </div>
            {showResults && (searchQuery.length > 0 || loadingPlayers) && (
              <div ref={resultsRef} className="absolute left-0 right-0 mt-2 w-full bg-black/90 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl z-40">
                <div className="p-2 max-h-96 overflow-auto">
                  {pageResults.length > 0 && (
                    <div className="mb-2">
                      <div className="px-2 py-1 text-xs uppercase tracking-wider text-white/40">Pages</div>
                      {pageResults.map((item, idx) => (
                        <button
                          key={item.href}
                          onClick={() => handleResultClick({ type: 'page', href: item.href, label: item.label })}
                          className={`w-full text-left px-3 py-2 rounded-md text-white/80 hover:bg-white/10 ${activeIndex === idx ? 'bg-white/10' : ''}`}
                          role="option"
                        >
                          <span className="text-sm">{item.label}</span>
                          <span className="ml-2 text-xs text-white/40">{item.href}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="px-2 py-1 text-xs uppercase tracking-wider text-white/40">Players</div>
                  {loadingPlayers && (
                    <div className="px-3 py-2 text-white/60 text-sm">Loading players…</div>
                  )}
                  {!loadingPlayers && playerResults.length === 0 && (
                    <div className="px-3 py-2 text-white/60 text-sm">No matching players</div>
                  )}
                  {!loadingPlayers && playerResults.map((p, idx) => {
                    const overallIndex = pageResults.length + idx;
                    return (
                      <button
                        key={p.playerId}
                        onClick={() => handleResultClick({ type: 'player', playerId: p.playerId, label: p.playerName })}
                        className={`w-full text-left px-3 py-2 rounded-md text-white/80 hover:bg-white/10 ${activeIndex === overallIndex ? 'bg-white/10' : ''}`}
                        role="option"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm">{p.playerName}</span>
                          <span className="text-xs text-white/50">{p.position}{p.team ? ` • ${p.team}` : ''}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

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
            <div className="flex space-x-3 bg-white/5 supports-[backdrop-filter]:bg-white/10 backdrop-blur-sm rounded-full p-1 border border-white/10">
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

          {/* Right side: Auth (desktop) */}
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

        

        {/* Mobile Navigation Overlay */}
        {isMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsMenuOpen(false)}
              aria-hidden
            />
            {/* Scrollable Menu Panel */}
            <div className="absolute top-16 inset-x-0 bottom-0 overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-md border-t border-white/10">
              {/* Mobile search */}
              <div className="p-3 sticky top-0 bg-black/80 backdrop-blur-md border-b border-white/10 z-10">
                <div className="flex items-center bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                  <Search className="h-4 w-4 text-white/60" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setActiveIndex(-1); setShowResults(true); }}
                    onFocus={handleSearchFocus}
                    placeholder="Search pages and players..."
                    className="ml-2 bg-transparent outline-none text-sm text-white placeholder-white/50 w-full"
                    aria-label="Search pages and players"
                  />
                </div>
                {showResults && (searchQuery.length > 0 || loadingPlayers) && (
                  <div className="mt-2 bg-black/90 border border-white/10 rounded-xl max-h-80 overflow-auto">
                    <div className="p-2">
                      {pageResults.length > 0 && (
                        <div className="mb-2">
                          <div className="px-2 py-1 text-xs uppercase tracking-wider text-white/40">Pages</div>
                          {pageResults.map((item) => (
                            <button
                              key={item.href}
                              onClick={() => { handleResultClick({ type: 'page', href: item.href, label: item.label }); setIsMenuOpen(false); }}
                              className="w-full text-left px-3 py-2 rounded-md text-white/80 hover:bg-white/10"
                            >
                              <span className="text-sm">{item.label}</span>
                              <span className="ml-2 text-xs text-white/40">{item.href}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="px-2 py-1 text-xs uppercase tracking-wider text-white/40">Players</div>
                      {loadingPlayers && (
                        <div className="px-3 py-2 text-white/60 text-sm">Loading players…</div>
                      )}
                      {!loadingPlayers && playerResults.length === 0 && (
                        <div className="px-3 py-2 text-white/60 text-sm">No matching players</div>
                      )}
                      {!loadingPlayers && playerResults.map((p) => (
                        <button
                          key={p.playerId}
                          onClick={() => { handleResultClick({ type: 'player', playerId: p.playerId, label: p.playerName }); setIsMenuOpen(false); }}
                          className="w-full text-left px-3 py-2 rounded-md text-white/80 hover:bg-white/10"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{p.playerName}</span>
                            <span className="text-xs text-white/50">{p.position}{p.team ? ` • ${p.team}` : ''}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-3 py-3 space-y-1">
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
        )}
        {/* Player quick view modal */}
        {selectedPlayerId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedPlayerId(null)} aria-hidden />
            <div className="relative z-[61] w-[95vw] max-w-2xl max-h-[90vh] overflow-auto bg-black/90 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-white/80 text-sm">Player Card</div>
                <button onClick={() => setSelectedPlayerId(null)} className="text-white/70 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <PlayerProfileCard playerId={selectedPlayerId} expanded={true} />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}