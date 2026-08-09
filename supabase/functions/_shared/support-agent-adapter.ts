// Versioned boundary for the future trained Support Agent. This module never
// sends a customer message and it deliberately has no heuristic fallback.

export const SUPPORT_AGENT_ADAPTER_VERSION = 'support-agent/v1';

export type SupportAgentRequest = {
  version: typeof SUPPORT_AGENT_ADAPTER_VERSION;
  caseId: string;
  source: 'email' | 'in_app_feedback';
  subject: string;
  originalMessage: string;
  sender: { email: string; name: string };
  thread: { provider: string; messageId: string; threadId: string; inReplyTo: string };
  attachmentMetadata: Array<{ name: string; mimeType: string; sizeBytes: number }>;
};

export type SupportAgentResult = {
  factualDraft: string;
  ownerVoiceDraft: string;
  classification: { topicKey: string; improvementType: string };
  confidence: number;
  safeWorkaround: string;
  missingInformation: string[];
  sensitiveFlags: string[];
  recommendedAction: string;
  approvalRequirements: string[];
};

export type SupportAgentOutcome =
  | { status: 'unavailable'; code: 'SUPPORT_AGENT_NOT_CONFIGURED'; message: string }
  | { status: 'mock'; result: SupportAgentResult }
  | { status: 'completed'; result: SupportAgentResult };

export async function invokeSupportAgent(_request: SupportAgentRequest): Promise<SupportAgentOutcome> {
  // A live integration must be explicitly supplied and reviewed. Do not turn
  // this into a hidden best-effort completion path: missing intelligence is
  // visible to the owner and leaves the response blank for human drafting.
  return {
    status: 'unavailable',
    code: 'SUPPORT_AGENT_NOT_CONFIGURED',
    message: 'The trained Support Agent is not configured. No response was invented; draft a reply manually or enable the reviewed adapter.',
  };
}
