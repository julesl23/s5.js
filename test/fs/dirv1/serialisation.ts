import type { DirV1, DirLink } from "./types";

export class DirV1Serialiser {
  static serialise(dir: DirV1): Uint8Array {
    // Stub - will implement to make tests pass
    return new Uint8Array();
  }

  static deserialise(data: Uint8Array): DirV1 {
    // Stub
    throw new Error("Not implemented");
  }

  static serialiseDirLink(link: DirLink): Uint8Array {
    // Stub
    return new Uint8Array(33);
  }
}
