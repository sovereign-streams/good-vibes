const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_RETRIES = 3;

// Haiku pricing (per million tokens)
const HAIKU_INPUT_PRICE_PER_M = 0.80;
const HAIKU_OUTPUT_PRICE_PER_M = 4.00;

export class LLMClient {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey - Anthropic API key.
   * @param {string} [opts.model] - Model identifier.
   */
  constructor({ apiKey, model = DEFAULT_MODEL } = {}) {
    if (!apiKey) {
      throw new Error(
        'Anthropic API key is required. Provide it as apiKey or set ANTHROPIC_API_KEY.'
      );
    }
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Send messages to the Anthropic Messages API and return the text response.
   *
   * @param {Array<{role: string, content: string}>} messages - Conversation messages.
   * @param {object} [opts]
   * @param {number} [opts.maxTokens=1024] - Maximum tokens in the response.
   * @param {number} [opts.temperature=0] - Sampling temperature.
   * @returns {Promise<string>} The assistant's text response.
   */
  async chat(messages, { maxTokens = 1024, temperature = 0 } = {}) {
    const body = {
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      messages,
    };

    const responseData = await this._requestWithRetry(body);

    // Extract text from the response content blocks
    const textBlocks = (responseData.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text);

    if (textBlocks.length === 0) {
      throw new Error('No text content in Anthropic API response');
    }

    return textBlocks.join('');
  }

  /**
   * Rough token estimate: approximately 1 token per 4 characters.
   * @param {string} text
   * @returns {number}
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate cost based on Haiku pricing.
   * @param {number} inputTokens
   * @param {number} outputTokens
   * @returns {{ inputCost: number, outputCost: number, totalCost: number }}
   */
  estimateCost(inputTokens, outputTokens) {
    const inputCost = (inputTokens / 1_000_000) * HAIKU_INPUT_PRICE_PER_M;
    const outputCost = (outputTokens / 1_000_000) * HAIKU_OUTPUT_PRICE_PER_M;
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    };
  }

  /**
   * Make an API request with retry logic.
   * Retries on 429 (rate limit), 500 (server error), and 503 (overloaded).
   * Uses exponential backoff: 1s, 2s, 4s.
   * @private
   */
  async _requestWithRetry(body, attempt = 1) {
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return await response.json();
      }

      const status = response.status;
      const shouldRetry = (status === 429 || status === 500 || status === 503) && attempt < MAX_RETRIES;

      let errorBody = '';
      try {
        const errorData = await response.json();
        errorBody = errorData.error?.message || JSON.stringify(errorData);
      } catch (_) {
        try {
          errorBody = await response.text();
        } catch (__) { /* ignore */ }
      }

      if (shouldRetry) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.warn(`[llm-client] HTTP ${status}, retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES}): ${errorBody}`);
        await this._sleep(delayMs);
        return this._requestWithRetry(body, attempt + 1);
      }

      // Build a descriptive error
      const errorCode = this._errorCodeForStatus(status);
      throw new Error(`Anthropic API error [${errorCode}] (HTTP ${status}): ${errorBody}`);
    } catch (err) {
      if (err.message.startsWith('Anthropic API error')) {
        throw err;
      }

      // Network-level error
      if (attempt < MAX_RETRIES) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.warn(`[llm-client] Network error, retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES}): ${err.message}`);
        await this._sleep(delayMs);
        return this._requestWithRetry(body, attempt + 1);
      }

      throw new Error(`Anthropic API request failed after ${MAX_RETRIES} attempts: ${err.message}`);
    }
  }

  /**
   * Map HTTP status to a human-readable error code.
   * @private
   */
  _errorCodeForStatus(status) {
    switch (status) {
      case 400: return 'invalid_request';
      case 401: return 'authentication_error';
      case 403: return 'permission_denied';
      case 404: return 'not_found';
      case 429: return 'rate_limit_exceeded';
      case 500: return 'internal_server_error';
      case 503: return 'overloaded';
      default: return 'unknown_error';
    }
  }

  /**
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
