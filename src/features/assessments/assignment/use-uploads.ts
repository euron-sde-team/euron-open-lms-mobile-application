/**
 * The composer's attachments: pick files with the system document picker, copy each into
 * the app's cache (so Android content URIs and iOS security-scoped files can be streamed),
 * upload them in parallel with progress, retry or remove one, and list the finished
 * media ids for the submit body. Removing a finished file discards its unused upload.
 */
import { errorCodes, isErrorWithCode, keepLocalCopy, pick, types, type DocumentPickerResponse } from "@react-native-documents/picker";
import { useCallback, useEffect, useReducer, useRef } from "react";
import ReactNativeBlobUtil from "react-native-blob-util";
import type { Media } from "../../../api/vendor/types";
import { useApi } from "../../../app/session";
import { errorText } from "../shared";
import { blobPath, isCancelled, uploadSubmissionFile, validateSubmissionFile, type LocalFile, type UploadHandle } from "./upload";

export interface UploadItem {
  localId: string;
  file: LocalFile;
  status: "uploading" | "done" | "error";
  progress: number;
  error: string | null;
  /** False when the file itself is the problem (type or size): retrying will not help. */
  retryable: boolean;
  media: Media | null;
}

type Action =
  | { type: "add"; items: UploadItem[] }
  | { type: "start"; localId: string }
  | { type: "progress"; localId: string; progress: number }
  | { type: "done"; localId: string; media: Media }
  | { type: "failed"; localId: string; error: string }
  | { type: "remove"; localId: string }
  | { type: "reset" };

export function uploadsReducer(items: UploadItem[], a: Action): UploadItem[] {
  const patch = (id: string, p: Partial<UploadItem>) => items.map((i) => (i.localId === id ? { ...i, ...p } : i));
  switch (a.type) {
    case "add":
      return [...items, ...a.items];
    case "start":
      return patch(a.localId, { status: "uploading", progress: 0, error: null });
    case "progress":
      return patch(a.localId, { progress: a.progress });
    case "done":
      return patch(a.localId, { status: "done", progress: 1, media: a.media });
    case "failed":
      return patch(a.localId, { status: "error", error: a.error });
    case "remove":
      return items.filter((i) => i.localId !== a.localId);
    case "reset":
      return [];
  }
}

/** What the picker offers. Matches what submissions accept on the server. */
const PICK_TYPES = [types.pdf, types.images, types.docx, types.xlsx, types.pptx, types.plainText, types.csv, types.zip, types.video, types.audio].flat().filter(Boolean) as string[];

let seq = 0;
const nextId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

async function toLocalFiles(picked: DocumentPickerResponse[]): Promise<LocalFile[]> {
  const [first, ...rest] = picked.map((p) => ({ uri: p.uri, fileName: p.name ?? "file" }));
  let copies: Awaited<ReturnType<typeof keepLocalCopy>> | null = null;
  try {
    if (first) copies = await keepLocalCopy({ files: [first, ...rest], destination: "cachesDirectory" });
  } catch {
    // Fall back to the picked URI; blob-util can stream file:// and content:// itself.
  }
  return Promise.all(
    picked.map(async (p) => {
      const copy = copies?.find((c) => c.sourceUri === p.uri);
      const uri = copy && copy.status === "success" ? copy.localUri : p.uri;
      let size = p.size ?? 0;
      if (!size) size = Number((await ReactNativeBlobUtil.fs.stat(blobPath(uri)).catch(() => null))?.size ?? 0);
      return { uri, name: p.name ?? "file", size, type: p.type };
    })
  );
}

export function useSubmissionUploads(maxFiles: number) {
  const api = useApi();
  const [items, dispatch] = useReducer(uploadsReducer, []);
  const handles = useRef(new Map<string, UploadHandle>());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const start = useCallback(
    (localId: string, file: LocalFile) => {
      dispatch({ type: "start", localId });
      const h = uploadSubmissionFile(api, file, (progress) => dispatch({ type: "progress", localId, progress }));
      handles.current.set(localId, h);
      h.promise.then(
        (media) => dispatch({ type: "done", localId, media }),
        (e) => {
          if (!isCancelled(e)) dispatch({ type: "failed", localId, error: errorText(e) });
        }
      ).finally(() => handles.current.delete(localId));
    },
    [api]
  );

  /** Opens the picker. Resolves with a message when some files were left out, else null. */
  const pickFiles = useCallback(async (): Promise<string | null> => {
    const room = maxFiles - itemsRef.current.length;
    if (room <= 0) return `You can attach up to ${maxFiles} ${maxFiles === 1 ? "file" : "files"}.`;
    let picked: DocumentPickerResponse[];
    try {
      picked = await pick({ allowMultiSelection: room > 1, type: PICK_TYPES });
    } catch (e) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return null;
      return "Could not open your files. Try again.";
    }
    if (!picked?.length) return null;
    const kept = picked.slice(0, room);
    const files = await toLocalFiles(kept);
    const added: UploadItem[] = files.map((file) => {
      const problem = validateSubmissionFile(file);
      return { localId: nextId(), file, status: problem ? "error" : "uploading", progress: 0, error: problem, retryable: !problem, media: null };
    });
    dispatch({ type: "add", items: added });
    for (const it of added) if (it.retryable) start(it.localId, it.file);
    return picked.length > room ? `Only ${maxFiles} ${maxFiles === 1 ? "file" : "files"} can be attached. Some were left out.` : null;
  }, [maxFiles, start]);

  const retry = useCallback(
    (localId: string) => {
      const it = itemsRef.current.find((i) => i.localId === localId);
      if (it && it.retryable && it.status === "error") start(localId, it.file);
    },
    [start]
  );

  const remove = useCallback(
    (localId: string) => {
      handles.current.get(localId)?.cancel();
      const it = itemsRef.current.find((i) => i.localId === localId);
      if (it?.media) api.media.discard(it.media.id).catch(() => undefined);
      dispatch({ type: "remove", localId });
    },
    [api]
  );

  /** After a successful submit: the media is attached now, so it is not discarded. */
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  useEffect(() => {
    const live = handles.current;
    return () => {
      for (const h of live.values()) h.cancel();
    };
  }, []);

  const mediaIds = items.filter((i) => i.status === "done" && i.media).map((i) => i.media!.id);
  const busy = items.some((i) => i.status === "uploading");
  return { items, mediaIds, busy, pickFiles, retry, remove, reset };
}
