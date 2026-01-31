import { createDecartClient, models } from '@decartai/sdk';
import type { RealtimeConnection } from '@decartai/sdk';
import { renderer } from './engine';

let aiEnabled = false;
let realtimeClient: RealtimeConnection | null = null;

function setAIStatus(text: string, statusClass?: string): void {
  const aiStatus = document.getElementById('aiStatus')!;
  aiStatus.textContent = text;
  aiStatus.className = 'ai-status' + (statusClass ? ' ' + statusClass : '');
}

async function enableAI(): Promise<void> {
  const aiToggleBtn = document.getElementById('aiToggleBtn') as HTMLButtonElement;
  const aiPromptInput = document.getElementById('aiPrompt') as HTMLInputElement;
  const aiVideo = document.getElementById('aiVideo') as HTMLVideoElement;
  const apiKey = (document.getElementById('decartApiKey') as HTMLInputElement).value.trim();

  if (!apiKey) {
    setAIStatus('Enter your API key first', 'error');
    return;
  }

  setAIStatus('Connecting...', 'connecting');
  aiToggleBtn.disabled = true;

  try {
    const client = createDecartClient({ apiKey });
    const model = models.realtime('mirage_v2');
    const fps = model.fps || 24;
    const canvasStream = renderer.domElement.captureStream(fps);

    realtimeClient = await client.realtime.connect(canvasStream, {
      model,
      onRemoteStream: (transformedStream: MediaStream) => {
        aiVideo.srcObject = transformedStream;
        aiVideo.classList.add('active');
        setAIStatus('Connected \u2014 streaming AI texture', 'connected');
      },
      initialState: {
        prompt: { text: aiPromptInput.value, enhance: true },
      },
    });

    aiEnabled = true;
    aiToggleBtn.textContent = 'Disable AI Texture';
    aiToggleBtn.classList.add('active');
  } catch (err) {
    console.error('Decart AI connection failed:', err);
    setAIStatus('Error: ' + (err as Error).message, 'error');
  }

  aiToggleBtn.disabled = false;
}

function disableAI(): void {
  const aiToggleBtn = document.getElementById('aiToggleBtn') as HTMLButtonElement;
  const aiVideo = document.getElementById('aiVideo') as HTMLVideoElement;

  if (realtimeClient) {
    realtimeClient.disconnect();
    realtimeClient = null;
  }
  aiVideo.srcObject = null;
  aiVideo.classList.remove('active');
  aiEnabled = false;
  aiToggleBtn.textContent = 'Enable AI Texture';
  aiToggleBtn.classList.remove('active');
  setAIStatus('Disconnected');
}

export function initAI(): void {
  const aiToggleBtn = document.getElementById('aiToggleBtn')!;
  const aiPromptInput = document.getElementById('aiPrompt') as HTMLInputElement;

  aiToggleBtn.addEventListener('click', () => {
    if (aiEnabled) disableAI();
    else enableAI();
  });

  // Live prompt update (debounced)
  let promptTimeout: ReturnType<typeof setTimeout> | null = null;
  aiPromptInput.addEventListener('input', () => {
    if (!realtimeClient || !aiEnabled) return;
    if (promptTimeout) clearTimeout(promptTimeout);
    promptTimeout = setTimeout(() => {
      realtimeClient!.setPrompt(aiPromptInput.value);
      setAIStatus('Prompt updated \u2014 streaming', 'connected');
    }, 500);
  });
}
