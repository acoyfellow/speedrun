import { type ChatMessage, toolDefinitions } from "./agent";
import { clefModel, clefQuestion, gatewayId, type RunnerModel } from "./config";
import { type ChatResponse, ChatResponse as ChatResponseSchema, ClefResponse } from "./schemas";

export async function chat(ai: Ai, model: RunnerModel, messages: ChatMessage[]): Promise<ChatResponse> {
  const inputs = { messages, tools: [...toolDefinitions], max_tokens: 4096, temperature: 0.2 };
  const options = { gateway: { id: gatewayId } };

  const raw: unknown =
    model === "@cf/moonshotai/kimi-k2.7-code"
      ? await ai.run(model, inputs, options)
      : model === "@cf/zai-org/glm-5.3"
        ? await ai.run(model, inputs, options)
        : await ai.run(model, inputs, options);

  return ChatResponseSchema.parse(raw);
}

export function clefState(rawTestOutput: string): string {
  return rawTestOutput.slice(-12000);
}

export async function clefScore(ai: Ai, rawTestOutput: string): Promise<number> {
  const raw: unknown = await ai.run(
    clefModel,
    {
      model: "clef",
      state: clefState(rawTestOutput),
      questions: { pass: { type: "noul", instructions: clefQuestion } },
    },
    { gateway: { id: gatewayId } },
  );

  return ClefResponse.parse(raw).answers.pass.noul;
}
