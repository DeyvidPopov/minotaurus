import { createApp } from "./app.js";
import { ConfigError, validateConfig } from "./config/env.js";

// Fail fast on insecure configuration (e.g. missing/placeholder JWT_SECRET)
// before binding the port. The message never includes the secret value.
try {
  validateConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    // eslint-disable-next-line no-console
    console.error(`[minotaurus-backend] configuration error: ${err.message}`);
    process.exit(1);
  }
  throw err;
}

const port = Number(process.env.PORT) || 4000;
const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[minotaurus-backend] listening on http://localhost:${port}`);
});
