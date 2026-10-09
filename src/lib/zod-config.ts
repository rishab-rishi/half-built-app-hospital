import { z } from "zod";

// Zod 4 probes for `new Function` to JIT-compile validators. Under a strict Content-Security-Policy the browser
// reports that probe as a violation even though Zod recovers. Turn the JIT off: validation here is small.
z.config({ jitless: true });
