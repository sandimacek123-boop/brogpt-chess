// Minimal typings for WebCodecs audio (not yet in TypeScript's DOM lib for this version).
interface EncodedAudioChunk {
  readonly type: 'key' | 'delta';
  readonly timestamp: number;
  readonly duration: number | null;
  readonly byteLength: number;
  copyTo(dest: ArrayBufferView | ArrayBuffer): void;
}
interface AudioEncoderConfig {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  bitrate?: number;
}
interface AudioDataInit {
  format: 'f32-planar' | 'f32' | 's16' | 's16-planar';
  sampleRate: number;
  numberOfFrames: number;
  numberOfChannels: number;
  timestamp: number;
  data: BufferSource;
}
declare class AudioData {
  constructor(init: AudioDataInit);
  close(): void;
}
declare class AudioEncoder {
  constructor(init: { output: (chunk: EncodedAudioChunk, meta?: any) => void; error: (e: DOMException) => void });
  configure(config: AudioEncoderConfig): void;
  encode(data: AudioData): void;
  flush(): Promise<void>;
  close(): void;
  readonly state: 'unconfigured' | 'configured' | 'closed';
  static isConfigSupported(config: AudioEncoderConfig): Promise<{ supported?: boolean }>;
}
