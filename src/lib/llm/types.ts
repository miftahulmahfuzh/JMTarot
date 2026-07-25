/**
 * What a reading request looks like once the prompt layer is done with it.
 *
 * Deliberately flat strings rather than provider message objects. Everything
 * provider-shaped stops at this boundary, which is what makes adding Gemini or
 * OpenAI later a one-file change with no caller edits.
 */
export interface ReadingPrompt {
  system: string;
  user: string;
  maxTokens: number;
}

export interface LLMProvider {
  /**
   * Plain text chunks in order, as they arrive.
   *
   * An async iterable rather than a callback or a Response: the route wraps it
   * in a ReadableStream, and tests can drain it without a server.
   */
  streamReading(prompt: ReadingPrompt): AsyncIterable<string>;
}
