import { AGENT_BATCH_SIZE, agentBatch, REVIEW_TOPICS, validateAgentReviews } from '../shared/reviewAgents.js';
import { CONTEXT_INSTRUCTIONS } from './simulationContext.js';
import { HttpError } from './security.js';

const OUTPUT_LIMITS = [4000, 8000];
const schema = {
  type: 'object', additionalProperties: false, required: ['reviews'],
  properties: { reviews: {
    type: 'array', minItems: AGENT_BATCH_SIZE, maxItems: AGENT_BATCH_SIZE,
    items: {
      type: 'object', additionalProperties: false,
      required: ['agentId', 'summary', 'questions', 'topics', 'sourceIds'],
      properties: {
        agentId: { type: 'string' }, summary: { type: 'string', minLength: 1, maxLength: 600 },
        questions: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', minLength: 1, maxLength: 200 } },
        topics: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', enum: REVIEW_TOPICS } },
        sourceIds: { type: 'array', maxItems: 4, items: { type: 'string' } },
      },
    },
  } },
};

export async function generateAgentBatch({ batch, provider, model, input, sourceIds, requestProvider }) {
  let agents;
  try { agents = agentBatch(batch); } catch (error) {
    throw new HttpError(400, 'invalid_agent_batch', error.message);
  }
  const instructions = `Generate one distinct research ethics review for EACH of the ten fictional agent perspectives listed below. Each perspective combines its role and review lens. These are composite AI perspectives, never actual university board members. Use the supplied study and any server-verified institution guidance. Do not invent institutional rules, clinical recommendations, empirical findings, or numerical predictions. Separate observed information from missing evidence. Return only a JSON object matching this schema: ${JSON.stringify(schema)}. Keep each summary under 400 characters and each question under 160 characters. Include one or two actionable, study-specific questions. Choose one to three relevant topics. Cite only document IDs that actually support the review; use an empty sourceIds array when none do. Do not invent agent interactions or source citations. Return every listed agentId exactly once. Allowed document IDs: ${JSON.stringify(sourceIds)}. Perspectives: ${JSON.stringify(agents)}.${CONTEXT_INSTRUCTIONS}`;
  for (const [attempt, limit] of OUTPUT_LIMITS.entries()) {
    const data = await requestProvider(provider === 'anthropic' ? {
      model, max_tokens: limit, system: instructions, messages: input,
    } : {
      model, store: false, max_output_tokens: limit, instructions, input,
      text: { format: { type: 'json_schema', name: 'agent_reviews', strict: true, schema } },
    });
    const limited = provider === 'anthropic'
      ? data?.stop_reason === 'max_tokens'
      : data?.status === 'incomplete' && data.incomplete_details?.reason === 'max_output_tokens';
    if (limited && attempt === 0) continue;
    const complete = provider === 'anthropic'
      ? data?.type === 'message' && data.role === 'assistant' && data.stop_reason === 'end_turn'
      : data?.status === 'completed';
    if (!complete) throw new HttpError(502, 'agent_batch_incomplete', 'The AI did not finish this agent batch. Completed reviews are saved in the graph. Retry the simulation.');
    const pieces = provider === 'anthropic' ? data.content : (data.output || [])
      .filter(item => item.type === 'message' && item.role === 'assistant').flatMap(item => item.content || []);
    const text = (Array.isArray(pieces) ? pieces : []).filter(item => item.type === (provider === 'anthropic' ? 'text' : 'output_text'))
      .map(item => item.text).filter(text => typeof text === 'string').join('\n').trim();
    try {
      if (!text || text.length > 30_000) throw new Error('Invalid output size');
      const parsed = JSON.parse(text);
      const reviews = validateAgentReviews(parsed.reviews, agents, sourceIds);
      return { reviews, agentCount: batch.total, offset: batch.offset, provider, model };
    } catch {
      throw new HttpError(502, 'invalid_agent_reviews', 'The AI returned invalid agent reviews or source references. Completed batches are saved in the graph. Retry the simulation.');
    }
  }
}
