'use client';

import { useState } from 'react';
import Feynman from '@/components/Feynman';
import LandingPage from '@/components/LandingPage';

export default function Home() {
  const [started, setStarted] = useState(false);
  const [landingMounted, setLandingMounted] = useState(true);

  const handleStart = () => {
    setStarted(true);
    // Unmount the decorative landing graph once the transition completes to free
    // up its render loop.
    setTimeout(() => setLandingMounted(false), 700);
  };

  return (
    <>
      {landingMounted && (
        <div className={`landing${started ? ' hidden' : ''}`}>
          <LandingPage onStart={handleStart} />
        </div>
      )}
      <div className={`app-wrapper${started ? ' visible' : ''}`}>
        <Feynman />
      </div>
    </>
  );
}
