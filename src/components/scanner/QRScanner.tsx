'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerProps {
  onScan: (qrCode: string) => void;
  onClose: () => void;
  isScanning: boolean;
}

export default function QRScanner({ onScan, onClose, isScanning }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isRunningRef = useRef<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Safe stop function
  const safeStopScanner = async () => {
    if (scannerRef.current && isRunningRef.current) {
      try {
        await scannerRef.current.stop();
      } catch (e) {
        // Ignore stop errors
      }
      isRunningRef.current = false;
    }
    scannerRef.current = null;
  };

  useEffect(() => {
    if (!isScanning) return;

    const startScanner = async () => {
      try {
        // Clean up any existing scanner first
        await safeStopScanner();

        // Create scanner instance with optimized settings
        const scanner = new Html5Qrcode('qr-reader', {
          verbose: false,
          formatsToSupport: [0], // QR_CODE only for faster scanning
        });
        scannerRef.current = scanner;

        // Get available cameras
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          throw new Error('No cameras found');
        }

        // Prefer back camera
        const backCamera = cameras.find(c =>
          c.label.toLowerCase().includes('back') ||
          c.label.toLowerCase().includes('rear') ||
          c.label.toLowerCase().includes('environment')
        );
        const cameraId = backCamera ? backCamera.id : cameras[cameras.length - 1].id;

        // Get camera permission and start scanning
        await scanner.start(
          cameraId,
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              // Make scanning area larger - 80% of viewfinder
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.floor(minEdge * 0.8);
              return { width: size, height: size };
            },
            aspectRatio: 1.0,
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            },
          },
          async (decodedText) => {
            // Stop scanning after successful scan
            isRunningRef.current = false;
            try {
              await scanner.stop();
            } catch (e) {
              // Ignore
            }
            onScan(decodedText);
          },
          () => {
            // QR code not found - ignore
          }
        );

        isRunningRef.current = true;
        setHasPermission(true);
        setError(null);
      } catch (err) {
        console.error('Scanner error:', err);
        isRunningRef.current = false;
        setHasPermission(false);
        if (err instanceof Error) {
          if (err.message.includes('Permission')) {
            setError('Camera permission denied. Please allow camera access to scan QR codes.');
          } else {
            setError(`Failed to start camera: ${err.message}`);
          }
        } else {
          setError('Failed to start camera. Please check permissions.');
        }
      }
    };

    startScanner();

    // Cleanup
    return () => {
      safeStopScanner();
    };
  }, [isScanning, onScan]);

  const handleClose = async () => {
    await safeStopScanner();
    setShowManualInput(false);
    setManualCode('');
    onClose();
  };

  const handleManualSubmit = () => {
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      setShowManualInput(false);
      setManualCode('');
    }
  };

  if (!isScanning) return null;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
        <h2 className="text-white font-semibold text-lg">Scan Machine QR Code</h2>
        <button
          onClick={handleClose}
          className="text-white p-2 hover:bg-slate-700 rounded-lg"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scanner area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4" ref={containerRef}>
        {showManualInput ? (
          <div className="text-center p-6 max-w-md w-full">
            <h3 className="text-white text-lg font-semibold mb-4">Enter Machine Code</h3>
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Enter machine QR code"
              className="w-full px-4 py-3 rounded-lg text-lg text-center mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowManualInput(false)}
                className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg font-medium"
              >
                Back
              </button>
              <button
                onClick={handleManualSubmit}
                disabled={!manualCode.trim()}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </div>
        ) : error ? (
          <div className="text-center p-6 max-w-md">
            <div className="text-red-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-white text-lg mb-4">{error}</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setShowManualInput(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium"
              >
                Enter Code Manually
              </button>
              <button
                onClick={handleClose}
                className="px-6 py-3 bg-slate-700 text-white rounded-lg font-medium"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              id="qr-reader"
              className="w-full max-w-md rounded-xl overflow-hidden"
              style={{ minHeight: '300px' }}
            />
            <p className="text-white mt-4 text-center">
              Point camera at the QR code on the washer or dryer
            </p>
          </>
        )}
      </div>

      {/* Instructions */}
      {!error && !showManualInput && (
        <div className="bg-slate-900 px-4 py-4">
          <div className="flex items-center justify-center gap-2 text-slate-300 text-sm mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Position the QR code within the frame</span>
          </div>
          <button
            onClick={() => setShowManualInput(true)}
            className="w-full py-2 text-blue-400 text-sm font-medium"
          >
            Or enter code manually
          </button>
        </div>
      )}
    </div>
  );
}
