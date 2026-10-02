import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getServerSession } from 'next-auth/next';
import { getAssistantGMSettings } from '@/lib/db-helpers';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  evaluateAssistantGMTrade,
  getAssistantGMTeamSnapshot,
  getAssistantGMUserTeamSnapshot,
  searchAssistantGMAssets,
} from '@/lib/assistant-gm/trade-evaluator';

// Force Node.js runtime to ensure OpenAI SDK compatibility in production
export const runtime = 'nodejs';

const DEFAULT_ASSISTANT_GM_MODEL = 'gpt-6.1-sol';

const BASE_SYSTEM_PROMPT = `You are the Budget Blitz Bowl Assistant GM. Give concise, practical fantasy-football advice.

You have tools to retrieve live league information. Before giving roster, player-contract, cap-space, draft-pick ownership, or trade advice, retrieve the relevant facts yourself. Do not ask the manager to re-enter their roster, cap space, or assets. Only ask a short clarification when the requested team, player, destination, or trade terms are genuinely ambiguous.

Verified trade evaluations are the source of truth for multi-team salary-cap math, draft-pick ownership, player ownership, KTC, and Budget Value. Never invent those facts.

When the manager proposes a complete trade, or when you recommend a concrete trade offer, resolve every referenced asset and call evaluate_trade before offering an opinion. That call renders the verified trade card and Trade Calculator link for the manager. Do not merely describe a proposed trade in text when it can be evaluated. Never output a Trade Calculator URL or Markdown link yourself; the verified card owns that link.

Use the league's $300 cap and four-year planning horizon. Distinguish a trade that is invalid now from a future cap warning. Keep answers short and conversational. Never use Markdown tables or pipe-delimited rows. Use short headings and bullets instead.`;

function normalizeMessages(messages) {
  const conversation = Array.isArray(messages)
    ? messages.filter((message) => message?.role === 'user' || message?.role === 'assistant')
    : [];
  return conversation.slice(-12).map(({ role, content }) => ({ role, content: String(content || '').slice(0, 12000) }));
}

function isTradeCardRequest(messages) {
  const latestUserMessage = [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) => message?.role === 'user')?.content;
  const text = String(latestUserMessage || '').toLowerCase();
  return /(?:trade\s*(?:card|link|calculator)|calculator\s*(?:proposal|link|trade)|\b(?:proposal|offer)\b)/.test(text);
}

function buildManagerSettingsContext(managerSettings) {
  const teamState = typeof managerSettings?.teamState === 'string'
    ? managerSettings.teamState.trim().slice(0, 80)
    : '';
  const assetPriority = Array.isArray(managerSettings?.assetPriority)
    ? managerSettings.assetPriority
      .filter((asset) => typeof asset === 'string' && asset.trim())
      .slice(0, 8)
      .map((asset) => asset.trim().slice(0, 40))
    : [];
  const strategyNotes = typeof managerSettings?.strategyNotes === 'string'
    ? managerSettings.strategyNotes.trim().slice(0, 2000)
    : '';

  if (!teamState && !assetPriority.length && !strategyNotes) return '';

  return `MANAGER PREFERENCES (guidance, not league facts)\nTeam state: ${teamState || 'Not specified'}\nAsset priority, highest to lowest: ${assetPriority.join(' > ') || 'Not specified'}\nStrategy notes: ${strategyNotes || 'None provided'}\nUse these preferences to frame recommendations, while retrieving live league facts with tools.`;
}

const ASSISTANT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_my_team_snapshot',
      description: 'Retrieve the authenticated manager\'s live roster, owned picks, and four-year cap ledger.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_team_snapshot',
      description: 'Retrieve a specific BBB team\'s live roster, owned picks, and four-year cap ledger.',
      parameters: {
        type: 'object',
        properties: { teamName: { type: 'string', description: 'BBB manager or team display name.' } },
        required: ['teamName'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_league_assets',
      description: 'Find active or future contracted players by name, optionally restricted to a BBB team. Returns ownership and contract details.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Player name or partial player name.' },
          teamName: { type: 'string', description: 'Optional BBB manager or team display name.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'evaluate_trade',
      description: 'Validate a fully specified proposed trade. Use after resolving player IDs and pick ownership. This returns the authoritative cap result and a Trade Calculator link; calling it creates the verified trade card in the UI.',
      parameters: {
        type: 'object',
        properties: {
          participants: {
            type: 'array',
            minItems: 2,
            items: {
              type: 'object',
              properties: {
                team: { type: 'string' },
                assets: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      k: { type: 'string', enum: ['pl', 'pk'], description: 'pl for player; pk for draft pick.' },
                      i: { type: 'string', description: 'Required player ID when k is pl.' },
                      s: { type: 'string', description: 'Required pick season when k is pk.' },
                      r: { type: 'number', description: 'Required pick round when k is pk.' },
                      o: { type: 'string', description: 'Required original team when k is pk.' },
                      d: { type: 'string', description: 'Receiving team.' },
                    },
                    required: ['k', 'd'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['team', 'assets'],
              additionalProperties: false,
            },
          },
        },
        required: ['participants'],
        additionalProperties: false,
      },
    },
  },
];

const RESPONSE_TOOLS = ASSISTANT_TOOLS.map(({ function: definition }) => ({
  type: 'function',
  ...definition,
}));

