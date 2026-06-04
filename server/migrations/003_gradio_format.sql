-- 003_gradio_format: allow the 'gradio' provider format (HuggingFace Spaces driven
-- by a per-model args template). Existing rows keep their openai/claude/gemini value.
ALTER TABLE custom_providers
  MODIFY COLUMN format ENUM('openai','claude','gemini','gradio') NOT NULL;
