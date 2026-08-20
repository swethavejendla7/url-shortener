import { describe, expect, it } from 'vitest';
import { createUrlSchema } from '../../src/modules/urls/urls.schema.js';

const schema = createUrlSchema('short.ly');

describe('createUrlSchema', () => {
  it('accepts a well-formed https URL', () => {
    const result = schema.safeParse({ longUrl: 'https://example.com/some/path?q=1' });
    expect(result.success).toBe(true);
  });

  it('rejects a javascript: URL', () => {
    const result = schema.safeParse({ longUrl: 'javascript:alert(1)' });
    expect(result.success).toBe(false);
  });

  it('rejects a data: URL', () => {
    const result = schema.safeParse({ longUrl: 'data:text/html,<script>alert(1)</script>' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed URL', () => {
    const result = schema.safeParse({ longUrl: 'not a url' });
    expect(result.success).toBe(false);
  });

  it('rejects a URL that points back at the shortener itself (redirect-loop guard)', () => {
    const result = schema.safeParse({ longUrl: 'https://short.ly/abc123' });
    expect(result.success).toBe(false);
  });

  it('accepts a valid custom alias', () => {
    const result = schema.safeParse({ longUrl: 'https://example.com', customAlias: 'my-link' });
    expect(result.success).toBe(true);
  });

  it('rejects a reserved-word custom alias', () => {
    const result = schema.safeParse({ longUrl: 'https://example.com', customAlias: 'api' });
    expect(result.success).toBe(false);
  });

  it('rejects a negative expiresInDays', () => {
    const result = schema.safeParse({ longUrl: 'https://example.com', expiresInDays: -1 });
    expect(result.success).toBe(false);
  });
});
