'use client';

import {
  avatarUrl,
  buildDivisionMap,
  buildReportData,
  formatPercent,
  formatPoints,
  formatSlotLabel,
  isDivisionOpponent,
  number,
} from './teamReportCardData';

const COLORS = {
  page: [7, 23, 37],
  panel: [10, 29, 43],
  panel2: [12, 34, 51],
  dark: [3, 17, 28],
  line: [45, 65, 80],
  white: [245, 248, 250],
  muted: [151, 163, 175],
  faint: [104, 118, 132],
  orange: [255, 75, 31],
  orangeSoft: [255, 156, 131],
  green: [110, 231, 183],
  lime: [190, 242, 100],
  amber: [252, 211, 77],
  orangeGrade: [253, 186, 116],
  red: [252, 165, 165],
  sky: [125, 211, 252],
  purple: [196, 181, 253],
  blue: [125, 211, 252],
};

function pdfSafeText(value) {
  return String(value ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF\uFE0E\uFE0F]/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{1FC00}-\u{1FFFF}]/gu, '')
    .replace(/[–—−]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function formatPdfTimestamp(date = new Date()) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function setFill(doc, color) {
  doc.setFillColor(...color);
}

function setDraw(doc, color) {
  doc.setDrawColor(...color);
}

function setText(doc, color) {
  doc.setTextColor(...color);
}

function panel(doc, x, y, w, h, { fill = COLORS.panel, border = COLORS.line, radius = 7 } = {}) {
  setFill(doc, fill);
  setDraw(doc, border);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, w, h, radius, radius, 'FD');
}

function text(doc, value, x, y, {
  size = 10,
  color = COLORS.white,
  style = 'normal',
  align = 'left',
  maxWidth,
  lineHeightFactor = 1.15,
} = {}) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  setText(doc, color);
  const raw = Array.isArray(value) ? value.map((item) => pdfSafeText(item)) : pdfSafeText(value);
  const content = Array.isArray(raw) ? raw : (maxWidth ? doc.splitTextToSize(raw, maxWidth) : raw);
  doc.text(content, x, y, { align, lineHeightFactor });
  return Array.isArray(content) ? content.length : 1;
}

function gradeRgb(grade = '') {
  if (String(grade).startsWith('A')) return COLORS.green;
  if (String(grade).startsWith('B')) return COLORS.lime;
  if (String(grade).startsWith('C')) return COLORS.amber;
  if (String(grade).startsWith('D')) return COLORS.orangeGrade;
  return COLORS.red;
}

function safeName(value, fallback = 'Team') {
  const str = String(value || fallback).trim();
  return str || fallback;
}

function teamName(team) {
  const fallback = `Team ${team?.rosterId || ''}`.trim() || 'Team';
  const raw = safeName(team?.teamName || team?.displayName || team?.userName, fallback);
  return pdfSafeText(raw) || fallback;
}

function userName(team) {
  const raw = pdfSafeText(safeName(team?.userName || team?.displayName || team?.teamName, 'team')) || 'team';
  return raw.startsWith('@') ? raw : `@${raw}`;
}

function sanitizeFilename(value) {
  return String(value || 'season-simulator')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'season-simulator';
}

function dataUrlFromArrayBuffer(buffer, mimeType) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return `data:${mimeType || 'image/png'};base64,${btoa(binary)}`;
}

async function fetchImageData(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) return null;
    const buffer = await response.arrayBuffer();
    return dataUrlFromArrayBuffer(buffer, contentType);
  } catch {
    return null;
  }
}

async function buildAvatarCache(teams = [], onProgress) {
  const cache = new Map();
  const withAvatars = teams.filter((team) => avatarUrl(team?.avatar));
  const concurrency = Math.min(4, Math.max(1, withAvatars.length));
  let nextIndex = 0;
  let complete = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= withAvatars.length) return;
      const team = withAvatars[index];
      const url = avatarUrl(team?.avatar);
      const data = await fetchImageData(url);
      if (data) cache.set(String(team.rosterId), data);
      complete += 1;
      onProgress?.({ phase: 'avatars', current: complete, total: Math.max(1, withAvatars.length), label: 'Loading team avatars' });
    }
  }

  if (withAvatars.length) {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }
  return cache;
}

