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
let activeProject: CloudProjectAccess | null = null;
let ignoreNextDraft = false;
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
      "database",
    ),
  ) as ExcalidrawInitialDataState;

const serializeSnapshot = (snapshot: Snapshot) =>
  JSON.stringify({ title: snapshot.title, scene: scene(snapshot) });

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
  activeProject = {
    id: loaded.id,
    title: loaded.title,
    updatedAt: loaded.updatedAt,
  };
  ignoreNextDraft = true;
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
  pending = null;
  emit("saved");
  return project;
};

const save = async () => {
  const project = getActiveCloudProject();
  if (!project || !pending || saving) {
    return;
  }

  const snapshot = pending;
  pending = null;
  saving = true;
  emit("saving");

  try {
    const body = serializeSnapshot(snapshot);
    if (body === lastSavedPayload) {
      emit("saved");
      return;
    }
    await parse(
      await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }),
    );
    lastSavedPayload = body;
    emit("saved");
  } catch (error) {
    pending = snapshot;
    console.error(error);
    emit("error");
  } finally {
    saving = false;
    if (pending && status !== "error") {
      emit("dirty");
    }
  }
};

export const hasUnsavedCloudChanges = () => !!pending;

export const updateCloudProjectDraft = (snapshot: Snapshot) => {
  if (!getActiveCloudProject()) {
    return;
  }
  if (ignoreNextDraft) {
    ignoreNextDraft = false;
    return;
  }
  pending = snapshot;
  emit("dirty");
};

export const saveCloudProjectNow = async () => {
  while (saving) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (pending) {
    await save();
  }
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
  activeProject = null;
  pending = null;
  emit("idle");
};
