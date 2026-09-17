import { useEffect, useMemo, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  createCloudProject,
  deleteCloudProject,
  getActiveCloudProject,
  getCurrentUser,
  getKnownCloudProjects,
  openCloudProject,
  renameCloudProject,
} from "../data/cloudProjects";

import type { CloudProjectAccess, CloudUser } from "../data/cloudProjects";

export const CloudProjectsDialog = ({
  excalidrawAPI,
  onClose,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  onClose: () => void;
}) => {
  const activeProject = useMemo(() => getActiveCloudProject(), []);
  const [projects, setProjects] = useState<CloudProjectAccess[]>([]);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [title, setTitle] = useState(
    excalidrawAPI.getName() || "Untitled project",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    void (async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      if (currentUser) {
        setProjects(await getKnownCloudProjects());
      }
    })();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const createProject = async () => {
    setBusy(true);
    setMessage("");
    try {
      const project = await createCloudProject({
        elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
        appState: excalidrawAPI.getAppState(),
        files: excalidrawAPI.getFiles(),
        title: title.trim() || "Untitled project",
      });
      onClose();
      await openCloudProject(project);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save project.");
      setBusy(false);
    }
  };

  const removeProject = async (project: CloudProjectAccess) => {
    if (!window.confirm(`Delete “${project.title}”?`)) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await deleteCloudProject(project);
      setProjects(await getKnownCloudProjects());
      if (activeProject?.id === project.id) {
        window.location.assign(window.location.pathname);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not delete project.",
      );
    } finally {
      setBusy(false);
    }
  };

  const renameProject = async (project: CloudProjectAccess) => {
    const nextTitle = window.prompt("Project name", project.title)?.trim();
    if (!nextTitle || nextTitle === project.title) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const updated = await renameCloudProject(project, nextTitle);
      setProjects((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (activeProject?.id === updated.id) {
        setTitle(updated.title);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not rename project.",
      );
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  };

  return (
    <div className="cloud-projects-backdrop" role="presentation">
      <section
        aria-labelledby="cloud-projects-title"
        aria-modal="true"
        className="cloud-projects-dialog"
        role="dialog"
      >
        <header>
          <div>
            <h2 id="cloud-projects-title">My Projects</h2>
            <p>
              {user
                ? `Signed in as ${user.email}`
                : "Sign in to access your projects on every device."}
            </p>
          </div>
          <button
            aria-label="Close"
            className="cloud-projects-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        {!user ? (
          <div className="cloud-projects-create">
            <a href="/api/auth/login">
              <button type="button">Sign in with Google</button>
            </a>
          </div>
        ) : (
          <>
            <div className="cloud-projects-create">
              <label htmlFor="cloud-project-title">Project name</label>
              <div>
                <input
                  id="cloud-project-title"
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
                <button
                  disabled={busy}
                  onClick={() => void createProject()}
                  type="button"
                >
                  Save as new project
                </button>
              </div>
            </div>

            {message && <p className="cloud-projects-message">{message}</p>}

            <div className="cloud-projects-list">
              {projects.length === 0 ? (
                <p className="cloud-projects-empty">No saved projects yet.</p>
              ) : (
                projects.map((project) => (
                  <article
                    className={
                      activeProject?.id === project.id ? "is-active" : undefined
                    }
                    key={project.id}
                  >
                    <div>
                      <strong>{project.title}</strong>
                      <small>
                        Updated {new Date(project.updatedAt).toLocaleString()}
                      </small>
                    </div>
                    <div className="cloud-projects-actions">
                      <button
                        disabled={busy}
                        onClick={() => void renameProject(project)}
                        type="button"
                      >
                        Rename
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          onClose();
                          void openCloudProject(project);
                        }}
                        type="button"
                      >
                        Open
                      </button>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => void removeProject(project)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
            <button onClick={() => void logout()} type="button">
              Sign out
            </button>
          </>
        )}
      </section>
    </div>
  );
};
