/**
 * OpenRouter's free-router model id (an older stored model choice maps to it,
 * services/aiDefaults wireModelId). Requests never go to OpenRouter from the
 * browser: every AI call goes through the site's proxy (services/aiTransport,
 * ADR-0007 2026-10-23).
 */

/**
 * Special "free router" model that automatically picks the best available free model.
 * OpenRouter's routing system handles model availability dynamically.
 */
export const FREE_ROUTER_MODEL = 'openrouter/free'; // the id OpenRouter's /models lists (not bare "free")