function drawAvatar(doc, team, avatarCache, x, y, size = 42) {
  const image = avatarCache?.get(String(team?.rosterId));
  setFill(doc, COLORS.dark);
  setDraw(doc, COLORS.line);
  doc.roundedRect(x, y, size, size, 8, 8, 'FD');
  if (image) {
    try {
      doc.addImage(image, undefined, x + 2, y + 2, size - 4, size - 4, undefined, 'FAST');
      return;
    } catch {
      // Fall through to initials.
    }
  }
  const initial = safeName(team?.userName || team?.teamName || team?.displayName, '?').slice(0, 1).toUpperCase();
  text(doc, initial, x + size / 2, y + size * 0.67, { size: size * 0.43, style: 'bold', align: 'center', color: COLORS.muted });
}

function drawGradeCard(doc, x, y, w, h, label, grade, value, { accent = null } = {}) {
  panel(doc, x, y, w, h, { fill: COLORS.dark, border: accent || COLORS.line, radius: 6 });
  text(doc, String(label || '').toUpperCase(), x + 8, y + 13, { size: 7.4, style: 'bold', color: COLORS.faint, maxWidth: w - 16 });
  const hasValue = pdfSafeText(value).length > 0;
  text(doc, grade || '-', x + 8, y + (hasValue ? 37 : 43), { size: 22, style: 'bold', color: gradeRgb(grade) });
  if (hasValue) text(doc, value, x + 8, y + h - 8, { size: 7.8, style: 'bold', color: COLORS.muted, maxWidth: w - 16 });
}

function drawOutcomeCard(doc, x, y, w, h, label, value, grade, tone = COLORS.orange) {
  panel(doc, x, y, w, h, { fill: COLORS.dark, border: COLORS.line, radius: 6 });
  text(doc, String(label || '').toUpperCase(), x + 7, y + 13, { size: 6.1, style: 'bold', color: COLORS.muted });
  text(doc, grade || '-', x + w - 7, y + 15, { size: 11.5, style: 'bold', align: 'right', color: gradeRgb(grade) });
  text(doc, value, x + w / 2, y + 42, { size: 14.5, style: 'bold', align: 'center', color: COLORS.white });
  setFill(doc, COLORS.line);
  doc.roundedRect(x + 8, y + h - 13, w - 16, 4, 2, 2, 'F');
  const percent = Math.max(0, Math.min(100, number(String(value).replace('%', ''))));
  setFill(doc, tone);
  doc.roundedRect(x + 8, y + h - 13, Math.max(2, (w - 16) * (percent / 100)), 4, 2, 2, 'F');
}

function drawSectionTitle(doc, numberLabel, title, x, y, note, maxWidth = 400) {
  setDraw(doc, COLORS.orange);
  doc.setLineWidth(1);
  doc.circle(x + 7, y - 3, 7, 'S');
  text(doc, numberLabel, x + 7, y, { size: 7.5, style: 'bold', align: 'center', color: COLORS.orangeSoft });
  text(doc, title, x + 19, y, { size: 11, style: 'bold', color: COLORS.white });
  if (note) text(doc, note, x + 19, y + 12, { size: 7.3, color: COLORS.faint, maxWidth });
}

function drawBulletList(doc, items, x, y, width, color, { maxItems = 4, lineGap = 3 } = {}) {
  let cursor = y;
  for (const item of (items || []).slice(0, maxItems)) {
    const lines = doc.splitTextToSize(pdfSafeText(item), Math.max(30, width - 14));
    setFill(doc, color);
    doc.circle(x + 3, cursor - 2, 1.6, 'F');
    text(doc, lines, x + 10, cursor, { size: 8, color: COLORS.muted, lineHeightFactor: 1.12 });
    cursor += lines.length * 9 + lineGap;
  }
}

function getHeadToHeadRows(team, teams, divisionMap) {
  return (team?.headToHead || [])
    .map((row) => ({
      ...row,
      opponent: teams.find((candidate) => String(candidate.rosterId) === String(row.opponentRosterId)),
    }))
    .filter((row) => row.opponent)
    .map((row) => ({
      ...row,
      divisionOpponent: isDivisionOpponent(row.opponentRosterId, team.rosterId, divisionMap),
    }))
    .sort((left, right) => number(right.winOdds) - number(left.winOdds));
}

function drawPdfHeader(doc, leagueName, subtitle) {
  setFill(doc, COLORS.page);
  doc.rect(0, 0, 792, 612, 'F');
  text(doc, leagueName, 24, 30, { size: 10, style: 'bold', color: COLORS.orangeSoft, maxWidth: 500 });
  text(doc, 'SEASON SIMULATOR REPORT', 24, 51, { size: 22, style: 'bold', color: COLORS.white });
  text(doc, subtitle, 24, 67, { size: 8.5, color: COLORS.muted, maxWidth: 620 });
}

