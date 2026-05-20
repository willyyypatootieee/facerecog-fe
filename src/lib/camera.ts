import { API_URL } from "@/lib/api";

export type CameraStatus = {
  index: number;
  is_running: boolean;
  has_frame: boolean;
  clients: number;
};

export async function setBackendCamera(index: number, signal?: AbortSignal) {
  const params = new URLSearchParams();
  params.set("index", index.toString());

  await fetch(`${API_URL}/camera/start?${params.toString()}`, {
    method: "POST",
    signal,
  });
}

export async function stopBackendCamera() {
  try {
    await fetch(`${API_URL}/camera/stop`, {
      method: "POST",
    });
  } catch (error) {
    console.debug("Camera stop endpoint is not available:", error);
  }
}

export async function getBackendCameraStatus() {
  const res = await fetch(`${API_URL}/camera/status`);
  return (await res.json()) as CameraStatus;
}
