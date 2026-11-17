// Vitest setup file
// import '@testing-library/jest-dom'; // Not installed yet

// Mock the global Worker for pdfjs-dist
global.Worker = class Worker {
  constructor(public url: string) {}
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
} as any;
