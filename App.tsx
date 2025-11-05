import React, { useState, useCallback, useMemo, useRef } from 'react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop';
import { generateAllOutfits } from './services/geminiService';
import type { Outfit } from './types';

// --- Helper & UI Components ---

const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type });
};

// --- Icon Components ---
const ShareIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
  </svg>
);

const LightbulbIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10.75 2.75a.75.75 0 00-1.5 0v.511c-.413.076-1.025.29-1.558.628-1.353.86-2.422 2.34-2.422 4.11v.281a3.5 3.5 0 001.332 2.825l.024.023.08.067a.75.75 0 00.998-1.123l-.08-.067.002-.002a2 2 0 01-.75-1.623V8c0-1.2.73-2.181 1.63-2.828.32-.228.75-.41 1.12-.51V2.75z" />
    <path d="M10 18a.75.75 0 01-.75-.75V16a.75.75 0 011.5 0v1.25A.75.75 0 0110 18zM8.25 15a.75.75 0 010-1.5h3.5a.75.75 0 010 1.5h-3.5z" />
    <path d="M10 12.5a4 4 0 100-8 4 4 0 000 8zM10 6a2.5 2.5 0 110 5 2.5 2.5 0 010-5z" clipRule="evenodd" />
  </svg>
);

const UploadIcon: React.FC = () => (
  <svg className="w-16 h-16 mx-auto text-indigo-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

// --- UI Components ---

const Header: React.FC<{ onGetStartedClick: () => void }> = ({ onGetStartedClick }) => (
  <header className="text-center p-4 md:p-6 space-y-4">
    <h1 className="text-5xl md:text-7xl font-bold tracking-tighter gradient-text animate-float">
      Virtual Stylist
    </h1>
    <p className="mt-2 text-lg text-slate-600 max-w-2xl mx-auto">
      Stuck on what to wear? Upload a photo of one item, and let AI create three complete outfits for you.
    </p>
    <button onClick={onGetStartedClick} className="btn btn-primary animate-pulse-glow mt-4">
        Get Started
    </button>
  </header>
);

interface ImageUploadProps {
  onImageSelect: (file: File) => void;
  imagePreview: string | null;
  uploadRef: React.RefObject<HTMLDivElement>;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ onImageSelect, imagePreview, uploadRef }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageSelect(e.target.files[0]);
    }
    e.target.value = '';
  };

  return (
    <div ref={uploadRef} className="w-full max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-lg">
      <label htmlFor="file-upload" className="relative cursor-pointer bg-slate-50 rounded-xl hover:bg-indigo-50 transition-colors duration-200 ease-in-out group block p-8 text-center border-2 border-dashed border-slate-200 hover:border-indigo-300">
        {imagePreview ? (
          <img src={imagePreview} alt="Selected item" className="w-full h-72 object-contain rounded-lg" />
        ) : (
          <div className="space-y-4">
            <UploadIcon />
            <p className="text-lg font-semibold text-slate-700">Drag & drop or click to upload</p>
            <p className="text-sm text-slate-500">PNG, JPG, or WEBP. Max 10MB.</p>
          </div>
        )}
        <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" />
      </label>
    </div>
  );
};

function getCroppedImg(image: HTMLImageElement, crop: PixelCrop): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) return Promise.reject(new Error('Canvas context not available.'));
  
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  
  ctx.drawImage(image, crop.x * scaleX, crop.y * scaleY, crop.width * scaleX, crop.height * scaleY, 0, 0, crop.width, crop.height);

  return Promise.resolve(canvas.toDataURL('image/jpeg', 0.95));
}

interface ImageCropperModalProps {
  imgSrc: string;
  onCropComplete: (croppedImageUrl: string) => void;
  onCancel: () => void;
}

const ImageCropperModal: React.FC<ImageCropperModalProps> = ({ imgSrc, onCropComplete, onCancel }) => {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(makeAspectCrop({ unit: '%', width: 90 }, 4 / 5, width, height), width, height);
    setCrop(initialCrop);
    setCompletedCrop(initialCrop);
  };

  const handleCrop = async () => {
    if (imgRef.current && completedCrop) {
      const croppedImageUrl = await getCroppedImg(imgRef.current, completedCrop);
      onCropComplete(croppedImageUrl);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" aria-modal="true">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 space-y-4">
        <h2 className="text-2xl font-bold text-gray-800">Crop your item</h2>
        <div className="max-h-[60vh] overflow-y-auto">
          <ReactCrop crop={crop} onChange={(_, p) => setCrop(p)} onComplete={c => setCompletedCrop(c)} aspect={4 / 5} minWidth={100} ruleOfThirds>
            <img ref={imgRef} alt="Crop me" src={imgSrc} onLoad={onImageLoad} className="w-full h-auto"/>
          </ReactCrop>
        </div>
        <div className="flex justify-end space-x-4">
          <button onClick={onCancel} className="btn btn-secondary">Cancel</button>
          <button onClick={handleCrop} className="btn btn-primary">Crop & Continue</button>
        </div>
      </div>
    </div>
  );
};

const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col items-center justify-center space-y-6 text-center">
    <div className="flex items-center justify-center space-x-4">
      <div className="loader-icon text-indigo-500"><svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"/></svg></div>
      <div className="loader-icon text-purple-500"><svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></div>
      <div className="loader-icon text-pink-500"><svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
    </div>
    <h3 className="text-2xl font-semibold text-slate-700 tracking-tight">Styling your outfits...</h3>
    <p className="text-slate-500 max-w-sm">Our AI is curating the perfect looks! This can take up to a minute.</p>
  </div>
);