function drawSummaryPage(doc, context) {
  const { teams, reportData, divisionMap, leagueName, season, currentWeek, simulations, startMode } = context;
  drawPdfHeader(
    doc,
    leagueName,
    `${season || ''} season | Week ${currentWeek || '-'} | ${Number(simulations || 0).toLocaleString()} simulated seasons | ${startMode === 'full' ? 'Full-season rerun' : 'From current week'}`
  );

  const byChamp = [...teams].sort((a, b) => number(b.championshipOdds) - number(a.championshipOdds));
  const byPlayoff = [...teams].sort((a, b) => number(b.playoffOdds) - number(a.playoffOdds));
  const byScore = [...teams].sort((a, b) => number(b.averageWeeklyScore ?? b.avgPointsFor) - number(a.averageWeeklyScore ?? a.avgPointsFor));
  const byPick = [...teams].sort((a, b) => number(b.firstPickOdds) - number(a.firstPickOdds));
  const cards = [
    ['Title favorite', teamName(byChamp[0]), formatPercent(byChamp[0]?.championshipOdds)],
    ['Safest playoffs', teamName(byPlayoff[0]), formatPercent(byPlayoff[0]?.playoffOdds)],
    ['Scoring leader', teamName(byScore[0]), formatPoints(byScore[0]?.averageWeeklyScore ?? byScore[0]?.avgPointsFor)],
    ['Highest #1 pick odds', teamName(byPick[0]), formatPercent(byPick[0]?.firstPickOdds)],
  ];

  const cardY = 84;
  const gap = 10;
  const cardW = (744 - gap * 3) / 4;
  cards.forEach((row, index) => {
    const x = 24 + index * (cardW + gap);
    panel(doc, x, cardY, cardW, 62, { fill: COLORS.panel, border: COLORS.line });
    text(doc, row[0].toUpperCase(), x + 9, cardY + 14, { size: 7.2, style: 'bold', color: COLORS.faint });
    text(doc, row[1], x + 9, cardY + 34, { size: 10.5, style: 'bold', color: COLORS.white, maxWidth: cardW - 18 });
    text(doc, row[2], x + 9, cardY + 52, { size: 13, style: 'bold', color: COLORS.orangeSoft });
  });

  text(doc, 'Overall league report cards', 24, 171, { size: 14, style: 'bold', color: COLORS.white });
  text(doc, 'Overall grade measures team quality: 50% starters, 20% replacement depth, 20% scoring margin, 10% scoring consistency.', 24, 184, { size: 7.5, color: COLORS.faint, maxWidth: 744 });

  const rows = reportData.rankings.get('overall') || [];
  const tableX = 24;
  const tableY = 198;
  const rowH = Math.min(25, Math.max(17, 325 / Math.max(1, rows.length)));
  const cols = [
    ['#', 28], ['Team', 176], ['Div', 40], ['Grade', 48], ['Weekly', 69], ['Margin', 69], ['Playoffs', 70], ['Title', 65], ['#1 Pick', 65], ['Volatility', 72],
  ];
  const totalW = cols.reduce((sum, col) => sum + col[1], 0);

  setFill(doc, COLORS.dark);
  setDraw(doc, COLORS.line);
  doc.roundedRect(tableX, tableY, totalW, rowH, 5, 5, 'FD');
  let cx = tableX;
  cols.forEach(([label, width], index) => {
    text(doc, label.toUpperCase(), cx + (index === 1 ? 7 : width / 2), tableY + rowH * 0.67, {
      size: 7,
      style: 'bold',
      color: COLORS.muted,
      align: index === 1 ? 'left' : 'center',
    });
    cx += width;
  });

  rows.forEach((row, index) => {
    const y = tableY + rowH * (index + 1);
    const fill = index % 2 === 0 ? COLORS.panel : COLORS.panel2;
    setFill(doc, fill);
    setDraw(doc, COLORS.line);
    doc.rect(tableX, y, totalW, rowH, 'FD');
    const t = row.team;
    const report = reportData.reports.get(String(t.rosterId));
    const division = divisionMap.get(String(t.rosterId)) ?? '-';
    const values = [
      String(row.rank),
      teamName(t),
      String(division),
      row.grade,
      formatPoints(t.averageWeeklyScore ?? t.avgPointsFor),
      formatPoints(t.averageWeeklyMargin ?? t.avgMargin, true),
      formatPercent(t.playoffOdds),
      formatPercent(t.championshipOdds),
      formatPercent(t.firstPickOdds),
      `${number(t.scoringVolatility ?? t.pointsForVolatility).toFixed(1)} SD`,
    ];
    let x = tableX;
    cols.forEach(([_, width], colIndex) => {
      const isTeam = colIndex === 1;
      const isGrade = colIndex === 3;
      text(doc, values[colIndex], x + (isTeam ? 7 : width / 2), y + rowH * 0.67, {
        size: isTeam ? 7.6 : 7.2,
        style: isGrade || isTeam ? 'bold' : 'normal',
        color: isGrade ? gradeRgb(report?.overall?.grade || row.grade) : COLORS.white,
        align: isTeam ? 'left' : 'center',
        maxWidth: isTeam ? width - 12 : undefined,
      });
      x += width;
    });
  });

  panel(doc, 24, 542, 744, 34, { fill: COLORS.dark, border: COLORS.line });
  text(doc, 'Grade curve', 34, 557, { size: 7.4, style: 'bold', color: COLORS.orangeSoft });
  text(doc, 'A+ = league best | F = lowest | C = league average. #1-pick odds reward higher odds; scoring consistency rewards lower weekly standard deviation.', 100, 557, { size: 7.2, color: COLORS.muted, maxWidth: 655 });
  text(doc, 'Each following page is one complete team report card.', 34, 569, { size: 7.2, color: COLORS.faint });
}

