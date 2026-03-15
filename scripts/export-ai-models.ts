import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { AI_MODELS, DEFAULT_AI_MODEL_ID } from '../src/config/ai-models';

const outputDir = resolve(process.cwd(), 'prompts/generated');
const outputPath = resolve(outputDir, 'ai-models.json');

mkdirSync(outputDir, { recursive: true });

writeFileSync(
  outputPath,
  JSON.stringify(
    {
      defaultModelId: DEFAULT_AI_MODEL_ID,
      models: AI_MODELS,
    },
    null,
    2,
  ),
  'utf-8',
);

console.log(outputPath);
