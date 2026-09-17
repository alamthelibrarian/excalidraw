import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import type { OrderedExcalidrawElement } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";

const PREFIX = "#project=";
const SAVE_DELAY = 2000;

export type CloudProjectAccess = {
  id: string;
  title: string;
  updatedAt: string;
};
export type CloudProjectSaveStatus = "idle" | "saving" | "saved" | "error";
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

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Snapshot | null = null;
let saving = false;
let lastSavedPayload: string | null = null;
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
  return id ? { id, title: "Excalidraw project", updatedAt: "" } : null;
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
    console.error(error);
    emit("error");
  } finally {
    saving = false;
    if (pending) {
      void save();
    }
  }
};

export const queueCloudProjectSave = (snapshot: Snapshot) => {
  if (!getActiveCloudProject()) {
    return;
  }
  pending = snapshot;
  emit("saving");
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = null;
    void save();
  }, SAVE_DELAY);
};

const flushCloudProjectSave = async () => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
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

export const openCloudProject = async (project: CloudProjectAccess) => {
  await flushCloudProjectSave();
  history.pushState(
    {},
    document.title,
    `${location.pathname}${PREFIX}${project.id}`,
  );
  location.reload();
};

export const detachActiveCloudProject = () => {
  history.replaceState({}, document.title, location.pathname);
  lastSavedPayload = null;
  emit("idle");
};
