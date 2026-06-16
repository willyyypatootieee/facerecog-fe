"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { CAMERA_DEVICES } from "@/constants/camera";
import { setBackendCamera, stopBackendCamera } from "@/lib/camera";
import { drawReadableLabelOnMirroredCanvas } from "@/lib/face-overlay";

type StatusMessage = {
  type: "success" | "error" | "info" | null;
  msg: string;
};

export default function Register() {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [selectedDevice, setSelectedDevice] = useState<number>(0);
  const [nrp, setNrp] = useState("");
  const [nama, setNama] = useState("");
  const [jurusan, setJurusan] = useState("");
  const [role, setRole] = useState("student");
  const [status, setStatus] = useState<StatusMessage>({
    type: null,
    msg: "",
  });
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceVisible, setFaceVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [faceApi, setFaceApi] = useState<
    typeof import("@vladmandic/face-api") | null
  >(null);

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
          setStatus({ type: "error", msg: "Scanner model failed to load." });
        }
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setBackendCamera(selectedDevice, controller.signal).catch((error: Error) => {
      if (error.name !== "AbortError") {
        console.error("Error setting camera:", error);
      }
    });

    return () => {
      controller.abort();
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

      setFaceVisible(Boolean(detection));

      if (detection && ctx) {
        const resizedResult = faceApi.resizeResults(detection, displaySize);
        const { box } = resizedResult.detection;

        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        const drawLandmarks = new faceApi.draw.DrawFaceLandmarks(
          resizedResult.landmarks,
          {
            lineColor: "#2563eb",
            pointColor: "#2563eb",
            lineWidth: 1.5,
            drawLines: true,
            drawPoints: true,
            pointSize: 2,
          }
        );
        drawLandmarks.draw(canvas);

        drawReadableLabelOnMirroredCanvas(
          ctx,
          canvas.width,
          box,
          nama.trim() || "New profile",
          { background: "rgba(37, 99, 235, 0.94)" }
        );
      }

      animationFrameRef.current = requestAnimationFrame(detectAndDraw);
    };

    void detectAndDraw();
  }, [faceApi, modelsLoaded, nama]);

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

  const handleRegister = async () => {
    if (!nrp.trim() || !nama.trim() || !jurusan.trim()) {
      setStatus({ type: "error", msg: "Fill NRP, name, and department." });
      return;
    }

    if (!faceVisible) {
      setStatus({ type: "error", msg: "Face is not detected in the frame." });
      return;
    }

    const frame = captureFrame();
    if (!frame) return;

    setSubmitting(true);
    setStatus({ type: "info", msg: "Registering face profile..." });

    try {
      const body = new URLSearchParams();
      body.set("nrp", nrp.trim());
      body.set("nama", nama.trim());
      body.set("jurusan", jurusan.trim());
      body.set("role", role.trim() || "student");
      body.set("image", frame);

      const res = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const data = (await res.json()) as { message?: string; detail?: string };

      if (res.ok) {
        setStatus({
          type: "success",
          msg: data.message || "Face profile registered.",
        });
        setNrp("");
        setNama("");
        setJurusan("");
        setRole("student");
      } else {
        setStatus({
          type: "error",
          msg: data.detail || "Registration failed.",
        });
      }
    } catch (error) {
      console.error("Registration error:", error);
      setStatus({
        type: "error",
        msg: "Network error. Make sure backend is running.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <section className="relative flex min-h-[320px] flex-col bg-slate-950">
        <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
          <span className="rounded bg-blue-600 px-2 py-1 text-xs font-bold text-white">
            REC
          </span>
          <span className="font-mono text-xs text-blue-100">
            REGISTRATION CAMERA
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
            alt="Registration camera feed"
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
          <span
            className={`rounded px-3 py-2 text-xs font-bold ${
              faceVisible ? "bg-green-600 text-white" : "bg-slate-200 text-slate-700"
            }`}
          >
            {faceVisible ? "FACE READY" : "NO FACE"}
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-6 p-6 text-slate-900 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-700">
              Enrollment
            </p>
            <h1 className="text-3xl font-bold">Register Face</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="btn btn-sm btn-outline">
              Scanner
            </Link>
            <Link href="/admin" className="btn btn-sm bg-blue-700 text-white hover:bg-blue-800">
              Admin
            </Link>
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

        <div className="grid gap-4">
          <label className="form-control">
            <span className="label-text mb-1 font-semibold text-slate-700">
              NRP
            </span>
            <input
              type="text"
              placeholder="Student NRP"
              className="input input-bordered bg-white text-slate-900"
              value={nrp}
              onChange={(event) => setNrp(event.target.value)}
            />
          </label>

          <label className="form-control">
            <span className="label-text mb-1 font-semibold text-slate-700">
              Full Name
            </span>
            <input
              type="text"
              placeholder="Full name"
              className="input input-bordered bg-white text-slate-900"
              value={nama}
              onChange={(event) => setNama(event.target.value)}
            />
          </label>

          <label className="form-control">
            <span className="label-text mb-1 font-semibold text-slate-700">
              Department
            </span>
            <input
              type="text"
              placeholder="Department"
              className="input input-bordered bg-white text-slate-900"
              value={jurusan}
              onChange={(event) => setJurusan(event.target.value)}
            />
          </label>

          <label className="form-control">
            <span className="label-text mb-1 font-semibold text-slate-700">
              Role
            </span>
            <select
              className="select select-bordered bg-white text-slate-900"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="student">Student</option>
              <option value="lecturer">Lecturer</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <button
            onClick={handleRegister}
            className="btn mt-2 bg-blue-700 text-white hover:bg-blue-800"
            disabled={!modelsLoaded || submitting}
          >
            {submitting ? "Registering..." : "Capture and Register"}
          </button>
        </div>

        {!modelsLoaded && (
          <p className="text-sm text-slate-500">Initializing scanner model...</p>
        )}
      </section>
    </div>
  );
}
