export interface EmbeddingConfig {
  model?: string;
  dimension?: number;
  cacheSize?: number;
  pooling?: 'mean' | 'cls';
  normalize?: boolean;
}
