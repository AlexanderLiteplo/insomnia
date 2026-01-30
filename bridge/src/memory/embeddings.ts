/**
 * Embedding Providers
 *
 * Configurable embedding providers for vector search.
 * Supports OpenAI, local (TF-IDF/BM25 fallback), and Ollama.
 */

import * as https from 'https';
import * as http from 'http';
import { EmbeddingProvider } from './types';
import { loadMemoryConfig } from './config';

/**
 * Simple TF-IDF based local embeddings
 * Uses a fixed vocabulary and creates sparse-like dense vectors
 * Good for keyword-heavy queries, no external dependencies
 */
class LocalEmbeddingProvider implements EmbeddingProvider {
  name = 'local';
  dimensions = 384;  // Fixed dimension for local embeddings

  private vocabulary: Map<string, number> = new Map();
  private idfScores: Map<string, number> = new Map();
  private docCount = 0;

  /**
   * Tokenize text into normalized terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  /**
   * Create a simple hash-based embedding
   * Uses multiple hash functions to create a dense representation
   */
  private hashEmbed(text: string): number[] {
    const tokens = this.tokenize(text);
    const embedding = new Array(this.dimensions).fill(0);

    // Use multiple hash seeds for different projections
    const seeds = [31, 37, 41, 43, 47, 53, 59, 61];

    for (const token of tokens) {
      for (let s = 0; s < seeds.length; s++) {
        let hash = 0;
        for (let i = 0; i < token.length; i++) {
          hash = ((hash * seeds[s]) + token.charCodeAt(i)) >>> 0;
        }
        // Distribute across embedding dimensions
        const idx = hash % this.dimensions;
        const sign = (hash >> 16) % 2 === 0 ? 1 : -1;
        embedding[idx] += sign * (1 / Math.sqrt(tokens.length));
      }
    }

    // Normalize the embedding
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  async embed(text: string): Promise<number[]> {
    return this.hashEmbed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(t => this.hashEmbed(t));
  }
}

/**
 * OpenAI embedding provider
 */
class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai';
  dimensions = 1536;  // text-embedding-3-small dimensions

  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'text-embedding-3-small') {
    this.apiKey = apiKey;
    this.model = model;
    if (model === 'text-embedding-3-large') {
      this.dimensions = 3072;
    }
  }

  private async request(texts: string[]): Promise<number[][]> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        input: texts,
        model: this.model,
      });

      const options = {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/embeddings',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(data),
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              const embeddings = response.data
                .sort((a: any, b: any) => a.index - b.index)
                .map((d: any) => d.embedding);
              resolve(embeddings);
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.request([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // OpenAI supports batch embedding
    return this.request(texts);
  }
}

/**
 * Ollama embedding provider (local LLM)
 */
class OllamaEmbeddingProvider implements EmbeddingProvider {
  name = 'ollama';
  dimensions = 4096;  // Default for llama models, varies by model

  private endpoint: string;
  private model: string;

  constructor(endpoint = 'http://localhost:11434', model = 'llama2') {
    this.endpoint = endpoint;
    this.model = model;
  }

  private async request(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.endpoint}/api/embeddings`);
      const data = JSON.stringify({
        model: this.model,
        prompt: text,
      });

      const options = {
        hostname: url.hostname,
        port: url.port || 11434,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      };

      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.embedding) {
              this.dimensions = response.embedding.length;
              resolve(response.embedding);
            } else {
              reject(new Error('No embedding in response'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  async embed(text: string): Promise<number[]> {
    return this.request(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch, so we do sequential
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.request(text));
    }
    return results;
  }
}

/**
 * Get the configured embedding provider
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  const config = loadMemoryConfig();

  switch (config.embeddingProvider) {
    case 'openai':
      if (!config.embeddingApiKey) {
        console.warn('OpenAI API key not configured, falling back to local embeddings');
        return new LocalEmbeddingProvider();
      }
      return new OpenAIEmbeddingProvider(
        config.embeddingApiKey,
        config.embeddingModel || 'text-embedding-3-small'
      );

    case 'ollama':
      return new OllamaEmbeddingProvider(
        config.embeddingEndpoint || 'http://localhost:11434',
        config.embeddingModel || 'llama2'
      );

    case 'local':
    default:
      return new LocalEmbeddingProvider();
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
