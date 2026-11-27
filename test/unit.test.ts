import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clipLink, isClipLink, mixSeedVideo, parseChannelRef, parsePlaylistId, parseStartTime, parseVideoId } from '../src/lib/ids.js';
import { ageSeconds, lockupViews, readLockup } from '../src/lib/innertube.js';
import { chooseTrack, decodeEntities, originalAudioLanguage, tidyCaption, dropRollover, parseJson3, parseTranscriptPanel, sameLanguage, transcriptPanelParams } from '../src/lib/transcript.js';
import { classify } from '../src/lib/errors.js';
import { formatSort, parseTimestamp, sanitizeFilename } from '../src/lib/download.js';
import { clock, estimateTokens } from '../src/tools/transcript.js';

describe('parseVideoId accepts whatever people paste', () => {
  const id = 'dQw4w9WgXcQ';
  it.each([
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&list=PL123&index=2`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=Ab12Cd34`,
    `youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}?feature=share`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `  ${id}  `,
    `<https://youtube.com/watch?v=${id}>`,
    `https://youtu.be/${id}.`,
    `(https://www.youtube.com/watch?v=${id})`,
  ])('%s', (input) => expect(parseVideoId(input)).toBe(id));

  it.each(['hello world', 'https://vimeo.com/123456', ''])('rejects %s', (input) => {
    expect(() => parseVideoId(input)).toThrow(/doesn't look like a YouTube video/);
  });

  it('names the right tool for playlist and channel links', () => {
    expect(() => parseVideoId('https://www.youtube.com/playlist?list=PLrAXtmErZgOdP_8GztsuKi9nrraNbKKp4')).toThrow(/playlist link/);
    expect(() => parseVideoId('https://www.youtube.com/@mkbhd')).toThrow(/channel link/);
    expect(() => parseVideoId('https://www.youtube.com/channel/UCAuUUnT6oDeKwE6v1NGQxug')).toThrow(/channel link/);
  });

  it('spots Clip links, which need YouTube to resolve', () => {
    expect(isClipLink('https://www.youtube.com/clip/UgkxU2HSeGL_NvmDJ-nQJrlLwllwMDBdGZFs')).toBe(true);
    expect(isClipLink(`https://youtu.be/${id}`)).toBe(false);
    expect(clipLink('(youtube.com/clip/UgkxU2HSeGL_NvmDJ-nQJrlLwllwMDBdGZFs).')).toBe('https://youtube.com/clip/UgkxU2HSeGL_NvmDJ-nQJrlLwllwMDBdGZFs');
  });

  it('reads start times', () => {
    expect(parseStartTime('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(90);
    expect(parseStartTime('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')).toBe(90);
    expect(parseStartTime('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s')).toBe(3723);
    expect(parseStartTime('dQw4w9WgXcQ')).toBeUndefined();
  });
});

describe('playlist and channel references', () => {
  it('extracts playlist IDs', () => {
    expect(parsePlaylistId('https://www.youtube.com/playlist?list=PLlT0ph_Ig5Rc8xVBw47aZfLsOGw-lxRWb')).toBe('PLlT0ph_Ig5Rc8xVBw47aZfLsOGw-lxRWb');
    expect(parsePlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890')).toBe('PL1234567890');
    expect(parsePlaylistId('PLlT0ph_Ig5Rc8xVBw47aZfLsOGw-lxRWb')).toBe('PLlT0ph_Ig5Rc8xVBw47aZfLsOGw-lxRWb');
  });
  it('normalises channels', () => {
    expect(parseChannelRef('UCAuUUnT6oDeKwE6v1NGQxug')).toEqual({ kind: 'id', id: 'UCAuUUnT6oDeKwE6v1NGQxug' });
    expect(parseChannelRef('https://www.youtube.com/channel/UCAuUUnT6oDeKwE6v1NGQxug/videos')).toEqual({ kind: 'id', id: 'UCAuUUnT6oDeKwE6v1NGQxug' });
    expect(parseChannelRef('@TED')).toEqual({ kind: 'url', url: 'https://www.youtube.com/@TED' });
    expect(parseChannelRef('https://www.youtube.com/@TED/videos')).toEqual({ kind: 'url', url: 'https://www.youtube.com/@TED' });
    expect(parseChannelRef('TED')).toEqual({ kind: 'url', url: 'https://www.youtube.com/@TED' });
    expect(parseChannelRef('https://www.youtube.com/c/TEDtalksDirector')).toEqual({ kind: 'url', url: 'https://www.youtube.com/c/TEDtalksDirector' });
  });
  it('finds the seed video of a Mix', () => {
    expect(mixSeedVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ', 'RDdQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(mixSeedVideo('https://www.youtube.com/watch?v=yPYZpwSpKmA&list=RDMM', 'RDMM')).toBe('yPYZpwSpKmA');
    expect(mixSeedVideo('RDdQw4w9WgXcQ', 'RDdQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(mixSeedVideo('PLUl4u3cNGP61Oq3tWYp6V_F-5jb5L2iHb', 'PLUl4u3cNGP61Oq3tWYp6V_F-5jb5L2iHb')).toBeUndefined();
  });
});

describe('search and channel cards', () => {
  it('reads the view count, never a description that mentions "view"', () => {
    expect(lockupViews(['58M', '4y ago'])).toBe('58M views');
    expect(lockupViews(['1,304 views', '2w ago'])).toBe('1,304 views');
    expect(lockupViews(['10K watching'])).toBe('10K watching');
    expect(lockupViews(['Welcome to our in-depth review of the top keyboards', '13d ago'])).toBe('');
  });
  it('orders relative ages, unknown ones last', () => {
    const ages = ['1y ago', '', '13 hours ago', 'Streamed 2y ago', '2w ago', '1mo ago', '1d ago'];
    expect([...ages].sort((a, b) => (ageSeconds(a) === ageSeconds(b) ? 0 : ageSeconds(a) - ageSeconds(b))))
      .toEqual(['13 hours ago', '1d ago', '2w ago', '1mo ago', '1y ago', 'Streamed 2y ago', '']);
  });
  it('finds the channel in a search card\'s avatar stack', () => {
    const endpoint = { payload: { browseId: 'UCSJ4gkVC6NrvII8umztf0Ow' } };
    const card = {
      type: 'LockupView',
      content_id: 'n61ULEU7CO0',
      content_type: 'VIDEO',
      metadata: {
        title: { text: 'Best of lofi hip hop 2021' },
        metadata: { metadata_rows: [
          { metadata_parts: [{ avatar_stack: { text: { text: 'Lofi Girl', endpoint } } }, { text: { text: '58M' } }, { text: { text: '4y ago' } }] },
          { metadata_parts: [{ text: { text: 'Listen on Spotify, Apple music and more' } }] },
        ] },
      },
    };
    const l = readLockup(card)!;
    expect([l.channelName, l.channelId]).toEqual(['Lofi Girl', 'UCSJ4gkVC6NrvII8umztf0Ow']);
    expect(l.rows).toEqual([['58M', '4y ago'], ['Listen on Spotify, Apple music and more']]);
  });
  it('never reads a numeric channel name as views', () => {
    const card = {
      type: 'LockupView',
      content_id: 'abcdefghijk',
      metadata: { metadata: { metadata_rows: [{ metadata_parts: [
        { text: { text: '311', endpoint: { payload: { browseId: 'UC0123456789abcdefghijkl' } } } },
        { text: { text: '2.1M' } },
        { text: { text: '9y ago' } },
      ] }] } },
    };
    const l = readLockup(card)!;
    expect(l.channelName).toBe('311');
    expect(lockupViews(l.parts)).toBe('2.1M views');
  });
});

describe('chooseTrack picks the right caption track', () => {
  const t = (languageCode: string, autoGenerated = false, translatable = true) => ({ languageCode, autoGenerated, translatable });
  const ted = [t('sq'), t('ar'), t('en'), t('en', true), t('fr')];

  it('defaults to the spoken language, preferring human captions', () => {
    expect(chooseTrack(ted)!.track).toEqual(t('en'));
  });
  it('honours a requested language', () => {
    expect(chooseTrack(ted, 'fr')!.track).toEqual(t('fr'));
    expect(chooseTrack(ted, 'fr')!.translateTo).toBeUndefined();
  });
  it('matches regional variants', () => {
    expect(chooseTrack([t('pt-BR'), t('pt-BR', true)], 'pt')!.track.languageCode).toBe('pt-BR');
  });
  it('asks YouTube to translate when the language is missing', () => {
    const choice = chooseTrack([t('es', true)], 'de')!;
    expect(choice.track.languageCode).toBe('es');
    expect(choice.translateTo).toBe('de');
  });
  it('does not translate untranslatable tracks', () => {
    expect(chooseTrack([t('es', true, false)], 'de')!.translateTo).toBeUndefined();
  });
  it('falls back to English, then anything', () => {
    expect(chooseTrack([t('de'), t('en')])!.track.languageCode).toBe('en');
    expect(chooseTrack([t('ja')])!.track.languageCode).toBe('ja');
    expect(chooseTrack([])).toBeNull();
  });
  it('uses the original audio language on auto-dubbed videos, which list an auto track per dub', () => {
    const dubbed = [t('bn', true), t('nl', true), t('en', true), t('fr', true)];
    expect(chooseTrack(dubbed, undefined, 'en')!.track).toEqual(t('en', true));
    expect(chooseTrack([...dubbed, t('en')], undefined, 'en')!.track).toEqual(t('en'));
  });
});

describe('originalAudioLanguage', () => {
  it('finds the original among dubbed audio tracks (type 4), wherever the default is', () => {
    const tracks = [{ audio_track_id: 'bn.10' }, { audio_track_id: 'en-US.4' }, { audio_track_id: 'es-US.10' }];
    expect(originalAudioLanguage(tracks, 2)).toBe('en');
  });
  it('falls back to the default audio track, and says nothing without audio tracks', () => {
    expect(originalAudioLanguage([{ audio_track_id: 'de-DE.3' }, { audio_track_id: 'ja.3' }], 1)).toBe('ja');
    expect(originalAudioLanguage(undefined)).toBeUndefined();
  });
});

describe('caption parsing', () => {
  it('parses json3 and drops empty events', () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 1000 },
        { tStartMs: 1200, dDurationMs: 2160, segs: [{ utf8: 'All right, so ' }, { utf8: 'here we are' }] },
        { tStartMs: 4000, dDurationMs: 500, segs: [{ utf8: '\n' }] },
        { tStartMs: 5000, dDurationMs: 1500, segs: [{ utf8: 'Tom &amp; Jerry&#39;s' }] },
      ],
    });
    expect(parseJson3(body)).toEqual([
      { text: 'All right, so here we are', offset: 1.2, duration: 2.16 },
      { text: "Tom & Jerry's", offset: 5, duration: 1.5 },
    ]);
  });
  it('decodes entities', () => {
    expect(decodeEntities('&quot;hi&quot; &lt;b&gt; &#x1F600; &#8212;')).toBe('"hi" <b> 😀 —');
  });
});

describe('transcript panel', () => {
  it("builds the same parameters YouTube's own page sends", () => {
    expect(transcriptPanelParams('Ks-_Mh1QhMc')).toBe('qgkPCgtLcy1fTWgxUWhNYxgB');
    expect(transcriptPanelParams('Ks-_Mh1QhMc', '.en')).toBe('qgkUCgtLcy1fTWgxUWhNYxgBMgMuZW4=');
  });

  const item = (text: string, seconds: number, timestamp: string) => ({
    macroMarkersPanelItemViewModel: {
      item: { timelineItemViewModel: { timestamp, contentItems: [{ transcriptSegmentViewModel: { simpleText: text, timestamp } }] } },
      onTap: { innertubeCommand: { watchEndpoint: { startTimeSeconds: seconds } } },
    },
  });
  const chapter = { macroMarkersPanelItemViewModel: { item: { timelineItemViewModel: { contentItems: [{ timelineChapterViewModel: { title: 'Intro' } }] } } } };
  const response = {
    content: { sectionListRenderer: { contents: [
      { itemSectionRenderer: { contents: [item('All right, so  here we are', 1, '0:01')] } },
      { itemSectionRenderer: { contents: [chapter, item('really long trunks', 7, '0:07'), item('that is all', 16, '0:16')] } },
    ] } },
    frameworkUpdates: { entityBatchUpdate: { mutations: [{ payload: { timedMarkersListSyncEntity: { timedListData: { sections: [
      { timedSyncDataList: [{ videoTimeMs: '1200', endTimeMs: '7000' }] },
      { timedSyncDataList: [{ videoTimeMs: '6000' }, { videoTimeMs: '7500', endTimeMs: '15900' }, { videoTimeMs: '16100', endTimeMs: '19000' }] },
    ] } } } }] } },
  };

  it('reads text with millisecond timings, skipping chapter headers', () => {
    expect(parseTranscriptPanel(response)).toEqual([
      { text: 'All right, so here we are', offset: 1.2, duration: 5.8 },
      { text: 'really long trunks', offset: 7.5, duration: 8.4 },
      { text: 'that is all', offset: 16.1, duration: expect.closeTo(2.9) },
    ]);
  });

  it('falls back to whole seconds when sync data is missing', () => {
    const { frameworkUpdates: _, ...noSync } = response;
    expect(parseTranscriptPanel(noSync)).toEqual([
      { text: 'All right, so here we are', offset: 1, duration: 6 },
      { text: 'really long trunks', offset: 7, duration: 9 },
      { text: 'that is all', offset: 16, duration: 3 },
    ]);
  });
});

describe('panel language when YouTube hides the caption list', () => {
  const segs = (...texts: string[]) => texts.map((text, i) => ({ text, offset: i * 3, duration: 3 }));
  const human = segs('So today I want to talk about the science of smiling.', 'Why do we smile at strangers on the street?', 'It turns out the answer is older than language itself.');
  const auto = segs('so today I want to talk about the science', 'of smiling why do we smile at strangers', 'on the street it turns out the answer is older');
  const french = segs('Aujourd\x27hui je veux parler de la science du sourire.', 'Pourquoi sourions-nous aux inconnus dans la rue ?', 'La réponse est plus ancienne que le langage.');
  it('treats human and auto captions of one talk as the same language', () => {
    expect(sameLanguage(auto, human)).toBe(true);
  });
  it('tells a translation apart', () => {
    expect(sameLanguage(auto, french)).toBe(false);
  });
  it('compares scripts written without spaces by character pairs', () => {
    expect(sameLanguage(segs('今日は笑顔の科学について話します'), segs('今日は笑顔の科学について話したいと思います'))).toBe(true);
    expect(sameLanguage(segs('今日は笑顔の科学について話します'), auto)).toBe(false);
  });
});

describe('transcript pages fit the result limit in any script', () => {
  it('counts Chinese, Japanese and Korean at about a token a character', () => {
    expect(estimateTokens('a'.repeat(4000))).toBe(1000);
    expect(estimateTokens('字'.repeat(4000))).toBe(4000);
  });
});

describe('errors are classified for agents', () => {
  it.each([
    ['YouTube is receiving too many requests from your IP address', 'rate_limited'],
    ['HTTP Error 429: Too Many Requests', 'rate_limited'],
    ['Sign in to confirm you’re not a bot', 'bot_check'],
    ['Private video', 'private'],
    ['This video may be inappropriate for some users. Sign in to confirm your age', 'age_restricted'],
    ['Transcript is disabled on this video', 'no_captions'],
    ['Video unavailable', 'unavailable'],
    ['The playlist does not exist.', 'not_found'],
    ['Request to https://www.youtube.com/youtubei/v1/navigation/resolve_url failed with status code 404', 'not_found'],
    ['ERROR: [youtube] abc: HTTP Error 404: Not Found', 'unavailable'],
    ['fetch failed', 'network'],
    ['getaddrinfo ENOTFOUND www.youtube.com', 'network'],
    ['something odd', 'unknown'],
  ])('%s -> %s', (message, kind) => expect(classify(new Error(message))).toBe(kind));
});

describe('media helpers', () => {
  it('parses timestamps', () => {
    expect(parseTimestamp('90')).toBe(90);
    expect(parseTimestamp('1:30')).toBe(90);
    expect(parseTimestamp('1:02:03')).toBe(3723);
    expect(parseTimestamp('12.5')).toBe(12.5);
    expect(() => parseTimestamp('soon')).toThrow();
  });
  it('builds yt-dlp format sorts', () => {
    expect(formatSort('720p')).toBe('res:720,vcodec:h264,acodec:aac');
    expect(formatSort('best')).toBe('res,vcodec:h264,acodec:aac');
  });
  it('makes safe file names', () => {
    expect(sanitizeFilename('What? A "great" video: part 1/2...')).toBe('What A great video part 12');
    expect(sanitizeFilename('***')).toBe('video');
  });
  it('formats clock times', () => {
    expect(clock(5)).toBe('0:05');
    expect(clock(754.9)).toBe('12:34');
    expect(clock(3723)).toBe('1:02:03');
  });
});

describe('tidyCaption', () => {
  const zw = '\u200B';
  it('drops the doubled lines and zero-width padding of styled captions', () => {
    const raw = `${zw}${zw} ${zw}I recreated Hunger Games ${zw} ${zw}in REAL life!${zw} ${zw}I recreated Hunger Games ${zw} ${zw}in REAL life!${zw} WoOOoO!${zw} ${zw}WoOOoO!${zw}`;
    expect(tidyCaption(raw)).toBe('I recreated Hunger Games in REAL life! WoOOoO!');
  });
  it('leaves ordinary captions alone, repeats included', () => {
    expect(tidyCaption('no  no, not that')).toBe('no no, not that');
    expect(tidyCaption('go go go')).toBe('go go go');
  });
  it('drops a line that rolls over into the next caption', () => {
    expect(dropRollover('May the odds be in your favor. Everything we need is here!', 'Everything we need is here! OH! I got a weapon!'))
      .toBe('OH! I got a weapon!');
    expect(dropRollover('I said it was fine', 'it was fine by me')).toBe('it was fine by me');
  });
});

describe('classify paid and members-only videos', () => {
  it.each(['UNPLAYABLE: This video requires payment to watch', 'Join this channel to get access to members-only content like this video'])('%s', (msg) => {
    expect(classify(new Error(msg))).toBe('paywalled');
  });
});

describe('release hygiene', () => {
  const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
  it('source has no stray control characters (an escaped \\b once became a backspace and broke two regexes)', () => {
    const files = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
    for (const file of files) expect(readFileSync(join('src', file), 'utf8'), file).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/);
  });
  const version = read('package.json').version;
  it.each(['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', 'gemini-extension.json'])('%s matches package.json version', (file) => {
    expect(read(file).version).toBe(version);
  });
  it('server.json matches package.json version', () => {
    const server = read('server.json');
    expect(server.version).toBe(version);
    expect(server.packages[0].version).toBe(version);
    expect(server.name).toBe(read('package.json').mcpName);
  });
  it('bin paths need no correction from npm publish (it warns about ./path)', () => {
    for (const target of Object.values(read('package.json').bin as Record<string, string>)) {
      expect(target).not.toMatch(/^\.\//);
      expect(() => readFileSync(target)).not.toThrow();
    }
  });
  it('MCP Registry name uses the GitHub account as spelled (the registry is case-sensitive)', () => {
    expect(read('package.json').mcpName).toMatch(/^io\.github\.JCodesMore\//);
  });
  it('has no lockfile in the plugin root (it would make Claude Code npm-install dev tools for every user)', () => {
    expect(() => readFileSync('.npmrc', 'utf8')).not.toThrow();
    expect(readFileSync('.npmrc', 'utf8')).toMatch(/package-lock=false/);
  });
});
