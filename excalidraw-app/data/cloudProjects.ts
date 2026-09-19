import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import type { OrderedExcalidrawElement } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";

const PREFIX = "#project=";
export type CloudProjectAccess = {
  id: string;
  title: string;
  updatedAt: string;
};
export type CloudProjectSaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error";
export type CloudUser = { email: string; name: string; picture: string };

type ResponseProject = CloudProjectAccess & {
  scene: ExcalidrawInitialDataState;
  createdAt: string;
};
type Snapshot = {
  elements: readonly OrderedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
  title: string;
};

let pending: Snapshot | null = null;
let saving = false;
let lastSavedPayload: string | null = null;
let lastSavedFingerprint: string | null = null;
let activeProject: CloudProjectAccess | null = null;
let status: CloudProjectSaveStatus = "idle";

const listeners = new Set<(status: CloudProjectSaveStatus) => void>();
const emit = (nextStatus: CloudProjectSaveStatus) => {
  status = nextStatus;
  listeners.forEach((listener) => listener(nextStatus));
};

const parse = async <T>(response: Response): Promise<T> => {
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(data?.error || "The project request failed.");
  }
  return data as T;
};

const scene = (snapshot: Snapshot) =>
  JSON.parse(
    serializeAsJSON(
      snapshot.elements,
      snapshot.appState,
      snapshot.files,
      "local",
    ),
  ) as ExcalidrawInitialDataState;

const serializeSnapshot = (snapshot: Snapshot) =>
  JSON.stringify({ title: snapshot.title, scene: scene(snapshot) });

const fingerprint = ({
  elements = [],
  appState = {},
  files = {},
  title,
}: {
  elements?: readonly Pick<
    OrderedExcalidrawElement,
    "id" | "version" | "versionNonce" | "isDeleted"
  >[] | null;
  appState?: Partial<AppState> | null;
  files?: BinaryFiles | null;
  title: string;
}) => {
  const currentElements = elements || [];
  const currentAppState = appState || {};
  const currentFiles = files || {};
  const referencedFileIds = new Set(
    currentElements.flatMap((element) => {
      const fileId = (element as { fileId?: string | null }).fileId;
      return fileId ? [fileId] : [];
    }),
  );
  return JSON.stringify([
    title,
    currentElements.map((element) => [
      element.id,
      element.version,
      element.versionNonce,
      element.isDeleted,
    ]),
    [
      currentAppState.gridSize,
      currentAppState.gridStep,
      currentAppState.gridModeEnabled,
      currentAppState.viewBackgroundColor,
      currentAppState.lockedMultiSelections,
    ],
    Object.values(currentFiles)
      .filter((file) => referencedFileIds.has(file.id))
      .map((file) => [file.id, file.created, file.dataURL.length])
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
  ]);
};

export const getProjectLink = (project: Pick<CloudProjectAccess, "id">) =>
  `${location.origin}${location.pathname}${PREFIX}${project.id}`;

export const getActiveCloudProject = (): CloudProjectAccess | null => {
  const id = location.hash.match(/^#project=([^,]+)$/)?.[1];
  if (!id) {
    return null;
  }
  return activeProject?.id === id
    ? activeProject
    : { id, title: "Untitled project", updatedAt: "" };
};

export const getCurrentUser = async () => {
  const response = await fetch("/api/auth/me");
  return response.ok
    ? ((await response.json()) as { user: CloudUser }).user
    : null;
};

export const getKnownCloudProjects = async () =>
  parse<CloudProjectAccess[]>(await fetch("/api/projects"));

export const subscribeToCloudSaveStatus = (
  listener: (status: CloudProjectSaveStatus) => void,
) => {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
};

export const loadActiveCloudProject = async () => {
  const project = getActiveCloudProject();
  if (!project) {
    return null;
  }
  const loaded = await parse<ResponseProject>(
    await fetch(`/api/projects/${encodeURIComponent(project.id)}`),
  );
  lastSavedPayload = JSON.stringify({
    title: loaded.title,
    scene: loaded.scene,
  });
  lastSavedFingerprint = fingerprint({
    title: loaded.title,
    elements: loaded.scene.elements,
    appState: loaded.scene.appState,
    files: loaded.scene.files,
  });
  activeProject = {
    id: loaded.id,
    title: loaded.title,
    updatedAt: loaded.updatedAt,
  };
  return loaded;
};

export const createCloudProject = async (snapshot: Snapshot) => {
  const body = serializeSnapshot(snapshot);
  const project = await parse<CloudProjectAccess>(
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
  lastSavedPayload = body;
  lastSavedFingerprint = fingerprint(snapshot);
  pending = null;
  emit("saved");
  return project;
};

const save = async (): Promise<boolean> => {
  const project = getActiveCloudProject();
  if (!project || !pending || saving) {
    return false;
  }

  const snapshot = pending;
  pending = null;
  saving = true;
  emit("saving");

  try {
    const body = serializeSnapshot(snapshot);
    if (body === lastSavedPayload) {
      emit("saved");
      return true;
    }
    await parse(
      await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }),
    );
    lastSavedPayload = body;
    lastSavedFingerprint = fingerprint(snapshot);
    emit("saved");
    return true;
  } catch (error) {
    pending = pending || snapshot;
    console.error(error);
    emit("error");
    return false;
  } finally {
    saving = false;
    if (pending && status !== "error") {
      if (fingerprint(pending) === lastSavedFingerprint) {
        pending = null;
        emit("saved");
      } else {
        emit("dirty");
      }
    }
  }
};

export const hasUnsavedCloudChanges = () => !!pending;

export const updateCloudProjectDraft = (snapshot: Snapshot) => {
  if (!getActiveCloudProject()) {
    return;
  }
  if (fingerprint(snapshot) === lastSavedFingerprint) {
    pending = null;
    if (!saving) {
      emit("saved");
    }
    return;
  }
  pending = snapshot;
  if (!saving) {
    emit("dirty");
  }
};

export const saveCloudProjectNow = async () => {
  while (saving) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (pending) {
    return save();
  }
  return status === "saved";
};

export const deleteCloudProject = async (project: CloudProjectAccess) => {
  await parse(
    await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: "DELETE",
    }),
  );
};

export const renameCloudProject = async (
  project: CloudProjectAccess,
  title: string,
) => {
  const updated = await parse<CloudProjectAccess>(
    await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  );
  if (activeProject?.id === updated.id) {
    activeProject = updated;
  }
  if (pending) {
    pending = { ...pending, title: updated.title };
  }
  if (lastSavedPayload) {
    const previous = JSON.parse(lastSavedPayload);
    lastSavedPayload = JSON.stringify({ ...previous, title: updated.title });
    lastSavedFingerprint = fingerprint({
      title: updated.title,
      elements: previous.scene?.elements,
      appState: previous.scene?.appState,
      files: previous.scene?.files,
    });
  }
  return updated;
};

export const openCloudProject = async (project: CloudProjectAccess) => {
  while (saving) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (
    pending &&
    !window.confirm("Discard unsaved changes and open another project?")
  ) {
    return false;
  }
  pending = null;
  emit("idle");
  history.pushState(
    {},
    document.title,
    `${location.pathname}${PREFIX}${project.id}`,
  );
  location.reload();
  return true;
};

export const detachActiveCloudProject = () => {
  history.replaceState({}, document.title, location.pathname);
  lastSavedPayload = null;
  lastSavedFingerprint = null;
  activeProject = null;
  pending = null;
  emit("idle");
};
