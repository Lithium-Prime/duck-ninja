export type ObjectStorage = {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
};

export type AttachmentKind = "step_image" | "result" | "result_comment";
