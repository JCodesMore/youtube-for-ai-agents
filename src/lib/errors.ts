/**
 * Turn low-level failures into messages an agent can act on and relay to a person: what went
 * wrong, whether retrying helps, and what to do about it.
 */

export type FailureKind =
  | 'rate_limited'
  | 'bot_check'
  | 'unavailable'
  | 'not_found'
  | 'private'
  | 'age_restricted'
  | 'paywalled'
  | 'no_captions'
  | 'comments_disabled'
  | 'network'
  | 'invalid_input'
  | 'unknown';

export class YouTubeToolError extends Error {
  constructor(public kind: FailureKind, message: string, public hint?: string) {
    super(message);
    this.name = 'YouTubeToolError';
  }
}

const HINTS: Record<FailureKind, string> = {
  rate_limited:
    'YouTube is temporarily limiting requests from this network (HTTP 429). It usually clears within an hour. ' +
    'Signing in (run the "login" command, or /youtube:setup in Claude Code) helps, and VPN or cloud IPs are limited more often than home ones. ' +
    "Don't retry in a tight loop.",
  bot_check:
    'YouTube asked to confirm this is not a bot, which happens on VPN, cloud and heavily used IPs. Signing in usually fixes it. Otherwise try again later from a home connection.',
  unavailable: 'The video may have been removed, or is blocked in this region.',
  not_found: 'Nothing exists at that link or ID. Check it for typos; it may also have been deleted or made private.',
  private: 'The video is private, so only its owner can see it.',
  age_restricted:
    'The video is age-restricted. Signing in with an adult account unlocks it: /youtube:setup in Claude Code, or `npx @jcodesmore/youtube-for-ai-agents login` in a terminal.',
  paywalled:
    "The video needs a purchase or a channel membership, so its transcript, frames and downloads aren't available. Its title, description and chapters still are (youtube_get_video_info).",
  no_captions:
    'This video has no captions or auto-generated transcript, so there is nothing to read. Use youtube_get_video_info for its description and chapters instead.',
  comments_disabled: 'The creator turned comments off for this video (videos made for kids always have them off), so there are none to read.',
  network: 'Could not reach YouTube. Check the internet connection, proxy or firewall.',
  invalid_input: 'Check the URL or ID and try again.',
  unknown: 'Try again in a minute. If it keeps failing, run the "doctor" command and report the output at github.com/JCodesMore/youtube-for-ai-agents/issues.',
};

export function classify(error: unknown): FailureKind {
  if (error instanceof YouTubeToolError) return error.kind;
  const name = error instanceof Error ? error.name : '';
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (name.includes('TooManyRequest') || /too many requests|\b429\b|rate.?limit/.test(msg)) return 'rate_limited';
  if (/age.?restrict|inappropriate for some users|confirm your age/.test(msg)) return 'age_restricted';
  if (/not a bot|captcha|unusual traffic|sign in to confirm/.test(msg)) return 'bot_check';
  if (/private video|video is private/.test(msg)) return 'private';
  if (/requires payment|members-only|join this channel|available to this channel's members|purchase/.test(msg)) return 'paywalled';
  if (name.includes('Disabled') || name.includes('NotAvailable') || /transcripts? (is |are )?disabled|no transcripts?|no captions|captions? (are )?not available/.test(msg)) return 'no_captions';
  // YouTube's own API answers 404 for a handle or ID that points at nothing. A 404 from a media
  // server (yt-dlp's "HTTP Error 404") is a stream gone stale, so it stays below.
  if (/does not exist|failed with status code 404/.test(msg)) return 'not_found';
  if (name.includes('Unavailable') || /unavailable|not available|removed|\b404\b/.test(msg)) return 'unavailable';
  if (/enotfound|econnreset|econnrefused|etimedout|fetch failed|network|socket hang up|getaddrinfo/.test(msg)) return 'network';
  if (/doesn't look like a youtube|invalid/.test(msg)) return 'invalid_input';
  return 'unknown';
}

export function hintFor(kind: FailureKind): string {
  return HINTS[kind];
}

/** Standard MCP error result. The text is JSON so agents can branch on `kind`. */
export function toolError(error: unknown, context?: string) {
  const kind = classify(error);
  const raw = error instanceof Error ? error.message : String(error);
  const hint = error instanceof YouTubeToolError && error.hint ? error.hint : HINTS[kind];
  const payload = {
    error: context ? `${context}: ${raw}` : raw,
    kind,
    retryable: kind === 'rate_limited' || kind === 'network' || kind === 'unknown',
    hint,
  };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}
