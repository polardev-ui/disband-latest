declare module "gifenc" {
  export interface GifEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: {
      palette?: number[][];
      delay?: number;
      repeat?: number;
      dispose?: number;
    }): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  export function GIFEncoder(options?: { initialCapacity?: number }): GifEncoder;
}
