// src/utils/mockDraftUtils.js

/**
 * Sample mock draft data
 * In a real application, this would be stored in a database
 */
export const sampleMockDrafts = [
    {
      id: '1',
      title: 'April 2025 Mock Draft Analysis',
      author: 'Commissioner',
      date: '2025-04-10',
      description: 'Looking ahead to the upcoming rookie draft with predictions and analysis.',
      content: `
  # 2025 BBB Mock Draft 1.0
  
  With the NFL Draft just weeks away, it's time to look at how our rookie draft might unfold. Based on team needs, pick positions, and the current NFL Draft projections, here's my prediction for the first round.
  
  ## Round 1
  
  ### 1.01 - Team Vikingsfan80
  **Projected Pick: Marvin Harrison Jr., WR, Ohio State**
  
  Vikingsfan80 needs a true WR1 to pair with J.J. McCarthy for the future. Harrison is the consensus top WR in this class and would immediately become a centerpiece for this rebuilding roster.
  
  ### 1.02 - Team aintEZBNwheezE
  **Projected Pick: Caleb Williams, QB, USC**
  
  With Jordan Love as the only established QB on the roster, aintEZBNwheezE needs to secure their QB room. Williams has the highest ceiling of any QB in this class and would be impossible to pass up here.
  
  ### 1.03 - Team DylanBears2022
  **Projected Pick: Malik Nabers, WR, LSU**
  
  DylanBears2022 has a solid team but could use another weapon at WR. Nabers would complement Tyreek Hill and eventually become the WR1 as Hill ages.
  
  ### 1.04 - Team Delusional1
  **Projected Pick: Brock Bowers, TE, Georgia**
  
  With Dallas Goedert aging, Delusional1 could use the best TE prospect in years. Bowers would give their roster the kind of positional advantage that's hard to find.
  
  ### 1.05 - Team Chewy2552
  **Projected Pick: Jayden Daniels, QB, LSU**
  
  Chewy2552 has an aging QB room and could use an infusion of youth. Daniels' dual-threat ability makes him a perfect fantasy QB with tremendous upside.
  
  ### 1.06 - Team tylercrain
  **Projected Pick: Rome Odunze, WR, Washington**
  
  Tylercrain has several aging WRs and needs to get younger at the position. Odunze's complete game would be a perfect fit alongside Tua Tagovailoa.
  
  ### 1.07 - Team Vikingsfan80
  **Projected Pick: Ollie Gordon II, RB, Oklahoma State**
  
  With their second first-round pick, Vikingsfan80 addresses RB by taking the first one off the board. Gordon's three-down skillset would give them a foundation piece.
  
  ### 1.08 - Team EthanL21
  **Projected Pick: Troy Franklin, WR, Oregon**
  
  EthanL21 could use more depth at WR, and Franklin's big-play ability would be a perfect complement to their existing roster construction.
  
  ### 1.09 - Team mlthomas5095
  **Projected Pick: Keon Coleman, WR, Florida State**
  
  Mlthomas5095 needs size at WR, and Coleman's contested-catch ability makes him a red zone threat from day one.
  
  ### 1.10 - Team jwalwer81
  **Projected Pick: Jonathon Brooks, RB, Texas**
  
  Jwalwer81 needs young RB talent, and Brooks has the three-down ability to be a fantasy difference-maker if his recovery from injury goes well.
  
  ### 1.11 - Team Schoontang
  **Projected Pick: Blake Corum, RB, Michigan**
  
  Schoontang could use more RB depth behind Bijan Robinson. Corum is a high-floor prospect who could contribute immediately.
  
  ### 1.12 - Team Henrypavlak3
  **Projected Pick: Brian Thomas Jr., WR, LSU**
  
  Henrypavlak3 closes out the first round by adding a vertical threat in Thomas to complement Chris Olave.
  
  ## Key Storylines to Watch
  
  1. **QB Market**: Will the QB-needy teams at the top of the draft get their targets, or will someone trade up?
  2. **RB Value**: With several teams needing RB help, will we see a run on the position in the late first?
  3. **Trade Activity**: Several teams have multiple picks in the first three rounds. Expect active trading as teams target specific players.
  
  Stay tuned for Mock Draft 2.0 after the NFL Draft when we'll have more clarity on landing spots!
  `,
      active: true
    },
    {
      id: '2',
      title: 'Post-NFL Draft Mock 2.0',
      author: 'Commissioner',
      date: '2025-04-25',
      description: 'Updated mock draft following the NFL Draft with landing spots factored in.',
      content: '',
      active: false
    }
  ];
  
  /**
   * Parse Markdown content for display
   * @param {string} markdown - The markdown content to parse
   * @param {Array} users - Users data from Sleeper API
   * @returns {string} HTML content
   */
  export const parseMarkdown = (markdown, users = []) => {
    if (!markdown) return '';
    
    let html = markdown;
  
    // First, let's escape any HTML in the content for security
    const escapeHtml = (unsafe) => {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
    
    html = escapeHtml(html);
  
    // Process lines to organize content and identify picks
    const lines = html.split('\n');
    const processedLines = [];
    let pickContent = [];
    let currentPickNumber = '';
    let currentTeamName = '';
    let currentPickProjection = '';
    let isFirstParagraph = true;
    let inRoundSection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Handle main title line that starts with #
      if (line.startsWith('# ')) {
        const titleText = line.substring(2).trim();
        processedLines.push(`<h1 class="text-2xl font-bold text-[#FF4B1F] mb-4 mt-6">${titleText}</h1>`);
        continue;
      }
      
      // Handle Round heading
      if (line.startsWith('## Round')) {
        // If a pick is currently being processed, finalize it BEFORE closing/opening round containers.
        // Otherwise the last pick of the previous round can get rendered under the next round.
        if ((currentPickNumber && currentTeamName) || pickContent.length > 0) {
          const pickHtml = processPick(currentPickNumber, currentTeamName, currentPickProjection, pickContent, users);
          processedLines.push(pickHtml);
          pickContent = [];
          currentPickNumber = '';
          currentTeamName = '';
          currentPickProjection = '';
        }
        if (inRoundSection) {
          // Close previous round section if open
          processedLines.push('</div>');
        }
        inRoundSection = true;
        processedLines.push(`<h2 class="text-xl font-bold text-white mb-4">${line.substring(3)}</h2>`);
        processedLines.push('<div class="picks-container">');
        continue;
      }
      
      // Handle pick heading (e.g., ### 1.01 - Team Vikingsfan80)
      if (line.startsWith('### ') && line.includes(' - Team ')) {
        // If we already have a pick being processed, finalize it
        if (pickContent.length > 0) {
          const pickHtml = processPick(currentPickNumber, currentTeamName, currentPickProjection, pickContent, users);
          processedLines.push(pickHtml);
          pickContent = [];
        }
        
        const parts = line.substring(4).split(' - Team ');
        currentPickNumber = parts[0].trim();
        currentTeamName = parts[1].trim();
        continue;
      }
      
      // Handle player projection after pick heading (e.g., **Projected Pick: Marvin Harrison Jr., WR, Ohio State**)
      if (line.startsWith('**Projected Pick:') && line.endsWith('**')) {
        currentPickProjection = line.substring(2, line.length - 2);
        continue;
      }
      
      // First paragraph after main heading (before any pick) should be an intro paragraph
      if (isFirstParagraph && line && !line.startsWith('#') && !line.startsWith('**') && processedLines.length > 0) {
        if (!line.trim()) continue; // Skip empty lines
        
        let paragraphContent = line;
        // Collect multi-line paragraph
        while (i + 1 < lines.length && lines[i + 1].trim() && !lines[i + 1].startsWith('#') && !lines[i + 1].startsWith('**')) {
          i++;
          paragraphContent += ' ' + lines[i].trim();
        }
        
        processedLines.push(`<p class="intro-paragraph">${paragraphContent}</p>`);
        isFirstParagraph = false;
        continue;
      }
      
      // If we're processing a pick, add the line to pick content
      if (currentPickNumber && currentTeamName) {
        // Skip empty lines at start of pick content
        if (pickContent.length === 0 && !line.trim()) continue;
        
        pickContent.push(line);
      } else if (line) {
        // Regular paragraph (not part of a pick or list)
        processedLines.push(`<p class="mb-3">${line}</p>`);
      }
    }
    
    // Close any open pick
    if (pickContent.length > 0) {
      const pickHtml = processPick(currentPickNumber, currentTeamName, currentPickProjection, pickContent, users);
      processedLines.push(pickHtml);
    }
    
    // Close any open sections
    if (inRoundSection) {
      processedLines.push('</div>');
    }
    
    html = processedLines.join('\n');
    
    // Process any remaining markdown within the HTML
    html = html
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    return html;
  };
  
  /**
   * Helper function to process a single draft pick
   */
  function processPick(pickNumber, teamName, projectionLine, contentLines, users = []) {
    let pickContent = contentLines.join(' ').trim();
    
    // Find user avatar based on username
    const teamUser = users.find(user => 
      user.display_name === teamName || 
      user.username === teamName || 
      (user.metadata && user.metadata.team_name === teamName)
    );
    
    const avatarHtml = teamUser && teamUser.avatar 
      ? `<img src="https://sleepercdn.com/avatars/thumbs/${teamUser.avatar}" alt="${teamName}" class="w-6 h-6 rounded-full mr-2" />`
      : `<div class="w-6 h-6 rounded-full bg-[#FF4B1F]/20 flex items-center justify-center mr-2 text-xs font-bold">${teamName.charAt(0)}</div>`;
    
    // Format the projection line to highlight position
    let formattedProjection = projectionLine;
    if (projectionLine.includes('Projected Pick:')) {
      // Extract player details
      const projectionText = projectionLine.replace('Projected Pick:', '').trim();
      const parts = projectionText.split(',').map(p => p.trim());
      
      if (parts.length >= 3) {
        const playerName = parts[0];
        const position = parts[1];
        const college = parts.slice(2).join(',');
        
        formattedProjection = `Projected Pick: <span class="player-name">${playerName}</span><span class="position">${position}</span><span class="college">${college}</span>`;
      }
    }
    
    return `
      <div class="pick-bubble">
        <div class="pick-number">
          <div class="flex items-center">
            ${avatarHtml}
            <div>
              <span class="text-[#FF4B1F]">${pickNumber}</span>
              <span class="team-name">Team ${teamName}</span>
            </div>
          </div>
        </div>
        <div class="player-projection">${formattedProjection}</div>
        <div class="pick-analysis">${pickContent}</div>
      </div>
    `;
  }
  
  /**
   * Get mock draft template for a new draft
   * @returns {string} Default template content
   */
  export const getNewDraftTemplate = () => {
    return `# 2025 BBB Mock Draft
  
  With the NFL Draft approaching, it's time to look at how our rookie draft might unfold. Based on team needs, pick positions, and current NFL Draft projections, here's my prediction for the first round.
  
  ## Round 1
  
  ### 1.01 - Team Vikingsfan80
  **Projected Pick: Marvin Harrison Jr., WR, Ohio State**
  
  Vikingsfan80 needs a true WR1 to pair with J.J. McCarthy for the future. Harrison is the consensus top WR in this class and would immediately become a centerpiece for this rebuilding roster.
  
  ### 1.02 - Team aintEZBNwheezE
  **Projected Pick: Caleb Williams, QB, USC**
  
  With Jordan Love as the only established QB on the roster, aintEZBNwheezE needs to secure their QB room. Williams has the highest ceiling of any QB in this class and would be impossible to pass up here.
  
  ### 1.03 - Team DylanBears2022
  **Projected Pick: [Player Name], [Position], [College]**
  
  Analysis goes here...
  `;
  };