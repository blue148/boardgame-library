import { useState, useRef, useEffect } from 'react';
import { Camera, X, Loader } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
  onManualEntry: () => void;
}

export default function BarcodeScanner({ onScan, onClose, onManualEntry }: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerIdRef = useRef<string>('barcode-scanner-' + Math.random().toString(36).substring(7));
  const shouldInitScanner = useRef(false);
  const isRunningRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    checkCameraPermission();
    return () => {
      isMountedRef.current = false;
      if (html5QrCodeRef.current && isRunningRef.current) {
        html5QrCodeRef.current.stop().catch(console.error);
        isRunningRef.current = false;
      }
    };
  }, []);

  // Initialize scanner after DOM is ready
  useEffect(() => {
    if (isScanning && shouldInitScanner.current) {
      shouldInitScanner.current = false;
      initializeScanner();
    }
  }, [isScanning]);

  const checkCameraPermission = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionStatus('unsupported');
      setError('Camera access is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.');
      return;
    }

    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setError('Camera access requires HTTPS. Please access this site using https:// or use localhost for development.');
      return;
    }

    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
      setPermissionStatus(result.state as 'prompt' | 'granted' | 'denied');

      if (result.state === 'denied') {
        setError('Camera access has been blocked. Please enable camera permissions in your browser settings and refresh the page.');
      }

      result.addEventListener('change', () => {
        setPermissionStatus(result.state as 'prompt' | 'granted' | 'denied');
        if (result.state === 'denied') {
          setError('Camera access has been blocked. Please enable camera permissions in your browser settings and refresh the page.');
        } else {
          setError('');
        }
      });
    } catch (err) {
      console.log('Permission API not supported, will prompt when camera is accessed');
    }
  };

  const stopScanning = async () => {
    if (html5QrCodeRef.current && isRunningRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
        isRunningRef.current = false;
      } catch (err) {
        console.error('Error stopping scanner:', err);
        // Reset the running state even if stop fails
        isRunningRef.current = false;
      }
    }
  };

  const qrCodeSuccessCallback = (decodedText: string) => {
    if (!isMountedRef.current) return;

    console.log('Barcode detected:', decodedText);

    // Immediately stop scanning to prevent duplicate scans and improve performance
    setIsScanning(false);
    stopScanning();
    onScan(decodedText);
  };

  const qrCodeErrorCallback = (error: string) => {
    // Only log significant errors, not the constant "No barcode detected" messages
    if (error && !error.includes('No barcode or QR code detected') && !error.includes('NotFoundException')) {
      console.log('Scanner error:', error);
    }
  };

  const startScanning = () => {
    setError('');
    shouldInitScanner.current = true;
    setIsScanning(true);
  };

  const initializeScanner = async () => {
    try {
      const scannerId = scannerIdRef.current;

      // Wait a tick to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if element exists
      const element = document.getElementById(scannerId);
      if (!element) {
        throw new Error(`Scanner element with id ${scannerId} not found in DOM`);
      }

      html5QrCodeRef.current = new Html5Qrcode(scannerId);

      // Add timeout wrapper for camera initialization - shorter timeout for mobile
      const initializeWithTimeout = async (cameraConfig: any, config: any) => {
        return new Promise((resolve, reject) => {
          const timeoutDuration = isMobile ? 6000 : 10000; // Shorter timeout on mobile
          const timeout = setTimeout(() => {
            reject(new Error('Camera initialization timeout'));
          }, timeoutDuration);

          html5QrCodeRef.current!.start(
            cameraConfig,
            config,
            qrCodeSuccessCallback,
            qrCodeErrorCallback
          ).then(() => {
            clearTimeout(timeout);
            isRunningRef.current = true;
            resolve(true);
          }).catch((error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      };

      // Detect if we're on a mobile device for optimized settings
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      // Calculate responsive qrbox size based on viewport - smaller for mobile
      const config = {
        fps: isMobile ? 8 : 12, // Lower FPS on mobile for better performance
        qrbox: function(viewfinderWidth: number, _viewfinderHeight: number) {
          // Smaller scanning area on mobile for faster processing
          const widthRatio = isMobile ? 0.6 : 0.75;
          const width = Math.min(viewfinderWidth * widthRatio, isMobile ? 220 : 280);
          const height = Math.min(width * 0.25, isMobile ? 55 : 70);
          return {
            width: Math.floor(width),
            height: Math.floor(height)
          };
        },
        aspectRatio: 1.777778,
        disableFlip: false,
        // Focus on most common barcode formats for speed - prioritize board game formats
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13, // Most common on board games
          Html5QrcodeSupportedFormats.UPC_A,  // Common in North America
          Html5QrcodeSupportedFormats.EAN_8   // Smaller products
        ],
        rememberLastUsedCamera: true,
        // Enable native barcode detection on supported devices (iPhone)
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        },
        // Optimize video settings for mobile performance
        videoConstraints: isMobile ? {
          width: { ideal: 640, max: 1024 },     // Lower resolution for mobile
          height: { ideal: 480, max: 768 },
          focusMode: 'continuous',
          frameRate: { ideal: 8, max: 12 }     // Limit frame rate
        } : {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          focusMode: 'continuous'
        },
        // Disable verbose logging for performance
        verbose: false,
        showTorchButtonIfSupported: true
      };


      // Try multiple camera configurations for iPhone compatibility

      // Optimized camera initialization sequence for iPhone performance
      if (isMobile) {
        // iPhone-optimized sequence: start with most likely to work
        try {
          // First try: simple environment camera for iPhone
          await initializeWithTimeout({ facingMode: 'environment' }, config);
        } catch (envError) {
          console.log('Environment camera failed, trying without constraints:', envError);

          // Second try: any camera without constraints (fastest)
          try {
            await initializeWithTimeout({}, config);
          } catch (anyError) {
            console.log('Any camera failed, trying user camera:', anyError);

            // Final try: front camera
            await initializeWithTimeout({ facingMode: 'user' }, config);
          }
        }
      } else {
        // Desktop sequence: try advanced settings
        try {
          await initializeWithTimeout({
            facingMode: 'environment',
            advanced: [
              { focusMode: 'continuous' },
              { focusDistance: { ideal: 0.3 } },
              { zoom: { ideal: 1.0 } }
            ]
          }, config);
        } catch (envError) {
          console.log('Environment camera with advanced settings failed, trying basic environment:', envError);

          // Fallback to basic environment camera
          try {
            await initializeWithTimeout({ facingMode: 'environment' }, config);
          } catch (basicError) {
            console.log('Basic environment camera failed, trying any camera:', basicError);

            // Final fallback
            await initializeWithTimeout({}, config);
          }
        }
      }
    } catch (err: any) {
      console.error('Error accessing camera:', err);
      console.error('Error type:', err?.name);
      console.error('Error message:', err?.message);

      // Reset scanner state on error
      setIsScanning(false);
      isRunningRef.current = false;

      if (!isMountedRef.current) return;

      const errorMessage = err?.message || err?.toString() || '';
      const errorName = err?.name || '';

      if (errorName === 'NotAllowedError' || errorMessage.includes('Permission denied') || errorMessage.includes('permission denied')) {
        setError('Camera access was denied. Please click "Allow" when your browser asks for camera permission, or enable it in your browser settings.');
      } else if (errorName === 'NotFoundError' || errorMessage.includes('not find') || errorMessage.includes('Requested device not found')) {
        setError('No camera found on this device. Please ensure your device has a camera or try a different device.');
      } else if (errorName === 'NotReadableError' || errorMessage.includes('Could not start video source') || errorMessage.includes('already in use')) {
        setError('Camera is already in use by another application. Please close other apps using the camera and try again.');
      } else if (errorName === 'NotSupportedError' || errorMessage.includes('secure') || errorMessage.includes('Only secure origins')) {
        setError('Camera access requires HTTPS. Please access this site using https:// or localhost.');
      } else if (errorName === 'OverconstrainedError' || errorMessage.includes('Overconstrained')) {
        setError('Camera constraint issue detected. This is common on mobile devices.');
        // The multiple camera attempts above should handle this case
      } else if (errorMessage.includes('Camera access is only supported in secure contexts')) {
        setError('Camera access requires HTTPS. Please access this site using https:// or localhost.');
      } else if (errorMessage.includes('not found in DOM')) {
        setError('Scanner initialization failed. Please try again.');
      } else {
        setError(`Unable to access camera: ${errorMessage || 'Unknown error'}. Check browser console for details.`);
      }
    }
  };

  const handleClose = async () => {
    await stopScanning();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-cream border thin-rule rule-line shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b thin-rule rule-line">
          <h2 className="text-xl font-display font-light text-slate-900 tracking-wide">New Entry</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-100 transition"
            title="Close"
          >
            <X className="w-5 h-5 text-slate-600" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-6">
          {!isScanning ? (
            <div className="space-y-6">
              <div className="bg-slate-50 border thin-rule rule-line p-4">
                <p className="text-sm font-body text-slate-700 leading-relaxed">
                  Point your camera at the barcode on the back of your board game box. The barcode is typically a 12 or 13 digit number with vertical lines.
                </p>
                <p className="text-xs font-body text-slate-600 mt-2 leading-relaxed">
                  <strong>iPhone users:</strong> Make sure to hold the device horizontally and allow adequate lighting for best results.
                </p>
              </div>

              {error && (
                <div className="bg-terracotta-50 border thin-rule border-terracotta-300 p-4">
                  <p className="text-sm font-body text-terracotta-900 leading-relaxed">{error}</p>
                  {permissionStatus === 'denied' && (
                    <div className="mt-3 text-xs text-red-600 space-y-1">
                      <p className="font-semibold">How to enable camera access:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Chrome: Click the camera icon in the address bar</li>
                        <li>Firefox: Click the camera icon in the address bar</li>
                        <li>Safari: Go to Settings → Safari → Camera</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={startScanning}
                disabled={permissionStatus === 'unsupported'}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 text-cream py-4 font-body text-sm uppercase tracking-wider hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Camera className="w-4 h-4" strokeWidth={1.5} />
                <span>Begin Scan</span>
              </button>

              <div className="text-center">
                <button
                  onClick={onManualEntry}
                  className="text-xs font-body text-slate-600 hover:text-slate-900 uppercase tracking-wider transition"
                >
                  Search by Title
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative bg-black border thin-rule rule-line overflow-hidden">
                <div id={scannerIdRef.current} className="w-full" />
              </div>

              <div className="bg-forest-50 border thin-rule border-forest-300 p-3">
                <p className="text-xs font-body text-forest-900 uppercase tracking-wider mb-2">Scanning Guide:</p>
                <ul className="text-xs font-body text-forest-800 space-y-1">
                  <li>• Distance: 6-8 inches from camera</li>
                  <li>• Position: Centered and horizontal</li>
                  <li>• Lighting: Ensure adequate illumination</li>
                  <li>• Stability: Hold steady 1-2 seconds</li>
                </ul>
              </div>

              <div className="flex items-center justify-center gap-2 text-slate-600">
                <Loader className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                <span className="text-xs font-body uppercase tracking-wider">Scanning...</span>
              </div>

              <button
                onClick={async () => {
                  await stopScanning();
                  setIsScanning(false);
                }}
                className="w-full py-3 border thin-rule rule-line text-slate-700 font-body text-sm uppercase tracking-wider hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
