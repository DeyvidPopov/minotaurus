import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 4000;
const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[minotaurus-backend] listening on http://localhost:${port}`);
});
