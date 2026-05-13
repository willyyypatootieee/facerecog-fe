"use client";

import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "@vladmandic/face-api";
import Link from "next/link";

export default function Home() {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  type ScanState =
    | "idle"
    | "detecting"
    | "extracting"
    | "verifying"
    | "success"
    | "error";

  const [scanState, setScanState] = useState<ScanState>("idle");
  const scanStateRef = useRef<string>("idle");

  const [simData, setSimData] = useState<number[]>([]);
  const simDataRef = useRef<number[]>([]);

  const [verifiedName, setVerifiedName] = useState<any>(null);
  const [activeClassName, setActiveClassName] = useState<string>("");

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    fetch(`${API_URL}/admin/schedules`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const active = data.find((s) => s.is_active);

          if (active) {
            setActiveClassName(
              `${active.class_name} (Room ${active.room})`
            );
          } else {
            setActiveClassName("No active class schedule right now");
          }
        }
      })
      .catch((err) =>
        console.error("Error fetching schedules:", err)
      );
  }, []);

  useEffect(() => {
    scanStateRef.current = scanState;
  }, [scanState]);

  useEffect(() => {
    simDataRef.current = simData;
  }, [simData]);

  const [devices] = useState<number[]>([0, 1, 2, 3]);
  const [selectedDevice, setSelectedDevice] =
    useState<number>(0);

  const [status, setStatus] = useState<{
    type: "success" | "error" | "info" | null;
    msg: string;
  }>({
    type: null,
    msg: "",
  });

  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
        ]);

        setModelsLoaded(true);
      } catch (err) {
        console.error("Error loading face-api models:", err);
      }
    };

    loadModels();
  }, []);

  useEffect(() => {
    fetch(`http://localhost:8000/set_camera/${selectedDevice}`, {
      method: "POST",
    }).catch((err) =>
      console.error("Error setting camera:", err)
    );
  }, [selectedDevice]);

  useEffect(() => {
    if (
      modelsLoaded &&
      imageRef.current &&
      imageRef.current.complete
    ) {
      handleImageLoad();
    }
  }, [modelsLoaded]);

  const animationFrameRef = useRef<number | null>(null);

  const handleImageLoad = () => {
    if (
      !imageRef.current ||
      !canvasRef.current ||
      !modelsLoaded
    )
      return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const img = imageRef.current;
    const canvas = canvasRef.current;

    canvas.width = img.width || 640;
    canvas.height = img.height || 480;

    const displaySize = {
      width: canvas.width,
      height: canvas.height,
    };

    faceapi.matchDimensions(canvas, displaySize);

    const detectAndDraw = async () => {
      if (!imageRef.current || !canvasRef.current) return;

      const detection = await faceapi
        .detectSingleFace(
          img,
          new faceapi.TinyFaceDetectorOptions({
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
        const resizedResult = faceapi.resizeResults(
          detection,
          displaySize
        );

        const { box } = resizedResult.detection;

        const drawOptions = {
          color: "#f59e0b",
          lineWidth: 1.5,
          drawLines: true,
          drawPoints: true,
          pointSize: 2,
        };

        const drawLandmarks =
          new faceapi.draw.DrawFaceLandmarks(
            resizedResult.landmarks,
            drawOptions
          );

        drawLandmarks.draw(canvas);

        const state = scanStateRef.current;

        if (
          state !== "idle" &&
          state !== "success" &&
          state !== "error"
        ) {
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 2;

          ctx.strokeRect(
            box.x,
            box.y,
            box.width,
            box.height
          );

          const time = Date.now();
          const scanLineY =
            box.y + ((time / 10) % box.height);

          ctx.beginPath();
          ctx.moveTo(box.x, scanLineY);
          ctx.lineTo(box.x + box.width, scanLineY);

          ctx.strokeStyle = "rgba(245,158,11,0.7)";
          ctx.lineWidth = 2;

          ctx.stroke();

          ctx.font = "12px monospace";
          ctx.fillStyle = "rgba(245,158,11,0.95)";

          ctx.save();

          ctx.translate(
            box.x + box.width / 2,
            box.y + box.height / 2
          );

          ctx.scale(-1, 1);

          const textX = -box.width / 2;
          const textY = -box.height / 2;

          ctx.fillText(
            `CONF: ${(
              detection.detection.score * 100
            ).toFixed(2)}%`,
            textX,
            textY - 10
          );

          if (
            state === "extracting" ||
            state === "verifying"
          ) {
            ctx.fillText(
              `EXTRACTING 128D VECTOR...`,
              textX,
              textY + box.height + 20
            );

            ctx.font = "10px monospace";

            const sd = simDataRef.current;

            ctx.fillText(
              `[${sd
                .slice(0, 4)
                .map((n) => n.toFixed(2))
                .join(", ")}...]`,
              textX,
              textY + box.height + 35
            );
          }

          ctx.restore();
        }

        if (scanStateRef.current === "idle") {
          triggerAutoScanRef.current();
        }
      }

      animationFrameRef.current = requestAnimationFrame(
        detectAndDraw
      );
    };

    detectAndDraw();
  };

  const captureFrame = (): string | null => {
    if (!imageRef.current) return null;

    const canvas = document.createElement("canvas");

    canvas.width = imageRef.current.width || 640;
    canvas.height = imageRef.current.height || 480;

    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.drawImage(
        imageRef.current,
        0,
        0,
        canvas.width,
        canvas.height
      );

      return canvas.toDataURL("image/jpeg", 0.9);
    }

    return null;
  };

  const triggerAutoScanRef = useRef<() => void>(() => {});

  triggerAutoScanRef.current = async () => {
    if ((scanStateRef.current as string) !== "idle")
      return;

    const frame = captureFrame();

    if (!frame) return;

    setScanState("detecting");

    await new Promise((r) => setTimeout(r, 600));

    if ((scanStateRef.current as string) !== "detecting")
      return;

    setScanState("extracting");

    try {
      const formData = new FormData();

      formData.append("image", frame);

      const res = await fetch(
        "http://localhost:8000/attendance",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await res.json();

      if (data.embedding) {
        setSimData(data.embedding);
      } else {
        setSimData(
          Array.from({ length: 16 }, () => Math.random())
        );
      }

      await new Promise((r) => setTimeout(r, 800));

      if ((scanStateRef.current as string) !== "extracting")
        return;

      setScanState("verifying");

      await new Promise((r) => setTimeout(r, 600));

      if ((scanStateRef.current as string) !== "verifying")
        return;

      if (res.ok && (data.status === "success" || data.message)) {
        console.log("Attendance API JSON response:", data);
        
        const userObj = data.user || data.data || data.student || data;
        
        let recognizedName = userObj.nama || userObj.name || userObj.student_name || "Unknown";
        
        // If the backend returns details like ["Checked in [late]: John Doe"]
        if (recognizedName === "Unknown" && Array.isArray(userObj.details) && userObj.details.length > 0) {
          const detailStr = userObj.details[0];
          // Try to extract name after the colon, e.g. "Checked in [late]: Achmad Wildan"
          const match = detailStr.match(/:\s*(.*)/);
          recognizedName = match ? match[1] : detailStr;
        } else if (recognizedName === "Unknown" && userObj.message) {
           recognizedName = userObj.message; // Fallback to message string
        }
        
        const recognizedNrp = userObj.nrp || userObj.id || userObj.student_id || "N/A";
        const recognizedJurusan = userObj.jurusan || userObj.major || userObj.department || "N/A";

        setStatus({
          type: "success",
          msg: `Success: ${recognizedName}`,
        });

        setVerifiedName({
          nama: recognizedName,
          nrp: recognizedNrp === "N/A" ? null : recognizedNrp,
          jurusan: recognizedJurusan === "N/A" ? null : recognizedJurusan,
        });

        setScanState("success");

        setTimeout(() => {
          setScanState("idle");
          setVerifiedName(null);
        }, 4000);
      } else {
        setStatus({
          type: "error",
          msg:
            data.detail || "Identification failed.",
        });

        setScanState("error");

        setTimeout(() => setScanState("idle"), 2000);
      }
    } catch (err) {
      setStatus({
        type: "error",
        msg:
          "Network error. Make sure backend is running.",
      });

      setScanState("error");

      setTimeout(() => setScanState("idle"), 2000);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-screen bg-[#f5f7fb] text-slate-800 p-6">
      <div className="card lg:card-side bg-white shadow-2xl w-full border border-slate-200 overflow-hidden rounded-3xl">
        {/* Left */}
        <div className="lg:w-1/2 flex flex-col relative bg-slate-100">
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
            <span className="badge bg-amber-400 text-black border-none badge-sm animate-pulse">
              REC
            </span>

            <span className="text-xs font-mono text-amber-600">
              SCAN ACTIVE
            </span>
          </div>

          <div className="relative w-full aspect-video flex items-center justify-center bg-white">
            <img
              ref={imageRef}
              src={`${API_URL}/video_feed`}
              crossOrigin="anonymous"
              onLoad={handleImageLoad}
              className="w-full h-full object-contain transform scale-x-[-1]"
              alt="Scanner Feed"
            />

            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1] pointer-events-none"
            />

            <div className="absolute inset-0 pointer-events-none bg-amber-300/5" />
          </div>

          <div className="absolute bottom-4 w-full px-4 z-20">
            <select
              className="select select-bordered select-sm w-full bg-white border-slate-300 text-slate-700"
              value={selectedDevice}
              onChange={(e) =>
                setSelectedDevice(
                  Number(e.target.value)
                )
              }
            >
              {devices.map((idx) => (
                <option key={idx} value={idx}>
                  Camera {idx}{" "}
                  {idx === 1 || idx === 2
                    ? "(Possible IR)"
                    : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right */}
        <div className="card-body lg:w-1/2 p-8 lg:p-12 relative flex flex-col bg-white">
          <div className="flex gap-2 justify-end absolute top-4 right-4 z-10 w-full px-4">
            <Link
              href="/register"
              className="btn btn-outline btn-sm border-slate-300 hover:bg-slate-100"
            >
              Register Face
            </Link>

            <Link
              href="/admin"
              className="btn btn-outline btn-sm border-slate-300 hover:bg-slate-100"
            >
              Admin Dashboard
            </Link>
          </div>

          <h2 className="card-title text-3xl font-bold mb-2 mt-8 text-slate-900">
            Access Control Scanner
          </h2>

          <p className="text-slate-500 mb-8">
            Please look squarely into the scanner
            to mark your active shift attendance.
          </p>

          <div className="space-y-8 w-full">
            {activeClassName && (
              <div className="bg-blue-50 text-blue-700 border border-blue-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider opacity-70">
                    Current Active Class
                  </h4>

                  <p className="font-semibold text-lg">
                    {activeClassName}
                  </p>
                </div>

                <div className="badge bg-blue-500 text-white border-none animate-pulse">
                  ONGOING
                </div>
              </div>
            )}

            {status.type && (
              <div
                className={`alert shadow-sm ${
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

            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 relative overflow-hidden shadow-inner">
              <h3 className="font-mono text-sm text-slate-400 mb-4 flex justify-between">
                <span>SYSTEM.STATUS</span>

                <span
                  className={
                    scanState === "idle"
                      ? "text-blue-500"
                      : scanState === "success"
                      ? "text-green-500"
                      : scanState === "error"
                      ? "text-red-500"
                      : "text-amber-500"
                  }
                >
                  [{scanState.toUpperCase()}]
                </span>
              </h3>

              <div className="space-y-4 font-mono text-xs">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      scanState !== "idle"
                        ? "bg-blue-500 animate-pulse"
                        : "bg-slate-300"
                    }`}
                  />

                  <span
                    className={
                      scanState !== "idle"
                        ? "text-blue-600 font-bold"
                        : "text-slate-400"
                    }
                  >
                    1. Face Detection & Alignment
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      scanState === "extracting" ||
                      scanState === "verifying" ||
                      scanState === "success"
                        ? "bg-blue-500 animate-pulse"
                        : "bg-slate-300"
                    }`}
                  />

                  <span
                    className={
                      scanState === "extracting" ||
                      scanState === "verifying" ||
                      scanState === "success"
                        ? "text-blue-600 font-bold"
                        : "text-slate-400"
                    }
                  >
                    2. CNN Feature Extraction (128D)
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      scanState === "verifying" ||
                      scanState === "success"
                        ? "bg-blue-500 animate-pulse"
                        : "bg-slate-300"
                    }`}
                  />

                  <span
                    className={
                      scanState === "verifying" ||
                      scanState === "success"
                        ? "text-blue-600 font-bold"
                        : "text-slate-400"
                    }
                  >
                    3. Vector Distance Calculation
                  </span>
                </div>
              </div>

              {scanState === "extracting" &&
                simData.length > 0 && (
                  <div className="mt-4 p-3 bg-slate-900 rounded-lg font-mono text-[10px] text-amber-300 grid grid-cols-4 gap-1 h-20 overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/70 z-10 pointer-events-none" />

                    {simData.map((val, i) => (
                      <span key={i}>
                        {val.toFixed(4)}
                      </span>
                    ))}

                    {simData.map((val, i) => (
                      <span
                        key={i + 16}
                        className="opacity-50"
                      >
                        {(val * 0.5).toFixed(4)}
                      </span>
                    ))}
                  </div>
                )}

              {scanState === "success" &&
                verifiedName && (
                  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl text-center animate-[pulse_2s_ease-in-out_infinite]">
                    <div className="text-green-600 font-bold text-xl mb-1">
                      ATTENDANCE MARKED
                    </div>

                    <div className="text-slate-800 font-semibold text-lg">
                      {verifiedName.nama || verifiedName.name || "User"}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      {verifiedName.nrp || "-"} {verifiedName.jurusan ? `• ${verifiedName.jurusan}` : ""}
                    </div>

                    {activeClassName &&
                      !activeClassName.startsWith(
                        "No"
                      ) && (
                        <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-green-200/50">
                          Recorded for{" "}
                          <span className="font-semibold text-slate-700">{activeClassName}</span>
                        </div>
                      )}
                  </div>
                )}
            </div>

            {!modelsLoaded && (
              <p className="text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2 mt-8">
                <span className="loading loading-spinner loading-xs"></span>
                Initializing Scanner Models...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}