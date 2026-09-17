import { useEffect, useMemo, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  createCloudProject,
  deleteCloudProject,
  getActiveCloudProject,
  getKnownCloudProjects,
  getProjectLink,
  openCloudProject,
} from "../data/cloudProjects";

import type { CloudProjectAccess } from "../data/cloudProjects";

export const CloudProjectsDialog = ({
  excalidrawAPI,
  onClose,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  onClose: () => void;
}) => {
  const activeProject = useMemo(() => getActiveCloudProject(), []);
  const [projects, setProjects] = useState(getKnownCloudProjects);
  const [title, setTitle] = useState(
    excalidrawAPI.getName() || "Proyek tanpa judul",
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
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const saveAsNewProject = async () => {
    setBusy(true);
    setMessage("");
    try {
      const project = await createCloudProject({
        elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
        appState: excalidrawAPI.getAppState(),
        files: excalidrawAPI.getFiles(),
        title: title.trim() || "Proyek tanpa judul",
      });
      window.location.href = getProjectLink(project);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Proyek gagal disimpan.",
      );
      setBusy(false);
    }
  };

  const copyLink = async (project: CloudProjectAccess) => {
    await navigator.clipboard.writeText(getProjectLink(project));
    setMessage("Tautan rahasia proyek telah disalin.");
  };

  const removeProject = async (project: CloudProjectAccess) => {
    if (!window.confirm(`Hapus proyek “${project.title}”?`)) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await deleteCloudProject(project);
      setProjects(getKnownCloudProjects());
      setMessage("Proyek telah dihapus.");
      if (activeProject?.id === project.id) {
        window.location.assign(window.location.pathname);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Proyek gagal dihapus.",
      );
    } finally {
      setBusy(false);
    }
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
            <h2 id="cloud-projects-title">Proyek Saya</h2>
            <p>Simpan dan buka kembali diagram dari perangkat mana pun.</p>
          </div>
          <button
            aria-label="Tutup"
            className="cloud-projects-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="cloud-projects-create">
          <label htmlFor="cloud-project-title">Nama proyek</label>
          <div>
            <input
              id="cloud-project-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
            <button disabled={busy} onClick={saveAsNewProject} type="button">
              Simpan sebagai proyek baru
            </button>
          </div>
        </div>

        {message && <p className="cloud-projects-message">{message}</p>}

        <div className="cloud-projects-list">
          {projects.length === 0 ? (
            <p className="cloud-projects-empty">Belum ada proyek tersimpan.</p>
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
                    {project.updatedAt
                      ? `Diperbarui ${new Date(project.updatedAt).toLocaleString("id-ID")}`
                      : "Tersimpan di cloud"}
                  </small>
                </div>
                <div className="cloud-projects-actions">
                  <button
                    disabled={busy}
                    onClick={() => openCloudProject(project)}
                    type="button"
                  >
                    Buka
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void copyLink(project)}
                    type="button"
                  >
                    Salin tautan
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => void removeProject(project)}
                    type="button"
                  >
                    Hapus
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        <p className="cloud-projects-note">
          Tautan proyek berisi kunci rahasia. Siapa pun yang memiliki tautan dapat
          membuka dan mengubah proyek.
        </p>
      </section>
    </div>
  );
};
