"use client";

import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "@vladmandic/face-api";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [status, setStatus] = useState<{ type: "success" | "error" | "info" | null; msg: string }>({ type: null, msg: "" });
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    // Load face-api models
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
    // Enumerate devices
    async function getDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedDevice(videoDevices[0].deviceId);
        }
      } catch (err) {
        console.error("Error enumerating devices:", err);
      }
    }
    getDevices();
  }, []);

  useEffect(() => {
    if (selectedDevice && videoRef.current) {
      navigator.mediaDevices
        .getUserMedia({
          video: { deviceId: selectedDevice ? { exact: selectedDevice } : undefined },
        })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.error("Error accessing webcam:", err);
          setStatus({ type: "error", msg: "Could not access the selected camera." });
        });
    }
  }, [selectedDevice]);

  // Handle Video Play - Start tracking faces
  const handleVideoPlay = () => {
    if (!videoRef.current || !canvasRef.current || !modelsLoaded) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);

    let animationFrameId: number;

    const detectAndDraw = async () => {
      if (video.paused || video.ended) return;

      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }))
        .withFaceLandmarks();

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      if (detection) {
        const resizedResult = faceapi.resizeResults(detection, displaySize);
        // Draw the landmarks (the dots thingy)
        // Custom draw options to look like an IR dot projector
        const drawOptions = {
          color: '#ef4444', // Red-ish IR color
          lineWidth: 2,
          drawLines: true,
          drawPoints: true,
          pointSize: 3,
        };
        const drawLandmarks = new faceapi.draw.DrawFaceLandmarks(resizedResult.landmarks, drawOptions);
        drawLandmarks.draw(canvas);
      }

      animationFrameId = requestAnimationFrame(detectAndDraw);
    };

    detectAndDraw();

    return () => cancelAnimationFrame(animationFrameId);
  };

  const captureFrame = (): string | null => {
    if (!videoRef.current) return null;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Draw image normally (it's flipped in CSS but here we just grab the raw pixels)
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.9);
    }
    return null;
  };

  const handleRegister = async () => {
    if (!name.trim()) {
      setStatus({ type: "error", msg: "Please enter a name for registration." });
      return;
    }
    const frame = captureFrame();
    if (!frame) return;

    setStatus({ type: "info", msg: "Registering..." });
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("image", frame);

      const res = await fetch("http://localhost:8000/register", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: "success", msg: data.message });
        setName("");
      } else {
        setStatus({ type: "error", msg: data.detail || "Registration failed." });
      }
    } catch (err) {
      setStatus({ type: "error", msg: "Network error. Make sure backend is running." });
    }
  };

  const handleAttendance = async () => {
    const frame = captureFrame();
    if (!frame) return;

    setStatus({ type: "info", msg: "Identifying..." });
    try {
      const formData = new FormData();
      formData.append("image", frame);

      const res = await fetch("http://localhost:8000/attendance", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: "success", msg: data.message });
      } else {
        setStatus({ type: "error", msg: data.detail || "Identification failed." });
      }
    } catch (err) {
      setStatus({ type: "error", msg: "Network error. Make sure backend is running." });
    }
  };

  return (
    <main className="min-h-screen bg-base-300 flex items-center justify-center p-4 sm:p-8">
      <div className="card lg:card-side bg-base-100 shadow-2xl w-full max-w-5xl border border-base-content/10">
        {/* Left Side - Scanner View */}
        <div className="card-body lg:w-1/2 flex flex-col items-center justify-center relative p-0 bg-black/90 overflow-hidden rounded-t-2xl lg:rounded-l-2xl lg:rounded-tr-none">
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
            <span className="badge badge-error badge-sm animate-pulse">REC</span>
            <span className="text-xs font-mono text-error/80">IR SCAN ACTIVE</span>
          </div>

          <div className="relative w-full aspect-video flex items-center justify-center">
            {/* The Video Element */}
            <video
              ref={videoRef}
              onPlay={handleVideoPlay}
              onLoadedMetadata={() => {
                if (videoRef.current && canvasRef.current) {
                  canvasRef.current.width = videoRef.current.videoWidth;
                  canvasRef.current.height = videoRef.current.videoHeight;
                }
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform scale-x-[-1]"
            />
            {/* The Canvas Overlay for "Dots" */}
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1] pointer-events-none"
            />
            {/* Scanning Laser Effect Overlay */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(239,68,68,0.1)_50%)] bg-[length:100%_4px]" />
          </div>

          <div className="absolute bottom-4 w-full px-4 z-20">
            <select 
              className="select select-bordered select-sm w-full bg-base-100/50 backdrop-blur"
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
            >
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId} className="text-base-content">
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Side - Controls */}
        <div className="card-body lg:w-1/2 p-8 lg:p-12">
          <h2 className="card-title text-3xl font-bold mb-2">Access Control</h2>
          <p className="text-base-content/70 mb-8">
            Identify yourself via the secure IR scanner or register a new identity profile.
          </p>

          <div className="space-y-8 w-full">
            {/* Status Alert */}
            {status.type && (
              <div className={`alert ${
                status.type === 'success' ? 'alert-success' : 
                status.type === 'error' ? 'alert-error' : 'alert-info'
              } shadow-sm`}>
                <span>{status.msg}</span>
              </div>
            )}

            {/* Attendance Action */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">Verify Identity</span>
              </label>
              <button 
                onClick={handleAttendance}
                className="btn btn-primary btn-block shadow-lg"
                disabled={!modelsLoaded}
              >
                Mark Attendance
              </button>
            </div>

            <div className="divider">OR</div>

            {/* Registration Action */}
            <div className="form-control gap-2">
              <label className="label">
                <span className="label-text font-semibold">Register New User</span>
              </label>
              <input 
                type="text" 
                placeholder="Enter full name..." 
                className="input input-bordered w-full" 
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button 
                onClick={handleRegister}
                className="btn btn-secondary btn-block"
                disabled={!modelsLoaded}
              >
                Register Face
              </button>
            </div>
            
            {!modelsLoaded && (
              <p className="text-center text-xs text-base-content/50 flex items-center justify-center gap-2">
                <span className="loading loading-spinner loading-xs"></span>
                Initializing Scanner Models...
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
