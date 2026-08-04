/**
 * youtube_export — compile a full research report from a single video.
 *
 * Fetches video info, structured summary, and optionally comments in parallel,
 * then assembles a publication-ready Markdown document (or structured JSON).
 *
 * Markdown output is designed to be:
 *   - Saved as a .md file and shared with a team
 *   - Pasted into Notion / Obsidian / any markdown editor
 *   - Used as LLM context for deeper analysis
 *
 * If outputPath is provided the report is also written to disk.
 */

import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { getVideoInfo } from '../lib/innertube.js';
import { getTranscript, cleanTranscriptText } from '../lib/transcript.js';
import { handleComments } from './comments.js';
import { handleSummarize } from './summarize.js';

export const exportInputSchema = {
  videoId: z.string()
    .describe('YouTube video ID to export'),
  format: z.enum(['markdown', 'json']).optional()
    .describe('Output format — "markdown" (default, human-readable) or "json" (machine-readable)'),
  includeTranscript: z.boolean().optional()
    .describe('Append the full condensed transcript to the report (default: false — uses chapter summaries only)'),
  includeComments: z.boolean().optional()
    .describe('Include top 20 comments in the report (default: false)'),
  sentencesPerSection: z.number().min(1).max(15).optional()
    .describe('Key sentences to extract per chapter section (default: 4)'),
  outputPath: z.string().optional()
    .describe('If set, write the report to this file path in addition to returning it. E.g. "~/Desktop/video-report.md"'),
  language: z.string().optional()
    .describe('Transcript language (default: "en")'),
};

interface ExportArgs {
  videoId: string;
  format?: 'markdown' | 'json';
  includeTranscript?: boolean;
  includeComments?: boolean;
  sentencesPerSection?: number;
  outputPath?: string;
  language?: string;
}

