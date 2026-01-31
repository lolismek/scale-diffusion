declare module '@decartai/sdk' {
  interface DecartClient {
    realtime: {
      connect(stream: MediaStream, options: {
        model: unknown;
        onRemoteStream: (stream: MediaStream) => void;
        initialState?: {
          prompt?: { text: string; enhance?: boolean };
        };
      }): Promise<RealtimeConnection>;
    };
  }

  interface RealtimeConnection {
    disconnect(): void;
    setPrompt(prompt: string): void;
  }

  interface RealtimeModel {
    fps?: number;
  }

  export function createDecartClient(options: { apiKey: string }): DecartClient;
  export const models: {
    realtime(name: string): RealtimeModel;
  };
}
