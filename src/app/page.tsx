"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  API_URL,
  AttendanceResponse,
  RecognizedUser,
  Schedule,
  fetchJson,
  getAttendanceResponseKind,
  getRecognitionDisplay,
  parseRecognizedUsers,
  resolveRegisteredUserName,
} from "@/lib/api";
import { CAMERA_DEVICES } from "@/constants/camera";
import {
  CameraStatus,
  getBackendCameraStatus,
  setBackendCamera,
  stopBackendCamera,
} from "@/lib/camera";
import {
  drawCnnAttentionHeatmap,
  drawReadableLabelOnMirroredCanvas,
} from "@/lib/face-overlay";

type ScanState =
  | "idle"
  | "detecting"
  | "extracting"
  | "verifying"
  | "success"
  | "error";

type StatusMessage = {
  type: "success" | "error" | "info" | null;
  msg: string;
};

export default function Home() {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const scanStateRef = useRef<ScanState>("idle");
  const simDataRef = useRef<number[]>([]);
  const recognizedRef = useRef<RecognizedUser | null>(null);
  const triggerAutoScanRef = useRef<() => void>(() => undefined);
  const autoScanEnabledRef = useRef(true);
  const resultResetTimerRef = useRef<number | null>(null);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [simData, setSimData] = useState<number[]>([]);
  const [recognizedUsers, setRecognizedUsers] = useState<RecognizedUser[]>([]);
  const [recognizedUser, setRecognizedUser] =
    useState<RecognizedUser | null>(null);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<number>(0);
  const [status, setStatus] = useState<StatusMessage>({
    type: null,
    msg: "",
  });
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus | null>(null);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [faceApi, setFaceApi] = useState<
    typeof import("@vladmandic/face-api") | null
  >(null);

  useEffect(() => {
    scanStateRef.current = scanState;
  }, [scanState]);

  useEffect(() => {
    simDataRef.current = simData;
  }, [simData]);

  useEffect(() => {
    recognizedRef.current = recognizedUser;
  }, [recognizedUser]);

  useEffect(() => {
    autoScanEnabledRef.current = autoScanEnabled;
  }, [autoScanEnabled]);

  useEffect(() => {
    return () => {
      if (resultResetTimerRef.current) {
        window.clearTimeout(resultResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        const api = await import("@vladmandic/face-api");
        await Promise.all([
          api.nets.tinyFaceDetector.loadFromUri("/models"),
          api.nets.faceLandmark68Net.loadFromUri("/models"),
        ]);

        if (!cancelled) {
          setFaceApi(api);
          setModelsLoaded(true);
        }
      } catch (error) {
        console.error("Error loading face-api models:", error);
        if (!cancelled) {
          setStatus({
            type: "error",
            msg: "Scanner model failed to load.",
          });
        }
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSchedule = async () => {
      try {
        const [health, schedules] = await Promise.all([
          fetch(`${API_URL}/health`),
          fetchJson<Schedule[]>("/admin/schedules"),
        ]);

        if (!cancelled) {
          setApiOnline(health.ok);
          setActiveSchedule(schedules.find((s) => s.is_active) || null);
        }
      } catch (error) {
        console.error("Error loading scanner context:", error);
        if (!cancelled) {
          setApiOnline(false);
        }
      }
    };

    void loadSchedule();
    const interval = window.setInterval(loadSchedule, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setBackendCamera(selectedDevice, controller.signal)
      .then(() => getBackendCameraStatus())
      .then(setCameraStatus)
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          console.error("Error setting camera:", error);
        }
      });

    const interval = window.setInterval(() => {
      void getBackendCameraStatus()
        .then(setCameraStatus)
        .catch(() => setCameraStatus(null));
    }, 5000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      void stopBackendCamera();
    };
  }, [selectedDevice]);

  const captureFrame = useCallback((): string | null => {
    if (!imageRef.current) return null;

    const canvas = document.createElement("canvas");
    canvas.width = imageRef.current.naturalWidth || imageRef.current.width || 640;
    canvas.height =
      imageRef.current.naturalHeight || imageRef.current.height || 480;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  }, []);

  const triggerAutoScan = useCallback(async () => {
    if ((scanStateRef.current as string) !== "idle") return;
    if (!autoScanEnabledRef.current) return;

    const frame = captureFrame();
    if (!frame) return;

    if (resultResetTimerRef.current) {
      window.clearTimeout(resultResetTimerRef.current);
      resultResetTimerRef.current = null;
    }

    setAutoScanEnabled(false);
    autoScanEnabledRef.current = false;
    setScanState("detecting");
    scanStateRef.current = "detecting";
    setStatus({ type: "info", msg: "Face detected. Verifying identity..." });

    await new Promise((resolve) => window.setTimeout(resolve, 400));
    if ((scanStateRef.current as string) !== "detecting") return;

    setScanState("extracting");
    scanStateRef.current = "extracting";

    try {
      const body = new URLSearchParams();
      body.set("image", frame);

      const res = await fetch(`${API_URL}/attendance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      const data = (await res.json()) as AttendanceResponse;
      setSimData(
        data.embedding ||
          Array.from({ length: 16 }, () => Number(Math.random().toFixed(4)))
      );

      await new Promise((resolve) => window.setTimeout(resolve, 500));
      if ((scanStateRef.current as string) !== "extracting") return;

      setScanState("verifying");
      scanStateRef.current = "verifying";

      await new Promise((resolve) => window.setTimeout(resolve, 450));
      if ((scanStateRef.current as string) !== "verifying") return;

      const hasRecognizedFace =
        Array.isArray(data.recognized) && data.recognized.length > 0;

      if (res.ok && (data.status || data.message || data.user || hasRecognizedFace)) {
        const users = await Promise.all(
          parseRecognizedUsers(data).map((user) =>
            resolveRegisteredUserName(user)
          )
        );
        const user = users[0] || null;
        const display = getRecognitionDisplay(user);

        setRecognizedUsers(users);
        setRecognizedUser(user);
        setStatus({
          type: getAttendanceResponseKind(data),
          msg:
            user?.message ||
            display.message ||
            data.message ||
            (user ? `Attendance marked for ${user.name}` : "Scan processed"),
        });
        setScanState("success");
        scanStateRef.current = "success";
        resultResetTimerRef.current = window.setTimeout(() => {
          setRecognizedUsers([]);
          setRecognizedUser(null);
          setStatus({ type: null, msg: "" });
          setScanState("idle");
          scanStateRef.current = "idle";
          setAutoScanEnabled(true);
          autoScanEnabledRef.current = true;
          resultResetTimerRef.current = null;
        }, 3500);
      } else {
        setStatus({
          type: "error",
          msg: data.detail || data.message || "Identification failed.",
        });
        setScanState("error");
        scanStateRef.current = "error";
        resultResetTimerRef.current = window.setTimeout(() => {
          setScanState("idle");
          scanStateRef.current = "idle";
          setAutoScanEnabled(true);
          autoScanEnabledRef.current = true;
          resultResetTimerRef.current = null;
        }, 2200);
      }
    } catch (error) {
      console.error("Attendance error:", error);
      setStatus({
        type: "error",
        msg: "Network error. Make sure backend is running.",
      });
      setApiOnline(false);
      setScanState("error");
      scanStateRef.current = "error";
      resultResetTimerRef.current = window.setTimeout(() => {
        setScanState("idle");
        scanStateRef.current = "idle";
        setAutoScanEnabled(true);
        autoScanEnabledRef.current = true;
        resultResetTimerRef.current = null;
      }, 2200);
    }
  }, [captureFrame]);

  useEffect(() => {
    triggerAutoScanRef.current = triggerAutoScan;
  }, [triggerAutoScan]);

  const handleImageLoad = useCallback(() => {
    if (!imageRef.current || !canvasRef.current || !modelsLoaded || !faceApi) {
      return;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const img = imageRef.current;
    const canvas = canvasRef.current;
    
    let width = img.naturalWidth || img.width || 640;
    let height = img.naturalHeight || img.height || 480;

    if (typeof width !== "number" || isNaN(width) || width <= 0) {
      width = 640;
    }
    if (typeof height !== "number" || isNaN(height) || height <= 0) {
      height = 480;
    }

    canvas.width = width;
    canvas.height = height;
    const displaySize = { width, height };
    faceApi.matchDimensions(canvas, displaySize);

    const detectAndDraw = async () => {
      if (!imageRef.current || !canvasRef.current) return;

      const detection = await faceApi
        .detectSingleFace(
          img,
          new faceApi.TinyFaceDetectorOptions({
            inputSize: 224,
            scoreThreshold: 0.5,
          })
        )
        .withFaceLandmarks();

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      if (detection && ctx) {
        const resizedResult = faceApi.resizeResults(detection, displaySize);
        const { box } = resizedResult.detection;
        const state = scanStateRef.current;
        const user = recognizedRef.current;
        const isVerified = state === "success" && Boolean(user);
        const recognitionDisplay = getRecognitionDisplay(user);
        const color = isVerified ? recognitionDisplay.color : "#f59e0b";
        const label = isVerified
          ? recognitionDisplay.label
          : state === "idle"
            ? "Face detected"
            : "Verifying...";

        ctx.strokeStyle = color;
        ctx.lineWidth = isVerified ? 3 : 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        drawCnnAttentionHeatmap(ctx, box, resizedResult.landmarks);

        const drawLandmarks = new faceApi.draw.DrawFaceLandmarks(
          resizedResult.landmarks,
          {
            lineColor: color,
            pointColor: color,
            lineWidth: 1.5,
            drawLines: true,
            drawPoints: true,
            pointSize: 2,
          }
        );
        drawLandmarks.draw(canvas);

        drawReadableLabelOnMirroredCanvas(ctx, canvas.width, box, label, {
          background: isVerified
            ? recognitionDisplay.color
            : "rgba(15, 23, 42, 0.88)",
          subLabel:
            isVerified &&
            recognitionDisplay.label !== user?.nrp &&
            recognitionDisplay.label !== "Not registered" &&
            recognitionDisplay.label !== "Spoof suspected"
              ? user?.nrp
              : undefined,
        });

        if (state === "extracting" || state === "verifying") {
          const time = Date.now();
          const scanLineY = box.y + ((time / 10) % box.height);

          ctx.beginPath();
          ctx.moveTo(box.x, scanLineY);
          ctx.lineTo(box.x + box.width, scanLineY);
          ctx.strokeStyle = "rgba(245,158,11,0.7)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        if (state === "idle" && autoScanEnabledRef.current) {
          triggerAutoScanRef.current();
        }
      }

      animationFrameRef.current = requestAnimationFrame(detectAndDraw);
    };

    void detectAndDraw();
  }, [faceApi, modelsLoaded]);

  useEffect(() => {
    if (modelsLoaded && imageRef.current?.complete) {
      handleImageLoad();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [handleImageLoad, modelsLoaded]);

  const activeClassName = activeSchedule
    ? `${activeSchedule.class_name} - Room ${activeSchedule.room}`
    : "No active class schedule";

  return (
    <div className="w-full">
      <div className="grid min-h-[calc(100vh-9rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <section className="relative flex min-h-[320px] flex-col bg-slate-950">
          <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
            <span className="rounded bg-red-500 px-2 py-1 text-xs font-bold text-white">
              REC
            </span>
            <span className="font-mono text-xs text-amber-200">
              CAMERA {selectedDevice}
            </span>
          </div>

          <div className="relative flex flex-1 items-center justify-center bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={`${API_URL}/video_feed`}
              crossOrigin="anonymous"
              onLoad={handleImageLoad}
              className="h-full max-h-[calc(100vh-9rem)] w-full scale-x-[-1] object-contain"
              alt="Scanner feed"
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full scale-x-[-1] object-contain"
            />
          </div>

          <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-col gap-3 sm:flex-row">
            <select
              className="select select-bordered select-sm min-h-9 flex-1 bg-white text-slate-900"
              value={selectedDevice}
              onChange={(event) => setSelectedDevice(Number(event.target.value))}
            >
              {CAMERA_DEVICES.map((idx) => (
                <option key={idx} value={idx}>
                  Camera {idx}
                </option>
              ))}
            </select>
            <div className="rounded border border-slate-500 bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white">
              {autoScanEnabled && scanState === "idle"
                ? "Auto scan watching"
                : "Auto scan processing"}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6 p-6 text-slate-900 lg:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-blue-700">
                Face Recognition Attendance
              </p>
              <h1 className="text-3xl font-bold">Live Scanner</h1>
            </div>
            <div className="flex gap-2">
              <Link href="/register" className="btn btn-sm btn-outline">
                Register
              </Link>
              <Link href="/admin" className="btn btn-sm bg-blue-700 text-white hover:bg-blue-800">
                Admin
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">API</p>
              <p className={apiOnline ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
                {apiOnline === null ? "Checking" : apiOnline ? "Online" : "Offline"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Status</p>
              <p className="font-semibold capitalize">{scanState}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Model</p>
              <p className={modelsLoaded ? "font-semibold text-green-700" : "font-semibold text-amber-700"}>
                {modelsLoaded ? "CNN Ready" : "Loading"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Camera</p>
              <p
                className={
                  cameraStatus?.is_running
                    ? "font-semibold text-green-700"
                    : "font-semibold text-red-700"
                }
              >
                {cameraStatus?.is_running ? "Running" : "Stopped"}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-blue-700">
                  Current Class
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  {activeClassName}
                </p>
              </div>
              <span
                className={`rounded px-2 py-1 text-xs font-bold ${
                  activeSchedule
                    ? "bg-green-600 text-white"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {activeSchedule ? "OPEN" : "CLOSED"}
              </span>
            </div>
          </div>

          {status.type && (
            <div
              className={`alert ${
                status.type === "success"
                  ? "alert-success"
                  : status.type === "error"
                    ? "alert-error"
                    : "alert-info"
              }`}
            >
              <span>{status.msg}</span>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase text-slate-500">
                CNN Recognition Pipeline
              </h2>
              <span className="font-mono text-xs text-slate-500">
                [{scanState.toUpperCase()}]
              </span>
            </div>

            <div className="space-y-3 text-sm">
              {["Face detection", "Embedding extraction", "Attendance match"].map(
                (step, index) => {
                  const active =
                    scanState !== "idle" &&
                    (index === 0 ||
                      (index === 1 &&
                        ["extracting", "verifying", "success"].includes(
                          scanState
                        )) ||
                      (index === 2 &&
                        ["verifying", "success"].includes(scanState)));

                  return (
                    <div key={step} className="flex items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          active ? "bg-blue-600" : "bg-slate-300"
                        }`}
                      />
                      <span className={active ? "font-semibold" : "text-slate-500"}>
                        {step}
                      </span>
                    </div>
                  );
                }
              )}
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Heatmap overlay is rendered at 10% opacity from face landmark
              attention points.
            </div>

            {scanState === "extracting" && simData.length > 0 && (
              <div className="mt-4 grid max-h-24 grid-cols-4 gap-1 overflow-hidden rounded bg-slate-950 p-3 font-mono text-[10px] text-amber-200">
                {simData.concat(simData.map((value) => value * 0.5)).map(
                  (value, index) => (
                    <span key={`${value}-${index}`}>{value.toFixed(4)}</span>
                  )
                )}
              </div>
            )}

            {scanState === "success" && recognizedUsers.length > 0 && (
              <div className="mt-5 space-y-3">
                {recognizedUsers.map((result, index) => {
                  const display = getRecognitionDisplay(result);

                  return (
                    <div
                      key={`${result.nrp || result.name}-${index}`}
                      className={`rounded-lg border p-4 ${
                        display.statusKind === "error"
                          ? "border-red-200 bg-red-50"
                          : display.statusKind === "info"
                            ? "border-blue-200 bg-blue-50"
                            : "border-green-200 bg-green-50"
                      }`}
                    >
                      <p
                        className={`text-xs font-bold uppercase ${
                          display.statusKind === "error"
                            ? "text-red-700"
                            : display.statusKind === "info"
                              ? "text-blue-700"
                              : "text-green-700"
                        }`}
                      >
                        {display.cardTitle}
                      </p>
                      <p className="text-xl font-bold text-slate-900">
                        {display.statusKind === "error" &&
                        result.resultStatus !== "not_registered"
                          ? result.message || display.message
                          : result.name}
                      </p>
                      <p className="text-sm text-slate-600">
                        {[result.nrp, result.jurusan].filter(Boolean).join(" - ") ||
                          result.message ||
                          display.message}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                        {result.attendanceStatus && (
                          <span className="rounded bg-white px-2 py-1 text-green-700">
                            {result.attendanceStatus}
                          </span>
                        )}
                        {result.resultStatus &&
                          result.resultStatus !== result.attendanceStatus && (
                            <span className="rounded bg-white px-2 py-1 text-slate-700">
                              {result.resultStatus}
                            </span>
                          )}
                        {typeof result.confidence === "number" && (
                          <span className="rounded bg-white px-2 py-1 text-slate-700">
                            {(result.confidence * 100).toFixed(1)}% match
                          </span>
                        )}
                        {typeof result.liveness === "number" && (
                          <span className="rounded bg-white px-2 py-1 text-slate-700">
                            {(result.liveness * 100).toFixed(1)}% live
                          </span>
                        )}
                      </div>
                      {result.livenessReasons &&
                        result.livenessReasons.length > 0 && (
                          <div className="mt-3 text-xs text-red-700">
                            Liveness reasons: {result.livenessReasons.join(", ")}
                          </div>
                        )}
                      {result.quality && result.quality.length > 0 && (
                        <div className="mt-2 text-xs text-slate-600">
                          Quality: {result.quality.join(", ")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
