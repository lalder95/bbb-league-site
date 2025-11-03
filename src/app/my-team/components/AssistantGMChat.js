import React, { useState, useMemo, useRef, useEffect } from 'react';

// Helper to get team name (mimics TradedPicks.js usage)
function getTeamName(rosterId, rosters, users) {
  if (!rosterId || !Array.isArray(rosters) || !Array.isArray(users)) return 'Unknown';
  const roster = rosters.find(r => String(r.roster_id) === String(rosterId));
  if (!roster) return 'Unknown';
  const user = users.find(u => String(u.user_id) === String(roster.owner_id));
  return user?.display_name || roster.name || 'Unknown';
}

// Helper to format draft pick string
function formatPickString(pick, rosters, users) {
  const original = getTeamName(pick.roster_id, rosters, users);
  return `${pick.season} Round ${pick.round} (from ${original})`;
}

export default function AssistantGMChat({
  teamState,
  assetPriority,
  strategyNotes,
  myContracts,
  playerContracts,
  session,
  tradedPicks = [],
  rosters = [],
  users = [],
  myDraftPicksList: propMyDraftPicksList,
  leagueWeek,  leagueYear,
  activeTab,
  autoMessage,
  autoSendTrigger,
  autoStartNewConversation = false,
}) {
  // Find user's team name
  const activeContracts = playerContracts.filter(p => p.status === 'Active' && p.team);
  const allTeamNames = Array.from(new Set(activeContracts.map(p => p.team.trim())));
  let myTeamName = '';
  if (session?.user?.name) {
    const nameLower = session.user.name.trim().toLowerCase();
    myTeamName = allTeamNames.find(team => team.trim().toLowerCase() === nameLower) || '';
    if (!myTeamName) {
      myTeamName = allTeamNames.find(team => team.trim().toLowerCase().includes(nameLower)) || '';
    }
  }
  if (!myTeamName) {
    const teamCounts = {};
    activeContracts.forEach(p => {
      const t = p.team.trim();
      teamCounts[t] = (teamCounts[t] || 0) + 1;
    });
    myTeamName = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }

  // Find user's roster_id (for draft pick ownership)
  let myRosterId = null;
  if (Array.isArray(rosters) && Array.isArray(users) && session?.user?.name) {
    const userObj = users.find(u =>
      typeof u.display_name === 'string' &&
      u.display_name.trim().toLowerCase() === session.user.name.trim().toLowerCase()
    );
    if (userObj) {
      const rosterObj = rosters.find(r => String(r.owner_id) === String(userObj.user_id));
      if (rosterObj) myRosterId = rosterObj.roster_id;
    }
  }

  // Get all picks currently owned by the user (per Sleeper API docs)
  let myDraftPicksList = [];
  if (propMyDraftPicksList) {
    myDraftPicksList = propMyDraftPicksList;
  } else if (myRosterId && Array.isArray(tradedPicks)) {
    myDraftPicksList = tradedPicks
      .filter(pick => String(pick.owner_id) === String(myRosterId))
      .sort((a, b) => {
        if (a.season !== b.season) return String(a.season).localeCompare(String(b.season));
        return a.round - b.round;
      })
      .map(pick => formatPickString(pick, rosters, users));
  }

  // Group contracts by team, filter out salary 0
  const contractsByTeam = {};
  playerContracts.filter(p => p.curYear && parseFloat(p.curYear) > 0).forEach(p => {
    const t = p.team.trim();
    if (!contractsByTeam[t]) contractsByTeam[t] = [];
    contractsByTeam[t].push(p);
  });

  // Format all rosters with contract status, fix years left, filter out 0 years left, and compute total salary
  const allRostersString = Object.entries(contractsByTeam).map(([team, contracts]) => {
    const isUser = team.trim().toLowerCase() === myTeamName.trim().toLowerCase();
    const filteredContracts = contracts.map(p => {
      let yearsRemaining = null;
      const currentYear = new Date().getFullYear();
      if (p.contractFinalYear && !isNaN(Number(p.contractFinalYear))) {
        yearsRemaining = Number(p.contractFinalYear) - currentYear + 1;
        if (yearsRemaining < 0) yearsRemaining = 0;
      }
      return { ...p, yearsRemaining };
    }).filter(p => p.yearsRemaining === null || p.yearsRemaining > 0);
    const totalSalary = filteredContracts.reduce((sum, p) => sum + (parseFloat(p.curYear) || 0), 0);
    return `--- ${isUser ? 'USER TEAM: ' : ''}${team} (Total Salary: $${totalSalary.toFixed(1)}) ---\n` + filteredContracts.map(p => {
      return `${p.playerName} (${p.position}), $${p.curYear}, KTC: ${p.ktcValue}, Age: ${p.age}, Years Left: ${p.yearsRemaining ?? '-'}, ${p.status}`;
    }).join('\n');
  }).join('\n\n');

  const systemPrompt = useMemo(() => `You're my Assistant GM for my Budget Blitz Bowl dynasty fantasy football league. Let's keep it casual—just text me advice like a friend would. Be concise and don't write essays.

This is a SuperFlex league, so teams can start 2 quarterbacks each week (one in the SuperFlex spot).

Current league year: ${leagueYear || 'Unknown'}
Current league week: ${leagueWeek || 'Unknown'}

Contract status types:
- Active: This player is on the team
- Expired: This player is no longer on the team, but we are still paying dead cap fees on their contract
- Future: This contract doesn't go into effect until the current contract expires

If I ask for trade advice, always compare the KTC values of the players and picks involved to help me understand the value side, as well as considering the contract details to evaluate the increase or decrease in salary obligations.

Always evaluate players based on both KTC value **and** contract details. Cheap contracts increase value. Expensive contracts reduce value, even for good players. KTC values do not reflect contract status, so you must consider both.

Long-term contracts are an asset if the player is an established starter, and not expected to decline due to age before the contract expires. Long-term contracts are a liability if the player's value is expected to decline significantly, due to age or losing their starting position.

Short-term contracts are prefered when a player is expected to be a starter for the next 1-2 years, but not beyond that. They are a liability if the player is expected to lose their starting position or decline significantly in that time.

When evaluating a player, consider the average salary for their position to establish a relative value.

Approximate KTC values for rookie picks:
Early 1st: 6000 | Mid 1st: 5000 | Late 1st: 4500
Early 2nd: 3500 | Mid 2nd: 3200 | Late 2nd: 3000
Early 3rd: 2500 | Mid 3rd: 2250 | Late 3rd: 2000
Early 4th: 1700 | Mid 4th: 1500 | Late 4th: 1200
Early 5th: 1000 | Mid 5th: 750  | Late 5th: 500
All later picks have negligible value.

Here's what you need to know:
- My Upcoming Draft Picks:
${myDraftPicksList.length ? myDraftPicksList.join(', ') : 'None'}

- All Team Rosters (including mine):
${allRostersString}

- My Team State: ${teamState}
- My Asset Priority: ${assetPriority.join(' > ')}
- My Strategy Notes: ${strategyNotes || 'None provided'}

Key league rules you should keep in mind:
- $300 salary cap. Teams must always stay under it. Cap space is not tradable.
- Contract types:
  • Base: Awarded in RFA or FA auction. 1–4 years for RFA, 2-4 years for FA auction. Can be extended.
  • Extension: 1–3 years, only on base contracts entering final year. Can only be given April through August.
  • Franchise Tag: One-year deal at top-10 average salary or current +10%, whichever is higher. One per team per year. One per player career. Can only be given February through April.
  • Rookie: 3-year deals based on draft slot. No extensions. Enter RFA after expiration.
  • Waiver/Free Agent: Salary = FAAB bid or $1. No extensions. Can be franchise tagged. Manager can designate 1 Waiver/Free Agent contract per year to go to RFA instead of Free Agency.
- Dead money rules:
  • 50% of remaining salary if drafted/traded
  • 100% of remaining salary if added via waiver/free agency
  • 0% if player retires
- Rookie Taxi Squad: 75% discount on rookie salary in Year 1 if placed there
- RFA process:
  • Players become RFA after rookie contract or FA/Waiver tag designation
  • Bids are evaluated using: 100% Y1 + 80% Y2 + 60% Y3 + 40% Y4
  • Original owner can match the winning bid to retain the player
- Trade deadline: End of Week 10. No trades after that.
- Playoffs start in Week 15. 6 Teams make it: 3 division winners + 3 wildcards. Division winners are seeds 1-3, wildcards are seeds 4-6. Top 2 seeds get first-round bye. Playoffs are 1 week per round.
- League schedule: Weeks 1-3 and 12-14 are against division rivals. Weeks 4-11 are inter-division matchups.
- Tiebreakers: Head-to-head, division record, conference record, points scored, points against, coin flip.
- Draft Order: Determined by reverse Max PF for non-playoff teams. Playoff teams draft in reverse order of playoff finish.

Keep in mind that this is only a fantasy football league, so managers have no real-life interactions with their players. Focus on the fantasy aspects and don't worry about real-life player behavior or contracts.

When I ask for advice, keep it short and practical. If you suggest a move, just say what and why—like you're texting a buddy. No long explanations or formalities.
  `, [
    leagueYear,
    leagueWeek,
    teamState,
    assetPriority,
    strategyNotes,
    myDraftPicksList,
    allRostersString
  ]);

  const chatKey = `assistantGMChat_${session?.user?.name || 'guest'}`;
  const [messages, setMessages] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(chatKey);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(chatKey, JSON.stringify(messages));
    }
  }, [messages, chatKey]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendRawMessage(content, baseMessages, options = {}) {
    if (!content?.trim()) return;
    setLoading(true);
    const userMsg = { role: 'user', content };
    if (options.hideInUI) {
      userMsg.uiHidden = true;
      userMsg.auto = true;
    }
    const base = Array.isArray(baseMessages) ? baseMessages : messages;
    const newMessages = [...base, userMsg];
    setMessages(newMessages);

    try {
      const res = await fetch('/api/assistant-gm-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages.map(({ role, content }) => ({ role, content })) }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        let errMsg = `Request failed (${res.status})`;
        try {
          if (contentType.includes('application/json')) {
            const j = await res.json();
            if (j?.error) errMsg = j.error;
          } else {
            const t = await res.text();
            if (t) errMsg = t.slice(0, 2000);
          }
        } catch {}
        setMessages([...newMessages, { role: 'assistant', content: `Error: ${errMsg}` }]);
        setLoading(false);
        return;
      }

      if (contentType.includes('application/json')) {
        const data = await res.json();
        setMessages([...newMessages, { role: 'assistant', content: data.reply || '' }]);
      } else {
        const text = await res.text();
        setMessages([...newMessages, { role: 'assistant', content: text || 'Empty response' }]);
      }
    } catch (err) {
      const msg = err && (err.message || String(err));
      setMessages([...newMessages, { role: 'assistant', content: `Network error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim()) return;
    const content = input;
    setInput('');
    await sendRawMessage(content);
  }

  function formatAssistantMessage(content) {
    let formatted = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    const numberedRegex = /(?:^|\n)(\d+\.[\s\S]*?)(?=(?:\n\d+\.|$))/g;
    const matches = [];
    let match;
    while ((match = numberedRegex.exec(formatted)) !== null) {
      matches.push(match[1].trim());
    }
    if (matches.length > 1) {
      return matches;
    }
    return formatted.split(/\n{2,}|\n(?=\d+\.)/g).map(s => s.trim()).filter(Boolean);
  }

  function handleClearChat() {
    if (window.confirm('Are you sure you want to reset your conversation?')) {
      setMessages([{ role: 'system', content: systemPrompt }]);
      if (typeof window !== 'undefined') {
        localStorage.setItem(chatKey, JSON.stringify([{ role: 'system', content: systemPrompt }]));
      }
    }
  }

  const messagesEndRef = useRef(null);
  const chatBoxRef = useRef(null);

  useEffect(() => {
    if (activeTab !== 'Assistant GM') return;
    const chatBox = chatBoxRef.current;
    if (chatBox) {
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }, [messages, activeTab]);

  const lastTriggerRef = useRef(undefined);
  useEffect(() => {
    if (activeTab !== 'Assistant GM') return;
    if (!autoMessage) return;
    if (autoSendTrigger === undefined || autoSendTrigger === lastTriggerRef.current) return;
    lastTriggerRef.current = autoSendTrigger;
    const t = setTimeout(() => {
      if (!loading) {
        if (autoStartNewConversation) {
          const fresh = [{ role: 'system', content: systemPrompt }];
          setMessages(fresh);
          if (typeof window !== 'undefined') {
            localStorage.setItem(chatKey, JSON.stringify(fresh));
          }
          sendRawMessage(autoMessage, fresh, { hideInUI: true });
        } else {
          sendRawMessage(autoMessage, undefined, { hideInUI: true });
        }
      }
    }, 50);
    return () => clearTimeout(t);
  }, [autoSendTrigger, autoMessage, activeTab, autoStartNewConversation, systemPrompt]);

  return (
    <div className="bg-black/20 rounded-lg p-4 flex flex-col" style={{height:'100%', minHeight:'38rem', maxHeight:'56rem'}}>
      <div
        ref={chatBoxRef}
        className="flex-1 min-h-0 overflow-y-auto bg-black/10 rounded p-2 mb-2 relative"
        style={{maxHeight:'34rem'}}
      >
        {messages.filter(m => m.role !== 'system' && !m.uiHidden).flatMap((msg, i) => {
          if (msg.role === 'assistant') {
            const parts = formatAssistantMessage(msg.content);
            return parts.map((part, j) => (
              <div key={`${i}-${j}`} className="mb-2 text-left">
                <span
                  className="inline-block px-3 py-2 rounded bg-white/10 text-white/90"
                  dangerouslySetInnerHTML={{ __html: part }}
                />
              </div>
            ));
          } else {
            return (
              <div key={i} className="mb-2 text-right">
                <span className="inline-block px-3 py-2 rounded bg-[#FF4B1F] text-white">
                  {msg.content}
                </span>
              </div>
            );
          }
        })}

        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center" aria-live="polite" role="status">
            <div className="flex flex-col items-center gap-3 text-white/90">
              <svg
                className="h-10 w-10 animate-spin text-[#FF4B1F]"
                style={{ animationDuration: '1200ms' }}
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                role="img"
                aria-label="Assistant is thinking"
              >
                <g transform="rotate(-25 32 32)">
                  <ellipse cx="32" cy="32" rx="26" ry="16" fill="currentColor" />
                  <rect x="12" y="29" width="8" height="6" rx="1" fill="#fff" opacity="0.9" />
                  <rect x="44" y="29" width="8" height="6" rx="1" fill="#fff" opacity="0.9" />
                  <rect x="24" y="30" width="16" height="4" rx="1" fill="#fff" />
                  <rect x="28" y="26" width="2" height="12" rx="1" fill="#fff" />
                  <rect x="32" y="26" width="2" height="12" rx="1" fill="#fff" />
                  <rect x="36" y="26" width="2" height="12" rx="1" fill="#fff" />
                </g>
              </svg>
              <span className="text-sm">Assistant is thinking…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="flex flex-col sm:flex-row gap-2 mb-2">
        <input
          className="flex-1 p-2 rounded bg-white/10 text-white"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
          placeholder="Ask your Assistant GM anything..."
        />
        <button
          className={`px-4 py-2 rounded font-bold transition-colors
            ${loading
              ? 'bg-gray-400 text-white opacity-70 cursor-not-allowed'
              : 'bg-[#FF4B1F] text-white'
            }`}
          disabled={loading || !input.trim()}
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
      <button
        className="w-full p-2 bg-white/10 rounded text-white font-semibold hover:bg-white/20 transition-colors"
        onClick={handleClearChat}
        disabled={loading}
        style={{ marginTop: '0.5rem' }}
      >
        Clear Chat
      </button>
    </div>
  );
}