function drawTeamPage(doc, context, team, avatarCache) {
  const { teams, reportData, divisionMap, leagueName, simulations } = context;
  const report = reportData.reports.get(String(team.rosterId));
  if (!report) return;

  setFill(doc, COLORS.page);
  doc.rect(0, 0, 792, 612, 'F');

  text(doc, leagueName, 24, 24, { size: 8.5, style: 'bold', color: COLORS.orangeSoft, maxWidth: 500 });
  text(doc, 'TEAM REPORT CARD', 24, 42, { size: 19, style: 'bold', color: COLORS.white });
  text(doc, 'Grades are curved against the entire league.', 24, 55, { size: 7.5, color: COLORS.faint });

  drawAvatar(doc, team, avatarCache, 24, 66, 48);
  text(doc, userName(team), 82, 83, { size: 9.5, style: 'bold', color: COLORS.muted });
  text(doc, teamName(team), 82, 104, { size: 18, style: 'bold', color: COLORS.white, maxWidth: 390 });
  const division = divisionMap.get(String(team.rosterId));
  if (division !== undefined) {
    panel(doc, 82, 111, 67, 18, { fill: [11, 40, 58], border: COLORS.sky, radius: 7 });
    text(doc, `DIVISION ${division}`, 115.5, 123, { size: 6.8, style: 'bold', color: COLORS.sky, align: 'center' });
  }

  drawGradeCard(doc, 526, 66, 112, 63, 'Overall Grade', report.overall?.grade, `#${report.overall?.rank || '-'} in league`, { accent: COLORS.orange });
  drawGradeCard(doc, 650, 66, 118, 63, 'Scoring Margin', report.margin?.grade, formatPoints(report.margin?.value, true), { accent: COLORS.green });

  const starterY = 146;
  drawSectionTitle(doc, '1', 'Starter Slot Grades', 24, starterY, 'Average simulated weekly score from each starting lineup slot.', 520);
  const starterCardsY = starterY + 20;
  const starterGap = 6;
  const starterCount = Math.max(1, report.slots.length);
  const starterW = (744 - starterGap * (starterCount - 1)) / starterCount;
  report.slots.forEach((slot, index) => {
    drawGradeCard(
      doc,
      24 + index * (starterW + starterGap),
      starterCardsY,
      starterW,
      55,
      formatSlotLabel(slot.slot),
      slot.grade,
      formatPoints(slot.value)
    );
  });

  const depthY = 246;
  drawSectionTitle(doc, '2', 'Depth Grades', 24, depthY, 'Replacement value: best reserve QB/TE and best two reserve RBs/WRs.', 500);
  const depthCardsY = depthY + 20;
  const depthGap = 7;
  const depthW = (744 - depthGap * 4) / 5;
  report.depth.forEach((depth, index) => {
    drawGradeCard(
      doc,
      24 + index * (depthW + depthGap),
      depthCardsY,
      depthW,
      55,
      depth.position === 'BENCH' ? 'Overall Bench' : `${depth.position} Depth`,
      depth.grade,
      ''
    );
  });

  const lowerY = 337;
  const col1X = 24;
  const col1W = 236;
  const col2X = 272;
  const col2W = 284;
  const col3X = 568;
  const col3W = 200;
  const lowerH = 224;

  panel(doc, col1X, lowerY, col1W, 105, { fill: [8, 40, 42], border: [39, 112, 92] });
  text(doc, 'STRENGTHS', col1X + 12, lowerY + 18, { size: 10, style: 'bold', color: COLORS.green });
  drawBulletList(doc, team.strengths || [], col1X + 12, lowerY + 36, col1W - 24, COLORS.green, { maxItems: 4, lineGap: 1 });

  panel(doc, col1X, lowerY + 117, col1W, 107, { fill: [45, 29, 22], border: [135, 73, 44] });
  text(doc, 'WEAKNESSES', col1X + 12, lowerY + 135, { size: 10, style: 'bold', color: COLORS.orangeGrade });
  drawBulletList(doc, team.weaknesses || [], col1X + 12, lowerY + 153, col1W - 24, COLORS.orangeGrade, { maxItems: 4, lineGap: 1 });

  panel(doc, col2X, lowerY, col2W, lowerH, { fill: COLORS.panel, border: COLORS.line });
  text(doc, 'HEAD-TO-HEAD WIN ODDS', col2X + 12, lowerY + 18, { size: 10, style: 'bold', color: COLORS.white });
  text(doc, `League H2H grade: ${report.h2hPower?.grade || '-'}`, col2X + col2W - 12, lowerY + 18, { size: 8, style: 'bold', align: 'right', color: gradeRgb(report.h2hPower?.grade) });
  const h2hRows = getHeadToHeadRows(team, teams, divisionMap);
  if (division !== undefined) text(doc, 'Blue highlight = division opponent', col2X + 12, lowerY + 32, { size: 6.8, color: COLORS.sky });
  const rowsY = lowerY + 53;
  const availableH = lowerH - 64;
  const rowH = Math.min(16, availableH / Math.max(1, h2hRows.length));
  h2hRows.forEach((row, index) => {
    const y = rowsY + index * rowH;
    if (row.divisionOpponent) {
      setFill(doc, [11, 40, 58]);
      setDraw(doc, COLORS.sky);
      doc.roundedRect(col2X + 8, y - 10, col2W - 16, Math.max(12, rowH - 1), 3, 3, 'FD');
    }
    text(doc, teamName(row.opponent), col2X + 14, y, { size: 6.9, style: row.divisionOpponent ? 'bold' : 'normal', color: row.divisionOpponent ? COLORS.sky : COLORS.muted, maxWidth: 130 });
    const barX = col2X + 151;
    const barW = 85;
    setFill(doc, COLORS.line);
    doc.roundedRect(barX, y - 5, barW, 4, 2, 2, 'F');
    setFill(doc, row.divisionOpponent ? COLORS.sky : COLORS.orange);
    doc.roundedRect(barX, y - 5, Math.max(2, barW * Math.max(0, Math.min(100, number(row.winOdds))) / 100), 4, 2, 2, 'F');
    text(doc, formatPercent(row.winOdds), col2X + col2W - 13, y, { size: 7, style: 'bold', align: 'right', color: row.divisionOpponent ? COLORS.sky : COLORS.white });
  });

  panel(doc, col3X, lowerY, col3W, 121, { fill: COLORS.panel, border: COLORS.line });
  text(doc, 'ODDS SNAPSHOT', col3X + 12, lowerY + 18, { size: 10, style: 'bold', color: COLORS.white });
  const oddsGap = 6;
  const oddsW = (col3W - 24 - oddsGap * 2) / 3;
  drawOutcomeCard(doc, col3X + 10, lowerY + 28, oddsW, 81, 'Playoff', formatPercent(team.playoffOdds), report.playoffs?.grade, COLORS.blue);
  drawOutcomeCard(doc, col3X + 10 + oddsW + oddsGap, lowerY + 28, oddsW, 81, 'Title', formatPercent(team.championshipOdds), report.championship?.grade, COLORS.purple);
  drawOutcomeCard(doc, col3X + 10 + (oddsW + oddsGap) * 2, lowerY + 28, oddsW, 81, '#1 Pick', formatPercent(team.firstPickOdds), report.firstPick?.grade, COLORS.orange);

  panel(doc, col3X, lowerY + 133, col3W, 91, { fill: COLORS.panel, border: COLORS.line });
  text(doc, 'SCORING VOLATILITY', col3X + 12, lowerY + 151, { size: 10, style: 'bold', color: COLORS.white });
  text(doc, report.volatility?.grade || '-', col3X + 12, lowerY + 184, { size: 28, style: 'bold', color: gradeRgb(report.volatility?.grade) });
  text(doc, `${number(team.scoringVolatility ?? team.pointsForVolatility).toFixed(1)} SD`, col3X + 67, lowerY + 180, { size: 14, style: 'bold', color: COLORS.white });
  text(doc, `Consistency rank #${report.volatility?.rank || '-'} of ${teams.length}`, col3X + 67, lowerY + 194, { size: 7.4, color: COLORS.muted });
  text(doc, 'Lower weekly standard deviation earns the stronger grade.', col3X + 12, lowerY + 211, { size: 6.8, color: COLORS.faint, maxWidth: col3W - 24 });

  text(doc, `Based on ${Number(simulations || 0).toLocaleString()} simulated seasons.`, 24, 586, { size: 6.8, color: COLORS.faint });
}

