// Compatibility entry for existing launch instructions. The current UI requires the API/SQLite server.
process.env.API_PORT ||= process.env.PORT || "5173";
await import("../server/index.mjs");