async function executeToolCall(toolCall, session) {
  let args = {};
  try {
    args = JSON.parse(toolCall?.arguments || toolCall?.function?.arguments || '{}');
  } catch {
    return { error: 'Tool arguments were not valid JSON.' };
  }

  switch (toolCall?.name || toolCall?.function?.name) {
    case 'get_my_team_snapshot':
      return getAssistantGMUserTeamSnapshot({ sleeperId: session.user.sleeperId });
    case 'get_team_snapshot':
      return getAssistantGMTeamSnapshot({ teamName: args.teamName });
    case 'search_league_assets':
      return searchAssistantGMAssets(args);
    case 'evaluate_trade':
      return evaluateAssistantGMTrade({ participants: args.participants });
    default:
      return { error: `Unsupported tool: ${toolCall?.name || toolCall?.function?.name || 'unknown'}` };
  }
}

function buildEvaluationContext(evaluation) {
  if (!evaluation) return '';
  const capSummary = Object.entries(evaluation.impactsByTeam || {}).map(([team, impact]) => {
    const years = ['curYear', 'year2', 'year3', 'year4']
      .map((yearKey) => `${yearKey}: $${Number(impact?.after?.[yearKey]?.remaining || 0).toFixed(1)}`)
      .join(', ');
    return `${team}: ${years}`;
  }).join('\n');
  const assets = (evaluation.participants || []).map((participant) => `${participant.team} sends ${participant.assets.map((asset) => asset.playerName).join(', ') || 'nothing'}`).join('\n');
  return `VERIFIED TRADE EVALUATION\nValid: ${evaluation.valid}\nErrors: ${(evaluation.errors || []).map((entry) => entry.message).join(' | ') || 'None'}\nWarnings: ${(evaluation.warnings || []).map((entry) => `${entry.team} ${entry.yearKey}: $${Number(entry.remaining).toFixed(1)}`).join(' | ') || 'None'}\nAssets:\n${assets}\nCap after trade, including projected rookie obligations:\n${capSummary}\nTrade Calculator URL: ${evaluation.tradeUrl}`;
}

function createDebugTrace({ requestId, model, messages, evaluation, toolTranscript, response, exhaustedToolRounds, tradeCardRequested, startedAt }) {
  return {
    requestId,
    model,
    sentMessages: messages,
    evaluationIncluded: Boolean(evaluation),
    tradeCardRequested,
    evaluation,
    toolTranscript,
    terminalResponse: {
      id: response?.id || null,
      status: response?.status || null,
      outputTypes: (response?.output || []).map((item) => item?.type).filter(Boolean),
      exhaustedToolRounds,
    },
    durationMs: Date.now() - startedAt,
  };
}

export async function POST(request) {
  try {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const { messages, proposal, managerSettings, includeDebugTrace = false } = await request.json();
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Server misconfiguration: OPENAI_API_KEY missing' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const settingsResult = await getAssistantGMSettings();
    const model = settingsResult?.success
      ? settingsResult.settings?.model || DEFAULT_ASSISTANT_GM_MODEL
      : DEFAULT_ASSISTANT_GM_MODEL;
    let evaluation = proposal ? await evaluateAssistantGMTrade(proposal) : null;
    const managerSettingsContext = buildManagerSettingsContext(managerSettings);
    const tradeCardRequested = isTradeCardRequest(messages);
    const outboundMessages = [
      { role: 'developer', content: BASE_SYSTEM_PROMPT },
      ...(managerSettingsContext ? [{ role: 'developer', content: managerSettingsContext }] : []),
      ...(evaluation ? [{ role: 'developer', content: buildEvaluationContext(evaluation) }] : []),
      ...(tradeCardRequested && !evaluation ? [{ role: 'developer', content: 'The manager explicitly requested a concrete proposal or Trade Calculator card. Resolve the necessary assets with tools, call evaluate_trade, and do not claim that a proposal was created until that tool succeeds. The UI will display the resulting verified card and link.' }] : []),
      ...normalizeMessages(messages),
    ];
    const toolTranscript = [];
    let responseInput = [...outboundMessages];
    let response = null;
    let previousResponseId = null;
    let exhaustedToolRounds = true;

    for (let iteration = 0; iteration < 6; iteration += 1) {
      response = await openai.responses.create({
        model,
        input: responseInput,
        tools: RESPONSE_TOOLS,
        ...(tradeCardRequested && !evaluation ? { tool_choice: 'required' } : {}),
        max_output_tokens: 600,
        ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
      });
      const toolCalls = (response?.output || []).filter((item) => item?.type === 'function_call');
      if (!toolCalls.length) {
        exhaustedToolRounds = false;
        break;
      }

      const toolOutputs = [];
      for (const toolCall of toolCalls) {
        const result = await executeToolCall(toolCall, session);
        if (toolCall.name === 'evaluate_trade' && !result?.error) {
          evaluation = result;
        }
        toolTranscript.push({ id: toolCall.call_id, name: toolCall.name, arguments: toolCall.arguments, result });
        toolOutputs.push({ type: 'function_call_output', call_id: toolCall.call_id, output: JSON.stringify(result) });
      }
      responseInput = toolOutputs;
      previousResponseId = response.id;
    }

    const reply = response?.output_text || (exhaustedToolRounds
      ? 'I completed the available league lookups but need one more step to finish the recommendation. Please try that request again.'
      : 'I could not complete the requested league lookup.');
    const shouldIncludeDebugTrace = includeDebugTrace === true && session.user.role === 'admin';
    return NextResponse.json({
      reply,
      evaluation,
      requestId,
      ...(shouldIncludeDebugTrace ? {
        debugTrace: {
          ...createDebugTrace({ requestId, model, messages: outboundMessages, evaluation, toolTranscript, response, exhaustedToolRounds, tradeCardRequested, startedAt }),
          usage: response?.usage || null,
        },
      } : {}),
    });
  } catch (err) {
    const msg = (err && (err.message || String(err))) || 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}