function fmtTs(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escMd(s: string): string {
  return s.replace(/([_*[\]()~`>#+=|{}.!-])/g, '\\$1');
}

// ── Markdown builder ─────────────────────────────────────────────────────────

function buildMarkdown(data: Record<string, any>): string {
  const v = data.videoInfo;
  const s = data.summary;
  const comments: any[] = data.comments ?? [];
  const date = new Date().toISOString().slice(0, 10);
  const yt = `https://www.youtube.com/watch?v=${data.videoId}`;

  const lines: string[] = [];

  // ── Header ─────────────────────────────────────────────────────────────────
  lines.push(`# ${v.title}`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| **Channel** | ${escMd(v.channel)} |`);
  lines.push(`| **Published** | ${v.published || v.relativeDate || '—'} |`);
  lines.push(`| **Views** | ${v.views || '—'} |`);
  lines.push(`| **Likes** | ${v.likes || '—'} |`);
  lines.push(`| **Duration** | ${v.duration || '—'} |`);
  lines.push(`| **URL** | [YouTube](${yt}) |`);
  if (v.category) lines.push(`| **Category** | ${escMd(v.category)} |`);
  lines.push('');

  // ── Topics ──────────────────────────────────────────────────────────────────
  if (s?.topics?.length) {
    lines.push(`## Topics`);
    lines.push('');
    lines.push(s.topics.map((t: string) => `\`${t}\``).join('  '));
    lines.push('');
  }

  // ── Description snippet ─────────────────────────────────────────────────────
  if (v.description) {
    const desc = v.description.slice(0, 400).trim();
    lines.push(`## Description`);
    lines.push('');
    lines.push(desc + (v.description.length > 400 ? '…' : ''));
    lines.push('');
  }

  // ── Chapter summaries ───────────────────────────────────────────────────────
  if (s?.sections?.length) {
    lines.push(`## Key Insights by Section`);
    lines.push('');
    const compressionNote = s.compressionRatio
      ? ` *(${s.compressionRatio} token reduction)*` : '';
    lines.push(`*${s.sectionCount} sections · ${s.extractedSegments} key sentences${compressionNote}*`);
    lines.push('');

    for (const sec of s.sections) {
      const ts = fmtTs(sec.startTime);
      const tsEnd = fmtTs(sec.endTime);
      const link = `https://youtu.be/${data.videoId}?t=${sec.startTime}`;
      lines.push(`### [${ts}–${tsEnd}](${link}) — ${escMd(sec.sectionTitle)}`);
      lines.push('');
      for (const ks of sec.keySentences) {
        const tsKs = ks.timestamp !== undefined ? `[${fmtTs(ks.timestamp)}](https://youtu.be/${data.videoId}?t=${ks.timestamp}) ` : '';
        lines.push(`- ${tsKs}${escMd(ks.text)}`);
      }
      lines.push('');
    }
  }

  // ── Full chapters (if video has them) ───────────────────────────────────────
  if (v.chapters?.length >= 2) {
    lines.push(`## Chapters`);
    lines.push('');
    for (const ch of v.chapters) {
      const link = `https://youtu.be/${data.videoId}?t=${ch.timestamp}`;
      lines.push(`- [${fmtTs(ch.timestamp)}](${link}) ${escMd(ch.title)}`);
    }
    lines.push('');
  }

  // ── Full condensed transcript ────────────────────────────────────────────────
  if (data.condensedTranscript) {
    lines.push(`## Condensed Transcript`);
    lines.push('');
    lines.push('```');
    lines.push(data.condensedTranscript);
    lines.push('```');
    lines.push('');
  }

  // ── Top comments ─────────────────────────────────────────────────────────────
  if (comments.length) {
    lines.push(`## Audience Reaction (Top ${comments.length} Comments)`);
    lines.push('');
    for (const c of comments.slice(0, 20)) {
      const pin = c.isPinned ? ' 📌' : '';
      const creator = c.isCreatorReply ? ' *(creator)*' : '';
      const likes = c.likes && c.likes !== '0' ? ` · ${c.likes} likes` : '';
      lines.push(`> **${escMd(c.author)}**${creator}${pin}${likes}`);
      lines.push(`> ${escMd(c.text.slice(0, 300))}${c.text.length > 300 ? '…' : ''}`);
      lines.push('');
    }
  }

  // ── Tags ─────────────────────────────────────────────────────────────────────
  if (v.tags?.length) {
    lines.push(`## Tags`);
    lines.push('');
    lines.push(v.tags.slice(0, 30).map((t: string) => `\`${t}\``).join(' '));
    lines.push('');
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push(`*Report generated by [YouTube for AI Agents](https://github.com/JCodesMore/youtube-for-ai-agents) · ${date}*`);

  return lines.join('\n');
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function handleExport(args: ExportArgs) {
  const format = args.format ?? 'markdown';
  const sentencesPerSection = args.sentencesPerSection ?? 4;

  // Parallel fetch: video info + summary + optional transcript + optional comments
  const tasks: Promise<any>[] = [
    getVideoInfo(args.videoId),
    handleSummarize({ videoId: args.videoId, sentencesPerSection, language: args.language }),
  ];
  if (args.includeTranscript) tasks.push(getTranscript(args.videoId, args.language));
  if (args.includeComments) tasks.push(handleComments({ videoId: args.videoId, limit: 20 }));

  const results = await Promise.allSettled(tasks);

  const videoInfo = results[0].status === 'fulfilled' ? results[0].value : null;

  // Parse summary tool response
  let summaryData: any = null;
  if (results[1].status === 'fulfilled') {
    try {
      const raw = results[1].value as { content: Array<{ text: string }> };
      summaryData = JSON.parse(raw.content[0].text);
    } catch { /* non-fatal */ }
  }

  // Parse transcript
  let condensedTranscript: string | undefined;
  if (args.includeTranscript && results[2]?.status === 'fulfilled') {
    const tr = results[2].value;
    if (tr && !('error' in tr)) {
      condensedTranscript = cleanTranscriptText(tr.segments?.map((s: any) => s.text).join(' ') ?? '');
    }
  }

  // Parse comments
  let commentList: any[] = [];
  if (args.includeComments) {
    const ci = args.includeTranscript ? 3 : 2;
    if (results[ci]?.status === 'fulfilled') {
      try {
        const raw = results[ci].value as { content: Array<{ text: string }> };
        commentList = JSON.parse(raw.content[0].text).comments ?? [];
      } catch { /* non-fatal */ }
    }
  }

  if (!videoInfo) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: `Could not fetch video info for ${args.videoId}` }) }],
      isError: true,
    };
  }

  const data = {
    videoId: args.videoId,
    videoInfo,
    summary: summaryData,
    condensedTranscript,
    comments: commentList,
  };

  let output: string;
  let contentType: string;

  if (format === 'json') {
    output = JSON.stringify(data, null, 2);
    contentType = 'json';
  } else {
    output = buildMarkdown(data);
    contentType = 'markdown';
  }

  // Optional disk write
  let savedTo: string | undefined;
  if (args.outputPath) {
    try {
      const resolved = args.outputPath.replace(/^~/, process.env.HOME ?? process.env.USERPROFILE ?? '~');
      mkdirSync(dirname(resolved), { recursive: true });
      writeFileSync(resolved, output, 'utf-8');
      savedTo = resolved;
    } catch (err) {
      /* non-fatal — still return the content */
    }
  }

  return {
    content: [{
      type: 'text' as const,
      text: output,
    }],
    ...(savedTo ? { _meta: { savedTo } } : {}),
  };
}
