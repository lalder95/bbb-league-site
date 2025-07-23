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
  activeTab, // <-- add this prop
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
    // Try to match user by display_name (case-insensitive)
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
    // If provided as a prop, use it
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
    // Add 1 to yearsRemaining, filter out contracts with yearsRemaining <= 0
    const filteredContracts = contracts.map(p => {
      let yearsRemaining = null;
      const currentYear = new Date().getFullYear();
      if (p.contractFinalYear && !isNaN(Number(p.contractFinalYear))) {
        yearsRemaining = Number(p.contractFinalYear) - currentYear + 1;
        if (yearsRemaining < 0) yearsRemaining = 0;
      }
      return { ...p, yearsRemaining };
    }).filter(p => p.yearsRemaining === null || p.yearsRemaining > 0);
    // Calculate total salary for this team
    const totalSalary = filteredContracts.reduce((sum, p) => sum + (parseFloat(p.curYear) || 0), 0);
    return `--- ${isUser ? 'USER TEAM: ' : ''}${team} (Total Salary: $${totalSalary.toFixed(1)}) ---\n` + filteredContracts.map(p => {
      return `${p.playerName} (${p.position}), $${p.curYear}, KTC: ${p.ktcValue}, Age: ${p.age}, Years Left: ${p.yearsRemaining ?? '-'}, ${p.status}`;
    }).join('\n');
  }).join('\n\n');

  // Memoize systemPrompt so it only changes when its dependencies change
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

  // Use a stable chat key based only on user/team identity
  const chatKey = `assistantGMChat_${session?.user?.name || 'guest'}`;

  // Only clear chat if chatKey changes (not systemPrompt)
  const [messages, setMessages] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(chatKey);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  // Save chat to localStorage when messages change
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(chatKey, JSON.stringify(messages));
    }
  }, [messages, chatKey]);

  // Do not auto-reset chat when systemPrompt changes; only reset on Clear Chat
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    const userMsg = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput(''); // <-- Clear input immediately

    let data;
    try {
      const res = await fetch('/api/assistant-gm-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const text = await res.text();
      data = JSON.parse(text);
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: 'Error: Could not parse response from server.' }]);
      setLoading(false);
      return;
    }
    setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    setLoading(false);
  }

  // Helper: Format assistant message (bold **text** and split numbered lists)
  function formatAssistantMessage(content) {
    // Bold **text**
    let formatted = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Try to match all numbered items (e.g., 1. text, 2. text, ...)
    const numberedRegex = /(?:^|\n)(\d+\.[\s\S]*?)(?=(?:\n\d+\.|$))/g;
    const matches = [];
    let match;
    while ((match = numberedRegex.exec(formatted)) !== null) {
      matches.push(match[1].trim());
    }
    if (matches.length > 1) {
      return matches;
    }
    // Otherwise, split on line breaks for readability
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

  // --- Add this ref and effect for auto-scroll ---
  const messagesEndRef = useRef(null);
  const chatBoxRef = useRef(null);

  useEffect(() => {
    if (activeTab !== 'Assistant GM') return;
    const chatBox = chatBoxRef.current;
    if (chatBox) {
      // Always scroll to the bottom of the chat box, but only affect the chat box
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }, [messages, activeTab]);
  // ------------------------------------------------

  return (
    <div className="bg-black/20 rounded-lg p-4 flex flex-col" style={{height:'100%', minHeight:'38rem', maxHeight:'56rem'}}>
      <div
        ref={chatBoxRef}
        className="flex-1 min-h-0 overflow-y-auto bg-black/10 rounded p-2 mb-2"
        style={{maxHeight:'34rem'}}
      >
        {messages.filter(m => m.role !== 'system').flatMap((msg, i) => {
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
        {/* --- Add this div for scroll target --- */}
        <div ref={messagesEndRef} />
      </div>
      {/* --- Update form className for responsive layout --- */}
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