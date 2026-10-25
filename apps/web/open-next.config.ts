import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// No incremental cache: every page renders on request and the API keeps its own Redis cache
// (menu 60s). For ISR at the edge, create an R2 bucket, bind it as NEXT_INC_CACHE_R2_BUCKET in
// wrangler.jsonc and pass `incrementalCache: r2IncrementalCache` from
// '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'.
export default defineCloudflareConfig({});