interface OutfitCardProps {
  outfit: Outfit;
  style: React.CSSProperties;
}

const OutfitCard: React.FC<OutfitCardProps> = ({ outfit, style }) => {
  const [buttonText, setButtonText] = useState('Share');

  const handleShare = async () => {
    const fileName = `${outfit.title.toLowerCase().replace(/\s/g, '-')}-outfit.png`;
    try {
      const file = await dataUrlToFile(outfit.imageUrl, fileName);
      const shareData = { files: [file], title: 'My Virtual Stylist Outfit', text: `Check out this ${outfit.title} look I created!` };
      
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        throw new Error('Web Share API not supported.');
      }
    } catch (error) {
      navigator.clipboard.writeText(outfit.imageUrl).then(() => {
        setButtonText('Copied!');
        setTimeout(() => setButtonText('Share'), 2000);
      });
    }
  };

  return (
    <div style={style} className="bg-white rounded-2xl shadow-lg overflow-hidden transition-all duration-300 ease-in-out hover:shadow-2xl hover:-translate-y-2 group">
      <img src={outfit.imageUrl} alt={`${outfit.title} outfit`} className="w-full h-96 object-cover" />
      <div className="p-4 bg-slate-50 flex justify-between items-center">
        <h3 className="text-xl font-semibold text-slate-800">{outfit.title}</h3>
        <button onClick={handleShare} disabled={buttonText !== 'Share'} className="inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-lg shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors">
          <ShareIcon className="w-4 h-4 mr-2" /> {buttonText}
        </button>
      </div>
      {outfit.stylingTip && (
        <div className="p-4 border-t border-slate-200 bg-white">
          <div className="flex items-start space-x-3">
            <LightbulbIcon className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 italic">"{outfit.stylingTip}"</p>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main App Component ---

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uncroppedImageSrc, setUncroppedImageSrc] = useState<string | null>(null);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLDivElement>(null);

  const handleGetStartedClick = () => {
    uploadRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleImageSelect = useCallback((file: File) => {
    setOutfits([]); setError(null); setIsLoading(false);
    const reader = new FileReader();
    reader.onloadend = () => setUncroppedImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleCropComplete = useCallback(async (croppedDataUrl: string) => {
    try {
      const croppedFile = await dataUrlToFile(croppedDataUrl, "cropped-item.jpeg");
      setSelectedFile(croppedFile);
      setImagePreview(croppedDataUrl);
      setUncroppedImageSrc(null);
    } catch (e) {
      setError("Failed to process the cropped image. Please try again.");
      setUncroppedImageSrc(null);
    }
  }, []);

  const handleCropCancel = useCallback(() => setUncroppedImageSrc(null), []);

  const handleGenerateOutfits = useCallback(async () => {
    if (!selectedFile || !imagePreview) return;

    setIsLoading(true); setError(null); setOutfits([]);

    try {
      const base64Data = imagePreview.split(',')[1];
      if (!base64Data) throw new Error("Could not read image data.");
      
      const generated = await generateAllOutfits(base64Data, selectedFile.type);
      setOutfits(generated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(`Failed to generate outfits. ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedFile, imagePreview]);

  const handleClear = () => {
    setSelectedFile(null); setImagePreview(null); setUncroppedImageSrc(null);
    setOutfits([]); setError(null); setIsLoading(false);
  };

  const showResults = useMemo(() => outfits.length > 0 && !isLoading, [outfits, isLoading]);
  
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      {uncroppedImageSrc && <ImageCropperModal imgSrc={uncroppedImageSrc} onCropComplete={handleCropComplete} onCancel={handleCropCancel} />}
      
      <main className="container mx-auto px-4 py-8 md:py-12 space-y-12">
        <Header onGetStartedClick={handleGetStartedClick} />

        <div className="space-y-6">
          <ImageUpload onImageSelect={handleImageSelect} imagePreview={imagePreview} uploadRef={uploadRef} />

          {selectedFile && (
            <div className="flex justify-center items-center space-x-4 animate-fadeIn">
              <button onClick={handleClear} disabled={isLoading} className="btn btn-secondary">
                Clear Selection
              </button>
              <button onClick={handleGenerateOutfits} disabled={isLoading} className={`btn btn-primary ${!isLoading && 'animate-pulse-glow'}`}>
                {isLoading ? 'Generating...' : 'Generate Outfits'}
              </button>
            </div>
          )}
        </div>

        <div className="mt-16">
          {isLoading && <LoadingSpinner />}
          {error && <p className="text-center text-red-600 bg-red-100 p-4 rounded-md animate-fadeIn">{error}</p>}
          
          {showResults && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {outfits.map((outfit, index) => (
                <OutfitCard 
                  key={outfit.title} 
                  outfit={outfit} 
                  style={{ animationDelay: `${index * 150}ms` }} 
                  className="animate-fadeIn"
                />
              ))}
            </div>
          )}
        </div>
      </main>
       <footer className="text-center py-6 mt-12 text-slate-500 text-sm">
        <p>Powered by Gemini AI</p>
      </footer>
    </div>
  );
}

export default App;