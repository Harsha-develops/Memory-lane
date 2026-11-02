export type AiProtocol = 'chat' | 'responses';
export interface AiConfiguration {
  endpoint: string;
  model: string;
  protocol: AiProtocol;
}
export interface AiStatus extends AiConfiguration {
  configured: boolean;
}
export type AiTask = 'caption' | 'tags' | 'album';
export interface AiRequests {
  testVision: null;
  analyze: { id: string; consent: true; people: boolean; categories: string[] };
  status: null;
  save: AiConfiguration & { key: string };
  remove: null;
  cancel: null;
  run: { task: AiTask; notes: string; consent: true };
}
export interface AiResponses {
  testVision: { tags: string[] };
  analyze: { tags: string[] };
  status: AiStatus;
  save: AiStatus;
  remove: AiStatus;
  cancel: null;
  run: { text: string };
}
