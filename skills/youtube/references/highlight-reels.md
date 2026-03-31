# Creating Highlight Reels

A good highlight reel feels like a produced piece, not a rough cut. Every clip earns its place. This reference covers clip selection, assembly, and the workflow for producing polished reels from single or multiple videos.

## Core Rules

### Self-Containment (Non-Negotiable)

Every clip must be understandable in complete isolation. A viewer starting the reel at any clip should immediately grasp what's being said and who's saying it.

**Test each clip:** If the transcript text starts with a pronoun ("they", "this", "it") or a sentence fragment ("just happened here?", "which means that..."), the clip fails. Either:
- Move the start timestamp earlier to capture the subject/setup
- Find a different moment where the speaker names the subject directly

Good clips name their subjects:
- "Anthropic has shipped 74 releases in 52 days" — clear subject, clear fact
- "Sam Altman declared the transformer architecture is about to be replaced" — names person, names thing
- "OpenAI started with 100% market share in 2023, dropped to 75% by 2025" — names company, gives data

Bad clips assume context:
- "They dropped plugins that caused the SaaS apocalypse" — who is "they"?
- "The new engram technique makes everything better" — what engram technique?
- "We're in the hard takeoff. Right now." — what hard takeoff? Who said this?

### Accurate Cuts for Reels

Always pass `accurate: true` when clipping for highlight reels. Default keyframe-aligned cuts snap to the nearest keyframe before the start time and after the end time, adding 2-4 seconds of unpredictable content at each boundary. For a tight reel where every second matters, this padding is the difference between polished and incoherent.

The re-encoding penalty is small for 5-15 second clips. The precision is always worth it.

### Clip Length and Boundaries

- **Target: 5-10 seconds per clip.** Go up to 15s only when a complete thought genuinely requires it.
- **Start when the speaker starts the key sentence.** Not mid-word, not on a breath, not on the tail of a prior sentence.
- **End right after the point lands.** Cut before filler ("and, um, so yeah...").
- **No dead air.** Silence at clip boundaries kills momentum.
- **One complete thought per clip.** Two interesting points = two clips.
- **Descriptive labels** that describe the moment, not the topic (e.g., "anthropic-74-releases" not "anthropic").

## Narrative Ordering

The order of clips defines the viewer experience — like editing a trailer.

- **Hook first.** The most attention-grabbing clip opens the reel.
- **Build a thread.** Order clips so each builds on or naturally follows the previous. Group related ideas. When mixing speakers, alternate for variety.
- **Close strong.** End with a memorable takeaway, bold prediction, or lasting impression.
- **Smooth transitions.** If clip A ends on one topic and clip B starts on something unrelated, reorder, adjust, or remove.

## The Transcript Preview

Before clipping, assemble a preview of what the reel will sound like. This is the most important step — it separates a polished reel from a random collection of clips.

### Step 1: Draft Clip Candidates

For each candidate, list:
- Video source, video ID, and timestamp range
- The **exact transcript text** for that range — copy directly from transcript segments, never paraphrase
- The transcript text for **5 seconds before the start time** — this is the danger zone that bleeds into the clip if timestamps are slightly off or if accurate mode is not used

### Step 2: Self-Containment Check

Read each clip's transcript text as if the viewer has never seen the source video. Flag any clip that:
- Starts with a pronoun without an antecedent
- References something said earlier in the video
- Uses jargon or acronyms without context
- Is a sentence fragment

Replace or fix every flagged clip before proceeding.

### Step 3: Arrange and Read

Put clips in playback order and read through the full sequence:

```
[Clip 1 — "anthropic-74-releases" (All-In 4Gmd5UTF4rk, 3:12-3:19)]
"Anthropic has shipped 74 releases in the last 52 days, which is insane."

[Clip 2 — "openai-share-drop" (All-In 4Gmd5UTF4rk, 15:58-16:10)]
"OpenAI started with 100% market share in 2023. Dropped to 85% in 2024, 75% in 2025."

[Clip 3 — "ai-pockets-free" (Two Minute Papers DmtoVnTkQnM, 6:52-7:04)]
"This is going to lead to even cheaper and smarter AI systems that run in our pockets, mostly for free."
```

### Step 4: Viewer Test

Read the assembled text as a first-time viewer who has never seen any of these videos. Check:
- Does each clip make sense on its own?
- Do transitions between clips feel natural?
- Are there context gaps where the viewer would be confused?
- Does the opening grab attention?
- Does the close leave an impression?

### Step 5: Adjust

Reorder clips, tweak timestamps, swap in different moments, remove weak clips. Repeat until the preview reads as a coherent narrative. Only proceed to clipping after this preview is solid.

## Single-Video Reel Workflow

1. Watch the video (get transcript)
2. Identify the 3-8 tightest, most impactful moments
3. Run each candidate through the self-containment check
4. Assemble the transcript preview, review for flow, adjust
5. Call `youtube_clip` with `accurate: true` — it automatically produces a highlight reel alongside individual clips
6. Verify: compare actual clip durations from the response to requested durations. Investigate any significant discrepancy
7. Present the highlight reel as the primary deliverable

## Multi-Video Reel Workflow

1. Watch all source videos (get transcripts)
2. Identify the best moments across all videos
3. Run each candidate through the self-containment check
4. Assemble the transcript preview with clips from all sources interleaved — review for flow, adjust
5. Call `youtube_clip` once per video with `accurate: true` and `highlightReel: false`
6. Verify: check actual clip durations match expected
7. Call `youtube_highlight_reel` with clip file paths **in narrative order** — it re-encodes automatically for clean cross-video joining
8. Present the combined highlight reel as the primary deliverable, with individual clips as supplementary
