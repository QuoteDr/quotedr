// Central QuoteDr AI limits.
// To change a limit later, edit the matching feature below and redeploy the AI Edge Functions.
export const AI_USAGE_LIMITS = Object.freeze({
  default: Object.freeze({
    feature: 'default',
    label: 'AI tool',
    hourlyLimit: 20,
    dailyLimit: 80,
    maxInputChars: 6000,
    maxOutputTokens: 1000,
  }),
  ai_assistant: Object.freeze({
    feature: 'ai_assistant',
    label: 'AI assistant',
    hourlyLimit: 60,
    dailyLimit: 300,
    maxInputChars: 12000,
    maxOutputTokens: 500,
  }),
  ai_refine: Object.freeze({
    feature: 'ai_refine',
    label: 'AI description refine',
    hourlyLimit: 160,
    dailyLimit: 800,
    maxInputChars: 2500,
    maxOutputTokens: 350,
  }),
  writing_suggestions: Object.freeze({
    feature: 'writing_suggestions',
    label: 'Quote spell check',
    hourlyLimit: 80,
    dailyLimit: 400,
    maxInputChars: 12000,
    maxOutputTokens: 1800,
  }),
  quote_completeness_review: Object.freeze({
    feature: 'quote_completeness_review',
    label: 'AI quote copilot',
    hourlyLimit: 40,
    dailyLimit: 200,
    maxInputChars: 16000,
    maxOutputTokens: 1800,
  }),
  quote_item_draft: Object.freeze({
    feature: 'quote_item_draft',
    label: 'AI quote item draft',
    hourlyLimit: 40,
    dailyLimit: 160,
    maxInputChars: 3500,
    maxOutputTokens: 500,
  }),
  voice_item_wizard: Object.freeze({
    feature: 'voice_item_wizard',
    label: 'AI guided pricing item',
    hourlyLimit: 50,
    dailyLimit: 250,
    maxInputChars: 5000,
    maxOutputTokens: 800,
  }),
  voice_quote: Object.freeze({
    feature: 'voice_quote',
    label: 'AI voice quote',
    hourlyLimit: 50,
    dailyLimit: 300,
    maxInputChars: 8000,
    maxOutputTokens: 2000,
  }),
  smart_import: Object.freeze({
    feature: 'smart_import',
    label: 'AI smart import',
    hourlyLimit: 20,
    dailyLimit: 80,
    maxInputChars: 30000,
    maxOutputTokens: 8000,
  }),
  supplier_import: Object.freeze({
    feature: 'supplier_import',
    label: 'AI supplier price import',
    hourlyLimit: 10,
    dailyLimit: 40,
    maxInputChars: 8200000,
    maxOutputTokens: 8000,
  }),
  quote_import: Object.freeze({
    feature: 'quote_import',
    label: 'Legacy quote import',
    hourlyLimit: 80,
    dailyLimit: 150,
    maxInputChars: 250000,
    maxOutputTokens: 16000,
  }),
  floor_plan: Object.freeze({
    feature: 'floor_plan',
    label: 'AI floor plan scan',
    hourlyLimit: 20,
    dailyLimit: 80,
    maxInputChars: 8500000,
    maxOutputTokens: 300,
  }),
  ikea_parser: Object.freeze({
    feature: 'ikea_parser',
    label: 'IKEA AI parser',
    hourlyLimit: 20,
    dailyLimit: 80,
    maxInputChars: 8000,
    maxOutputTokens: 1200,
  }),
  analytics_brief: Object.freeze({
    feature: 'analytics_brief',
    label: 'AI analytics brief',
    hourlyLimit: 10,
    dailyLimit: 30,
    maxInputChars: 12000,
    maxOutputTokens: 700,
  }),
});

const MODEL_PRICES_PER_MILLION_TOKENS = Object.freeze({
  'gpt-4o-mini': Object.freeze({ input: 0.15, output: 0.60 }),
  'gpt-4o': Object.freeze({ input: 5.00, output: 15.00 }),
  'gpt-5.4-mini': Object.freeze({ input: 0.75, output: 4.50 }),
  default: Object.freeze({ input: 1.00, output: 3.00 }),
});

export function getAiFeaturePolicy(feature) {
  return AI_USAGE_LIMITS[feature] || AI_USAGE_LIMITS.default;
}

export function estimateOpenAiCostUsd(model, usage = {}) {
  const prices = MODEL_PRICES_PER_MILLION_TOKENS[model] || MODEL_PRICES_PER_MILLION_TOKENS.default;
  const promptTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
  const cost = ((promptTokens * prices.input) + (completionTokens * prices.output)) / 1000000;
  return Math.round(cost * 1000000) / 1000000;
}

export function secondsUntilWindowReset(now = new Date(), windowName = 'hour') {
  const date = now instanceof Date ? now : new Date(now);
  const reset = new Date(date);
  if (windowName === 'day') {
    reset.setUTCHours(24, 0, 0, 0);
  } else {
    reset.setUTCMinutes(60, 0, 0);
  }
  return Math.max(1, Math.ceil((reset.getTime() - date.getTime()) / 1000));
}
