"use client";

import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "@vladmandic/face-api";

export default function Home() {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  type ScanState = "idle" | "detecting" | "extracting" | "verifying" | "success" | "error";
  const [scanState, setScanState] = useState<ScanState>("idle");
  const scanStateRef = useRef<ScanState>("idle");
  const [simData, setSimData] = useState<number[]>([]);
  const simDataRef = useRef<number[]>([]);
  const [verifiedName, setVerifiedName] = useState<string>("");

  useEffect(() => {
    scanStateRef.current = scanState;
  }, [scanState]);
  
  useEffect(() => {
    simDataRef.current = simData;
  }, [simData]);

  const [devices] = useState<number[]>([0, 1, 2, 3]);
  const [selectedDevice, setSelectedDevice] = useState<number>(0);
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
    // Notify backend to change camera index
    fetch(`http://localhost:8000/set_camera/${selectedDevice}`, { method: 'POST' })
      .catch(err => console.error("Error setting camera:", err));
  }, [selectedDevice]);

  // Ensure detection loop starts if models load after the stream connects
  useEffect(() => {
    if (modelsLoaded && imageRef.current && imageRef.current.complete) {
      handleImageLoad();
    }
  }, [modelsLoaded]);

  // Handle Image Load - Start tracking faces on the MJPEG stream
  const handleImageLoad = () => {
    if (!imageRef.current || !canvasRef.current || !modelsLoaded) return;

    const img = imageRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match image
    canvas.width = img.width || 640;
    canvas.height = img.height || 480;
    const displaySize = { width: canvas.width, height: canvas.height };
    faceapi.matchDimensions(canvas, displaySize);

    let animationFrameId: number;

    const detectAndDraw = async () => {
      const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks();

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      if (detection) {
        const resizedResult = faceapi.resizeResults(detection, displaySize);
        const { box } = resizedResult.detection;
        
        if (ctx) {
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
          
          const state = scanStateRef.current;
          
          if (state !== 'idle' && state !== 'success' && state !== 'error') {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            // Draw a scanning line moving down the box
            const time = Date.now();
            const scanLineY = box.y + ((time / 10) % box.height);
            ctx.beginPath();
            ctx.moveTo(box.x, scanLineY);
            ctx.lineTo(box.x + box.width, scanLineY);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Draw some "matrix" numbers around the box
            ctx.font = "12px monospace";
            ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
            
            // Note: Since the canvas is horizontally flipped via CSS (scale-x-[-1]), 
            // text drawn on it would appear backward. To fix this, we can flip the context for text,
            // or just let it be mirrored like a true raw IR feed. Let's flip it back for text.
            ctx.save();
            // Translate to the center of the box, flip, then draw
            ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
            ctx.scale(-1, 1);
            // Now coordinates are relative to the center of the box, but flipped
            const textX = -box.width / 2;
            const textY = -box.height / 2;
            
            ctx.fillText(`CONF: ${(detection.detection.score * 100).toFixed(2)}%`, textX, textY - 10);
            if (state === 'extracting' || state === 'verifying') {
                ctx.fillText(`EXTRACTING 128D VECTOR...`, textX, textY + box.height + 20);
                // Draw some sim data
                ctx.font = "10px monospace";
                const sd = simDataRef.current;
                ctx.fillText(`[${sd.slice(0,4).map(n => n.toFixed(2)).join(', ')}...]`, textX, textY + box.height + 35);
            }
            ctx.restore();
          }
        }
        
        if (scanStateRef.current === "idle") {
          triggerAutoScanRef.current();
        }
      }

      animationFrameId = requestAnimationFrame(detectAndDraw);
    };

    detectAndDraw();

    return () => cancelAnimationFrame(animationFrameId);
  };

  const captureFrame = (): string | null => {
    if (!imageRef.current) return null;
    const canvas = document.createElement("canvas");
    canvas.width = imageRef.current.width || 640;
    canvas.height = imageRef.current.height || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Draw image normally (it's flipped in CSS but here we just grab the raw pixels)
      ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
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

  const triggerAutoScanRef = useRef<() => void>(() => {});
  
  triggerAutoScanRef.current = async () => {
    if (scanStateRef.current !== "idle") return;
    
    const frame = captureFrame();
    if (!frame) return;

    setScanState("detecting");
    
    // Simulate detecting
    await new Promise(r => setTimeout(r, 600));
    
    if (scanStateRef.current !== "detecting") return;
    
    setScanState("extracting");
    
    try {
      const formData = new FormData();
      formData.append("image", frame);

      // Hit the attendance endpoint to get the real embedding
      const res = await fetch("http://localhost:8000/attendance", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      
      if (data.embedding) {
          setSimData(data.embedding);
      } else {
          setSimData(Array.from({length: 16}, () => Math.random()));
      }

      // Show extracting state with the REAL data for a moment
      await new Promise(r => setTimeout(r, 800));
      if (scanStateRef.current !== "extracting") return;

      setScanState("verifying");
      await new Promise(r => setTimeout(r, 600));
      if (scanStateRef.current !== "verifying") return;

      if (res.ok && data.status === "success") {
        setStatus({ type: "success", msg: data.message });
        setVerifiedName(data.user);
        setScanState("success");
        setTimeout(() => {
           setScanState("idle");
           setVerifiedName("");
        }, 4000);
      } else {
        setStatus({ type: "error", msg: data.detail || "Identification failed." });
        setScanState("error");
        setTimeout(() => setScanState("idle"), 2000);
      }
    } catch (err) {
      setStatus({ type: "error", msg: "Network error. Make sure backend is running." });
      setScanState("error");
      setTimeout(() => setScanState("idle"), 2000);
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
            {/* The Image Element receiving MJPEG */}
            <img
              ref={imageRef}
              src="http://localhost:8000/video_feed"
              crossOrigin="anonymous"
              onLoad={handleImageLoad}
              className="w-full h-full object-cover transform scale-x-[-1]"
              alt="Scanner Feed"
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
              onChange={(e) => setSelectedDevice(Number(e.target.value))}
            >
              {devices.map((idx) => (
                <option key={idx} value={idx} className="text-base-content">
                  Camera {idx} {idx === 1 || idx === 2 ? '(Possible IR)' : ''}
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

            {/* Simulation Status */}
            <div className="bg-base-200 rounded-xl p-4 border border-base-content/5 relative overflow-hidden shadow-inner">
              <h3 className="font-mono text-sm opacity-50 mb-4 flex justify-between">
                <span>SYSTEM.STATUS</span>
                <span className={scanState === 'idle' ? 'text-info' : scanState === 'success' ? 'text-success' : scanState === 'error' ? 'text-error' : 'text-warning'}>
                  [{scanState.toUpperCase()}]
                </span>
              </h3>
              
              <div className="space-y-4 font-mono text-xs">
                {/* Simulated Logs */}
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${scanState !== 'idle' ? 'bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--p),1)]' : 'bg-base-content/20'}`}></span>
                  <span className={scanState !== 'idle' ? 'text-primary font-bold' : 'opacity-50'}>1. Face Detection & Alignment</span>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${scanState === 'extracting' || scanState === 'verifying' || scanState === 'success' ? 'bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--p),1)]' : 'bg-base-content/20'}`}></span>
                  <span className={scanState === 'extracting' || scanState === 'verifying' || scanState === 'success' ? 'text-primary font-bold' : 'opacity-50'}>
                    2. CNN Feature Extraction (128D)
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${scanState === 'verifying' || scanState === 'success' ? 'bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--p),1)]' : 'bg-base-content/20'}`}></span>
                  <span className={scanState === 'verifying' || scanState === 'success' ? 'text-primary font-bold' : 'opacity-50'}>
                    3. Vector Distance Calculation
                  </span>
                </div>
              </div>

              {scanState === 'extracting' && simData.length > 0 && (
                <div className="mt-4 p-2 bg-black/80 rounded font-mono text-[10px] text-error/80 grid grid-cols-4 gap-1 h-20 overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 z-10 pointer-events-none"></div>
                  {simData.map((val, i) => (
                    <span key={i} className="animate-pulse">{val.toFixed(4)}</span>
                  ))}
                  {simData.map((val, i) => (
                    <span key={i + 16} className="animate-pulse opacity-50">{(val * 0.5).toFixed(4)}</span>
                  ))}
                </div>
              )}

              {scanState === 'success' && verifiedName && (
                <div className="mt-4 p-4 bg-success/10 border border-success/30 rounded-lg text-center animate-[pulse_2s_ease-in-out_infinite]">
                  <div className="text-success font-bold text-xl mb-1">ACCESS GRANTED</div>
                  <div className="text-base-content font-semibold">Welcome, {verifiedName}</div>
                </div>
              )}
            </div>

            <div className="divider">MANUAL REGISTRATION</div>

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
