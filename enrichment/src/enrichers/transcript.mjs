const MAX_EXCERPT_LENGTH = 500;

export class TranscriptFetcher {
  /**
   * Attempt to fetch a transcript for a video from the source adapter.
   * Returns the first 500 characters for LLM context, or null if unavailable.
   *
   * @param {string} videoId - The platform-specific video identifier.
   * @param {import('../sources/base.mjs').BaseSource} source - The source adapter.
   * @returns {Promise<string|null>} Transcript excerpt or null.
   */
  async fetch(videoId, source) {
    if (!videoId) {
      console.warn('[transcript] No videoId provided, skipping transcript fetch');
      return null;
    }

    if (!source || typeof source.getTranscript !== 'function') {
      console.warn('[transcript] Source adapter does not support getTranscript');
      return null;
    }

    try {
      const fullText = await source.getTranscript(videoId);

      if (!fullText || typeof fullText !== 'string' || fullText.trim().length === 0) {
        console.log(`[transcript] No transcript available for ${videoId}`);
        return null;
      }

      // Return first MAX_EXCERPT_LENGTH characters for LLM context
      const excerpt = fullText.trim().slice(0, MAX_EXCERPT_LENGTH);
      console.log(`[transcript] Got ${excerpt.length} char excerpt for ${videoId}`);
      return excerpt;
    } catch (err) {
      // Handle gracefully: transcript is supplementary, not required
      console.warn(`[transcript] Failed to fetch transcript for ${videoId}: ${err.message}`);
      return null;
    }
  }
}