function addPageNumbers(doc, leagueName, generatedAtLabel) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    text(doc, `Generated ${generatedAtLabel}`, 768, 24, { size: 6.4, color: COLORS.faint, align: 'right' });
    setDraw(doc, COLORS.line);
    doc.setLineWidth(0.4);
    doc.line(24, 596, 768, 596);
    text(doc, `${leagueName} - Season Simulator`, 24, 606, { size: 6.4, color: COLORS.faint });
    text(doc, `Page ${page} of ${total}`, 768, 606, { size: 6.4, color: COLORS.faint, align: 'right' });
  }
}

export async function exportSeasonSimulatorPdf({
  leagueInfo,
  result,
  teams = [],
  rosters = [],
  slotLabels = [],
  startMode,
  onProgress,
}) {
  if (!Array.isArray(teams) || !teams.length) {
    throw new Error('No simulation results are available to export.');
  }

  onProgress?.({ phase: 'prepare', current: 0, total: teams.length + 1, label: 'Preparing PDF export' });
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'letter',
    compress: true,
    putOnlyUsedFonts: true,
  });

  const leagueName = safeName(result?.leagueName || leagueInfo?.leagueName, 'Fantasy Football League');
  const generatedAtLabel = formatPdfTimestamp(new Date());
  const reportData = buildReportData(teams, slotLabels);
  const divisionMap = buildDivisionMap(teams, rosters);
  const context = {
    teams,
    rosters,
    reportData,
    divisionMap,
    leagueName,
    season: result?.season || leagueInfo?.season,
    currentWeek: result?.currentWeek || leagueInfo?.currentWeek,
    simulations: result?.simulations || 0,
    startMode: result?.startMode || startMode,
  };

  const avatarCache = await buildAvatarCache(teams, onProgress);

  drawSummaryPage(doc, context);
  onProgress?.({ phase: 'pages', current: 1, total: teams.length + 1, label: 'Building league summary' });

  const orderedTeams = (reportData.rankings.get('overall') || []).map((row) => row.team);
  for (let index = 0; index < orderedTeams.length; index += 1) {
    doc.addPage('letter', 'landscape');
    drawTeamPage(doc, context, orderedTeams[index], avatarCache);
    onProgress?.({
      phase: 'pages',
      current: index + 2,
      total: orderedTeams.length + 1,
      label: `Building ${teamName(orderedTeams[index])}`,
    });
    // Yield so the browser can repaint the export progress indicator.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  addPageNumbers(doc, leagueName, generatedAtLabel);
  doc.setProperties({
    title: `${pdfSafeText(leagueName)} Season Simulator Report`,
    subject: 'Season simulation summary and team report cards',
    author: 'Budget Bowl Fantasy',
    creator: 'Budget Bowl Fantasy',
    keywords: 'fantasy football, season simulator, report card',
  });

  const date = new Date().toISOString().split('T')[0];
  const filename = `${sanitizeFilename(leagueName)}-season-simulator-${date}.pdf`;
  onProgress?.({ phase: 'save', current: orderedTeams.length + 1, total: orderedTeams.length + 1, label: 'Saving PDF' });
  doc.save(filename);
  return filename;
}
