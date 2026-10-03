interface ClefQuestion {
  type: "noul";
  instructions: string;
}

interface AiModels {
  "@cf/cloudflare/clef": {
    inputs: { model: "clef" | "clef-flash"; state: string; questions: Record<string, ClefQuestion> };
    postProcessedOutputs: { model: string; answers: Record<string, { type: "noul"; noul: number }> };
  };
}
