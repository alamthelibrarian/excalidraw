import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";

const PROJECTS_STORAGE_KEY = "alam-draw-cloud-projects";
const PROJECT_HASH_PREFIX = "#project=";
const AUTOSAVE_DELAY = 1200;

export type CloudProjectAccess = {
  id: string;
  token: string;
  title: string;
  updatedAt: string;
};

export type CloudProjectSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error";

type CloudProjectResponse = {
  id: string;
  title: string;
  scene: ExcalidrawInitialDataState;
  createdAt: string;
  updatedAt: string;
};

type SceneSnapshot = {
  elements: readonly OrderedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
  title: string;
};

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshot: SceneSnapshot | null = null;
let saveInProgress = false;
let saveStatus: CloudProjectSaveStatus = "idle";
const statusListeners = new Set<(status: CloudProjectSaveStatus) => void>();

const emitStatus = (status: CloudProjectSaveStatus) => {
  saveStatus = status;
  statusListeners.forEach((listener) => listener(status));
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(data?.error || "Permintaan penyimpanan proyek gagal.");
  }
  return data as T;
};

const createScene = ({ elements, appState, files }: SceneSnapshot) =>
  JSON.parse(
    serializeAsJSON(elements, appState, files, "database"),
  ) as ExcalidrawInitialDataState;

export const getProjectLink = (access: Pick<CloudProjectAccess, "id" | "token">) =>
  `${window.location.origin}${window.location.pathname}${PROJECT_HASH_PREFIX}${access.id},${access.token}`;

export const getActiveCloudProject = (): CloudProjectAccess | null => {
  const match = window.location.hash.match(/^#project=([^,]+),([^,]+)$/);
  if (!match) {
    return null;
  }
  const storedProject = getKnownCloudProjects().find(
    (project) => project.id === match[1],
  );
  return {
    id: match[1],
    token: match[2],
    title: storedProject?.title || "Proyek Excalidraw",
    updatedAt: storedProject?.updatedAt || "",
  };
};

export const getKnownCloudProjects = (): CloudProjectAccess[] => {
  try {
    const value = localStorage.getItem(PROJECTS_STORAGE_KEY);
    return value ? (JSON.parse(value) as CloudProjectAccess[]) : [];
  } catch (error) {
    console.error(error);
    return [];
  }
};

const rememberProject = (project: CloudProjectAccess) => {
  try {
    const projects = getKnownCloudProjects().filter(
      (candidate) => candidate.id !== project.id,
    );
    projects.unshift(project);
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch (error) {
    console.error(error);
  }
};

const forgetProject = (id: string) => {
  try {
    localStorage.setItem(
      PROJECTS_STORAGE_KEY,
      JSON.stringify(
        getKnownCloudProjects().filter((project) => project.id !== id),
      ),
    );
  } catch (error) {
    console.error(error);
  }
};

export const subscribeToCloudSaveStatus = (
  listener: (status: CloudProjectSaveStatus) => void,
) => {
  statusListeners.add(listener);
  listener(saveStatus);
  return () => {
    statusListeners.delete(listener);
  };
};

export const loadActiveCloudProject = async () => {
  const access = getActiveCloudProject();
  if (!access) {
    return null;
  }
  const response = await fetch(
    `/api/projects/${encodeURIComponent(access.id)}`,
    {
      headers: { Authorization: `Bearer ${access.token}` },
    },
  );
  const project = await parseResponse<CloudProjectResponse>(response);
  rememberProject({
    ...access,
    title: project.title,
    updatedAt: project.updatedAt,
  });
  return project;
};

export const createCloudProject = async (snapshot: SceneSnapshot) => {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: snapshot.title,
      scene: createScene(snapshot),
    }),
  });
  const project = await parseResponse<CloudProjectAccess>(response);
  rememberProject(project);
  return project;
};

const savePendingSnapshot = async () => {
  const access = getActiveCloudProject();
  if (!access || !pendingSnapshot || saveInProgress) {
    return;
  }

  const snapshot = pendingSnapshot;
  pendingSnapshot = null;
  saveInProgress = true;
  emitStatus("saving");
  try {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(access.id)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${access.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: snapshot.title,
          scene: createScene(snapshot),
        }),
      },
    );
    const project = await parseResponse<CloudProjectResponse>(response);
    rememberProject({
      ...access,
      title: project.title,
      updatedAt: project.updatedAt,
    });
    emitStatus("saved");
  } catch (error) {
    console.error(error);
    emitStatus("error");
  } finally {
    saveInProgress = false;
    if (pendingSnapshot) {
      void savePendingSnapshot();
    }
  }
};

export const queueCloudProjectSave = (snapshot: SceneSnapshot) => {
  if (!getActiveCloudProject()) {
    return;
  }
  pendingSnapshot = snapshot;
  emitStatus("saving");
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    void savePendingSnapshot();
  }, AUTOSAVE_DELAY);
};

export const deleteCloudProject = async (project: CloudProjectAccess) => {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(project.id)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${project.token}` },
    },
  );
  await parseResponse<{ deleted: boolean }>(response);
  forgetProject(project.id);
};

export const openCloudProject = (project: CloudProjectAccess) => {
  window.location.href = getProjectLink(project);
};

export const detachActiveCloudProject = () => {
  window.history.replaceState({}, document.title, window.location.pathname);
  emitStatus("idle");
};
