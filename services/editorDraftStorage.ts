import {
  clearEditorDraftFilesFromOPFS,
  readEditorDraftFileFromOPFS,
  saveEditorDraftFileToOPFS,
} from "./storageService";

const EDITOR_DRAFT_KEY = "peinture_editor_draft_v1";

export interface EditorDraftFile {
  fileName: string;
  contentType: string;
  size: number;
  updatedAt: number;
}

export interface EditorDraft {
  version: 1;
  updatedAt: number;
  prompt: string;
  isSourceNSFW: boolean;
  source?: EditorDraftFile;
  canvas?: EditorDraftFile;
  generated?: EditorDraftFile;
  attachedImages: EditorDraftFile[];
}

type EditorDraftSlot = "source" | "canvas" | "generated" | `ref-${number}`;

const blankDraft = (): EditorDraft => ({
  version: 1,
  updatedAt: Date.now(),
  prompt: "",
  isSourceNSFW: false,
  attachedImages: [],
});

const hasLocalStorage = () => typeof localStorage !== "undefined";

export const readEditorDraft = (): EditorDraft | null => {
  if (!hasLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(EDITOR_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorDraft>;
    if (parsed.version !== 1) return null;
    return {
      ...blankDraft(),
      ...parsed,
      attachedImages: Array.isArray(parsed.attachedImages)
        ? parsed.attachedImages
        : [],
    };
  } catch (e) {
    console.warn("Failed to read editor draft", e);
    return null;
  }
};

export const writeEditorDraft = (draft: EditorDraft): EditorDraft => {
  const next = { ...draft, version: 1 as const, updatedAt: Date.now() };
  if (hasLocalStorage()) {
    localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify(next));
  }
  return next;
};

export const patchEditorDraft = (
  patch: Partial<EditorDraft>,
): EditorDraft => {
  const current = readEditorDraft() ?? blankDraft();
  return writeEditorDraft({
    ...current,
    ...patch,
    version: 1,
    attachedImages: patch.attachedImages ?? current.attachedImages ?? [],
  });
};

export const saveEditorDraftBlob = async (
  slot: EditorDraftSlot,
  blob: Blob,
): Promise<EditorDraftFile | null> => {
  const fileName = `${slot}.bin`;
  const savedFileName = await saveEditorDraftFileToOPFS(blob, fileName);
  if (!savedFileName) return null;
  return {
    fileName: savedFileName,
    contentType: blob.type || "application/octet-stream",
    size: blob.size,
    updatedAt: Date.now(),
  };
};

export const readEditorDraftBlob = async (
  draftFile?: EditorDraftFile,
): Promise<Blob | null> => {
  if (!draftFile) return null;
  const blob = await readEditorDraftFileFromOPFS(draftFile.fileName);
  if (!blob) return null;
  return new Blob([await blob.arrayBuffer()], {
    type: draftFile.contentType || blob.type || "application/octet-stream",
  });
};

export const clearEditorDraft = async (): Promise<void> => {
  if (hasLocalStorage()) localStorage.removeItem(EDITOR_DRAFT_KEY);
  await clearEditorDraftFilesFromOPFS();
};
